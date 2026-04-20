const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ─── Paths ─────────────────────────────────────────────────────────────────
const userDataPath   = app.getPath('userData');
const cachePath      = path.join(userDataPath, 'weather_cache.json');
const settingsPath   = path.join(userDataPath, 'settings.json');
const lpcachePath    = path.join(userDataPath, 'lightpollution_cache.json');

// ─── Helpers ───────────────────────────────────────────────────────────────
function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = { timeout: 15000, headers };
    const req = mod.get(url, opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function readJSON(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {}
  return fallback;
}

function writeJSON(filePath, data) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('writeJSON error:', e.message); }
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

// ─── Settings ──────────────────────────────────────────────────────────────
function loadSettings() {
  return readJSON(settingsPath, { lat: null, lon: null, locationName: null });
}

function saveSettings(settings) {
  writeJSON(settingsPath, settings);
}

// ─── Weather Cache ─────────────────────────────────────────────────────────
// Cache schema: { date: "YYYY-MM-DD", lat, lon, weather, smoke }
function loadCache() {
  return readJSON(cachePath, null);
}

function isCacheValid(cache, lat, lon) {
  if (!cache) return false;
  if (cache.date !== todayKey()) return false;
  if (Math.abs(cache.lat - lat) > 0.05) return false;  // location shifted significantly
  if (Math.abs(cache.lon - lon) > 0.05) return false;
  return true;
}

async function fetchWeatherData(lat, lon) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=cloud_cover,relative_humidity_2m&forecast_days=16&timezone=auto`;

  const smokeUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=pm2_5,pm10&timezone=auto`;

  const [weather, smoke] = await Promise.all([
    fetchJson(weatherUrl),
    fetchJson(smokeUrl)
  ]);

  const cache = { date: todayKey(), lat, lon, weather, smoke, fetchedAt: new Date().toISOString() };
  writeJSON(cachePath, cache);
  console.log(`[AstroPlanner] Weather cache refreshed for ${lat}, ${lon} on ${cache.date}`);
  return { weather, smoke };
}

async function getWeatherData(lat, lon) {
  const cache = loadCache();
  if (isCacheValid(cache, lat, lon)) {
    console.log('[AstroPlanner] Using cached weather data from', cache.fetchedAt);
    return { weather: cache.weather, smoke: cache.smoke, fromCache: true, cachedAt: cache.fetchedAt };
  }
  const data = await fetchWeatherData(lat, lon);
  return { ...data, fromCache: false, cachedAt: new Date().toISOString() };
}

// ─── Light Pollution ───────────────────────────────────────────────────────
// Uses lightpollutionmap.info QueryRaster (VIIRS World Atlas data).
// Radiance in mcd/m² is converted to Bortle class.
// Cache is keyed by rounded lat/lon — light pollution rarely changes.

function lpCacheKey(lat, lon) {
  return `${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
}

function loadLPCache() {
  return readJSON(lpcachePath, {});
}

function saveLPCache(cache) {
  writeJSON(lpcachePath, cache);
}

function radianceToBortle(mcd) {
  if (mcd < 0.11)  return { bortle: 1, label: 'Bortle 1 – Pristine dark sky',           sqm: '>21.7', color: '#0d3b0d' };
  if (mcd < 0.33)  return { bortle: 2, label: 'Bortle 2 – Truly dark sky',              sqm: '21.5',  color: '#1e5c1e' };
  if (mcd < 1.0)   return { bortle: 3, label: 'Bortle 3 – Rural sky',                   sqm: '21.3',  color: '#2d7a2d' };
  if (mcd < 3.0)   return { bortle: 4, label: 'Bortle 4 – Rural/suburban transition',   sqm: '20.4',  color: '#4a7c1f' };
  if (mcd < 9.0)   return { bortle: 5, label: 'Bortle 5 – Suburban sky',                sqm: '19.1',  color: '#8a8a00' };
  if (mcd < 27.0)  return { bortle: 6, label: 'Bortle 6 – Bright suburban sky',         sqm: '18.0',  color: '#b36b00' };
  if (mcd < 80.0)  return { bortle: 7, label: 'Bortle 7 – Suburban/urban transition',   sqm: '17.0',  color: '#cc4400' };
  if (mcd < 200.0) return { bortle: 8, label: 'Bortle 8 – City sky',                    sqm: '15.5',  color: '#cc2200' };
  return             { bortle: 9, label: 'Bortle 9 – Inner city sky',                   sqm: '<15.0', color: '#aa0000' };
}

async function fetchLightPollution(lat, lon) {
  // Primary: lightpollutionmap.info QueryRaster (World Atlas 2015 VIIRS)
  const url = `https://www.lightpollutionmap.info/QueryRaster/?ql=wa_2015&qt=point&qd=${lon},${lat}`;
  console.log('[AstroPlanner] Fetching LP from:', url);
  try {
    const data = await fetchJson(url);
    console.log('[AstroPlanner] LP response:', JSON.stringify(data).slice(0, 200));
    const raw = data?.Level ?? data?.level ?? data?.value ?? data?.brightness ?? null;
    if (raw !== null && !isNaN(parseFloat(raw))) {
      const mcd = parseFloat(raw);
      return { mcd, ...radianceToBortle(mcd), source: 'lightpollutionmap' };
    }
    throw new Error('Unexpected LP response: ' + JSON.stringify(data).slice(0, 80));
  } catch (primaryErr) {
    console.warn('[AstroPlanner] LP primary failed:', primaryErr.message, '— trying nominatim fallback');

    // Fallback: rough estimate from OSM address type
    try {
      const nominatimUrl =
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
      console.log('[AstroPlanner] Trying LP fallback:', nominatimUrl);
      // Nominatim requires a User-Agent header
      const place = await fetchJson(nominatimUrl, { 'User-Agent': 'AstroPlanner/1.0' });
      console.log('[AstroPlanner] Nominatim response:', JSON.stringify(place).slice(0, 200));
      const address = place?.address || {};
      let mcd = 5.0;
      if      (address.city)    mcd = 25.0;
      else if (address.town)    mcd = 8.0;
      else if (address.village) mcd = 2.0;
      else if (address.hamlet)  mcd = 0.5;
      else if (address.county && !address.city && !address.town) mcd = 1.5;
      const result = radianceToBortle(mcd);
      return {
        mcd, ...result,
        source: 'estimate',
        estimated: true,
        placeName: (place?.display_name || '').split(',').slice(0, 2).join(',')
      };
    } catch (fallbackErr) {
      console.error('[AstroPlanner] LP fallback failed:', fallbackErr.message);

      // Final fallback: use rough estimate based on distance from major city centers
      // This provides basic LP estimation without any external API
      const roughEstimate = roughLPEstimate(lat, lon);
      if (roughEstimate) {
        return {
          ...roughEstimate,
          source: 'estimate',
          estimated: true,
          placeName: 'Approximate'
        };
      }
      return null;
    }
  }
}

function roughLPEstimate(lat, lon) {
  // Rough estimation based on proximity to known city coordinates
  // mcd values: city center ~25, suburban ~8, rural ~2, dark ~0.5
  const cities = [
    { name: 'New York', lat: 40.7128, lon: -74.0060, mcd: 80 },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, mcd: 60 },
    { name: 'Chicago', lat: 41.8781, lon: -87.6298, mcd: 50 },
    { name: 'Houston', lat: 29.7604, lon: -95.3698, mcd: 40 },
    { name: 'Phoenix', lat: 33.4484, lon: -112.0740, mcd: 30 },
    { name: 'Philadelphia', lat: 39.9526, lon: -75.1652, mcd: 45 },
    { name: 'San Antonio', lat: 29.4241, lon: -98.4936, mcd: 25 },
    { name: 'San Diego', lat: 32.7157, lon: -117.1611, mcd: 35 },
    { name: 'Dallas', lat: 32.7767, lon: -96.7970, mcd: 35 },
    { name: 'San Jose', lat: 37.3382, lon: -121.8863, mcd: 40 },
    { name: 'Austin', lat: 30.2672, lon: -97.7431, mcd: 20 },
    { name: 'Jacksonville', lat: 30.3322, lon: -81.6557, mcd: 20 },
    { name: 'San Francisco', lat: 37.7749, lon: -122.4194, mcd: 50 },
    { name: 'Columbus', lat: 39.9612, lon: -82.9988, mcd: 25 },
    { name: 'Fort Worth', lat: 32.7555, lon: -97.3308, mcd: 22 },
    { name: 'Indianapolis', lat: 39.7684, lon: -86.1581, mcd: 22 },
    { name: 'Charlotte', lat: 35.2271, lon: -80.8431, mcd: 20 },
    { name: 'Seattle', lat: 47.6062, lon: -122.3321, mcd: 30 },
    { name: 'Denver', lat: 39.7392, lon: -104.9903, mcd: 25 },
    { name: 'Boston', lat: 42.3601, lon: -71.0589, mcd: 30 }
  ];

  let minDist = Infinity;
  let nearest = null;

  for (const city of cities) {
    const dist = Math.sqrt(Math.pow(lat - city.lat, 2) + Math.pow(lon - city.lon, 2));
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }

  if (!nearest) return null;

  // Adjust mcd based on distance (each degree ~ 70km, roughly)
  const distDeg = minDist;
  let mcd = nearest.mcd;

  if (distDeg > 3) mcd = 1.0;      // > 200km
  else if (distDeg > 1.5) mcd = 3.0; // 100-200km
  else if (distDeg > 0.5) mcd = 8.0; // 35-100km
  // else use city center mcd

  console.log('[AstroPlanner] Rough LP estimate:', nearest.name, '~', Math.round(distDeg * 70), 'km, mcd:', mcd);
  return { mcd, ...radianceToBortle(mcd) };
}

async function getLightPollution(lat, lon) {
  const cache = loadLPCache();
  const key   = lpCacheKey(lat, lon);
  if (cache[key]) {
    console.log('[AstroPlanner] LP cache hit for', key);
    return { ...cache[key], fromCache: true };
  }
  const result = await fetchLightPollution(lat, lon);
  if (result) { cache[key] = result; saveLPCache(cache); }
  return result ? { ...result, fromCache: false } : null;
}

// ─── Auto Daily Refresh ────────────────────────────────────────────────────
let refreshTimer = null;

function scheduleNextMidnightRefresh(win) {
  if (refreshTimer) clearTimeout(refreshTimer);

  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 5, 0, 0); // 12:05 AM next day (small buffer after midnight)

  const msUntilMidnight = next - now;
  console.log(`[AstroPlanner] Next auto-refresh scheduled in ${Math.round(msUntilMidnight / 60000)} min`);

  refreshTimer = setTimeout(async () => {
    const settings = loadSettings();
    if (settings.lat && settings.lon) {
      try {
        console.log('[AstroPlanner] Auto-refreshing weather at midnight...');
        fs.existsSync(cachePath) && fs.unlinkSync(cachePath); // invalidate cache
        const data = await fetchWeatherData(settings.lat, settings.lon);
        if (win && !win.isDestroyed()) {
          win.webContents.send('weather-refreshed', {
            ...data,
            fromCache: false,
            cachedAt: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error('[AstroPlanner] Midnight refresh failed:', e.message);
      }
    }
    scheduleNextMidnightRefresh(win); // reschedule for next night
  }, msUntilMidnight);
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────
function registerIpcHandlers(win) {

  // Renderer asks for weather (uses cache if valid)
  ipcMain.handle('get-weather', async (_, { lat, lon }) => {
    try {
      return { success: true, ...(await getWeatherData(lat, lon)) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Renderer forces a fresh fetch (user clicked Refresh)
  ipcMain.handle('refresh-weather', async (_, { lat, lon }) => {
    try {
      fs.existsSync(cachePath) && fs.unlinkSync(cachePath);
      const data = await fetchWeatherData(lat, lon);
      return { success: true, ...data, fromCache: false, cachedAt: new Date().toISOString() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Save location
  ipcMain.handle('save-location', (_, { lat, lon, locationName }) => {
    saveSettings({ lat, lon, locationName });
    return { success: true };
  });

  // Load saved location
  ipcMain.handle('load-settings', () => {
    return loadSettings();
  });

  // Load catalog from bundled file
  ipcMain.handle('load-catalog', () => {
    try {
      const catalogPath = path.join(__dirname, 'ngc-ic-messier-catalog.json');
      const raw = fs.readFileSync(catalogPath, 'utf8');
      return { success: true, catalog: JSON.parse(raw) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Fetch sunrise/sunset data
  ipcMain.handle('get-sun-times', async (_, { lat, lon, dates }) => {
    try {
      const results = await Promise.all(dates.map(async d => {
        const url = `https://api.sunrisesunset.io/json?lat=${lat}&lng=${lon}&date=${d}&timezone=auto`;
        const data = await fetchJson(url);
        return { date: d, data };
      }));
      return { success: true, results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Open external link
  ipcMain.on('open-external', (_, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
  });

  // Light pollution (uses caching via getLightPollution())
  ipcMain.handle('get-light-pollution', async (_, { lat, lon }) => {
    try {
      const result = await getLightPollution(lat, lon);
      if (!result) return { success: false, error: "Unable to fetch light pollution data" };
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // IP-based location for desktop Electron (fallback when GPS unavailable)
  ipcMain.handle('get-ip-location', async () => {
    try {
      const data = await fetchJson('https://ipwho.is/');
      if (data.success && data.latitude && data.longitude) {
        const lat = data.latitude;
        const lon = data.longitude;
        console.log('[AstroPlanner] IP location:', lat, lon, data.country);
        return { success: true, lat, lon, country: data.country };
      }
      return { success: false, error: data?.message || "Unable to determine location from IP" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Force-clear LP cache for this location (if user moves)
  ipcMain.handle('clear-lp-cache', (_, { lat, lon }) => {
    const cache = loadLPCache();
    const key = lpCacheKey(lat, lon);
    delete cache[key];
    saveLPCache(cache);
    return { success: true };
  });

  // Check cache status
  ipcMain.handle('cache-status', () => {
    const cache = loadCache();
    if (!cache) return { exists: false };
    return {
      exists: true,
      date: cache.date,
      isToday: cache.date === todayKey(),
      fetchedAt: cache.fetchedAt,
      lat: cache.lat,
      lon: cache.lon
    };
  });
}

// ─── Window ────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'Astro Planner – Seestar',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'astro.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  registerIpcHandlers(mainWindow);
  scheduleNextMidnightRefresh(mainWindow);

  // Dev tools in dev mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (refreshTimer) clearTimeout(refreshTimer);
});

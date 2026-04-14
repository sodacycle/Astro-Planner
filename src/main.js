const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ─── Paths ─────────────────────────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const cachePath    = path.join(userDataPath, 'weather_cache.json');
const settingsPath = path.join(userDataPath, 'settings.json');

// ─── Helpers ───────────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 15000 }, res => {
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

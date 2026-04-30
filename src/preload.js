const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Weather (cached daily)
  getWeather: (lat, lon) => ipcRenderer.invoke('get-weather', { lat, lon }),
  refreshWeather: (lat, lon) => ipcRenderer.invoke('refresh-weather', { lat, lon }),

  // Location persistence
  saveLocation: (lat, lon, locationName) =>
    ipcRenderer.invoke('save-location', { lat, lon, locationName }),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // Catalog
  loadCatalog: () => ipcRenderer.invoke('load-catalog'),

  // Sun times (sunrise/sunset API, called from main process to avoid CORS)
  getSunTimes: (lat, lon, dates) =>
    ipcRenderer.invoke('get-sun-times', { lat, lon, dates }),

  // Light pollution
  getLightPollution: (lat, lon) =>  ipcRenderer.invoke('get-light-pollution', { lat, lon }),
  clearLPCache: (lat, lon) => ipcRenderer.invoke('clear-lp-cache', { lat, lon }),

  // IP-based location (fallback when GPS unavailable in Electron)
  getIPLocation: () => ipcRenderer.invoke('get-ip-location'),

  // Cache info
  cacheStatus: () => ipcRenderer.invoke('cache-status'),

  // Listen for midnight auto-refresh push
  onWeatherRefreshed: (callback) =>
    ipcRenderer.on('weather-refreshed', (_, data) => callback(data)),

  // Open links in system browser
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Platform info
  platform: process.platform,

  // Window controls (from Backup)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleDevTools: () => ipcRenderer.send('window-toggle-dev-tools'),
});

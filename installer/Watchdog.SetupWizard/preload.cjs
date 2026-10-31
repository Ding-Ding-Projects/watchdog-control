const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('watchdogSetup', Object.freeze({
  hostingStatus: () => ipcRenderer.invoke('hosting:status'),
  configureStartup: enabled => ipcRenderer.invoke('hosting:startup', enabled),
  stopHosting: () => ipcRenderer.invoke('hosting:stop'),
  saveWebhook: value => ipcRenderer.invoke('hosting:save-webhook', value),
  removeWebhook: () => ipcRenderer.invoke('hosting:remove-webhook'),
  testWebhook: () => ipcRenderer.invoke('hosting:test-webhook'),
  useUrl: (target, action) => ipcRenderer.invoke('hosting:use-url', { target, action }),
  recheckNetwork: () => ipcRenderer.invoke('setup:recheck-network'),
  loadState: () => ipcRenderer.invoke('setup:load-state'),
  getBuildInfo: () => ipcRenderer.invoke('setup:get-build-info'),
  saveSettings: (value) => ipcRenderer.invoke('setup:save-settings', value),
  saveProgress: (value) => ipcRenderer.invoke('setup:save-progress', value),
  chooseStorageDirectory: () => ipcRenderer.invoke('setup:choose-storage'),
  preserveProgress: () => ipcRenderer.invoke('setup:preserve-progress'),
  checkDocker: () => ipcRenderer.invoke('setup:check-docker'),
  install: () => ipcRenderer.invoke('setup:install'),
  cancel: () => ipcRenderer.invoke('setup:cancel'),
  retryAgent: () => ipcRenderer.invoke('setup:retry-agent'),
  exportCertificate: () => ipcRenderer.invoke('setup:export-certificate'),
  openDashboard: () => ipcRenderer.invoke('setup:open-dashboard'),
  onProgress: (callback) => ipcRenderer.on('setup:progress', (_event, value) => callback(value)),
  onOperationProgress: (callback) => ipcRenderer.on('setup:operation-progress', (_event, value) => callback(value))
}));

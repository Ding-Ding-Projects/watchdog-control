const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('watchdogSetup', Object.freeze({
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
  onProgress: (callback) => ipcRenderer.on('setup:progress', (_event, value) => callback(value)),
  onOperationProgress: (callback) => ipcRenderer.on('setup:operation-progress', (_event, value) => callback(value))
}));

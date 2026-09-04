const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  windowControls: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximizedChange: (callback) => {
      ipcRenderer.on('window:maximized', (_event, value) => callback(value));
    },
  },
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    open: (url) => ipcRenderer.invoke('update:open', url),
  },
});
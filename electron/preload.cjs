const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  windowControls: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maxState: () => ipcRenderer.invoke('win:maxState'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
    close: () => ipcRenderer.invoke('win:close'),
    onMaxStateChange: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('window:maxstate', listener);
      return () => ipcRenderer.removeListener('window:maxstate', listener);
    },
  },
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    open: (url) => ipcRenderer.invoke('update:open', url),
    on: (channel, callback) => {
      const map = {
        available: 'app-update-available',
        downloaded: 'app-update-downloaded',
        progress: 'app-update-progress',
      };
      const event = map[channel];
      if (!event) return () => {};
      const listener = (_event, data) => callback(data);
      ipcRenderer.on(event, listener);
      return () => ipcRenderer.removeListener(event, listener);
    },
  },
});
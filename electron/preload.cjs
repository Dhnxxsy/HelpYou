const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  vault: {
    pickFiles: () => ipcRenderer.invoke('vault:pickFiles'),
  },
  notes: {
    openFile: () => ipcRenderer.invoke('notes:openFile'),
    saveFile: (name, content) => ipcRenderer.invoke('notes:saveFile', name, content),
  },
  paint: {
    savePng: (dataUrl) => ipcRenderer.invoke('paint:savePng', dataUrl),
    saveJpg: (dataUrl) => ipcRenderer.invoke('paint:saveJpg', dataUrl),
  },
  mirror: {
    list: () => ipcRenderer.invoke('mirror:list'),
    connect: (addr) => ipcRenderer.invoke('mirror:connect', addr),
    pair: (addr, code) => ipcRenderer.invoke('mirror:pair', addr, code),
    disconnect: (addr) => ipcRenderer.invoke('mirror:disconnect', addr),
    screencap: (serial) => ipcRenderer.invoke('mirror:screencap', serial),
    input: (serial, kind, payload) => ipcRenderer.invoke('mirror:input', serial, kind, payload),
    launch: (serial) => ipcRenderer.invoke('mirror:launch', serial),
  },
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
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    open: (url) => ipcRenderer.invoke('update:open', url),
    on: (channel, callback) => {
      const map = {
        available: 'app-update-available',
        downloaded: 'app-update-downloaded',
        progress: 'app-update-progress',
        error: 'app-update-error',
      };
      const event = map[channel];
      if (!event) return () => {};
      const listener = (_event, data) => callback(data);
      ipcRenderer.on(event, listener);
      return () => ipcRenderer.removeListener(event, listener);
    },
  },
});
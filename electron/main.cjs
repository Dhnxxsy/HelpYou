const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let server = null;

const appId = 'com.dhnxxsy.helpyou.app';
app.setAppUserModelId(appId);

function logLine(...args) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'app.log'),
      `[${new Date().toISOString()}] ${args.join(' ')}\n`,
    );
  } catch {}
}

process.on('uncaughtException', (err) => logLine('uncaughtException', err?.stack || err));
process.on('unhandledRejection', (err) => logLine('unhandledRejection', err?.stack || err));

function appBase() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');
}

function iconPath() {
  return path.join(appBase(), 'electron', 'assets', app.isPackaged ? 'icon-256.png' : 'icon-256.png');
}

/* -------------------- Auto updater (electron-updater) -------------------- */

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let lastProgressAt = 0;

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function initAutoUpdater() {
  autoUpdater.on('checking-for-update', () => logLine('updater checking'));
  autoUpdater.on('update-available', (info) => {
    logLine('updater available', info?.version);
    sendToWindow('app-update-available', { version: info?.version });
  });
  autoUpdater.on('update-not-available', (info) => {
    logLine('updater not-available', info?.version);
  });
  autoUpdater.on('download-progress', (p) => {
    const now = Date.now();
    if (now - lastProgressAt < 150) return;
    lastProgressAt = now;
    sendToWindow('app-update-progress', {
      percent: Math.round(p.percent || 0),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    logLine('updater downloaded', info?.version);
    sendToWindow('app-update-downloaded', { version: info?.version });
  });
  autoUpdater.on('error', (e) => logLine('updater error', e?.message || e));
}

function startUpdateCheck() {
  autoUpdater
    .checkForUpdates()
    .catch((e) => logLine('updater check error', e?.message || e));
}

async function startServer() {
  const entry = path.join(appBase(), 'dist-server', 'server', 'index.js');
  logLine('startServer entry:', entry);
  const mod = await import(pathToFileURL(entry).href);
  logLine('startServer module imported');
  const res = await mod.startServer({
    host: '127.0.0.1',
    port: 3010,
    base: appBase(),
    data: app.getPath('userData'),
  });
  server = res.server;
  logLine('server bound at', res.url);
  return res;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#07070e',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => logLine('window did-finish-load'));

  const pushMaxState = () => {
    mainWindow?.webContents.send('window:maxstate', maxState());
  };
  mainWindow.on('maximize', pushMaxState);
  mainWindow.on('unmaximize', pushMaxState);
  mainWindow.on('enter-full-screen', pushMaxState);
  mainWindow.on('leave-full-screen', pushMaxState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // F11 toggles fullscreen (mirrors native window behavior).
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      _event.preventDefault();
      mainWindow?.setFullScreen(!mainWindow?.isFullScreen());
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const host = new URL(targetUrl).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(url);
}

function maxState() {
  return {
    maximized: mainWindow?.isMaximized() ?? false,
    fullscreen: mainWindow?.isFullScreen() ?? false,
  };
}

function registerIpc() {
  ipcMain.handle('win:minimize', () => mainWindow?.minimize());
  ipcMain.handle('win:maxState', () => maxState());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!mainWindow) return maxState();
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    else if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return maxState();
  });
  ipcMain.handle('win:toggleFullscreen', () => {
    if (!mainWindow) return { fullscreen: false };
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return { fullscreen: next };
  });
  ipcMain.handle('win:close', () => mainWindow?.close());
  ipcMain.handle('update:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      const version = r?.updateInfo?.version;
      return { status: version ? (version !== app.getVersion() ? 'available' : 'uptodate') : 'uptodate', version };
    } catch (e) {
      logLine('update check error', e?.message || e);
      return { status: 'error', message: 'Gagal memeriksa pembaruan.' };
    }
  });
  ipcMain.handle('update:install', async () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('update:open', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('pickFolder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder',
      properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpc();
    initAutoUpdater();
    logLine('app ready');
    try {
      const res = await startServer();
      createWindow(res.url);
      logLine('window creating with url', res.url);
      if (app.isPackaged) {
        // Auto-check short after the window is up; electron-updater skips in dev.
        startUpdateCheck();
      }
    } catch (err) {
      logLine('startup error', err?.stack || err);
      dialog.showErrorBox('HelpYou', `Gagal memulai server lokal.\n\n${err?.message || err}`);
      app.quit();
    }
  });

  app.on('before-quit', () => {
    try {
      server?.close();
    } catch {}
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
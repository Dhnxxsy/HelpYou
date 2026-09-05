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

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let lastProgressAt = 0;
let awaitingDownload = false;

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function updateSizeBytes(info) {
  const n = Number(info?.files?.[0]?.size);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function initAutoUpdater() {
  autoUpdater.on('checking-for-update', () => logLine('updater checking'));
  autoUpdater.on('update-available', (info) => {
    logLine('updater available', info?.version);
    sendToWindow('app-update-available', { version: info?.version, size: updateSizeBytes(info) });
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
    awaitingDownload = false;
    sendToWindow('app-update-downloaded', { version: info?.version });
  });
  autoUpdater.on('error', (e) => {
    logLine('updater error', e?.message || e);
    if (awaitingDownload) {
      awaitingDownload = false;
      sendToWindow('app-update-error', { message: e?.message || 'Gagal mengunduh pembaruan.' });
    }
  });
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
      const size = updateSizeBytes(r?.updateInfo);
      return { status: version ? (version !== app.getVersion() ? 'available' : 'uptodate') : 'uptodate', version, size };
    } catch (e) {
      logLine('update check error', e?.message || e);
      return { status: 'error', message: 'Gagal memeriksa pembaruan.' };
    }
  });
  ipcMain.handle('update:download', async () => {
    try {
      awaitingDownload = true;
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      awaitingDownload = false;
      logLine('update download error', e?.message || e);
      return { ok: false, message: e?.message || 'Gagal mengunduh pembaruan.' };
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
  ipcMain.handle('vault:pickFiles', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih File untuk Disembunyikan',
      properties: ['openFile', 'multiSelections', 'showHiddenFiles'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths;
  });
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle('notes:openFile', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Buka File Teks',
      properties: ['openFile'],
      filters: [
        {
          name: 'Teks',
          extensions: ['txt', 'md', 'markdown', 'log', 'json', 'csv', 'ini', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'py', 'yml', 'yaml'],
        },
        { name: 'Semua File', extensions: ['*'] },
      ],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const p = res.filePaths[0];
    try {
      const content = fs.readFileSync(p, 'utf-8');
      return { path: p, name: path.basename(p), content };
    } catch (e) {
      return { path: p, error: e?.message || 'Gagal membaca file' };
    }
  });
  ipcMain.handle('notes:saveFile', async (_event, name, content) => {
    if (!mainWindow) return null;
    const suggested = (typeof name === 'string' && name.trim() ? name.trim() : 'catatan');
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Catatan',
      defaultPath: /\.\w{1,10}$/.test(suggested) ? suggested : `${suggested}.txt`,
      filters: [
        { name: 'File Teks', extensions: ['txt'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Semua File', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePath) return null;
    try {
      await fs.promises.writeFile(res.filePath, typeof content === 'string' ? content : '', 'utf-8');
      return { path: res.filePath };
    } catch (e) {
      return { error: e?.message || 'Gagal menyimpan file' };
    }
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
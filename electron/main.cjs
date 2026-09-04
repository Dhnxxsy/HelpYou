const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const updateConfig = require('./update-config.json');
const { compareVersions, resolveUpdateSource } = require('./update-utils.cjs');

let mainWindow = null;
let server = null;

const appId = 'com.fileorganizer.app';
app.setAppUserModelId(appId);
app.disableHardwareAcceleration();

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

/* -------------------- Update checker -------------------- */

function updateStatePath() {
  return path.join(app.getPath('userData'), 'update-check.json');
}

function readUpdateState() {
  try {
    return JSON.parse(fs.readFileSync(updateStatePath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeUpdateState(state) {
  try {
    fs.writeFileSync(updateStatePath(), JSON.stringify(state, null, 2));
  } catch (e) {
    logLine('update state write error', e?.message || e);
  }
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'file-organizer-updater/1.0',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function showUpdateNotification(info) {
  try {
    const n = new Notification({
      title: 'Pembaruan File Organizer tersedia',
      body: `Versi ${info.version} sudah rilis. Klik untuk melihat detail.`,
    });
    n.on('click', () => {
      if (info.url) shell.openExternal(info.url);
    });
    n.show();
  } catch (e) {
    logLine('update notification error', e?.message || e);
  }
}

async function checkForUpdates({ force = false } = {}) {
  let packageJson = {};
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(appBase(), 'package.json'), 'utf8'));
  } catch {}
  const src = resolveUpdateSource({ config: updateConfig, packageJson, env: process.env });

  if (!src.owner || !src.repo) {
    logLine('update check disabled (empty owner/repo)');
    return { status: 'disabled' };
  }

  const state = readUpdateState();
  const intervalMs = (src.intervalHours || 0) * 3600 * 1000;
  if (!force && state.latest && intervalMs > 0 && Date.now() - (state.lastChecked || 0) < intervalMs) {
    logLine('update check throttled, returning cached');
    return state.latest;
  }

  try {
    const api =
      process.env.FO_UPDATE_URL ||
      `https://api.github.com/repos/${src.owner}/${src.repo}/releases/latest`;
    const release = await fetchJson(api);
    const rawTag = release.tag_name || '';
    const tag = rawTag.replace(/^v/i, '');
    const current = app.getVersion();
    const newer = compareVersions(rawTag || tag, current) > 0;
    const result = {
      status: newer ? 'update' : 'uptodate',
      version: tag,
      url: release.html_url || `https://github.com/${src.owner}/${src.repo}/releases/latest`,
      notes: (release.body || '').slice(0, 500),
      publishedAt: release.published_at || null,
    };
    state.lastChecked = Date.now();
    state.latest = result;
    if (newer && state.notifiedVersion !== result.version) {
      state.notifiedVersion = result.version;
      showUpdateNotification(result);
    }
    writeUpdateState(state);
    logLine('update check result', JSON.stringify({ status: result.status, version: result.version }));
    return result;
  } catch (e) {
    logLine('update check error', e?.message || e);
    return state.latest && state.latest.status === 'update'
      ? state.latest
      : { status: 'error', message: 'Gagal memeriksa pembaruan.' };
  }
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
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));
  mainWindow.on('closed', () => {
    mainWindow = null;
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

function registerIpc() {
  ipcMain.handle('win:minimize', () => mainWindow?.minimize());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('win:close', () => mainWindow?.close());
  ipcMain.handle('update:check', async () => checkForUpdates({ force: false }));
  ipcMain.handle('update:forceCheck', async () => checkForUpdates({ force: true }));
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
    logLine('app ready');
    try {
      const res = await startServer();
      createWindow(res.url);
      logLine('window creating with url', res.url);
    } catch (err) {
      logLine('startup error', err?.stack || err);
      dialog.showErrorBox('File Organizer', `Gagal memulai server lokal.\n\n${err?.message || err}`);
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
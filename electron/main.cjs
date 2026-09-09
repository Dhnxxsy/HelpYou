const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, desktopCapturer, clipboard, screen, nativeImage, session, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');
const { pathToFileURL } = require('node:url');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { autoUpdater } = require('electron-updater');

const execFileP = promisify(execFile);

/* ----------------------- ffmpeg (smoothing) support ----------------------- */

let ffmpegPathCache = null;
let ffmpegDownloadP = null;

function bundledFfmpegPath() {
  if (!process.resourcesPath) return '';
  return path.join(process.resourcesPath, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

async function resolveFfmpeg(kickDownload = false) {
  if (ffmpegPathCache) return ffmpegPathCache;
  const bundled = bundledFfmpegPath();
  if (bundled && fs.existsSync(bundled)) {
    ffmpegPathCache = bundled;
    return bundled;
  }
  try {
    const { stdout } = await execFileP(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg']);
    const p = String(stdout).trim().split(/\r?\n/)[0];
    if (p && fs.existsSync(p)) {
      ffmpegPathCache = p;
      return p;
    }
  } catch {
    /* not on PATH */
  }
  const cached = path.join(app.getPath('userData'), 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(cached)) {
    ffmpegPathCache = cached;
    return cached;
  }
  if (kickDownload) {
    void downloadFfmpeg();
  }
  return null;
}

function downloadFfmpeg() {
  if (ffmpegDownloadP) return ffmpegDownloadP;
  ffmpegDownloadP = (async () => {
    const dir = path.join(app.getPath('userData'), 'ffmpeg');
    await fs.promises.mkdir(dir, { recursive: true });
    const isWin = process.platform === 'win32';
    const url = isWin
      ? 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
      : 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
    const tmp = path.join(os.tmpdir(), `helpyou-ffmpeg-${Date.now()}.${isWin ? 'zip' : 'tar.xz'}`);
    await new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close();
          resolve();
        });
        out.on('error', reject);
      });
      req.setTimeout(120000, () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
    if (isWin) {
      await execFileP('tar', ['-xf', tmp, '-C', dir]);
    } else {
      await execFileP('tar', ['-xJf', tmp, '-C', dir]);
    }
    fs.rmSync(tmp, { force: true });
    const found = findFile(dir, isWin ? 'ffmpeg.exe' : 'ffmpeg');
    if (found) ffmpegPathCache = found;
    logLine('ffmpeg downloaded', found || 'NOT FOUND');
  })().catch((e) => {
    ffmpegDownloadP = null;
    logLine('ffmpeg download failed', e?.message || String(e));
  });
  return ffmpegDownloadP;
}

function findFile(dir, name) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}

function runFfmpeg(exe, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    const to = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: -9, stderr });
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(to);
      resolve({ code: -1, stderr: String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(to);
      resolve({ code, stderr });
    });
  });
}

// Keep recording smooth & steady: never let the OS/Chromium throttle the
// capture pipeline when the window is occluded, minimized, or in the background.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let mainWindow = null;
let server = null;
let serverUrl = '';
let overlayWindow = null;
/** Screen-pick state for getDisplayMedia routing (chosen by the renderer before recording). */
let activeRecordSourceId = '';
let activeRecordAudio = 'none';

/** Overlay toggle shortcut. Deliberately a 4-key chord to avoid conflicts. */
const OVERLAY_SHORTCUT = 'CommandOrControl+Alt+Shift+H';

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

/* -------------------- Phone mirror (adb + scrcpy) -------------------- */

function adbPath() {
  return path.join(appBase(), 'electron', 'bin', 'adb', 'adb.exe');
}

function scrcpyDir() {
  return path.join(appBase(), 'electron', 'bin', 'scrcpy');
}

async function runAdb(args, { timeout = 30000, binary = false } = {}) {
  try {
    const opts = {
      timeout,
      windowsHide: true,
      maxBuffer: 48 * 1024 * 1024,
      encoding: binary ? 'buffer' : 'utf8',
    };
    const { stdout, stderr } = await execFileP(adbPath(), args, opts);
    if (binary) {
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || []);
      return { ok: true, base64: buf.toString('base64'), bytes: buf.length };
    }
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (e) {
    const msg = String(e?.message || e || '').slice(0, 400);
    return { ok: false, error: msg, stdout: String(e?.stdout || ''), stderr: String(e?.stderr || '') };
  }
}

function parseAdbDevices(stdout) {
  const devices = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = /^(\S+)\t([a-z]+)(?:\s+(.*))?$/.exec(line.trim());
    if (!m) continue;
    const props = {};
    for (const p of ((m[3] || '').match(/\S+/g) || [])) {
      const i = p.indexOf(':');
      if (i > 0) props[p.slice(0, i)] = p.slice(i + 1);
    }
    devices.push({
      serial: m[1],
      state: m[2],
      model: props.model || '',
      product: props.product || '',
      usb: !!props.usb,
      wireless: !!props.wireless,
    });
  }
  return devices;
}

const scrcpyPids = new Set();

function killScrcpy() {
  for (const pid of scrcpyPids) {
    try {
      process.kill(pid);
    } catch {}
  }
  scrcpyPids.clear();
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
  serverUrl = res.url;
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
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  // Never suspend the app during a recording (prevents dropped frames).
  powerSaveBlocker.start('prevent-app-suspension');

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

/* -------------------- Overlay window -------------------- */

function createOverlayWindow(url) {
  overlayWindow = new BrowserWindow({
    width: 440,
    height: 680,
    minWidth: 380,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    fullscreenable: false,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.once('ready-to-show', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.show();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Escape hides the overlay (mirrors a quick-dismiss panel).
  overlayWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      _event.preventDefault();
      overlayWindow?.hide();
    }
  });

  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlayWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const host = new URL(targetUrl).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  overlayWindow.loadURL(url);
}

function ensureOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  if (!serverUrl) return null;
  createOverlayWindow(`${serverUrl}?overlay=1`);
  return overlayWindow;
}

function toggleOverlay() {
  const win = ensureOverlay();
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) overlayWindow.hide();
}

function registerOverlayShortcut() {
  try {
    const ok = globalShortcut.register(OVERLAY_SHORTCUT, toggleOverlay);
    logLine('overlay shortcut', OVERLAY_SHORTCUT, ok ? 'registered' : 'FAILED');
  } catch (e) {
    logLine('overlay shortcut error', e?.message || e);
  }
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
  ipcMain.handle('overlay:toggle', () => toggleOverlay());
  ipcMain.handle('overlay:hide', () => hideOverlay());
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
  ipcMain.handle('apps:pickExe', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Berkas Aplikasi',
      properties: ['openFile'],
      filters: [
        { name: 'Program (.exe)', extensions: ['exe'] },
        { name: 'Semua File', extensions: ['*'] },
      ],
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
  ipcMain.handle('paint:savePng', async (_event, dataUrl) => {
    if (!mainWindow) return { ok: false, error: 'Tidak ada jendela' };
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/.test(dataUrl)) {
      return { ok: false, error: 'Data gambar tidak valid' };
    }
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Gambar',
      defaultPath: 'lukisan.png',
      filters: [{ name: 'Gambar PNG', extensions: ['png'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const base64 = dataUrl.slice('data:image/png;base64,'.length);
      await fs.promises.writeFile(res.filePath, Buffer.from(base64, 'base64'));
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal menyimpan gambar' };
    }
  });
  ipcMain.handle('paint:saveJpg', async (_event, dataUrl) => {
    if (!mainWindow) return { ok: false, error: 'Tidak ada jendela' };
    if (typeof dataUrl !== 'string' || !/^data:image\/jpeg;base64,/.test(dataUrl)) {
      return { ok: false, error: 'Data gambar tidak valid' };
    }
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Gambar',
      defaultPath: 'lukisan.jpg',
      filters: [{ name: 'Gambar JPEG', extensions: ['jpg'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      const base64 = dataUrl.slice('data:image/jpeg;base64,'.length);
      await fs.promises.writeFile(res.filePath, Buffer.from(base64, 'base64'));
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal menyimpan gambar' };
    }
  });
  ipcMain.handle('mirror:list', async () => {
    const r = await runAdb(['devices', '-l']);
    if (!r.ok) return { ok: false, error: r.error || 'adb gagal dijalankan.' };
    return { ok: true, devices: parseAdbDevices(r.stdout) };
  });
  ipcMain.handle('mirror:connect', async (_e, addr) => {
    if (typeof addr !== 'string' || !/^\S+:\d+$/.test(addr)) return { ok: false, error: 'Alamat tidak valid.' };
    const r = await runAdb(['connect', addr], { timeout: 25000 });
    const out = (r.stdout + ' ' + r.stderr).trim();
    return { ok: r.ok, message: out || r.ok ? 'Berhasil terhubung.' : (r.error || 'Gagal terhubung.') };
  });
  ipcMain.handle('mirror:pair', async (_e, addr, code) => {
    if (typeof addr !== 'string' || !/^\S+:\d+$/.test(addr) || typeof code !== 'string' || !code.trim()) {
      return { ok: false, error: 'Data pairing tidak valid.' };
    }
    const r = await runAdb(['pair', addr, code.trim()], { timeout: 30000 });
    const out = (r.stdout + ' ' + r.stderr).trim();
    return { ok: r.ok, message: out || r.error || '' };
  });
  ipcMain.handle('mirror:disconnect', async (_e, addr) => {
    const r = await runAdb(typeof addr === 'string' && addr ? ['disconnect', addr] : ['disconnect']);
    const out = (r.stdout + ' ' + r.stderr).trim();
    return { ok: r.ok, message: out || r.error || '' };
  });
  const screenLocks = new Map();
  ipcMain.handle('mirror:screencap', async (_e, serial) => {
    if (typeof serial !== 'string' || !serial) return { ok: false, error: 'Perangkat tidak dipilih.' };
    if (screenLocks.get(serial)) return { ok: false, busy: true };
    screenLocks.set(serial, true);
    try {
      const r = await runAdb(['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000, binary: true });
      if (!r.ok) return { ok: false, error: r.error || 'Gagal mengambil layar.' };
      if (!r.base64) return { ok: false, error: 'Layar kosong.' };
      return { ok: true, base64: r.base64 };
    } finally {
      screenLocks.delete(serial);
    }
  });
  ipcMain.handle('mirror:input', async (_e, serial, kind, payload) => {
    if (typeof serial !== 'string' || !serial) return { ok: false, error: 'Perangkat tidak dipilih.' };
    let command = null;
    if (kind === 'tap' && payload && Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
      command = ['tap', String(Math.round(payload.x)), String(Math.round(payload.y))];
    } else if (kind === 'swipe' && payload) {
      command = ['swipe', String(Math.round(payload.x1)), String(Math.round(payload.y1)), String(Math.round(payload.x2)), String(Math.round(payload.y2)), String(Math.round(payload.dur ?? 60))];
    } else if (kind === 'text' && typeof payload?.text === 'string') {
      command = ['text', payload.text.replace(/(["\\ ])/g, (m) => (m === ' ' ? '%s' : '\\' + m))];
    } else if (kind === 'key' && payload && Number.isInteger(payload.code)) {
      command = ['keyevent', String(payload.code)];
    }
    if (!command) return { ok: false, error: 'Perintah input tidak dikenal.' };
    const r = await runAdb(['-s', serial, 'shell', 'input', ...command]);
    return { ok: r.ok, error: r.ok ? undefined : (r.error || 'Gagal mengirim input.') };
  });
  ipcMain.handle('mirror:launch', async (_e, serial) => {
    if (typeof serial !== 'string' || !serial) return { ok: false, error: 'Pilih perangkat dulu.' };
    const exe = path.join(scrcpyDir(), 'scrcpy.exe');
    if (!fs.existsSync(exe)) return { ok: false, error: 'scrcpy tidak ditemukan.' };
    const args = ['--serial', serial, '--stay-awake', '--window-title', `HelpYou · ${serial}`];
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', cwd: scrcpyDir() });
    scrcpyPids.add(child.pid);
    child.unref();
    child.on('exit', () => {
      scrcpyPids.delete(child.pid);
      logLine('scrcpy exit', child.pid);
    });
    logLine('scrcpy launch', serial, child.pid);
    return { ok: true, pid: child.pid };
  });

  /* -------------------- Screen capture (screenshot + recording save) -------------------- */

  // Allow screen/mic capture from the renderer without prompting (granular OS consent is on
  // desktopCapturer.source; getUserMedia only needs the media permission approved).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  // Route getDisplayMedia() to the screen the renderer selected via capture:setRecordSource.
  // The legacy getUserMedia({chromeMediaSource:'desktop'}) path hangs in Electron 33, so we
  // use the supported display-media request handler instead.
  // useSystemPicker:true lets Windows 10+/macOS use the NATIVE capture pipeline (WGC /
  // ScreenCaptureKit) which delivers the display's true frame rate; without it the custom
  // desktopCapturer path is throttled (~15-30fps) and recordings look choppy. On platforms
  // without a system picker, Electron automatically falls back to the handler below.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const src = sources.find((s) => s.id === activeRecordSourceId) || sources[0];
        if (!src) {
          callback({ video: undefined });
          return;
        }
        if (activeRecordAudio === 'system') callback({ video: src, audio: 'loopback' });
        else callback({ video: src });
      } catch (e) {
        logLine('displayMedia handler error', e?.stack || e);
        try {
          callback({ video: undefined });
        } catch {}
      }
    },
    { useSystemPicker: process.env.HELPYOU_DIRECT_CAPTURE !== '1' }
  );

  ipcMain.handle('capture:setRecordSource', (_e, id, audio) => {
    activeRecordSourceId = typeof id === 'string' ? id : '';
    activeRecordAudio = audio === 'system' || audio === 'mic' ? audio : 'none';
    return { ok: true };
  });

  ipcMain.handle('capture:listSources', async () => {
    try {
      const displays = screen.getAllDisplays();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 160, height: 90 } });
      const list = sources.map((s, i) => {
        // On Windows `display_id` is often empty, so fall back to ordered/position matching.
        const display = displays.find((d) => d.id === parseInt(s.display_id, 10)) ?? displays[i];
        const bounds = display?.bounds || { width: 1920, height: 1080 };
        return {
          id: s.id,
          name: display ? (display.label || s.name) : s.name,
          displayId: display?.id ?? i,
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          refreshRate: Math.round(display?.displayFrequency || 60),
          thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
        };
      });
      return { ok: true, sources: list };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal memindai layar.' };
    }
  });

  ipcMain.handle('capture:screenshot', async (_e, payload) => {
    try {
      const displayId = Number.isFinite(payload?.displayId) ? payload.displayId : 0;
      const displays = screen.getAllDisplays();
      const display = displays.find((d) => d.id === displayId) ?? displays[0];
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 4096, height: 4096 } });
      const byId = sources.find((s) => s.display_id === String(displayId));
      const idx = display ? displays.indexOf(display) : -1;
      const src = byId || (idx >= 0 ? sources[idx] : undefined) || sources[0];
      if (!src || src.thumbnail.isEmpty()) return { ok: false, error: 'Layar kosong.' };
      // The returned thumbnail is cropped to the screen's native size, so this is full-res.
      const size = src.thumbnail.getSize();
      return { ok: true, dataUrl: src.thumbnail.toDataURL(), width: size.width, height: size.height };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal mengambil layar.' };
    }
  });

  ipcMain.handle('capture:saveData', async (_e, payload) => {
    try {
      if (!mainWindow) return { ok: false, error: 'Tidak ada jendela' };
      const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl : '';
      const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:([\w.+-]+\/[\w+-]+);base64,(.+)$/) : null;
      if (!m) return { ok: false, error: 'Data file tidak valid' };
      const extFromMime = { 'image/png': 'png', 'image/jpeg': 'jpg', 'video/webm': 'webm', 'video/mp4': 'mp4' }[m[1]];
      const defaultName = typeof payload?.defaultName === 'string' && /^[\w\-. ()]+$/.test(payload.defaultName)
        ? payload.defaultName
        : `tangkapan-${Date.now()}.${extFromMime || 'png'}`;
      const filters = (Array.isArray(payload?.filters) && payload.filters.length ? payload.filters : [
        { name: 'File', extensions: [extFromMime || '*'] },
        { name: 'Semua File', extensions: ['*'] },
      ]);
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Simpan Hasil Tangkapan',
        defaultPath: defaultName,
        filters,
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      await fs.promises.writeFile(res.filePath, Buffer.from(m[2], 'base64'));
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal menyimpan file' };
    }
  });

  ipcMain.handle('capture:copyImage', async (_e, dataUrl) => {
    try {
      if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(dataUrl)) {
        return { ok: false, error: 'Data gambar tidak valid' };
      }
      const img = nativeImage.createFromDataURL(dataUrl);
      if (img.isEmpty()) return { ok: false, error: 'Gagal membaca gambar' };
      clipboard.writeImage(img);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal menyalin gambar' };
    }
  });

  // Motion-compensated frame interpolation: lifts low-fps captures (which the OS may
  // deliver at ~15-25fps even on 60Hz screens) up to a silky 60fps. Only runs when the
  // delivered fps is below a threshold, so already-smooth clips pass through untouched
  // (keeps the file size exactly as promised by the quality preset).
  ipcMain.handle('capture:smooth', async (_e, payload) => {
    try {
      const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl : '';
      const m = dataUrl.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
      if (!m) return { ok: false, error: 'Data video tidak valid' };
      const mime = m[1];
      const isWebm = mime.includes('webm');
      const ext = isWebm ? 'webm' : 'mp4';
const fps = Number(payload?.fps) || 0;
      if (fps >= 45) return { ok: true, processed: false, fps };
      const ffmpeg = await resolveFfmpeg(true);
      if (!ffmpeg) {
        return { ok: false, code: 'no-ffmpeg', error: 'Konverter video (ffmpeg) belum tersedia.' };
      }
      // Frame interpolation pays off only when capture is genuinely choppy; a
      // 30-44 fps clip already plays acceptably on a 60 Hz timeline.
      if (fps >= 30) return { ok: true, processed: false, fps };
      const mbps = Math.max(0.5, Math.min(50, Number(payload?.mbps) || 8));
      const durationSec = Math.max(1, Number(payload?.duration) || 1);
      // Motion estimation is the costly step: run it at <=1024px wide, then
      // upscale back to the original resolution (~4x faster than full-res ME).
      const srcW = Math.round(Number(payload?.width) || 0);
      const srcH = Math.round(Number(payload?.height) || 0);
      const srcW2 = srcW > 1 ? srcW : 1920;
      const srcH2 = srcH > 1 ? srcH : 1080;
      const meW = Math.min(srcW2, 1024);
      const meH = Math.max(2, Math.round((meW * srcH2) / srcW2 / 2) * 2);
      const estSec = durationSec * 7.5 * ((meW * meH) / (1024 * 640));
      // A long grind for a smoother clip is the UX ceiling; respect it.
      if (estSec > 240) return { ok: true, processed: false, fps, skipped: 'long' };
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpyou-smooth-'));
      const input = path.join(tmpDir, `in.${ext}`);
      const output = path.join(tmpDir, `out.${ext}`);
      await fs.promises.writeFile(input, Buffer.from(m[2], 'base64'));
      const vf = `scale=${meW}:${meH},minterpolate=fps=60,scale=${srcW2}:${srcH2}`;
      const args = [
        '-y', '-i', input, '-vf', vf, '-threads', '0',
        isWebm
          ? ['-c:v', 'libvpx-vp9', '-b:v', `${Math.round(mbps)}M`, '-row-mt', '1', '-cpu-used', '4', '-deadline', 'good', '-pix_fmt', 'yuv420p', '-g', '240', '-c:a', 'libopus', '-b:a', '128k']
          : ['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${Math.round(mbps)}M`, '-maxrate', `${Math.round(mbps * 1.2)}M`, '-bufsize', `${Math.round(mbps * 2.4)}M`, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2', '-g', '240', '-c:a', 'aac', '-b:a', '128k'],
        '-y', output,
      ].flat();
      const timeoutMs = Math.min(30 * 60 * 1000, estSec * 1000 + 60000);
      const { code, stderr } = await runFfmpeg(ffmpeg, args, timeoutMs);
      if (code !== 0) {
        return { ok: false, error: (stderr.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300)) || 'Gagal memroses video' };
      }
      const buf = await fs.promises.readFile(output);
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const duration = durMatch ? +durMatch[1] * 3600 + +durMatch[2] * 60 + +durMatch[3] : 0;
      const outDataUrl = `data:${isWebm ? 'video/webm' : 'video/mp4'};base64,${buf.toString('base64')}`;
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return { ok: true, processed: true, fps: 60, dataUrl: outDataUrl, size: buf.length, duration };
    } catch (e) {
      return { ok: false, error: e?.message || 'Gagal memroses video' };
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
      registerOverlayShortcut();
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
    killScrcpy();
    try {
      server?.close();
    } catch {}
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
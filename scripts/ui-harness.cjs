'use strict';
/** Temporary UI-visualization harness: launches the real app and captures screenshots. */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'opencode', 'shots');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

app.setPath('userData', path.join(OUT, 'userData'));
app.disableHardwareAcceleration();

const shot = (win, name) => win.webContents.capturePage().then((img) => {
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  console.log('SHOT ' + name);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const click = (win, js) => win.webContents.executeJavaScript(`(${js})()`).then((r) => {
  console.log('CLICK', r);
  return r;
});

async function typeInto(win, selector, value) {
  return win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'notfound';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'typed';
    })()
  `);
}

async function run() {
  const entry = path.join(ROOT, 'dist-server', 'server', 'index.js');
  const mod = await import(pathToFileURL(entry).href);
  const { url } = await mod.startServer({ host: '127.0.0.1', port: 3020, base: ROOT, data: path.join(OUT, 'data') });

  const mkWin = async (w, h) => {
    const win = new BrowserWindow({
      width: w, height: h, frame: false, show: true,
      backgroundColor: '#07070e',
      webPreferences: {
        preload: path.join(ROOT, 'electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await win.loadURL(url);
    await sleep(700);
    return win;
  };

  // ---------- WIDE 1240x820 ----------
  const win = await mkWin(1240, 820);
  await shot(win, '01-landing-1240');

  await click(win, `() => { const b = document.querySelector('button[title="Pengaturan scan"]'); b && b.click(); return !!b; }`);
  await sleep(500);
  await shot(win, '02-settings-1240');

  await click(win, `() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Kelola Aturan')); b && b.click(); return !!b; }`);
  await sleep(500);
  await shot(win, '03-rules-empty-1240');

  await click(win, `() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Tambah Aturan')); b && b.click(); return !!b; }`);
  await sleep(400);
  await shot(win, '04-rules-one-1240');

  // Fill pattern + folder of the last rule
  await win.webContents.executeJavaScript(`
    (() => {
      const rules = [...document.querySelectorAll('[role="dialog"] .rounded-xl')].filter(el => el.querySelector('input'));
      const card = rules[rules.length - 1];
      const inputs = [...card.querySelectorAll('input')];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const setV = (el, v) => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      if (inputs[1]) setV(inputs[1], 'draft');
      return inputs.length;
    })()
  `);
  await sleep(300);

  // click "Tambah Aturan" twice more to test scroll/crowding
  await click(win, `() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Tambah Aturan')); b && b.click(); return !!b; }`);
  await sleep(200);
  await click(win, `() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Tambah Aturan')); b && b.click(); return !!b; }`);
  await sleep(300);
  await shot(win, '05-rules-three-1240');

  win.close();

  // ---------- NARROW 960x640 ----------
  const win2 = await mkWin(960, 640);
  await shot(win2, '06-landing-960');
  await click(win2, `() => { const b = document.querySelector('button[title="Pengaturan scan"]'); b && b.click(); return !!b; }`);
  await sleep(500);
  await shot(win2, '07-settings-960');
  win2.close();

  app.exit(0);
}

app.whenReady().then(run);
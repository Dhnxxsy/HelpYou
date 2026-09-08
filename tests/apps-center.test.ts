import { describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { InstalledApp } from '../shared/types.js';
import {
  categorizeInstalledApp,
  parseLibraryFolders,
  pickPrimaryExe,
  dedupeEntries,
  resolveExe,
  launchApp,
  addCustomApp,
  removeCustomApp,
  listCustomApps,
} from '../server/organizer/apps-center.js';
import type { AppEntry } from '../shared/types.js';

function app(partial: Partial<InstalledApp>): InstalledApp {
  return { key: 'k', name: 'Test', ...partial };
}

describe('categorizeInstalledApp', () => {
  it('returns app for a normal installed program', () => {
    expect(categorizeInstalledApp(app({ name: 'Google Chrome', publisher: 'Google LLC' }))).toBe('app');
  });

  it('classifies games by known publisher', () => {
    expect(categorizeInstalledApp(app({ name: 'Valorant', publisher: 'Riot Games' }))).toBe('game');
    expect(categorizeInstalledApp(app({ name: 'FIFA 24', publisher: 'Electronic Arts' }))).toBe('game');
  });

  it('classifies games by store path markers', () => {
    expect(
      categorizeInstalledApp(app({ name: 'Cyberpunk 2077', installLocation: 'D:\\Games\\steamapps\\common\\Cyberpunk 2077' }))
    ).toBe('game');
    expect(categorizeInstalledApp(app({ name: 'Fortnite', installLocation: 'C:\\Program Files\\Epic Games\\Fortnite' }))).toBe('game');
  });

  it('classifies steam:// uninstall entries as games', () => {
    expect(categorizeInstalledApp(app({ name: 'Dota 2', uninstallString: 'steam://uninstall/570' }))).toBe('game');
  });

  it('skips infrastructure noise and empty names', () => {
    expect(categorizeInstalledApp(app({ name: 'Microsoft Visual C++ 2015 Redistributable' }))).toBe('skip');
    expect(categorizeInstalledApp(app({ name: '', publisher: 'Foo' }))).toBe('skip');
  });
});

describe('resolveExe', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-apps-test-'));
  const exe = path.join(dir, 'game.exe');
  const dll = path.join(dir, 'launcher.dll');
  fs.writeFileSync(exe, '');
  fs.writeFileSync(dll, '');
  const junkFiles = ['uninst.exe', 'VBCABLE_Setup_x64.exe', 'winsdksetup.exe', 'RemoveAccess.exe', 'semua_game.exe'].map((f) => path.join(dir, f));
  for (const f of junkFiles) fs.writeFileSync(f, '');

  it('resolves an .exe display icon', () => {
    expect(resolveExe(exe)).toBe(exe);
  });

  it('ignores a .dll display icon (not launchable directly)', () => {
    expect(resolveExe(dll)).toBeUndefined();
  });

  it('falls back to an absolute exe installLocation', () => {
    expect(resolveExe(dll, exe)).toBe(exe);
  });

  it('returns undefined when no launchable file exists', () => {
    expect(resolveExe('C:\\No\\Such\\File.exe')).toBeUndefined();
  });

  it('ignores uninstaller/installer executables as app launchers', () => {
    expect(resolveExe(path.join(dir, 'uninst.exe'))).toBeUndefined();
    expect(resolveExe(path.join(dir, 'VBCABLE_Setup_x64.exe'))).toBeUndefined();
    expect(resolveExe(path.join(dir, 'winsdksetup.exe'))).toBeUndefined();
    expect(resolveExe(path.join(dir, 'RemoveAccess.exe'))).toBeUndefined();
    expect(resolveExe(path.join(dir, 'semua_game.exe'))).toBe(path.join(dir, 'semua_game.exe'));
  });
});

describe('pickPrimaryExe', () => {
  it('prefers the exe matching the folder name', () => {
    const exes = ['C:\\common\\Some Game\\launcher.exe', 'C:\\common\\Some Game\\SomeGame.exe'];
    expect(pickPrimaryExe(exes, 'Some Game')).toBe('C:\\common\\Some Game\\SomeGame.exe');
  });

  it('filters out installer/support executables', () => {
    const exes = [
      'C:\\common\\Game\\setup.exe',
      'C:\\common\\Game\\unins000.exe',
      'C:\\common\\Game\\vc_redist.x64.exe',
      'C:\\common\\Game\\Game.exe',
    ];
    expect(pickPrimaryExe(exes, 'Game')).toBe('C:\\common\\Game\\Game.exe');
  });

  it('returns null when only junk remains', () => {
    expect(pickPrimaryExe(['C:\\common\\X\\setup.exe', 'C:\\common\\X\\crashhandler.exe'], 'X')).toBeNull();
  });
});

describe('parseLibraryFolders', () => {
  it('extracts library paths from a VDF', () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"path"		"D:\\SteamLibrary"
	}
}`;
    expect(parseLibraryFolders(vdf)).toEqual(['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);
  });

  it('handles empty input', () => {
    expect(parseLibraryFolders('')).toEqual([]);
  });
});

describe('dedupeEntries', () => {
  const steam: AppEntry = { name: 'Game', kind: 'game', exe: 'C:\\X\\Game.exe', source: 'steam' };
  const registry: AppEntry = {
    name: 'Game',
    kind: 'game',
    exe: 'c:\\x\\game.exe',
    publisher: 'Foo',
    sizeBytes: 1234,
    source: 'registry',
  };

  it('merges entries sharing the same exe (case-insensitive) and prefers metadata', () => {
    const out = dedupeEntries([steam, registry]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Game');
    expect(out[0].publisher).toBe('Foo');
    expect(out[0].sizeBytes).toBe(1234);
    expect(out[0].source).toBe('steam');
  });

  it('keeps distinct apps and exe-less entries separate', () => {
    const a: AppEntry = { name: 'Alpha', kind: 'app', exe: 'C:\\A.exe', source: 'menu' };
    const b: AppEntry = { name: 'Beta', kind: 'app', exe: 'C:\\B.exe', source: 'menu' };
    const c: AppEntry = { name: 'Gamma', kind: 'game', source: 'registry' };
    expect(dedupeEntries([a, b, c])).toHaveLength(3);
  });
});

describe('launchApp validation', () => {
  it('rejects non-absolute and missing targets without launching', async () => {
    const bad = await launchApp('C:\\No\\Such\\App.exe');
    expect(bad.ok).toBe(false);
    const relative = await launchApp('notepad.exe');
    expect(relative.ok).toBe(false);
    const temp = path.join(os.tmpdir(), 'evil.exe');
    fs.writeFileSync(temp, '');
    const inTemp = await launchApp(temp);
    fs.unlinkSync(temp);
    expect(inTemp.ok).toBe(false);
  });
});

describe('custom apps (manual add/remove)', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-custom-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-custom-app-'));
  const exe = path.join(appDir, 'MyTool.exe');
  fs.writeFileSync(exe, '');
  const namedExe = path.join(appDir, 'AnotherTool.exe');
  fs.writeFileSync(namedExe, '');
  const setupExe = path.join(appDir, 'setup.exe');
  fs.writeFileSync(setupExe, '');

  const orig = process.env.FO_DATA;
  beforeAll(() => {
    process.env.FO_DATA = dataDir;
  });
  afterAll(() => {
    if (orig === undefined) delete process.env.FO_DATA;
    else process.env.FO_DATA = orig;
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('adds a valid custom app and defaults the name from the file', () => {
    const res = addCustomApp({ exe });
    expect(res.ok).toBe(true);
    expect(res.entry).toMatchObject({ name: 'MyTool', exe, kind: 'app', source: 'custom' });
  });

  it('persists the custom app across the JSON store', () => {
    const list = listCustomApps();
    expect(list.some((e) => e.exe.toLowerCase() === exe.toLowerCase())).toBe(true);
  });

  it('respects an explicit name and stores in listCatalog entries', () => {
    const res = addCustomApp({ name: 'Alat Saya', exe: namedExe, cwd: appDir });
    expect(res.entry?.name).toBe('Alat Saya');
  });

  it('rejects duplicates by exe (case-insensitive)', () => {
    const res = addCustomApp({ exe: exe.toLowerCase() });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Aplikasi sudah ada di daftar.');
  });

  it('rejects missing files, relative paths and non-exe inputs', () => {
    expect(addCustomApp({ exe: 'C:\\No\\Such\\App.exe' }).error).toBe('Berkas aplikasi tidak ditemukan.');
    expect(addCustomApp({ exe: 'app.exe' }).ok).toBe(false);
    expect(addCustomApp({ exe: path.join(appDir, 'notes.txt') }).ok).toBe(false);
    expect(addCustomApp({ exe: '' })).toEqual({ ok: false, error: 'Pilih berkas aplikasi (.exe).' });
  });

  it('rejects installer/removal executables', () => {
    const res = addCustomApp({ exe: setupExe });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Ini adalah berkas pemasang/penghapus, bukan aplikasi utama.');
  });

  it('removes a custom app and reports missing ones', () => {
    expect(removeCustomApp(exe).ok).toBe(true);
    expect(listCustomApps().some((e) => e.exe.toLowerCase() === exe.toLowerCase())).toBe(false);
    expect(removeCustomApp(exe).error).toBe('Aplikasi tidak ditemukan.');
  });
});

describe('hide & unhide apps', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-hidden-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-hidden-app-'));
  const exeA = path.join(appDir, 'AlphaApp.exe');
  const exeB = path.join(appDir, 'BetaGame.exe');
  fs.writeFileSync(exeA, '');
  fs.writeFileSync(exeB, '');

  const orig = process.env.FO_DATA;
  beforeAll(() => {
    process.env.FO_DATA = dataDir;
  });
  afterAll(() => {
    if (orig === undefined) delete process.env.FO_DATA;
    else process.env.FO_DATA = orig;
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('computes stable hidden keys (case-insensitive exe, name+source)', async () => {
    const { hiddenKeyOf } = await import('../server/organizer/apps-center.js');
    expect(hiddenKeyOf({ exePath: undefined, exe: exeA })).toBe('x:' + path.normalize(exeA).toLowerCase());
    expect(hiddenKeyOf({ exe: exeA.toUpperCase() })).toBe(hiddenKeyOf({ exe: exeA }));
    expect(hiddenKeyOf({ name: 'Spotify', source: 'menu' })).toBe('n:menu:spotify');
    expect(hiddenKeyOf({ name: '  ', source: 'menu' })).toBeNull();
  });

  it('hides, filters, flags with showHidden, and unhides an entry', async () => {
    const { addCustomApp, hideApp, unhideApp, listCatalog, listHiddenApps } = await import('../server/organizer/apps-center.js');
    addCustomApp({ name: 'AlphaApp', exe: exeA });
    addCustomApp({ name: 'BetaGame', exe: exeB });

    expect(hideApp({ exe: exeA }).ok).toBe(true);
    expect(listHiddenApps()).toContain('x:' + path.normalize(exeA).toLowerCase());
    expect(hideApp({ exe: exeA }).ok).toBe(true);

    const filtered = await listCatalog(true, false);
    expect(filtered.apps.some((e) => e.exe && e.exe.toLowerCase() === exeA.toLowerCase())).toBe(false);
    expect(filtered.apps.some((e) => e.exe && e.exe.toLowerCase() === exeB.toLowerCase())).toBe(true);

    const shown = await listCatalog(true, true);
    const hiddenEntry = shown.apps.find((e) => e.exe && e.exe.toLowerCase() === exeA.toLowerCase());
    expect(hiddenEntry?.hidden).toBe(true);

    expect(unhideApp({ exe: exeA }).ok).toBe(true);
    expect(listHiddenApps()).toHaveLength(0);
    const restored = await listCatalog(true, false);
    expect(restored.apps.some((e) => e.exe && e.exe.toLowerCase() === exeA.toLowerCase())).toBe(true);
  }, 30_000);

  it('rejects hiding entries without a resolvable key', async () => {
    const { hideApp } = await import('../server/organizer/apps-center.js');
    expect(hideApp({ name: '', source: '' })).toEqual({ ok: false, error: 'Aplikasi tidak valid.' });
  });
});
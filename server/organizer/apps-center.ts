import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { AppEntry, AppCatalog, InstalledApp } from '../../shared/types.js';
import { runPowerShell } from '../utils/powershell.js';
import { listInstalledApps, parseCommandLine } from './uninstaller.js';
import { normalizeIconPath } from './icons.js';

/* ------------------------------------------------------------------ */
/* Start Menu shortcut enumeration (single fast PowerShell run)        */
/* ------------------------------------------------------------------ */

const MENU_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$wsh = New-Object -ComObject WScript.Shell
$roots = @(
  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"
) | Where-Object { Test-Path -LiteralPath $_ }
$rows = New-Object System.Collections.Generic.List[object]
foreach ($root in $roots) {
  Get-ChildItem -Path "$root\\*" -Recurse -Include *.lnk,*.url -File -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $wsh.CreateShortcut($_.FullName)
      $t = [string]$sc.TargetPath
      if (-not $t) { return }
      $rows.Add([pscustomobject]@{
        name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
        target = $t
        args = [string]$sc.Arguments
        cwd = [string]$sc.WorkingDirectory
        icon = [string]$sc.IconLocation
      })
    } catch {}
  }
}
$steamRoots = New-Object System.Collections.Generic.List[string]
foreach ($key in @(
  'HKLM:\\Software\\WOW6432Node\\Valve\\Steam',
  'HKLM:\\Software\\Valve\\Steam',
  'HKCU:\\Software\\Valve\\Steam'
)) {
  $p = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
  if ($p -and $p.InstallPath -and (Test-Path -LiteralPath "$($p.InstallPath)\\steamapps")) {
    $steamRoots.Add([string]$p.InstallPath)
  }
}
[pscustomobject]@{
  menu = $rows
  steamRoots = $steamRoots
} | ConvertTo-Json -Depth 3 -Compress
`;

interface SteamScanOut {
  menu: MenuRow[];
  steamRoots: string[];
}

interface MenuRow {
  name: string;
  target: string;
  args: string;
  cwd: string;
  icon: string;
}

/* ------------------------------------------------------------------ */
/* Classification heuristics (pure, unit-testable)                     */
/* ------------------------------------------------------------------ */

const GAME_PATH_MARKERS = [
  '\\steamapps\\',
  '\\steam\\steamapps\\',
  '\\epic games\\',
  '\\gog galaxy\\',
  '\\gog games\\',
  '\\riot games\\',
  '\\battle.net\\',
  '\\blizzard entertainment\\',
  '\\ubisoft game launcher\\',
];

const GAME_PUBLISHERS = new Set([
  'gameloft',
  'ubisoft entertainment',
  'electronic arts',
  'activision',
  'blizzard entertainment',
  'riot games',
  'valve',
  'epic games',
  'gog.com',
  'cd projekt red',
  'bandai namco entertainment',
  'square enix',
  'capcom',
  'sega',
  'konami',
  '2k games',
  'take-two interactive software',
  'bethesda softworks',
  'warner bros. interactive entertainment',
  'microsoft game studios',
  'rockstar games',
  'ea games',
  'supergiant games',
  'fromsoftware',
  'insomniac games',
  'nintendo',
]);

/** Infrastructure entries (redistributables, runtimes) are noise in an app list. */
const INFRA_RE = /redistributable|visual c\+\+|directx|vc_redist|\.net (sdk|runtime)|dotnet|windows sdk|software development kit/i;

/** Digital store clients are apps, not games — even when their publisher is in the game list. */
const STORE_CLIENT_RE = /^(ea app|ea desktop app|origin|epic games launcher|gog galaxy|ubisoft connect|battle\.net|blizzard app|riot client|steam|valve steam)$/i;

/** Folder names under a Steam library that are not games (redist/middleware). */
const SKIP_DIR_RE = /(redist|directx|vc_redist|dotnet|runtime|_common|unreal engine|ue[0-9]*prereq|steamworks)/i;

/** Installer/support executables that should never be a game's primary launcher. */
const SKIP_EXE_RE = /^(setup|installer|install|uninst?[0-9]*|crash[a-z]*|unitycrashhandler|crashpad|vc_redist.*|ue[0-9]*prereq.*|dxsetup|directx.*|remove[a-z0-9_]*)\.exe$/i;

/** Filenames that merely END in an installer token (e.g. RewardsInstaller.exe, VBCABLE_Setup_x64.exe). */
const SKIP_EXE_TAIL_RE = /(installer|setup|uninstall)[a-z0-9_]*\.exe$/i;

function isJunkExe(baseName: string): boolean {
  const b = baseName.toLowerCase();
  return SKIP_EXE_RE.test(b) || SKIP_EXE_TAIL_RE.test(b);
}

function hasGameMarker(...fields: (string | undefined)[]): boolean {
  return fields.some((f) => {
    if (!f) return false;
    const low = f.toLowerCase();
    return GAME_PATH_MARKERS.some((m) => low.includes(m));
  });
}

export function categorizeInstalledApp(app: InstalledApp): 'app' | 'game' | 'skip' {
  const name = String(app.name || '').trim();
  if (!name) return 'skip';
  if (INFRA_RE.test(name) || INFRA_RE.test(String(app.publisher || ''))) return 'skip';
  if (STORE_CLIENT_RE.test(name)) return 'app';
  const pub = String(app.publisher || '').toLowerCase();
  if (GAME_PUBLISHERS.has(pub)) return 'game';
  if (hasGameMarker(app.installLocation, app.displayIcon, app.uninstallString)) return 'game';
  if (/steam:\/\//i.test(String(app.uninstallString || ''))) return 'game';
  return 'app';
}

/** Resolve a registry row to a launchable .exe without running extra IO. */
export function resolveExe(displayIcon?: string, installLocation?: string): string | undefined {
  const icon = normalizeIconPath(displayIcon);
  if (icon && path.extname(icon).toLowerCase() === '.exe' && fs.existsSync(icon)) {
    if (!isJunkExe(path.basename(icon))) return path.normalize(icon);
  }
  const loc = String(installLocation || '').trim();
  if (/^[a-zA-Z]:[\\/]/.test(loc) && path.extname(loc).toLowerCase() === '.exe' && fs.existsSync(loc)) {
    const norm = path.normalize(loc);
    if (!isJunkExe(path.basename(norm))) return norm;
  }
  return undefined;
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function pickPrimaryExe(exes: string[], dirName: string): string | null {
  const dk = normKey(dirName);
  let best: string | null = null;
  let bestScore = -1;
  for (const exe of exes) {
    if (isJunkExe(path.basename(exe))) continue;
    const base = path.basename(exe, path.extname(exe));
    const bk = normKey(base);
    let score = 10;
    if (bk === dk) score = 100;
    else if (bk.startsWith(dk)) score = 90;
    else if (dk.startsWith(bk)) score = 80;
    if (score > bestScore || (score === bestScore && String(exe).localeCompare(String(best || ''), 'id') < 0)) {
      best = exe;
      bestScore = score;
    }
  }
  return best;
}

export function parseLibraryFolders(vdf: string): string[] {
  const out: string[] = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(vdf || ''))) !== null) {
    const p = m[1].trim();
    if (p && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out;
}

export function dedupeEntries(entries: AppEntry[]): AppEntry[] {
  const groups = new Map<string, AppEntry[]>();
  const keyOf = (e: AppEntry) =>
    e.exe ? 'x:' + e.exe.toLowerCase() : 'n:' + e.source + ':' + e.name.toLowerCase();
  for (const e of entries) {
    const k = keyOf(e);
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }
  const out: AppEntry[] = [];
  for (const group of groups.values()) {
    const primary = group.find((e) => e.exe) ?? group[0];
    for (const other of group) {
      if (other === primary) continue;
      primary.publisher = primary.publisher ?? other.publisher;
      primary.version = primary.version ?? other.version;
      primary.sizeBytes = primary.sizeBytes ?? other.sizeBytes;
      primary.icon = primary.icon ?? other.icon;
      primary.cwd = primary.cwd ?? other.cwd;
      primary.args = primary.args ?? other.args;
    }
    out.push(primary);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Game-library discovery (Steam VDF + Epic manifests, plain fs)       */
/* ------------------------------------------------------------------ */

function steamRoots(extraRoots: string[] = []): string[] {
  const cands = [...extraRoots];
  for (const env of ['ProgramFiles(x86)', 'ProgramFiles', 'ProgramW6432']) {
    const pf = process.env[env];
    if (pf) cands.push(path.join(pf, 'Steam'));
  }
  const roots = cands.filter((p) => fs.existsSync(path.join(p, 'steamapps')));
  return [...new Set(roots)];
}

function steamLibraries(extraRoots: string[] = []): string[] {
  const libs: string[] = [];
  for (const root of steamRoots(extraRoots)) {
    libs.push(root);
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    try {
      if (fs.existsSync(vdf)) {
        for (const p of parseLibraryFolders(fs.readFileSync(vdf, 'utf8'))) {
          if (fs.existsSync(path.join(p, 'steamapps', 'common'))) libs.push(p);
        }
      }
    } catch {
      /* ignore malformed vdf */
    }
  }
  return [...new Set(libs)];
}

function scanSteamGames(extraRoots: string[] = []): AppEntry[] {
  const out: AppEntry[] = [];
  for (const lib of steamLibraries(extraRoots)) {
    const common = path.join(lib, 'steamapps', 'common');
    let dirs: fs.Dirent[];
    try {
      dirs = fs.readdirSync(common, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      if (SKIP_DIR_RE.test(dir.name.toLowerCase())) continue;
      let files: string[];
      try {
        files = fs.readdirSync(path.join(common, dir.name));
      } catch {
        continue;
      }
      const exes = files.filter((f) => path.extname(f).toLowerCase() === '.exe' && fs.statSync(path.join(common, dir.name, f)).isFile());
      const chosen = pickPrimaryExe(exes.map((f) => path.join(common, dir.name, f)), dir.name);
      out.push({
        name: dir.name,
        kind: 'game',
        exe: chosen ?? undefined,
        icon: chosen ?? undefined,
        cwd: path.join(common, dir.name),
        source: 'steam',
      });
    }
  }
  return out;
}

function scanEpicGames(): AppEntry[] {
  const base = process.env.ProgramData || path.join(process.env.SystemDrive || 'C:', 'ProgramData');
  const manifestsDir = path.join(base, 'Epic', 'Launcher', 'Data', 'Manifests');
  let files: string[];
  try {
    files = fs.readdirSync(manifestsDir).filter((f) => f.endsWith('.item'));
  } catch {
    return [];
  }
  const out: AppEntry[] = [];
  for (const file of files) {
    let data: any;
    try {
      const raw = fs.readFileSync(path.join(manifestsDir, file), 'utf8').replace(/^\uFEFF/, '');
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const name = String(data?.DisplayName || '').trim();
    const install = String(data?.InstallLocation || '').trim();
    if (!name || !install) continue;
    let exe: string | undefined;
    const launch = String(data?.LaunchExecutable || '').trim();
    if (launch) {
      const candidate = path.isAbsolute(launch) ? launch : path.join(install, launch);
      if (path.extname(candidate).toLowerCase() === '.exe' && fs.existsSync(candidate)) exe = path.normalize(candidate);
    }
    out.push({
      name,
      kind: 'game',
      exe,
      icon: exe,
      cwd: fs.existsSync(install) ? path.normalize(install) : undefined,
      version: data?.AppVersion ? String(data.AppVersion) : undefined,
      sizeBytes: Number.isFinite(Number(data?.InstallSize)) && Number(data.InstallSize) > 0
        ? Number(data.InstallSize)
        : undefined,
      source: 'epic',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Custom apps (manually added by the user)                            */
/* ------------------------------------------------------------------ */

interface CustomAppMeta {
  name: string;
  exe: string;
  cwd?: string;
  args?: string;
  addedAt: number;
}

function dataRoot(): string {
  return process.env.FO_DATA ? path.resolve(process.env.FO_DATA) : process.cwd();
}

function customAppsPath(): string {
  return path.join(dataRoot(), 'custom-apps.json');
}

export function listCustomApps(): CustomAppMeta[] {
  try {
    if (!fs.existsSync(customAppsPath())) return [];
    const data = JSON.parse(fs.readFileSync(customAppsPath(), 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.filter((e) => e && typeof e.exe === 'string' && typeof e.name === 'string');
  } catch {
    return [];
  }
}

function saveCustomApps(list: CustomAppMeta[]): void {
  const file = customAppsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
}

export function addCustomApp(input: { name?: string; exe: string; args?: string; cwd?: string }): { ok: boolean; error?: string; entry?: AppEntry } {
  const exeV = String(input?.exe || '').trim();
  if (!exeV) return { ok: false, error: 'Pilih berkas aplikasi (.exe).' };
  const exe = path.normalize(exeV);
  if (!/^[a-zA-Z]:[\\/]/.test(exe)) return { ok: false, error: 'Pilih berkas aplikasi (.exe).' };
  if (path.extname(exe).toLowerCase() !== '.exe') return { ok: false, error: 'Pilih berkas aplikasi (.exe).' };
  try {
    if (!fs.existsSync(exe) || !fs.statSync(exe).isFile()) return { ok: false, error: 'Berkas aplikasi tidak ditemukan.' };
  } catch {
    return { ok: false, error: 'Berkas aplikasi tidak ditemukan.' };
  }
  if (isJunkExe(path.basename(exe))) return { ok: false, error: 'Ini adalah berkas pemasang/penghapus, bukan aplikasi utama.' };

  const list = listCustomApps();
  const key = exe.toLowerCase();
  if (list.some((e) => e.exe.toLowerCase() === key)) return { ok: false, error: 'Aplikasi sudah ada di daftar.' };

  const name = (String(input?.name || '').trim() || path.basename(exe, path.extname(exe))).slice(0, 120);
  const cwd = input?.cwd && /^[a-zA-Z]:[\\/]/.test(input.cwd) && fs.existsSync(input.cwd) ? path.normalize(input.cwd) : undefined;
  const meta: CustomAppMeta = {
    name,
    exe,
    args: (String(input?.args || '').trim() || undefined) as string | undefined,
    cwd,
    addedAt: Date.now(),
  };
  list.push(meta);
  saveCustomApps(list);
  invalidateCatalogCache();
  return { ok: true, entry: customMetaToEntry(meta) };
}

export function removeCustomApp(exe: string): { ok: boolean; error?: string } {
  const exeV = String(exe || '').trim();
  if (!exeV) return { ok: false, error: 'Aplikasi tidak valid.' };
  const key = path.normalize(exeV).toLowerCase();
  const list = listCustomApps();
  const next = list.filter((e) => e.exe.toLowerCase() !== key);
  if (next.length === list.length) return { ok: false, error: 'Aplikasi tidak ditemukan.' };
  saveCustomApps(next);
  invalidateCatalogCache();
  return { ok: true };
}

function customMetaToEntry(m: CustomAppMeta): AppEntry {
  return {
    name: m.name,
    kind: 'app',
    exe: m.exe,
    icon: m.exe,
    cwd: m.cwd,
    args: m.args,
    source: 'custom',
  };
}

const CATALOG_CACHE_TTL_MS = 60_000;
/**
 * Raw (pre-hidden-filter) catalog cache. Hidden state is read from disk on
 * every request and applied dynamically, so hiding/unhiding an entry never
 * forces a full registry/Start-Menu rescan.
 */
type RawCatalog = { at: number; apps: AppEntry[]; games: AppEntry[] };
let rawCache: RawCatalog | null = null;
let rawPromise: Promise<RawCatalog> | null = null;

function invalidateCatalogCache(): void {
  rawCache = null;
  rawPromise = null;
}

/* ------------------------------------------------------------------ */
/* Hidden apps (user hides entries from the menu — NOT uninstall)      */
/* ------------------------------------------------------------------ */

export function hiddenAppsPath(): string {
  return path.join(dataRoot(), 'hidden-apps.json');
}

export function listHiddenApps(): string[] {
  try {
    if (!fs.existsSync(hiddenAppsPath())) return [];
    const data = JSON.parse(fs.readFileSync(hiddenAppsPath(), 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.filter((k) => typeof k === 'string');
  } catch {
    return [];
  }
}

function saveHiddenApps(keys: string[]): void {
  const file = hiddenAppsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), 'utf8');
}

export function hiddenKeyOf(input: { exe?: string; name?: string; source?: string }): string | null {
  const exe = input?.exe && /^[a-zA-Z]:[\\/]/.test(String(input.exe)) ? path.normalize(String(input.exe)) : '';
  if (exe) return 'x:' + exe.toLowerCase();
  const name = String(input?.name || '').trim();
  const source = String(input?.source || '').trim();
  if (!name) return null;
  return 'n:' + source.toLowerCase() + ':' + normKey(name);
}

export function hideApp(input: { exe?: string; name?: string; source?: string }): { ok: boolean; error?: string } {
  const key = hiddenKeyOf(input);
  if (!key) return { ok: false, error: 'Aplikasi tidak valid.' };
  const list = listHiddenApps();
  if (!list.includes(key)) {
    list.push(key);
    saveHiddenApps(list);
  }
  return { ok: true };
}

export function unhideApp(input: { exe?: string; name?: string; source?: string }): { ok: boolean; error?: string } {
  const key = hiddenKeyOf(input);
  if (!key) return { ok: false, error: 'Aplikasi tidak valid.' };
  const list = listHiddenApps();
  const next = list.filter((k) => k !== key);
  if (next.length !== list.length) {
    saveHiddenApps(next);
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Game panel (user-curated collection of games/apps — "Game Shelf")   */
/* ------------------------------------------------------------------ */

export function gamePanelPath(): string {
  return path.join(dataRoot(), 'game-panel.json');
}

export function listGamePanelKeys(): string[] {
  try {
    if (!fs.existsSync(gamePanelPath())) return [];
    const data = JSON.parse(fs.readFileSync(gamePanelPath(), 'utf8'));
    const rawKeys = data?.keys;
    if (!Array.isArray(rawKeys)) return [];
    return rawKeys.filter((k): k is string => typeof k === 'string');
  } catch {
    return [];
  }
}

export function setGamePanelKeys(keys: string[]): { ok: boolean; error?: string; keys: string[] } {
  if (!Array.isArray(keys)) return { ok: false, error: 'Body harus berisi array keys.', keys: [] };
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (typeof k !== 'string') continue;
    const s = k.trim();
    if (!s || s.length > 512 || seen.has(s)) continue;
    const parts = s.split(':');
    if (parts.length < 3) continue;
    if (!parts[0]) continue;
    if (!parts[1]) continue;
    seen.add(s);
    cleaned.push(s);
  }
  if (cleaned.length > 500) {
    return { ok: false, error: 'Terlalu banyak item di panel game.', keys: [] };
  }
  try {
    const file = gamePanelPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ keys: cleaned }, null, 2), 'utf8');
  } catch {
    return { ok: false, error: 'Gagal menyimpan panel game.', keys: [] };
  }
  return { ok: true, keys: cleaned };
}

function menuRowsToEntries(rows: MenuRow[]): AppEntry[] {
  return rows
    .filter(
      (r) =>
        /^[a-zA-Z]:[\\/]/.test(r.target) &&
        path.extname(r.target).toLowerCase() === '.exe' &&
        !isJunkExe(path.basename(r.target))
    )
    .map((r) => ({
      name: (r.name || path.basename(r.target, '.exe')).trim(),
      kind: 'app' as const,
      exe: path.normalize(r.target),
      args: (r.args || '').trim() || undefined,
      cwd: r.cwd && /^[a-zA-Z]:[\\/]/.test(r.cwd) ? path.normalize(r.cwd) : undefined,
      icon: r.icon || r.target,
      source: 'menu' as const,
    }));
}

export async function listCatalog(force = false, showHidden = false): Promise<AppCatalog> {
  const hiddenSet = new Set(listHiddenApps());
  const applyHidden = (entries: AppEntry[]): AppEntry[] =>
    showHidden
      ? entries.map((e) => (hiddenSet.has(hiddenKeyOf(e) ?? '') ? { ...e, hidden: true } : e))
      : entries.filter((e) => !hiddenSet.has(hiddenKeyOf(e) ?? ''));

  let raw =
    !force && rawCache && Date.now() - rawCache.at < CATALOG_CACHE_TTL_MS
      ? rawCache
      : null;
  if (!raw) {
    if (!rawPromise) {
      rawPromise = buildRawCatalog(force).finally(() => {
        rawPromise = null;
      });
    }
    raw = await rawPromise;
    rawCache = raw;
  }

  const apps = applyHidden(raw.apps);
  const games = applyHidden(raw.games);
  return { apps, games, total: apps.length + games.length, scannedAt: raw.at };
}

export async function buildRawCatalog(force = false): Promise<RawCatalog> {
  const raw = await runPowerShell(MENU_SCRIPT, 90_000);
  let scan: SteamScanOut | null = null;
  try {
    const parsed = JSON.parse(raw);
    scan = {
      menu: Array.isArray(parsed?.menu) ? parsed.menu : [],
      steamRoots: Array.isArray(parsed?.steamRoots) ? parsed.steamRoots.map((s: any) => String(s)) : [],
    };
  } catch {
    scan = { menu: [], steamRoots: [] };
  }
  const menu = scan.menu;

  const installed = await listInstalledApps(force);

  const entries: AppEntry[] = menuRowsToEntries(menu);

  for (const app of installed) {
    const category = categorizeInstalledApp(app);
    if (category === 'skip') continue;
    if (category === 'app') {
      const exe = resolveExe(app.displayIcon, app.installLocation);
      if (!exe) continue;
      entries.push({
        name: app.name.trim(),
        kind: 'app',
        exe,
        icon: normalizeIconPath(app.displayIcon) ?? exe,
        cwd: app.installLocation && fs.existsSync(app.installLocation) ? app.installLocation : undefined,
        publisher: app.publisher || undefined,
        version: app.displayVersion || undefined,
        sizeBytes: app.estimatedSizeKb !== undefined ? app.estimatedSizeKb * 1024 : undefined,
        source: 'registry',
      });
    }
  }

  const apps = dedupeEntries(entries.filter((e) => e.kind === 'app')).slice(0, 500);

  for (const c of listCustomApps().map(customMetaToEntry)) {
    if (!c.exe) continue;
    const existing = apps.some((e) => e.exe && e.exe.toLowerCase() === c.exe!.toLowerCase());
    if (!existing && apps.length < 500) apps.push(c);
  }

  const games = dedupeEntries([
    ...scanSteamGames(scan.steamRoots),
    ...scanEpicGames(),
  ]).slice(0, 500);

  for (const app of installed) {
    if (categorizeInstalledApp(app) !== 'game') continue;
    const exe = resolveExe(app.displayIcon, app.installLocation);
    const entry: AppEntry = {
      name: app.name.trim(),
      kind: 'game',
      exe,
      icon: normalizeIconPath(app.displayIcon) ?? exe,
      cwd: app.installLocation && fs.existsSync(app.installLocation) ? app.installLocation : undefined,
      publisher: app.publisher || undefined,
      version: app.displayVersion || undefined,
      sizeBytes: app.estimatedSizeKb !== undefined ? app.estimatedSizeKb * 1024 : undefined,
      source: 'registry',
    };
    if (exe) {
      const existing = games.find((g) => g.exe && g.exe.toLowerCase() === exe.toLowerCase());
      if (existing) {
        existing.publisher = existing.publisher ?? entry.publisher;
        existing.version = existing.version ?? entry.version;
        existing.sizeBytes = existing.sizeBytes ?? entry.sizeBytes;
        continue;
      }
    } else {
      const sameName = games.find((g) => normKey(g.name) === normKey(entry.name));
      const sameDir =
        entry.cwd &&
        games.find((g) => g.cwd && normKey(g.cwd) === normKey(entry.cwd!));
      const existing = sameName ?? sameDir;
      if (existing) {
        existing.publisher = existing.publisher ?? entry.publisher;
        existing.version = existing.version ?? entry.version;
        existing.sizeBytes = existing.sizeBytes ?? entry.sizeBytes;
        existing.icon = existing.icon ?? entry.icon;
        existing.cwd = existing.cwd ?? entry.cwd;
        continue;
      }
    }
    games.push(entry);
  }

  games.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  apps.sort((a, b) => a.name.localeCompare(b.name, 'id'));

  return { at: Date.now(), apps, games };
}

/* ------------------------------------------------------------------ */
/* Launch / reveal helpers                                             */
/* ------------------------------------------------------------------ */

function validateExe(exe: string): string | null {
  if (typeof exe !== 'string') return 'Aplikasi tidak valid.';
  const p = path.normalize(exe.trim());
  if (!/^[a-zA-Z]:[\\/]/.test(p)) return 'Aplikasi tidak valid.';
  if (path.extname(p).toLowerCase() !== '.exe') return 'Aplikasi tidak valid.';
  const temp = os.tmpdir().toLowerCase();
  if (p.toLowerCase().startsWith(temp)) return 'Aplikasi tidak valid.';
  try {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return 'Berkas aplikasi tidak ditemukan.';
  } catch {
    return 'Berkas aplikasi tidak ditemukan.';
  }
  return null;
}

export async function launchApp(exe: string, args?: string, cwd?: string): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const err = validateExe(exe);
  if (err) return { ok: false, error: err };
  const parsed = parseCommandLine(args && args.trim() ? `"${exe}" ${args}` : `"${exe}"`);
  const runArgs = parsed ? parsed.args : [];
  const workDir = cwd && /^[a-zA-Z]:[\\/]/.test(cwd) && fs.existsSync(cwd) ? cwd : path.dirname(exe);
  return new Promise((resolve) => {
    const child = spawn(exe, runArgs, { cwd: workDir, detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', (e) => resolve({ ok: false, error: e?.message || 'Gagal membuka aplikasi.' }));
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true, pid: child.pid });
    });
  });
}

export async function revealTarget(exe?: string, cwd?: string): Promise<{ ok: boolean; error?: string }> {
  const sel = exe && /^[a-zA-Z]:[\\/]/.test(exe) && fs.existsSync(exe) ? path.normalize(exe) : null;
  const folder = !sel && cwd && fs.existsSync(cwd) ? path.normalize(cwd) : null;
  if (!sel && !folder) return { ok: false, error: 'Lokasi tidak ditemukan.' };
  const args = sel ? [`/select,${sel}`] : [folder!];
  return new Promise((resolve) => {
    const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore' });
    child.once('error', (e) => resolve({ ok: false, error: e?.message || 'Gagal membuka lokasi.' }));
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}
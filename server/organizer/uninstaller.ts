import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { homedir } from 'os';
import type { InstalledApp, AppUninstallRun, ResidueEntry } from '../../shared/types.js';

/* ------------------------------------------------------------------ */
/* Installed-app enumeration (Windows registry via PowerShell)          */
/* ------------------------------------------------------------------ */

const LIST_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$roots = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
$rows = New-Object System.Collections.Generic.List[object]
foreach ($root in $roots) {
  Get-ChildItem -Path $root | Where-Object { $_.PSIsContainer } | ForEach-Object {
    $p = Get-ItemProperty -Path $_.PSPath
    if (-not $p.DisplayName) { return }
    $row = [ordered]@{
      key = $_.PSChildName
      name = [string]$p.DisplayName
      displayVersion = if ($p.DisplayVersion) { [string]$p.DisplayVersion } else { $null }
      publisher = if ($p.Publisher) { [string]$p.Publisher } else { $null }
      installDate = if ($p.InstallDate) { [string]$p.InstallDate } else { $null }
      installLocation = if ($p.InstallLocation) { [string]$p.InstallLocation } else { $null }
      uninstallString = if ($p.UninstallString) { [string]$p.UninstallString } else { $null }
      quietUninstallString = if ($p.QuietUninstallString) { [string]$p.QuietUninstallString } else { $null }
      estimatedSizeKb = if ($p.EstimatedSize) { [int64]$p.EstimatedSize } else { $null }
      displayIcon = if ($p.DisplayIcon) { [string]$p.DisplayIcon } else { $null }
      systemComponent = if ($p.SystemComponent) { [int]$p.SystemComponent } else { 0 }
      hasParent = if ($p.ParentKey) { 1 } else { 0 }
      arch = if ($root -like '*WOW6432Node*') { '32-bit' } elseif ($root -like 'HKCU:*') { 'Per-user' } else { '64-bit' }
    }
    $rows.Add([pscustomobject]$row)
  }
}
$rows | ConvertTo-Json -Depth 2 -Compress
`;

const LIST_CACHE_TTL_MS = 30_000;

let listCache: { at: number; apps: InstalledApp[] } | null = null;

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let errOut = '';
    const killTimer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('Timeout membaca daftar aplikasi.'));
    }, 25_000);
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { errOut += d.toString('utf8'); });
    child.on('error', (e) => {
      clearTimeout(killTimer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (out.trim()) resolve(out.trim());
      else reject(new Error((errOut && errOut.trim()) ? errOut.trim() : 'PowerShell keluar dengan kode ' + code));
    });
  });
}

export async function listInstalledApps(force = false): Promise<InstalledApp[]> {
  if (!force && listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) {
    return listCache.apps;
  }
  const raw = await runPowerShell(LIST_SCRIPT);
  let parsed: any[] = [];
  try {
    const value = JSON.parse(raw);
    parsed = Array.isArray(value) ? value : [];
  } catch {
    parsed = [];
  }
  const apps: InstalledApp[] = parsed
    .filter((a) => a && typeof a.name === 'string' && a.name.trim() && !a.systemComponent && !a.hasParent)
    .map((a) => ({
      key: String(a.key || ''),
      name: a.name.trim(),
      displayVersion: a.displayVersion || undefined,
      publisher: a.publisher || undefined,
      installDate: a.installDate || undefined,
      installLocation: a.installLocation || undefined,
      uninstallString: a.uninstallString || undefined,
      quietUninstallString: a.quietUninstallString || undefined,
      estimatedSizeKb: typeof a.estimatedSizeKb === 'number' ? a.estimatedSizeKb : undefined,
      displayIcon: a.displayIcon || undefined,
      arch: a.arch || undefined,
      hkcu: !!a.hkcu,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  listCache = { at: Date.now(), apps };
  return apps;
}

/* ------------------------------------------------------------------ */
/* Command-line parsing / normalization                                 */
/* ------------------------------------------------------------------ */

export function expandEnv(s: string): string {
  return String(s).replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] || (_m as string));
}

/** Split a Windows command line (e.g. an UninstallString) into command + args. */
export function parseCommandLine(input: string): { command: string; args: string[] } | null {
  const s = String(input || '').trim();
  if (!s) return null;
  const parts: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuote && s[i + 1] === '"') { buf += '"'; i++; continue; }
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (buf) { parts.push(buf); buf = ''; }
      continue;
    }
    buf += ch;
  }
  if (buf) parts.push(buf);
  if (parts.length === 0) return null;
  return { command: expandEnv(parts[0]), args: parts.slice(1).map(expandEnv) };
}

function isMsi(command: string): boolean {
  const base = path.basename(command || '').toLowerCase();
  return base === 'msiexec' || base === 'msiexec.exe';
}

/**
 * Turn an (un)install command into an uninstall command. For MSI installers
 * `/I{GUID}` is rewritten to `/X{GUID}` and silent flags may be appended.
 */
export function toUninstallCommand(parsed: { command: string; args: string[] }, silent: boolean): { command: string; args: string[] } {
  if (isMsi(parsed.command)) {
    const args = parsed.args.map((a) => {
      const m = /^\/[Ii]\{(.*)\}$/.exec(a.trim());
      if (m) return '/X{' + m[1] + '}';
      return a;
    });
    const joined = args.join(' ').toLowerCase();
    const hasX = /\/x\{/.test(joined);
    if (silent) {
      if (!/\/qn\b/.test(joined)) args.push('/qn');
      if (!/\/norestart\b/.test(joined)) args.push('/norestart');
    } else if (!hasX) {
      // no /X yet and no MSI-style product code found — leave as-is
    }
    return { command: parsed.command, args };
  }
  return parsed;
}

/**
 * Build the command to actually run. Prefers a quiet uninstall string when
 * silent is requested, otherwise the plain UninstallString.
 */
export function buildUninstallCommand(app: InstalledApp, silent: boolean): { command: string; args: string[] } | null {
  const source = silent && app.quietUninstallString ? app.quietUninstallString : app.uninstallString;
  const parsed = parseCommandLine(source || '');
  if (!parsed) return null;
  return toUninstallCommand(parsed, silent);
}

/* ------------------------------------------------------------------ */
/* Uninstall runs                                                       */
/* ------------------------------------------------------------------ */

const runs = new Map<string, AppUninstallRun>();

export function getUninstallRun(id: string): AppUninstallRun | undefined {
  return runs.get(id);
}

export function createUninstallRun(app: InstalledApp): AppUninstallRun {
  const run: AppUninstallRun = {
    id: randomUUID(),
    startedAt: Date.now(),
    name: app.name,
    launched: false,
    finished: false,
    exitCode: null,
  };
  runs.set(run.id, run);
  return run;
}

function finishRun(run: AppUninstallRun, exitCode: number | null, error?: string) {
  run.finished = true;
  run.exitCode = exitCode;
  if (error) run.error = error;
}

export function launchUninstall(run: AppUninstallRun, app: InstalledApp, silent: boolean): Promise<void> {
  return new Promise((resolve) => {
    const built = buildUninstallCommand(app, silent);
    if (!built) {
      finishRun(run, null, 'Springer uninstall tidak ditemukan untuk aplikasi ini.');
      return resolve();
    }
    const { command, args } = built;
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    run.launched = true;
    child.on('error', (e: any) => {
      finishRun(run, null, e?.code === 'ENOENT' ? 'File uninstaller tidak ditemukan.' : (e?.message || 'Gagal menjalankan uninstaller.'));
    });
    child.on('exit', (code) => {
      finishRun(run, code);
    });
    child.unref();
    resolve();
  });
}

/** Run the uninstaller elevated via a UAC prompt (shell-backed, waits for exit). */
export function launchUninstallAsAdmin(run: AppUninstallRun, app: InstalledApp, silent: boolean): Promise<void> {
  return new Promise((resolve) => {
    const built = buildUninstallCommand(app, silent);
    if (!built) {
      finishRun(run, null, 'Springer uninstall tidak ditemukan untuk aplikasi ini.');
      return resolve();
    }
    const { command, args } = built;
    const esc = (v: string) => "'" + String(v).replace(/'/g, "''") + "'";
    const argList = args.map(esc).join(', ');
    const script =
      `$ErrorActionPreference='Stop'\n` +
      `$cmd=${esc(command)}\n` +
      `$args=@(${argList})\n` +
      `Start-Process -FilePath $cmd -ArgumentList $args -Verb RunAs -Wait\n`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: 'ignore',
    });
    run.asAdmin = true;
    run.launched = true;
    ps.on('error', (e: any) => {
      finishRun(run, null, e?.message || 'Gagal memulai uninstaller (admin).');
    });
    ps.on('exit', (code) => {
      finishRun(run, code);
    });
    resolve();
  });
}

/* ------------------------------------------------------------------ */
/* Residue scanning & safe cleanup                                      */
/* ------------------------------------------------------------------ */

function randir(): string { return process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'); }
function localAppData(): string { return process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'); }
function programData(): string { return process.env.PROGRAMDATA || 'C:\\ProgramData'; }

function nameTokens(name: string): string[] {
  const set = new Set<string>();
  const add = (t: string) => {
    const v = String(t || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (v && v.length > 1) set.add(v);
  };
  add(name);
  add(name.replace(/[Ii]nstaller.*$/, '').replace(/\s+/g, ' ').trim());
  const firstWord = name.split(/[\s(&#0-9-]+/).find((w) => w.length >= 3);
  if (firstWord) add(firstWord);
  add(name.toLowerCase());
  return [...set];
}

function folderSize(p: string, capEntries = 4000): number {
  let total = 0;
  let seen = 0;
  try {
    const walk = (dir: string) => {
      if (seen >= capEntries) return;
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (seen >= capEntries) return;
        const full = path.join(dir, e.name);
        try {
          if (e.isDirectory()) walk(full);
          else if (e.isFile()) { total += fs.statSync(full).size; seen++; }
        } catch { /* ignore */ }
      }
    };
    walk(p);
  } catch { /* ignore */ }
  return total;
}

/** Candidate data locations to inspect for leftovers. */
export function residueRoots(app: InstalledApp): string[] {
  const roots = new Set<string>();
  if (app.installLocation && fs.existsSync(app.installLocation) && fs.statSync(app.installLocation).isDirectory()) {
    roots.add(app.installLocation);
  }
  const tokens = nameTokens(app.name);
  const installName = app.installLocation ? path.basename(app.installLocation.trim().replace(/[\\/]+$/, '')) : null;
  if (installName) tokens.unshift(installName);
  for (const token of tokens) {
    roots.add(path.join(randir(), token));
    roots.add(path.join(localAppData(), token));
    roots.add(path.join(programData(), token));
  }
  return [...roots];
}

export async function scanResidue(app: InstalledApp): Promise<ResidueEntry[]> {
  const entries: ResidueEntry[] = [];
  const seen = new Set<string>();
  const roots = residueRoots(app);

  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      const st = fs.statSync(root);
      const kind = st.isDirectory() ? 'folder' : 'file';
      if (seen.has(root)) continue;
      seen.add(root);
      entries.push({ path: root, kind, sizeBytes: kind === 'folder' ? folderSize(root) : st.size });
    } catch { /* ignore */ }
  }

  // Start Menu shortcuts (Roaming + All Users).
  const startMenuRoots = [
    path.join(randir(), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(programData(), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
  const tokens = nameTokens(app.name).map((t) => t.toLowerCase());
  for (const sm of startMenuRoots) {
    try {
      if (!fs.existsSync(sm)) continue;
      for (const e of fs.readdirSync(sm)) {
        const full = path.join(sm, e);
        const st = fs.statSync(full);
        const lower = String(e).toLowerCase();
        const hit = tokens.some((t) => lower.includes(t) || String(t).toLowerCase().includes(/^[a-z0-9 ]+$/.test(t) ? lower.slice(0, Math.max(12, e.length)) : t));
        if (hit) {
          if (seen.has(full)) continue;
          seen.add(full);
          entries.push({ path: full, kind: st.isDirectory() ? 'folder' : 'shortcut', sizeBytes: st.isDirectory() ? folderSize(full) : st.size });
        }
      }
    } catch { /* ignore */ }
  }

  return entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

/** Delete path(s) listed in a residue scan — re-verifies they are still known leftovers. */
export async function deleteResidue(app: InstalledApp, paths: string[]): Promise<{ path: string; ok: boolean; error?: string }[]> {
  const known = await scanResidue(app);
  const allowed = new Set(known.map((k) => path.resolve(k.path.toLowerCase())));
  const targets = [...new Set(paths.map((p) => path.resolve(String(p))))].filter((p) => allowed.has(p.toLowerCase()));

  const results: { path: string; ok: boolean; error?: string }[] = [];
  if (targets.length === 0) {
    return paths.map((p) => ({ path: p, ok: false, error: 'Item bukan residu (sudah dihapus atau tidak dikenali).' }));
  }

  const list = targets.map((p) => "'" + p.replace(/'/g, "''") + "'").join(', ');
  const script =
    `$ErrorActionPreference='Continue'\n` +
    `Add-Type -AssemblyName Microsoft.VisualBasic\n` +
    `$paths=@(${list})\n` +
    `foreach ($p in $paths) {\n` +
    `  try {\n` +
    `    if (Test-Path -LiteralPath $p -PathType Container) {\n` +
    `      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')\n` +
    `    } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin') }\n` +
    `    Write-Output ('OK:' + $p)\n` +
    `  } catch { Write-Output ('ERR:' + $p + '||' + $_.Exception.Message) }\n` +
    `}\n`;
  const raw = await runPowerShell(script);
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('OK:')) results.push({ path: line.slice(3), ok: true });
    else if (line.startsWith('ERR:')) {
      const [p, err] = line.slice(4).split('||');
      results.push({ path: p, ok: false, error: err || 'Gagal menghapus' });
    }
  }
  for (const target of targets) {
    if (!results.some((r) => path.resolve(r.path) === target)) {
      results.push({ path: target, ok: false, error: 'Item sudah tidak ada.' });
    }
  }
  return results;
}
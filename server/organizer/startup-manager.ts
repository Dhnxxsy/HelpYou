import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import type { StartupItem } from '../../shared/types.js';
import { runPowerShell, runElevatedPowerShell, psQuote } from '../utils/powershell.js';

const isWindows = process.platform === 'win32';

const RUN_KEYS: { hive: 'HKCU' | 'HKLM' | 'HKLM32'; key: string; admin: boolean }[] = [
  { hive: 'HKCU', key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', admin: false },
  { hive: 'HKLM', key: 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', admin: true },
  { hive: 'HKLM32', key: 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', admin: true },
];

function env(name: string): string {
  return process.env[name] || '';
}

function startupFolder(scope: 'user' | 'prog'): string {
  if (scope === 'prog') {
    return path.join(env('PROGRAMDATA') || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  }
  return path.join(env('APPDATA') || path.join(homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function disabledFolderFor(startupDir: string): string {
  return path.join(path.dirname(startupDir), 'HelpYou-Disabled');
}

function expandEnv(s: string): string {
  return String(s).replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] || _m);
}

/** Try to extract the executable path from a startup command line. */
export function resolveExe(command: string): string | null {
  const c = String(command || '').trim();
  if (!c) return null;
  let exe = '';
  const quoted = c.match(/^"([^"]+\.(?:exe|bat|cmd|com|msi))"(\s|$)/i);
  if (quoted) {
    exe = quoted[1];
  } else {
    const idx = c.toLowerCase().indexOf('.exe');
    if (idx >= 0) {
      const before = c.slice(0, idx + 4);
      const q = before.lastIndexOf('"');
      exe = q >= 0 ? before.slice(q + 1) : before;
    } else {
      const first = c.split(/\s+/)[0];
      if (/\.(exe|bat|cmd|com|msi)$/i.test(first)) exe = first;
    }
  }
  if (!exe) return null;
  exe = expandEnv(exe).trim().replace(/^"|"$/g, '');
  return exe || null;
}

/* ------------------------- PowerShell enumeration ------------------------- */

const LIST_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$rows = New-Object System.Collections.Generic.List[object]
$runKeys = @(
  @{ hive='HKCU'; key='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; admin=$false },
  @{ hive='HKLM'; key='HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; admin=$true },
  @{ hive='HKLM32'; key='HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; admin=$true }
)
foreach ($r in $runKeys) {
  if (Test-Path -LiteralPath $r.key) {
    $props = Get-ItemProperty -LiteralPath $r.key
    $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
      $rows.Add([pscustomobject]@{
        type='registry'; hive=$r.hive; registryPath=$r.key; valueName=$_.Name;
        command=[string]$_.Value; admin=$r.admin; enabled=$true
      })
    }
  }
}
$folders = @(
  @{ dir=(Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'); admin=$false; location='Startup Folder'; disabled=$false },
  @{ dir=(Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'); admin=$true; location='Startup Folder (Semua Pengguna)'; disabled=$false },
  @{ dir=(Join-Path (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs') 'HelpYou-Disabled'); admin=$false; location='Startup Folder (nonaktif)'; disabled=$true },
  @{ dir=(Join-Path (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs') 'HelpYou-Disabled'); admin=$true; location='Startup Folder (nonaktif)'; disabled=$true }
)
foreach ($f in $folders) {
  if (Test-Path -LiteralPath $f.dir) {
    Get-ChildItem -LiteralPath $f.dir -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
      $rows.Add([pscustomobject]@{
        type='file'; filePath=$_.FullName; name=$_.BaseName; command=$_.FullName;
        admin=$f.admin; enabled=(-not $f.disabled); location=$f.location
      })
    }
  }
}
$rows | ConvertTo-Json -Depth 3 -Compress
`;

interface RawRegItem {
  type: 'registry';
  hive: 'HKCU' | 'HKLM' | 'HKLM32';
  registryPath: string;
  valueName: string;
  command: string;
  admin: boolean;
  enabled: boolean;
}

interface RawFileItem {
  type: 'file';
  filePath: string;
  name: string;
  command: string;
  admin: boolean;
  enabled: boolean;
  location: string;
}

function parseRows(raw: string): (RawRegItem | RawFileItem)[] {
  let arr: any[] = [];
  try {
    const v = JSON.parse(raw);
    arr = Array.isArray(v) ? v : [];
  } catch {
    arr = [];
  }
  return arr.filter((r) => r && (r.type === 'registry' || r.type === 'file'));
}

/* ------------------------------- Journal ------------------------------- */

const DATA_ROOT = process.env.FO_DATA ? path.resolve(process.env.FO_DATA) : process.cwd();
const JOURNAL_DIR = path.join(DATA_ROOT, '.file-organizer');
const JOURNAL_FILE = path.join(JOURNAL_DIR, 'startup-journal.json');

export interface JournalEntry {
  hive: string;
  registryPath: string;
  valueName: string;
  command: string;
  admin: boolean;
  kind?: string;   // registry value kind (String, ExpandString, DWord, ...)
  raw?: string;    // packed raw value: str:..., b64:..., dword:..., multi:...
}

function readJournal(): Record<string, JournalEntry> {
  try {
    if (fs.existsSync(JOURNAL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
      if (raw && typeof raw === 'object') return raw as Record<string, JournalEntry>;
    }
  } catch { /* ignore */ }
  return {};
}

function writeJournal(map: Record<string, JournalEntry>) {
  try {
    if (!fs.existsSync(JOURNAL_DIR)) fs.mkdirSync(JOURNAL_DIR, { recursive: true });
    fs.writeFileSync(JOURNAL_FILE, JSON.stringify(map, null, 2));
  } catch { /* ignore */ }
}

/* ------------------------------ Public API ------------------------------ */

function idForReg(hive: string, valueName: string): string {
  return hive + ':' + valueName;
}

function toItem(row: RawRegItem | RawFileItem, journal: Record<string, JournalEntry>): StartupItem | null {
  if (row.type === 'registry') {
    const id = idForReg(row.hive, row.valueName);
    const disabled = !!journal[id];
    const exePath = resolveExe(row.command);
    return {
      id,
      type: 'registry',
      name: row.valueName,
      command: row.command,
      location: row.hive === 'HKCU' ? 'HKCU · Run' : row.hive === 'HKLM32' ? 'HKLM · Run (32-bit)' : 'HKLM · Run',
      hive: row.hive,
      registryPath: row.registryPath,
      valueName: row.valueName,
      admin: row.admin,
      enabled: !disabled,
      exePath,
      exists: exePath ? fs.existsSync(exePath) : undefined,
      folderPath: exePath ? path.dirname(exePath) : undefined,
    };
  }
  // file item
  const dir = path.dirname(row.filePath);
  const isDisabledDir = path.basename(dir).toLowerCase() === 'helpyou-disabled';
  const enabled = !isDisabledDir && row.enabled !== false;
  const exePath: string | null = /\.(?:lnk|url)$/i.test(row.filePath) ? null : row.filePath;
  return {
    id: 'file:' + row.filePath.toLowerCase(),
    type: 'file',
    name: row.name,
    command: row.filePath,
    location: row.location || 'Startup Folder',
    filePath: row.filePath,
    admin: row.admin,
    enabled,
    exePath,
    exists: fs.existsSync(row.filePath),
    folderPath: path.dirname(row.filePath),
  };
}

export async function listStartupItems(): Promise<StartupItem[]> {
  if (!isWindows) return [];
  const raw = await runPowerShell(LIST_SCRIPT);
  const rows = parseRows(raw);
  const journal = readJournal();

  const items: StartupItem[] = [];
  const seenIds = new Set<string>();
  for (const row of rows) {
    const item = toItem(row, journal);
    if (!item) continue;
    items.push(item);
    seenIds.add(item.id);
    // drop stale journal entries that are live again
    if (item.type === 'registry' && item.enabled && journal[item.id]) {
      const next = { ...journal };
      delete next[item.id];
      writeJournal(next);
    }
  }

  // disabled registry items only exist in the journal
  for (const [id, j] of Object.entries(journal)) {
    if (seenIds.has(id)) continue;
    const exePath = resolveExe(j.command);
    items.push({
      id,
      type: 'registry',
      name: j.valueName,
      command: j.command,
      location: j.hive === 'HKLM' || j.hive === 'HKLM32' ? 'HKLM · Run' : 'HKCU · Run',
      hive: j.hive as 'HKCU' | 'HKLM' | 'HKLM32',
      registryPath: j.registryPath,
      valueName: j.valueName,
      admin: !!j.admin,
      enabled: false,
      exePath,
      exists: exePath ? fs.existsSync(exePath) : undefined,
      folderPath: exePath ? path.dirname(exePath) : undefined,
    });
  }

  return items.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, 'id'));
}

/* ------------------------------ Operations ------------------------------ */

export function regStatus(line: string): { ok: boolean; error?: string; value?: string } {
  if (line.trim() === 'OK') return { ok: true, value: 'OK' };
  if (line.startsWith('OK:')) return { ok: true, value: line.slice(3) };
  if (line.startsWith('ERR:')) return { ok: false, error: line.slice(4).trim() || 'Operasi gagal.' };
  return { ok: false, error: line || 'Operasi gagal.' };
}

/** Read a registry value with its exact type preserving %VAR% / DWORD / binary content. */
function registryCaptureScript(item: StartupItem): string {
  const key = psQuote(item.registryPath || '');
  const name = psQuote(item.valueName || '');
  return (
    `$ErrorActionPreference='Stop'\ntry {\n` +
    `  $rk = Get-Item -LiteralPath ${key}\n` +
    `  $kind = $rk.GetValueKind(${name}).ToString()\n` +
    `  $raw = $rk.GetValue(${name}, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)\n` +
    `  Remove-ItemProperty -LiteralPath ${key} -Name ${name}\n` +
    `  if ($kind -eq 'Binary') { $pack = 'b64:' + [Convert]::ToBase64String([byte[]]$raw) }\n` +
    `  elseif ($raw -is [string[]]) { $pack = 'multi:' + ($raw -join [char]1) }\n` +
    `  elseif ($raw -is [int]) { $pack = 'dword:' + $raw }\n` +
    `  else { $pack = 'str:' + [string]$raw }\n` +
    `  Write-Output ('OK:' + $kind + '|' + $pack)\n` +
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`
  );
}

/** Re-create a registry value preserving the exact kind and raw content. */
function registryRestoreScript(item: StartupItem, entry: JournalEntry): string {
  const key = psQuote(item.registryPath || '');
  const name = psQuote(item.valueName || '');
  const kind = entry.kind && ['String', 'ExpandString', 'Binary', 'DWord', 'MultiString', 'QWord'].includes(entry.kind)
    ? entry.kind
    : 'String';
  const packed = entry.raw && entry.raw.startsWith('str:') ? entry.raw
    : entry.raw && entry.raw.startsWith('b64:') ? entry.raw
    : entry.raw && entry.raw.startsWith('multi:') ? entry.raw
    : entry.raw && entry.raw.startsWith('dword:') ? entry.raw
    : 'str:' + (entry.command || '');
  let literal: string;
  if (packed.startsWith('b64:')) {
    literal = `([Convert]::FromBase64String(${psQuote(packed.slice(4))}))`;
  } else if (packed.startsWith('multi:')) {
    literal = `(@(${packed.slice(6).split('\u0001').map(psQuote).join(', ')}))`;
  } else if (packed.startsWith('dword:')) {
    literal = `([int]${packed.slice(6)})`;
  } else {
    literal = psQuote(packed.slice(4));
  }
  return (
    `$ErrorActionPreference='Stop'\ntry {\n` +
    `  if (-not (Test-Path -LiteralPath ${key})) { New-Item -Path ${key} -Force | Out-Null }\n` +
    `  New-ItemProperty -LiteralPath ${key} -Name ${name} -Value ${literal} -PropertyType ${psQuote(kind)} -Force | Out-Null\n` +
    `  Write-Output 'OK'\n` +
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`
  );
}

function registryDeleteScript(item: StartupItem): string {
  const key = psQuote(item.registryPath || '');
  const name = psQuote(item.valueName || '');
  return (
    `$ErrorActionPreference='Stop'\ntry {\n` +
    `  Remove-ItemProperty -LiteralPath ${key} -Name ${name} -ErrorAction Stop\n` +
    `  Write-Output 'OK'\n` +
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`
  );
}

export function parseRegCapture(raw: string): { kind: string; packed: string; display: string } | null {
  const line = raw.startsWith('OK:') ? raw.slice(3) : raw;
  const sep = line.indexOf('|');
  if (sep < 0) return null;
  const kind = line.slice(0, sep);
  const packed = line.slice(sep + 1);
  if (!kind || !packed) return null;
  let display = '';
  if (packed.startsWith('str:')) display = packed.slice(4);
  else if (packed.startsWith('multi:')) display = packed.slice(6).split('\u0001').join(', ');
  else if (packed.startsWith('dword:')) display = packed.slice(6) + ' (DWORD)';
  else if (packed.startsWith('b64:')) display = '[data biner]';
  return { kind, packed, display };
}

/** Run a toggle script, mapping a cancelled UAC prompt to a friendly message. */
async function runToggleScript(script: string, admin: boolean): Promise<{ ok: boolean; error?: string; value?: string }> {
  try {
    const out = admin ? await runElevatedPowerShell(script) : await runPowerShell(script);
    return regStatus(out);
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    return { ok: false, error: /dibatalkan|dibataikan|UAC|elevation|admin/i.test(msg) ? 'Izin Administrator (UAC) dibatalkan.' : msg };
  }
}

function isUnder(p: string, root: string): boolean {
  const r = path.resolve(root).toLowerCase();
  const t = path.resolve(p).toLowerCase();
  return t === r || t.startsWith(r + path.sep);
}

/** Move a Startup folder item between the active folder and HelpYou-Disabled. */
async function fileToggle(item: StartupItem, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const src = item.filePath;
  if (!src) return { ok: false, error: 'File tidak ditemukan.' };
  const scope: 'user' | 'prog' = item.admin ? 'prog' : 'user';
  const activeDir = startupFolder(scope);
  const disabledDir = disabledFolderFor(activeDir);
  const dest = enabled ? path.join(activeDir, path.basename(src)) : path.join(disabledDir, path.basename(src));

  if (!isUnder(src, activeDir) && !isUnder(src, disabledDir)) {
    return { ok: false, error: 'Item berada di luar folder Startup.' };
  }
  if (!fs.existsSync(src)) return { ok: false, error: 'Berkas tidak ditemukan.' };

  if (item.admin) {
    const script =
      `$ErrorActionPreference='Stop'\ntry {\n` +
      `  if (-not (Test-Path -LiteralPath ${psQuote(disabledDir)})) { New-Item -ItemType Directory -Path ${psQuote(disabledDir)} -Force | Out-Null }\n` +
      `  Move-Item -LiteralPath ${psQuote(src)} -Destination ${psQuote(dest)} -Force\n` +
      `  Write-Output 'OK'\n` +
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`;
    return runToggleScript(script, true);
  }

  try {
    if (!enabled && !fs.existsSync(disabledDir)) fs.mkdirSync(disabledDir, { recursive: true });
    fs.renameSync(src, dest);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gagal memindahkan berkas.' };
  }
}

/** Enable or disable a startup item. Returns fresh item state after the change. */
export async function setStartupItemEnabled(item: StartupItem, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  if (item.type === 'file') {
    return fileToggle(item, enabled);
  }
  if (item.type !== 'registry' || !item.registryPath || !item.valueName) {
    return { ok: false, error: 'Item tidak valid.' };
  }
  const journal = readJournal();
  const id = idForReg(item.hive || 'HKCU', item.valueName);

  if (!enabled) {
    const cap = await runToggleScript(registryCaptureScript(item), item.admin);
    if (!cap.ok) return cap;
    const parsed = parseRegCapture(cap.value || '');
    if (!parsed) return { ok: false, error: 'Respons server tidak dikenali.' };
    writeJournal({
      ...journal,
      [id]: {
        hive: item.hive || 'HKCU',
        registryPath: item.registryPath,
        valueName: item.valueName,
        command: parsed.display || item.command,
        admin: item.admin,
        kind: parsed.kind,
        raw: parsed.packed,
      },
    });
    return { ok: true };
  }

  const entry = journal[id] as JournalEntry | undefined;
  const st = await runToggleScript(registryRestoreScript(item, entry || { ...itemAsJournal(item) }), item.admin);
  if (!st.ok) return st;
  const next = { ...journal };
  delete next[id];
  writeJournal(next);
  return { ok: true };
}

function itemAsJournal(item: StartupItem): JournalEntry {
  return {
    hive: item.hive || 'HKCU',
    registryPath: item.registryPath || '',
    valueName: item.valueName || '',
    command: item.command || '',
    admin: !!item.admin,
  };
}

/** Permanently remove a startup item (registry value removed, file to Recycle Bin). */
export async function deleteStartupItem(item: StartupItem): Promise<{ ok: boolean; error?: string }> {
  if (item.type === 'file') {
    const scope: 'user' | 'prog' = item.admin ? 'prog' : 'user';
    const activeDir = startupFolder(scope);
    const disabledDir = disabledFolderFor(activeDir);
    if (!isUnder(item.filePath || '', activeDir) && !isUnder(item.filePath || '', disabledDir)) {
      return { ok: false, error: 'Item berada di luar folder Startup.' };
    }
    const script =
      `$ErrorActionPreference='Continue'\n` +
      `Add-Type -AssemblyName Microsoft.VisualBasic\n` +
      `try { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(${psQuote(item.filePath || '')},'OnlyErrorDialogs','SendToRecycleBin'); Write-Output 'OK' } catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`;
    return runToggleScript(script, item.admin);
  }
  if (item.type !== 'registry' || !item.registryPath || !item.valueName) {
    return { ok: false, error: 'Item tidak valid.' };
  }
  const out = await runToggleScript(registryDeleteScript(item), item.admin);
  const st = regStatus(out.value || out.error || '');
  if (st.ok && out.ok) {
    const journal = readJournal();
    const id = idForReg(item.hive || 'HKCU', item.valueName);
    if (journal[id]) {
      const next = { ...journal };
      delete next[id];
      writeJournal(next);
    }
  }
  return out.ok ? { ok: true } : { ok: false, error: out.error };
}
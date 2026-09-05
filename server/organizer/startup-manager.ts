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
  @{ dir=(Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'); admin=$false; location='Startup Folder' },
  @{ dir=(Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'); admin=$true; location='Startup Folder (Semua Pengguna)' }
)
foreach ($f in $folders) {
  if (Test-Path -LiteralPath $f.dir) {
    Get-ChildItem -LiteralPath $f.dir -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
      $rows.Add([pscustomobject]@{
        type='file'; filePath=$_.FullName; name=$_.BaseName; command=$_.FullName;
        admin=$f.admin; enabled=$true; location=$f.location
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
  const enabled = !isDisabledDir;
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
    exists: exePath ? fs.existsSync(exePath) : true,
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

function regStatus(line: string): { ok: boolean; error?: string; value?: string } {
  if (line.startsWith('OK:')) return { ok: true, value: line.slice(3) };
  if (line.startsWith('ERR:')) return { ok: false, error: line.slice(4).trim() || 'Operasi gagal.' };
  return { ok: false, error: line || 'Operasi gagal.' };
}

function registryToggleScript(kind: 'get' | 'set' | 'delete', item: StartupItem, command?: string): string {
  const key = psQuote(item.registryPath || '');
  const name = psQuote(item.valueName || '');
  const head = `$ErrorActionPreference='Stop'\ntry {\n`;
  if (kind === 'get') {
    return (
      head +
      `  $v = Get-ItemPropertyValue -LiteralPath ${key} -Name ${name}\n` +
      `  Remove-ItemProperty -LiteralPath ${key} -Name ${name}\n` +
      `  Write-Output ('OK:' + $v)\n` +
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`
    );
  }
  if (kind === 'set') {
    const val = psQuote(command || '');
    return (
      head +
      `  New-ItemProperty -LiteralPath ${key} -Name ${name} -Value ${val} -PropertyType String -Force | Out-Null\n` +
      `  Write-Output 'OK'\n` +
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`
    );
  }
  return (
    head +
    `  Remove-ItemProperty -LiteralPath ${key} -Name ${name}\n` +
    `  Write-Output 'OK'\n` +
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`
  );
}

function fileToggle(item: StartupItem, enabled: boolean): { ok: boolean; error?: string } {
  const src = item.filePath;
  if (!src || !fs.existsSync(src) && !enabled) return { ok: false, error: 'File tidak ditemukan.' };
  const scope: 'user' | 'prog' = item.admin ? 'prog' : 'user';
  const activeDir = startupFolder(scope);
  const disabledDir = disabledFolderFor(activeDir);

  const activePath = path.join(activeDir, path.basename(src));
  if (!isUnder(src, activeDir) && !isUnder(src, disabledDir)) {
    return { ok: false, error: 'Item berada di luar folder Startup.' };
  }
  try {
    if (enabled) {
      if (!fs.existsSync(src)) return { ok: false, error: 'Berkas tidak ditemukan.' };
      if (!fs.existsSync(disabledDir)) return { ok: false, error: 'Ruang penyimpanan nonaktif tidak ditemukan.' };
      fs.renameSync(src, activePath);
    } else {
      if (!fs.existsSync(disabledDir)) fs.mkdirSync(disabledDir, { recursive: true });
      fs.renameSync(src, path.join(disabledDir, path.basename(src)));
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gagal memindahkan berkas.' };
  }
}

function isUnder(p: string, root: string): boolean {
  const r = path.resolve(root).toLowerCase();
  const t = path.resolve(p).toLowerCase();
  return t === r || t.startsWith(r + path.sep);
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
    const script = registryToggleScript('get', item);
    const out = item.admin
      ? await runElevatedPowerShell(script)
      : await runPowerShell(script);
    const st = regStatus(out);
    if (!st.ok) return st;
    writeJournal({ ...journal, [id]: { hive: item.hive || 'HKCU', registryPath: item.registryPath, valueName: item.valueName, command: st.value || item.command, admin: item.admin } });
    return { ok: true };
  }

  const entry = journal[id];
  const command = entry?.command ?? item.command;
  const script = registryToggleScript('set', item, command);
  const out = item.admin
    ? await runElevatedPowerShell(script)
    : await runPowerShell(script);
  const st = regStatus(out);
  if (!st.ok) return st;
  const next = { ...journal };
  delete next[id];
  writeJournal(next);
  return { ok: true };
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
    const out = item.admin ? await runElevatedPowerShell(script) : await runPowerShell(script);
    return regStatus(out);
  }
  if (item.type !== 'registry' || !item.registryPath || !item.valueName) {
    return { ok: false, error: 'Item tidak valid.' };
  }
  const script = registryToggleScript('delete', item);
  const out = item.admin ? await runElevatedPowerShell(script) : await runPowerShell(script);
  const st = regStatus(out);
  if (!st.ok) return st;
  const journal = readJournal();
  const id = idForReg(item.hive || 'HKCU', item.valueName);
  if (journal[id]) {
    const next = { ...journal };
    delete next[id];
    writeJournal(next);
  }
  return { ok: true };
}
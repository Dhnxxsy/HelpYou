import fs from 'fs';
import path from 'path';
import os from 'os';
import type { JunkTarget, JunkScanResult, JunkCleanOutcome } from '../../shared/types.js';
import { psQuote, runElevatedPowerShell } from '../utils/powershell.js';

const isWindows = process.platform === 'win32';

const MAX_MEASURE_ENTRIES = 30_000;

function env(name: string): string {
  return process.env[name] || '';
}

function userPaths() {
  const local = env('LOCALAPPDATA') || path.join(os.homedir(), 'AppData', 'Local');
  const roaming = env('APPDATA') || path.join(os.homedir(), 'AppData', 'Roaming');
  const temp = env('TEMP') || env('TMP') || path.join(local, 'Temp');
  return { local, roaming, temp };
}

/** Static list of known junk locations (safe whitelist — never arbitrary dirs). */
export function junkCatalog(): Omit<JunkTarget, 'sizeBytes' | 'itemCount' | 'exists'>[] {
  if (!isWindows) return [];
  const u = userPaths();
  const win = path.parse(env('SystemRoot') || 'C:\\Windows').root + 'Windows';
  const winDir = env('SystemRoot') || win;
  return [
    {
      id: 'user-temp',
      label: 'Temp Pengguna',
      note: 'File sementara milik akun Anda (TEMP/TMP)',
      path: u.temp,
      admin: false,
    },
    {
      id: 'crash-dumps',
      label: 'Crash Dumps',
      note: 'Laporan crash aplikasi yang sudah tidak berguna',
      path: path.join(u.local, 'CrashDumps'),
      admin: false,
    },
    {
      id: 'recent',
      label: 'Daftar File Terbaru',
      note: 'Pintasan file terbaru di menu Start & Jump List',
      path: path.join(u.roaming, 'Microsoft', 'Windows', 'Recent'),
      admin: false,
    },
    {
      id: 'win-temp',
      label: 'Temp Windows',
      note: 'File sementara sistem (perlu izin admin)',
      path: path.join(winDir, 'Temp'),
      admin: true,
    },
    {
      id: 'update-cache',
      label: 'Cache Pembaruan Windows',
      note: 'Sisa unduhan pembaruan — akan diunduh ulang bila perlu',
      path: path.join(winDir, 'SoftwareDistribution', 'Download'),
      admin: true,
    },
    {
      id: 'prefetch',
      label: 'Prefetch',
      note: 'Cache pemuatan aplikasi Windows',
      path: path.join(winDir, 'Prefetch'),
      admin: true,
    },
  ];
}

/** Measure total size & item count of a folder (bounded DFS). */
function measureFolder(dir: string): { sizeBytes: number; itemCount: number } {
  let sizeBytes = 0;
  let itemCount = 0;
  let seen = 0;
  const walk = (cur: string, depth: number) => {
    if (seen >= MAX_MEASURE_ENTRIES || depth > 40) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (seen >= MAX_MEASURE_ENTRIES) return;
      const full = path.join(cur, e.name);
      try {
        if (e.isDirectory()) {
          walk(full, depth + 1);
          itemCount++;
        } else if (e.isFile()) {
          sizeBytes += fs.statSync(full).size;
          itemCount++;
          seen++;
        }
      } catch { /* locked items are skipped */ }
    }
  };
  walk(dir, 0);
  return { sizeBytes, itemCount };
}

/** Scan the whitelisted junk locations and return measured targets. */
export async function scanJunk(): Promise<JunkScanResult> {
  const targets: JunkTarget[] = junkCatalog().map((t) => {
    const exists = fs.existsSync(t.path) && fs.statSync(t.path).isDirectory();
    const measured = exists ? measureFolder(t.path) : { sizeBytes: 0, itemCount: 0 };
    return { ...t, ...measured, exists };
  });
  const totalBytes = targets.reduce((s, t) => s + (t.exists ? t.sizeBytes : 0), 0);
  const totalFiles = targets.reduce((s, t) => s + (t.exists ? t.itemCount : 0), 0);
  return { targets, totalBytes, totalFiles };
}

/** Resolve the current catalog and reject any path that is not a whitelisted target. */
function validateTargets(): JunkTarget[] {
  const catalog = junkCatalog();
  const existing: JunkTarget[] = [];
  for (const t of catalog) {
    if (fs.existsSync(t.path)) existing.push({ ...t, sizeBytes: 0, itemCount: 0, exists: true });
  }
  return existing;
}

/** Delete the children of the given folder (permanent, skips locked files). */
function deleteChildren(dir: string): { removed: number; freed: number; errors: number } {
  let removed = 0;
  let freed = 0;
  let errors = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { removed, freed, errors: 1 };
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
      } else if (e.isFile()) {
        const st = fs.statSync(full);
        fs.unlinkSync(full);
        freed += st.size;
      }
      removed++;
    } catch {
      errors++;
    }
  }
  return { removed, freed, errors };
}

/**
 * Clean the selected whitelisted targets (non-elevated). Only the immediate
 * children are removed — in-use/locked files are skipped automatically.
 */
export async function cleanJunk(targetIds: string[]): Promise<JunkCleanOutcome[]> {
  const valid = validateTargets();
  const byId = new Map(valid.map((t) => [t.id, t]));
  const results: JunkCleanOutcome[] = [];
  for (const id of targetIds) {
    const target = byId.get(String(id));
    if (!target) {
      results.push({ path: String(id), ok: false, removed: 0, freed: 0, errors: 0, error: 'Target tidak dikenal.' });
      continue;
    }
    const r = deleteChildren(target.path);
    results.push({ path: target.path, ok: true, removed: r.removed, freed: r.freed, errors: r.errors });
  }
  return results;
}

/** Elevated cleanup for admin targets (runs via UAC and returns a JSON summary). */
export async function cleanJunkElevated(targetIds: string[]): Promise<JunkCleanOutcome[]> {
  const valid = validateTargets().filter((t) => t.admin);
  const byId = new Map(valid.map((t) => [t.id, t]));
  const chosen = targetIds.map((id) => byId.get(String(id))).filter((t): t is JunkTarget => !!t);
  if (chosen.length === 0) {
    throw new Error('Tidak ada target admin yang valid. Pilih kembali lewat hasil pemindaian.');
  }

  const psItems = chosen.map((t) => psQuote(t.path)).join(', ');
  const script =
    `$ErrorActionPreference = 'Continue'\n` +
    `$list = New-Object System.Collections.Generic.List[object]\n` +
    `foreach ($root in @(${psItems})) {\n` +
    `  $removed=0; $freed=0; $errors=0\n` +
    `  try {\n` +
    `    Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue | ForEach-Object {\n` +
    `      if ($_.PSIsContainer) {\n` +
    `        try { $siz=0; Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object { $siz += $_.Length }; Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop; $removed++; $freed += $siz } catch { $errors++ }\n` +
    `      } else {\n` +
    `        try { $freed += $_.Length; Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop; $removed++ } catch { $errors++ }\n` +
    `      }\n` +
    `    }\n` +
    `  } catch { $errors++ }\n` +
    `  $list.Add([pscustomobject]@{ path=$root; removed=$removed; freed=$freed; errors=$errors })\n` +
    `}\n` +
    `$list | ConvertTo-Json -Compress\n`;

  const raw = await runElevatedPowerShell(script);
  let parsed: any = [];
  try {
    const value = JSON.parse(raw);
    parsed = Array.isArray(value) ? value : [];
  } catch {
    parsed = [];
  }
  return parsed.map((row: any) => ({
    path: String(row?.path || ''),
    ok: true,
    removed: Number(row?.removed || 0),
    freed: Number(row?.freed || 0),
    errors: Number(row?.errors || 0),
  }));
}
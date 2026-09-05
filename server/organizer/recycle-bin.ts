import { runPowerShell, psQuote } from '../utils/powershell.js';
import type { RecycleItem, RecycleListResult } from '../../shared/types.js';

const LIST_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$sh = New-Object -ComObject Shell.Application
$rb = $sh.Namespace(10)
$rows = New-Object System.Collections.Generic.List[object]
foreach ($i in $rb.Items()) {
  try { $size = [long]$i.Size } catch { $size = 0 }
  $from = ''
  $dDel = ''
  try { $from = [string]$i.ExtendedProperty('System.Recycle.DeletedFrom') } catch {}
  try { $dDel = [string]$i.ExtendedProperty('System.DateDeleted') } catch {}
  $rows.Add([pscustomobject]@{
    name = [string]$i.Name
    origPath = [string]$i.Path
    size = $size
    deletedAt = $dDel
    deletedFrom = $from
  })
}
$rows | ConvertTo-Json -Depth 3 -Compress
`;

export function parseItems(out: string): RecycleItem[] {
  let arr: any[] = [];
  try {
    const v = JSON.parse(out);
    arr = Array.isArray(v) ? v : [];
  } catch { /* ignore */ }
  const items: RecycleItem[] = [];
  const seen = new Set<string>();
  for (const r of arr) {
    const key = String(r?.origPath || '') + '|' + String(r?.name || '');
    if (!r || !key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      name: String(r.name || ''),
      origPath: String(r.origPath || ''),
      deletedFrom: String(r.deletedFrom || ''),
      size: Number(r.size) || 0,
      deletedAt: String(r.deletedAt || ''),
    });
  }
  return items.slice(0, 500);
}

export async function listRecycleBin(): Promise<RecycleListResult> {
  const out = await runPowerShell(LIST_SCRIPT, 60_000);
  const items = parseItems(out);
  const totalBytes = items.reduce((s, i) => s + i.size, 0);
  return { items, count: items.length, totalBytes };
}

export async function restoreRecycleItem(origPath: string, deletedFrom: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const src = psQuote(origPath);
  const target = psQuote(deletedFrom);
  const itemName = psQuote(name);
  const script =
    `$ErrorActionPreference = 'Stop'\ntry {\n` +
    `  $src = ${src}\n` +
    `  $parent = ${target}\n` +
    `  if (-not (Test-Path -LiteralPath $src)) { Write-Output 'ERR:Sumber sudah tidak ada di Tempat Sampah.'; exit }\n` +
    `  if (-not (Test-Path -LiteralPath $parent)) { $parent = Split-Path -Qualifier $parent }\n` +
    `  if (-not (Test-Path -LiteralPath $parent)) { $parent = $env:USERPROFILE }\n` +
    `  $n = ${itemName}\n` +
    `  $srcExt = [IO.Path]::GetExtension((Split-Path $src -Leaf))\n` +
    `  if ($srcExt -and -not $n.ToLower().EndsWith($srcExt.ToLower())) { $n = $n + $srcExt }\n` +
    `  $dest = Join-Path $parent $n\n` +
    `  $base = [IO.Path]::GetFileNameWithoutExtension($dest)\n` +
    `  $ext = [IO.Path]::GetExtension($dest)\n` +
    `  $i = 1\n` +
    `  while (Test-Path -LiteralPath $dest) { $dest = Join-Path $parent ($base + ' (' + $i + ')' + $ext); $i++ }\n` +
    `  if (Test-Path -LiteralPath $src -PathType Container) { [IO.Directory]::Move($src, $dest) } else { [IO.File]::Move($src, $dest) }\n` +
    `  $info = $src -replace '\\\\$R', '\\\\$I'\n` +
    `  if (Test-Path -LiteralPath $info) { Remove-Item -LiteralPath $info -Force -ErrorAction SilentlyContinue }\n` +
    `  Write-Output 'OK:' + $dest\n` +
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`;
  try {
    const out = await runPowerShell(script, 40_000);
    if (/^OK:/.test(out.trim())) return { ok: true };
    return { ok: false, error: out.trim().replace(/^ERR:/, '') || 'Gagal memulihkan item.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gagal memulihkan item.' };
  }
}

export async function emptyRecycleBin(driveLetter?: string): Promise<{ ok: boolean; error?: string }> {
  const drive = driveLetter && /^[A-Za-z]:?$/.test(driveLetter.trim()) ? driveLetter.trim().replace(':', '') : '';
  const line = drive ? `Clear-RecycleBin -DriveLetter ${psQuote(drive)} -Force` : `Clear-RecycleBin -Force`;
  const script =
    `$ErrorActionPreference = 'Continue'\ntry {\n` +
    `  ${line}\n` +
    `  Write-Output 'OK'\n` +
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }\n`;
  try {
    const out = await runPowerShell(script, 60_000);
    if (/^OK/.test(out.trim())) return { ok: true };
    return { ok: false, error: out.trim().replace(/^ERR:/, '') || 'Gagal mengosongkan Tempat Sampah.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gagal mengosongkan Tempat Sampah.' };
  }
}
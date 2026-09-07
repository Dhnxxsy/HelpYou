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
  try { $from = [string]$i.ExtendedProperty('System.Recycle.DeletedFrom') } catch {}
  $name = [string]$i.Name
  $origPath = [string]$i.Path
  $ts = ''
  $metaSize = 0L
  $metaPath = ''
  $leaf = Split-Path $origPath -Leaf
  if ($leaf.StartsWith('$R') -and $leaf.Length -gt 2) {
    $metaFile = Join-Path (Split-Path $origPath -Parent) ('$I' + $leaf.Substring(2))
    if (Test-Path -LiteralPath $metaFile) {
      try {
        $b = [IO.File]::ReadAllBytes($metaFile)
        if ($b.Length -ge 28) {
          $ft = [BitConverter]::ToInt64($b, 16)
          if ($ft -gt 0) { $ts = [DateTime]::FromFileTimeUtc($ft).ToUniversalTime().ToString('o') }
          $metaSize = [BitConverter]::ToInt64($b, 8)
          $pathStart = 24
          $len = [BitConverter]::ToUInt32($b, 24)
          if ($len -gt 0 -and ($len * 2 + 28) -le $b.Length) { $pathStart = 28 }
          $pb = $b[$pathStart..($b.Length - 1)]
          while ($pb.Count -ge 2 -and $pb[$pb.Count - 1] -eq 0 -and $pb[$pb.Count - 2] -eq 0) { $pb = $pb[0..($pb.Count - 3)] }
          if ($pb.Count % 2 -eq 1) { $pb = $pb[0..($pb.Count - 2)] }
          if ($pb.Count -gt 0) { $metaPath = [Text.Encoding]::Unicode.GetString($pb) }
        }
      } catch {}
    }
  }
  if ($metaPath) { $originalPath = $metaPath }
  if (-not $from) { if ($originalPath) { $from = Split-Path $originalPath -Parent } else { $from = Split-Path $origPath -Parent } }
  if ($metaSize -gt 0) { $size = $metaSize }
  $dName = ''
  if ($originalPath) { $dName = Split-Path $originalPath -Leaf }
  if (-not $dName) { $dName = $name }
  $rows.Add([pscustomobject]@{
    name = $dName
    origPath = $origPath
    originalPath = $originalPath
    size = $size
    deletedAt = $ts
    deletedFrom = $from
    ts = $ts
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
  const seen = new Set<string>();
  const items: RecycleItem[] = [];
  for (const r of arr) {
    const key = String(r?.origPath || '') + '|' + String(r?.name || '');
    if (!r || !key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      name: String(r.name || ''),
      origPath: String(r.origPath || ''),
      originalPath: String(r.originalPath || ''),
      deletedFrom: String(r.deletedFrom || ''),
      size: Number(r.size) || 0,
      deletedAt: String(r.deletedAt || ''),
      deletedDt: String(r.ts || ''),
    });
  }
  /* Newest items first (UTC ISO key when available, else raw deletedAt, else name). */
  const sortKey = (i: RecycleItem): string =>
    i.deletedDt ||
    (/^\d/.test(i.deletedAt) ? i.deletedAt : '') ||
    i.name.toUpperCase();
  items.sort((a, b) => {
    const byTs = sortKey(b).localeCompare(sortKey(a));
    if (byTs !== 0) return byTs;
    return a.name.localeCompare(b.name);
  });
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
    `  if (Test-Path -LiteralPath $src -PathType Container) {\n` +
    `    try { [IO.Directory]::Move($src, $dest) } catch { Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force -ErrorAction Stop; Remove-Item -LiteralPath $src -Recurse -Force -ErrorAction Stop }\n` +
    `  } else { [IO.File]::Move($src, $dest) }\n` +
    `  $leaf = Split-Path $src -Leaf\n` +
    `  $info = ''\n` +
    `  if ($leaf -like '\$R*' -and $leaf.Length -gt 2) { $info = Join-Path (Split-Path $src -Parent) ('\$I' + $leaf.Substring(2)) }\n` +
    `  if ($info -and (Test-Path -LiteralPath $info)) { Remove-Item -LiteralPath $info -Force -ErrorAction SilentlyContinue }\n` +
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
import { runPowerShell } from '../utils/powershell.js';
import type { DiskVolumeInfo } from '../../shared/types.js';

/** Normalize a drive path like 'C', 'c', 'C:\', 'D:/' into a bare uppercase letter. */
export function normalizeDrive(input: unknown): string {
  const m = /^([a-zA-Z])[:\\/]*$/.exec(String(input ?? '').trim());
  if (!m) throw new Error('Drive tidak valid. Gunakan format seperti C:\\ atau D:');
  return m[1].toUpperCase();
}

/** Drive letters that Windows defrag actually supports. */
export function isDefraggable(fs: string): boolean {
  return fs === 'NTFS' || fs === 'ReFS';
}

/** Non-elevated: list mounted volumes with a drive letter. */
export async function listVolumes(): Promise<DiskVolumeInfo[]> {
  const script =
    `Get-Volume | Where-Object { $_.DriveLetter } | ForEach-Object { ` +
    `[pscustomobject]@{ letter=[string]$_.DriveLetter; label=[string]$_.FileSystemLabel; ` +
    `fileSystem=[string]$_.FileSystem; sizeBytes=[long]$_.Size; freeBytes=[long]$_.SizeRemaining } ` +
    `} | Sort-Object letter | ConvertTo-Json -Compress`;
  const out = await runPowerShell(script, 30_000);
  if (!out.trim()) return [];
  const parsed = JSON.parse(out);
  const arr: DiskVolumeInfo[] = Array.isArray(parsed) ? parsed : [parsed];
  return arr
    .filter((v) => /^[A-Z]$/.test(String(v.letter || '')))
    .map((v) => ({
      letter: String(v.letter).toUpperCase(),
      label: String(v.label || ''),
      fileSystem: String(v.fileSystem || ''),
      sizeBytes: Number(v.sizeBytes) || 0,
      freeBytes: Number(v.freeBytes) || 0,
    }));
}

/** Read every progress/percent token in an optimizer + report dump (0-100, last wins). */
export function defragProgress(output: string): number | undefined {
  let last: number | undefined;
  for (const line of output.split(/\r?\n/)) {
    const m = /(\d{1,3})\s*%/.exec(line);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 0 && v <= 100) last = v;
    }
  }
  return last;
}

export function tailLines(text: string, n: number): string {
  return text.split(/\r?\n/).slice(-n).join('\n');
}

/**
 * Elevated script: detect media type + filesystem, then run
 * `Optimize-Volume -Analyze` and print a single `DATA:` JSON line.
 */
export function buildAnalyzeScript(drive: string, paths: { outPath: string; errPath: string; statePath: string; cancelPath: string }): string {
  const q = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";
  return [
    "$ErrorActionPreference = 'Continue'",
    '$d = ' + q(drive),
    '$state = ' + q(paths.statePath),
    '$cancel = ' + q(paths.cancelPath),
    "Set-Content -LiteralPath $state -Value 'running' -Encoding utf8",
    'Start-Sleep -Milliseconds 600',
    '$vol = Get-Volume -DriveLetter $d -ErrorAction SilentlyContinue',
    "$fs = if ($vol) { [string]$vol.FileSystem } else { '' }",
    '$disk = Get-Partition -DriveLetter $d -ErrorAction SilentlyContinue | Get-Disk -ErrorAction SilentlyContinue | Select-Object -First 1',
    "$media = if ($disk -and $null -ne $disk.MediaType) { [string]$disk.MediaType } else { 'Unknown' }",
    '$letter = $d.ToUpper()',
    'try {',
    "  if (($fs -ne 'NTFS') -and ($fs -ne 'ReFS')) {",
    "    $data = [ordered]@{ drive=$letter; mediaType=$media; fileSystem=$fs; supported=$false; report='Sistem file ini tidak mendukung defragmentasi (butuh NTFS/ReFS).' }",
    '    Write-Output ("DATA:" + ($data | ConvertTo-Json -Compress))',
    '  } else {',
    '    Write-Output ("Media: " + $media + " | Sistem file: " + $fs)',
    '    $raw = Optimize-Volume -DriveLetter $d -Analyze -Verbose 4>&1',
    '    $obj = $raw | Where-Object { $_ -is [Microsoft.Management.Infrastructure.CimInstance] } | Select-Object -First 1',
    '    $text = ($raw | ForEach-Object { "$_" }) -join "`n"',
    '    $last = $null',
    '    if ($obj -and $null -ne $obj.LastOptimizationTime) { $last = [string]$obj.LastOptimizationTime }',
    '    $data = [ordered]@{',
    '      drive=$letter; mediaType=$media; fileSystem=$fs; supported=$true;',
    '      totalSpaceBytes = if ($obj) { $obj.TotalSpace } else { $null };',
    '      freeSpaceBytes  = if ($obj) { $obj.FreeSpace } else { $null };',
    '      fragmentedBytes = if ($obj) { $obj.TotalFragmentedSpace } else { $null };',
    '      fragPercent = if ($obj) { if ($null -ne $obj.TotalPercentFragmentation) { $obj.TotalPercentFragmentation } else { $obj.PercentFragmentation } } else { $null };',
    '      totalFiles = if ($obj) { $obj.TotalFiles } else { $null };',
    '      fragmentedFiles = if ($obj) { $obj.FragmentedFiles } else { $null };',
    '      lastOptimized = $last;',
    '      report = $text',
    '    }',
    '    Write-Output ("DATA:" + ($data | ConvertTo-Json -Compress -Depth 3))',
    '  }',
    "  Set-Content -LiteralPath $state -Value 'done' -Encoding utf8",
    '} catch {',
    '  $data = [ordered]@{ drive=$letter; mediaType=$media; fileSystem=$fs; supported=$false; report=$_ }',
    '  Write-Output ("DATA:" + ($data | ConvertTo-Json -Compress))',
    "  Set-Content -LiteralPath $state -Value 'error' -Encoding utf8",
    '}',
  ].join('\n');
}

/**
 * Elevated script: run the real Windows optimizer (`defrag.exe X: /O /U`)
 * in the background. Progress is written to `outPath`; the state file is
 * flipped to done/cancelled when finished. A cancel file stops the job.
 */
export function buildOptimizeScript(drive: string, paths: { outPath: string; errPath: string; statePath: string; cancelPath: string }): string {
  const q = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";
  return [
    "$ErrorActionPreference = 'Continue'",
    '$d = ' + q(drive),
    '$state = ' + q(paths.statePath),
    '$cancel = ' + q(paths.cancelPath),
    '$out = ' + q(paths.outPath),
    '$err = ' + q(paths.errPath),
    "Set-Content -LiteralPath $state -Value 'running' -Encoding utf8",
    'Start-Sleep -Milliseconds 800',
    'try {',
    "  $proc = Start-Process -FilePath (Join-Path $env:windir 'System32\\defrag.exe') -ArgumentList @($d + ':','/O','/U') -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru",
    '  while (-not $proc.HasExited) {',
    '    if (Test-Path -LiteralPath $cancel) {',
    '      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue',
    '      Add-Content -LiteralPath $out -Value ("Dibatalkan oleh pengguna : " + (Get-Date -Format "HH:mm:ss")) -Encoding utf8',
    "      Set-Content -LiteralPath $state -Value 'cancelled' -Encoding utf8",
    '      exit 0',
    '    }',
    '    Start-Sleep -Milliseconds 400',
    '  }',
    '} catch {',
    '  Add-Content -LiteralPath $err -Value $_.ToString() -Encoding utf8',
    "  Set-Content -LiteralPath $state -Value 'error' -Encoding utf8",
    '  exit 1',
    '}',
    "Set-Content -LiteralPath $state -Value 'done' -Encoding utf8",
  ].join('\n');
}
import { runPowerShell } from '../utils/powershell.js';
import type { ProcessInfo } from '../../shared/types.js';

const LIST_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Get-Process | Sort-Object ProcessName | ForEach-Object {
  $title = ''
  try { $title = [string]$_.MainWindowTitle } catch {}
  $pth = $null
  try { $pth = [string]$_.Path } catch {}
  $cpu = 0.0
  try { $cpu = [double]$_.CPU } catch {}
  [pscustomobject]@{
    pid = [int]$_.Id
    name = [string]$_.ProcessName
    cpuSeconds = [math]::Round($cpu, 1)
    memMB = [math]::Round([double]$_.WorkingSet64 / 1MB, 1)
    windowTitle = $title
    sessionId = [int]$_.SessionId
    startedAt = [string]$_.StartTime
    path = $pth
  }
} | ConvertTo-Json -Depth 2 -Compress
`;

function parseProcesses(out: string): ProcessInfo[] {
  let arr: any[] = [];
  try {
    const v = JSON.parse(out);
    arr = Array.isArray(v) ? v : [];
  } catch { /* ignore */ }
  return arr
    .filter((p) => p && p.pid)
    .map((p) => ({
      pid: Number(p.pid),
      name: String(p.name || ''),
      cpuSeconds: Number(p.cpuSeconds) || 0,
      memMB: Number(p.memMB) || 0,
      windowTitle: String(p.windowTitle || ''),
      sessionId: Number(p.sessionId) || 0,
      startedAt: String(p.startedAt || ''),
      path: p.path ? String(p.path) : undefined,
    }));
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  const out = await runPowerShell(LIST_SCRIPT, 60_000);
  return parseProcesses(out);
}

export async function killProcess(pid: number): Promise<{ ok: boolean; error?: string }> {
  const script =
    `try { Stop-Process -Id ${pid} -Force -ErrorAction Stop; Write-Output 'OK' } catch { Write-Output ('ERR:' + $_.Exception.Message) }`;
  try {
    const out = await runPowerShell(script, 40_000);
    if (/^OK/.test(out.trim())) return { ok: true };
    return { ok: false, error: out.trim().replace(/^ERR:/, '') || 'Gagal menghentikan proses.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gagal menghentikan proses.' };
  }
}
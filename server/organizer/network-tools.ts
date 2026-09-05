import { runPowerShell } from '../utils/powershell.js';
import type { DnsRow, PingRow, PortRow, TraceHop } from '../../shared/types.js';

const isWindows = process.platform === 'win32';

export async function pingHost(host: string, count = 4): Promise<PingRow[]> {
  const h = psQuoteHost(host);
  const n = Math.max(1, Math.min(10, Math.floor(Number(count) || 4)));
  const script =
    `$ErrorActionPreference = 'SilentlyContinue'\n` +
    `$p = New-Object System.Net.NetworkInformation.Ping\n` +
    `$rows = New-Object System.Collections.Generic.List[object]\n` +
    `1..${n} | ForEach-Object {\n` +
    `  $r = $p.Send(${h}, 2000)\n` +
    `  $ttl = $null\n` +
    `  if ($r.Options) { $ttl = [int]$r.Options.Ttl }\n` +
    `  $rows.Add([pscustomobject]@{ seq = $_; ms = [long]$r.RoundtripTime; ttl = $ttl; timedOut = ($r.Status -ne 'Success'); reply = [string]$r.Status })\n` +
    `  Start-Sleep -Milliseconds 200\n` +
    `}\n` +
    `$rows | ConvertTo-Json -Compress`;
  try {
    const out = await runPowerShell(script, 90_000);
    const arr = parseJsonArr(out);
    return arr.map((r) => ({
      seq: Number(r.seq) || 0,
      ms: Number(r.ms) || 0,
      ttl: r.ttl != null ? Number(r.ttl) : undefined,
      timedOut: !!r.timedOut,
      reply: String(r.reply || ''),
    }));
  } catch {
    return [];
  }
}

export async function traceHost(host: string): Promise<TraceHop[]> {
  const h = host.trim();
  try {
    const out = await runPowerShell(`tracert -d -h 30 ${winCmdArg(h)}`, 120_000);
    return parseTracert(out);
  } catch {
    return [];
  }
}

export function parseTracert(out: string): TraceHop[] {
  const hops: TraceHop[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
    if (!m) continue;
    const tokens = m[2].trim().split(/\s+/);
    const times: string[] = [];
    let idx = 0;
    while (idx < tokens.length && times.length < 3) {
      const tok = tokens[idx];
      if (tok === '*') {
        times.push('*');
        idx++;
      } else if (/^<1$/i.test(tok) && tokens[idx + 1] === 'ms') {
        times.push('<1 ms');
        idx += 2;
      } else if (/^\d+$/.test(tok) && tokens[idx + 1] === 'ms') {
        times.push(`${tok} ms`);
        idx += 2;
      } else {
        break;
      }
    }
    const address = tokens.slice(idx).join(' ').trim();
    hops.push({ hop: Number(m[1]), times, address });
  }
  return hops;
}

export async function dnsLookup(host: string): Promise<DnsRow[]> {
  const h = psQuoteHost(host);
  const script =
    `$ErrorActionPreference = 'SilentlyContinue'\n` +
    `Resolve-DnsName -Name ${h} -ErrorAction SilentlyContinue | ForEach-Object {\n` +
    `  $val = ''\n` +
    `  if ($_.Strings) { $val = ($_.Strings -join '') }\n` +
    `  elseif ($_.IPAddress) { $val = [string]$_.IPAddress }\n` +
    `  elseif ($_.NameHost) { $val = [string]$_.NameHost }\n` +
    `  elseif ($_.NameExchange) { $val = [string]$_.NameExchange }\n` +
    `  elseif ($_.PrimaryServer) { $val = [string]$_.PrimaryServer }\n` +
    `  [pscustomobject]@{ name = [string]$_.Name; type = [string]$_.Type; value = $val }\n` +
    `} | ConvertTo-Json -Compress`;
  try {
    const out = await runPowerShell(script, 60_000);
    const arr = parseJsonArr(out);
    return arr.map((r) => ({
      name: String(r.name || ''),
      type: String(r.type || ''),
      value: String(r.value ?? '').trim(),
    }));
  } catch {
    return [];
  }
}

export async function scanPorts(host: string, ports: number[]): Promise<PortRow[]> {
  const h = psQuoteHost(host);
  const list = (Array.isArray(ports) ? ports : []).slice(0, 40);
  if (!list.length) list.push(80);
  const script =
    `$ErrorActionPreference = 'SilentlyContinue'\n` +
    `$hostName = ${h}\n` +
    `$ports = @(${list.join(',')})\n` +
    `$rows = New-Object System.Collections.Generic.List[object]\n` +
    `foreach ($port in $ports) {\n` +
    `  $sw = [System.Diagnostics.Stopwatch]::StartNew()\n` +
    `  $open = $false\n` +
    `  try {\n` +
    `    $c = New-Object Net.Sockets.TcpClient\n` +
    `    $iar = $c.BeginConnect($hostName, $port, $null, $null)\n` +
    `    $ok = $iar.AsyncWaitHandle.WaitOne(1300, $false)\n` +
    `    if ($ok -and $c.Connected) { $open = $true }\n` +
    `    $c.Close()\n` +
    `  } catch {}\n` +
    `  $sw.Stop()\n` +
    `  $rows.Add([pscustomobject]@{ port = [int]$port; open = $open; ms = [int]$sw.ElapsedMilliseconds })\n` +
    `}\n` +
    `$rows | ConvertTo-Json -Compress`;
  try {
    const out = await runPowerShell(script, 90_000);
    const arr = parseJsonArr(out);
    const map: Record<number, string> = {
      21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 135: 'RPC',
      139: 'NetBIOS', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL',
      3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 8080: 'HTTP-alt', 8443: 'HTTPS-alt',
    };
    return arr.map((r) => ({
      port: Number(r.port) || 0,
      open: !!r.open,
      service: map[Number(r.port)] || '',
      ms: Number(r.ms) || 0,
    }));
  } catch {
    return [];
  }
}

function parseJsonArr(out: string): any[] {
  try {
    const v = JSON.parse(out);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function psQuoteHost(host: string): string {
  return "'" + String(host).replace(/'/g, "''") + "'";
}

function winCmdArg(a: string): string {
  return '"' + String(a).replace(/"/g, '\\"') + '"';
}

export function isWindowsPlatform(): boolean {
  return isWindows;
}
import { runPowerShell } from '../utils/powershell.js';
import type { SystemInfoReport } from '../../shared/types.js';

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$os   = Get-CimInstance Win32_OperatingSystem
$cs   = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu  = @(Get-CimInstance Win32_Processor | Select-Object -First 1)[0]
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object -First 3 | ForEach-Object {
  $mem = 0
  try { $mem = [int][math]::Round($_.AdapterRAM / 1MB) } catch {}
  [pscustomobject]@{ name = [string]$_.Name; memMB = $mem }
})
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  [pscustomobject]@{ drive = $_.DeviceID; label = [string]$_.VolumeName; fileSystem = [string]$_.FileSystem; total = [long]$_.Size; free = [long]$_.FreeSpace }
})
$bat = @(Get-CimInstance Win32_Battery | Select-Object -First 1)[0]
$uptime = ((Get-Date) - $os.LastBootUpTime)
[pscustomobject]@{
  os = @{
    caption = [string]$os.Caption; version = [string]$os.Version; build = [string]$os.BuildNumber;
    arch = [string]$os.OSArchitecture; hostname = [string]$env:COMPUTERNAME; user = [string]$env:USERNAME;
    installDate = [string]$os.InstallDate; uptimeDays = [math]::Round($uptime.TotalDays, 1)
  }
  pc = @{ manufacturer = [string]$cs.Manufacturer; model = [string]$cs.Model; serial = [string]$bios.SerialNumber; bios = [string]$bios.SMBIOSBIOSVersion }
  cpu = @{ name = [string]$cpu.Name; cores = [int]$cpu.NumberOfCores; logical = [int]$cpu.NumberOfLogicalProcessors; clockGhz = [math]::Round($cpu.MaxClockSpeed / 1000, 2) }
  ram = @{ total = [long]$cs.TotalPhysicalMemory; free = [long]($os.FreePhysicalMemory * 1KB) }
  gpu = $gpus
  battery = $(if ($bat) { [pscustomobject]@{ capacityPercent = [int]$bat.EstimatedChargeRemaining; status = [int]$bat.BatteryStatus } } else { $null })
  disks = $disks
} | ConvertTo-Json -Depth 5 -Compress
`;

const BATTERY_STATUS: Record<number, string> = {
  1: 'Mengisi (daya baterai)',
  2: 'Terhubung AC',
  3: 'Terisi penuh',
  4: 'Mengisi',
  5: 'Kritis',
  6: 'Sebentar lagi habis',
  7: 'Mengisi & terisi sebagian',
  8: 'Mengisi & penuh',
  9: 'Mengisi & kritis',
  10: 'Terhubung AC & sebagian',
  11: 'Terhubung AC & penuh',
  12: 'Sedang diisi',
};

function num(v: any, dflt = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function str(v: any): string {
  return v == null ? '' : String(v).trim();
}

export async function getSystemInfo(): Promise<SystemInfoReport> {
  const out = await runPowerShell(SCRIPT, 60_000);
  let raw: any;
  try {
    raw = JSON.parse(out);
  } catch {
    throw new Error('Gagal membaca informasi sistem.');
  }
  const os = raw.os || {};
  const pc = raw.pc || {};
  const cpu = raw.cpu || {};
  const ram = raw.ram || {};
  return {
    os: {
      caption: str(os.caption),
      version: str(os.version),
      build: str(os.build),
      arch: str(os.arch),
      hostname: str(os.hostname),
      user: str(os.user),
      installDate: str(os.installDate),
      uptimeDays: num(os.uptimeDays),
    },
    pc: {
      manufacturer: str(pc.manufacturer),
      model: str(pc.model),
      serial: str(pc.serial),
      bios: str(pc.bios),
    },
    cpu: {
      name: str(cpu.name),
      cores: num(cpu.cores),
      logical: num(cpu.logical),
      clockGhz: num(cpu.clockGhz),
    },
    ram: { total: num(ram.total), free: num(ram.free) },
    gpu: Array.isArray(raw.gpu) ? raw.gpu.map((g: any) => ({ name: str(g.name), memMB: num(g.memMB) })) : [],
    battery: raw.battery && raw.battery.capacityPercent != null
      ? { capacityPercent: num(raw.battery.capacityPercent), status: BATTERY_STATUS[num(raw.battery.status)] || 'Tidak diketahui' }
      : null,
    disks: Array.isArray(raw.disks)
      ? raw.disks.map((d: any) => ({ drive: str(d.drive), label: str(d.label), fileSystem: str(d.fileSystem), total: num(d.total), free: num(d.free) }))
      : [],
  };
}
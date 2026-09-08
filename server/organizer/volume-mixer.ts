import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Windows per-app volume mixer backed by a persistent PowerShell daemon.
 * A single `powershell.exe -Mta` process stays alive and answers JSON-line
 * requests on stdin (CoreAudio IAudioSessionManager2 requires an MTA thread).
 * The C# CoreAudio helpers are compiled exactly once per daemon start.
 */

export interface MixerSession {
  pid: number;
  name: string;
  title: string;
  volume: number; // 0..1
  muted: boolean;
  system: boolean;
}

export interface MixerSnapshot {
  master: { volume: number; muted: boolean };
  sessions: MixerSession[];
}

const CORE_AUDIO_CS = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class VolumeMixer
{
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  private class MMDeviceEnumeratorCom { }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDeviceEnumerator
  {
    [PreserveSig] int NotImpl0();
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDevice
  {
    [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionManager2
  {
    [PreserveSig] int NotImpl0();
    [PreserveSig] int NotImpl1();
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionEnumerator
  {
    [PreserveSig] int GetCount(out int SessionCount);
    [PreserveSig] int GetSession(int SessionCount, out IAudioSessionControl Session);
  }

  [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionControl
  {
    [PreserveSig] int GetState(out int pRetVal);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, [MarshalAs(UnmanagedType.LPStruct)] Guid EventContext);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, [MarshalAs(UnmanagedType.LPStruct)] Guid EventContext);
    [PreserveSig] int GetGroupingParam(out Guid pRetVal);
    [PreserveSig] int SetGroupingParam([MarshalAs(UnmanagedType.LPStruct)] Guid Override, [MarshalAs(UnmanagedType.LPStruct)] Guid EventContext);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
  }

  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionControl2
  {
    [PreserveSig] int GetState(out int pRetVal);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, [MarshalAs(UnmanagedType.LPStruct)] Guid EventContext);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, [MarshalAs(UnmanagedType.LPStruct)] Guid EventContext);
    [PreserveSig] int GetGroupingParam(out Guid pRetVal);
    [PreserveSig] int SetGroupingParam([MarshalAs(UnmanagedType.LPStruct)] Guid Override, [MarshalAs(UnmanagedType.LPStruct)] Guid EventContext);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    [PreserveSig] int GetProcessId(out int pRetVal);
    [PreserveSig] int IsSystemSoundsSession();
    [PreserveSig] int SetDuckingPreference(int optOut);
  }

  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface ISimpleAudioVolume
  {
    [PreserveSig] int SetMasterVolume(float fLevel, ref Guid EventContext);
    [PreserveSig] int GetMasterVolume(out float pfLevel);
    [PreserveSig] int SetMute(int bMute, ref Guid EventContext);
    [PreserveSig] int GetMute(out int pbMute);
  }

  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioEndpointVolume
  {
    [PreserveSig] int NotImpl0();
    [PreserveSig] int NotImpl1();
    [PreserveSig] int NotImpl2();
    [PreserveSig] int SetMasterVolumeLevel(float fLevel, IntPtr pguidEventContext);
    [PreserveSig] int SetMasterVolumeLevelScalar(float fLevel, IntPtr pguidEventContext);
    [PreserveSig] int NotImpl3();
    [PreserveSig] int GetMasterVolumeLevelScalar(out float pfLevel);
    [PreserveSig] int NotImpl4();
    [PreserveSig] int NotImpl5();
    [PreserveSig] int NotImpl6();
    [PreserveSig] int NotImpl7();
    [PreserveSig] int SetMute(int bMute, IntPtr pguidEventContext);
    [PreserveSig] int GetMute(out int pbMute);
  }

  public class SessionInfo
  {
    public int pid { get; set; }
    public string name { get; set; }
    public string title { get; set; }
    public double volume { get; set; }
    public bool muted { get; set; }
    public bool system { get; set; }
  }

  private const int eRender = 0;
  private const int eMultimedia = 1;
  private const int CLSCTX_ALL = 23;

  private static IMMDevice GetDefaultRenderDevice()
  {
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
    IMMDevice device;
    int hr = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia, out device);
    Marshal.ReleaseComObject(enumerator);
    if (hr != 0) throw new Exception("GetDefaultAudioEndpoint: 0x" + hr.ToString("X8"));
    return device;
  }

  private static IAudioEndpointVolume GetEndpointVolume()
  {
    IMMDevice device = GetDefaultRenderDevice();
    try
    {
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o;
      int hr = device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o);
      if (hr != 0) throw new Exception("Activate endpoint volume: 0x" + hr.ToString("X8"));
      return (IAudioEndpointVolume)o;
    }
    finally { Marshal.ReleaseComObject(device); }
  }

  private static string SafeName(int pid, string displayName, bool system)
  {
    if (system) return "System";
    string name = (displayName ?? "").Trim();
    if (name.StartsWith("@%") || name.IndexOf(".Dll,", StringComparison.OrdinalIgnoreCase) >= 0) name = "";
    if (name.Length > 0) return name;
    try
    {
      if (pid > 0)
      {
        System.Diagnostics.Process p = System.Diagnostics.Process.GetProcessById(pid);
        string pn = p.ProcessName;
        if (!string.IsNullOrEmpty(pn)) return pn;
      }
    }
    catch { }
    return "Aplikasi";
  }

  private static string SafeTitle(int pid)
  {
    try
    {
      if (pid <= 0) return "";
      return System.Diagnostics.Process.GetProcessById(pid).MainWindowTitle ?? "";
    }
    catch { return ""; }
  }

  private static List<SessionInfo> EnumerateSessions()
  {
    List<SessionInfo> list = new List<SessionInfo>();
    IMMDevice device = GetDefaultRenderDevice();
    try
    {
      Guid iid = typeof(IAudioSessionManager2).GUID;
      object o;
      int hr = device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o);
      if (hr != 0) throw new Exception("Activate session manager: 0x" + hr.ToString("X8"));
      IAudioSessionManager2 mgr = (IAudioSessionManager2)o;
      try
      {
        IAudioSessionEnumerator en;
        hr = mgr.GetSessionEnumerator(out en);
        if (hr != 0) throw new Exception("GetSessionEnumerator: 0x" + hr.ToString("X8"));
        try
        {
          int count;
          en.GetCount(out count);
          for (int i = 0; i < count; i++)
          {
            IAudioSessionControl ctl;
            en.GetSession(i, out ctl);
            try
            {
              IAudioSessionControl2 ctl2 = ctl as IAudioSessionControl2;
              if (ctl2 == null) continue;
              int pid;
              ctl2.GetProcessId(out pid);
              bool system = ctl2.IsSystemSoundsSession() == 0;
              ISimpleAudioVolume vol = ctl as ISimpleAudioVolume;
              if (vol == null) continue;
              float level = 0;
              int mute = 0;
              vol.GetMasterVolume(out level);
              vol.GetMute(out mute);
              string dn;
              ctl2.GetDisplayName(out dn);
              SessionInfo s = new SessionInfo
              {
                pid = pid,
                name = SafeName(pid, dn, system),
                title = SafeTitle(pid),
                volume = (double)level,
                muted = mute != 0,
                system = system
              };
              list.Add(s);
            }
            finally { Marshal.ReleaseComObject(ctl); }
          }
        }
        finally { Marshal.ReleaseComObject(en); }
      }
      finally { Marshal.ReleaseComObject(mgr); }
    }
    finally { Marshal.ReleaseComObject(device); }
    return list;
  }

  private static object GetMasterVolumeState()
  {
    IAudioEndpointVolume vol = GetEndpointVolume();
    try
    {
      float level;
      int mute;
      vol.GetMasterVolumeLevelScalar(out level);
      vol.GetMute(out mute);
      return new { volume = (double)level, muted = mute != 0 };
    }
    finally { Marshal.ReleaseComObject(vol); }
  }

  public static object Snapshot()
  {
    try
    {
      List<SessionInfo> raw = EnumerateSessions();
      Dictionary<int, SessionInfo> seen = new Dictionary<int, SessionInfo>();
      foreach (SessionInfo s in raw)
      {
        SessionInfo cur;
        if (seen.TryGetValue(s.pid, out cur))
        {
          if (cur.title.Length == 0 && s.title.Length > 0) cur.title = s.title;
          continue;
        }
        seen.Add(s.pid, s);
      }
      List<SessionInfo> sessions = new List<SessionInfo>(seen.Values);
      sessions.Sort((a, b) => string.Compare(a.name, b.name, StringComparison.OrdinalIgnoreCase));
      object master = GetMasterVolumeState();
      return new { ok = true, data = new { master = master, sessions = sessions } };
    }
    catch (Exception e) { return new { ok = false, error = e.Message }; }
  }

  public static object SetMaster(double? volume, bool? muted)
  {
    try
    {
      IAudioEndpointVolume vol = GetEndpointVolume();
      try
      {
        if (volume.HasValue)
        {
          double v = volume.Value;
          if (v < 0) v = 0;
          if (v > 1) v = 1;
          vol.SetMasterVolumeLevelScalar((float)v, IntPtr.Zero);
        }
        if (muted.HasValue) vol.SetMute(muted.Value ? 1 : 0, IntPtr.Zero);
        float level;
        int mute;
        vol.GetMasterVolumeLevelScalar(out level);
        vol.GetMute(out mute);
        return new { ok = true, data = new { volume = (double)level, muted = mute != 0 } };
      }
      finally { Marshal.ReleaseComObject(vol); }
    }
    catch (Exception e) { return new { ok = false, error = e.Message }; }
  }

  public static object SetSession(int pid, double? volume, bool? muted)
  {
    try
    {
      bool found = false;
      float level0 = 0;
      int mute0 = 0;
      IMMDevice device = GetDefaultRenderDevice();
      try
      {
        Guid iid = typeof(IAudioSessionManager2).GUID;
        object o;
        int hr = device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o);
        if (hr != 0) throw new Exception("Activate session manager: 0x" + hr.ToString("X8"));
        IAudioSessionManager2 mgr = (IAudioSessionManager2)o;
        try
        {
          IAudioSessionEnumerator en;
          mgr.GetSessionEnumerator(out en);
          try
          {
            int count;
            en.GetCount(out count);
            for (int i = 0; i < count; i++)
            {
              IAudioSessionControl ctl;
              en.GetSession(i, out ctl);
              try
              {
                IAudioSessionControl2 ctl2 = ctl as IAudioSessionControl2;
                if (ctl2 == null) continue;
                int cpid;
                ctl2.GetProcessId(out cpid);
                if (cpid == pid)
                {
                  found = true;
                  ISimpleAudioVolume vol = ctl as ISimpleAudioVolume;
                  if (vol != null)
                  {
                    Guid g = Guid.Empty;
                    if (volume.HasValue)
                    {
                      double v = volume.Value;
                      if (v < 0) v = 0;
                      if (v > 1) v = 1;
                      vol.SetMasterVolume((float)v, ref g);
                    }
                    if (muted.HasValue) vol.SetMute(muted.Value ? 1 : 0, ref g);
                    vol.GetMasterVolume(out level0);
                    vol.GetMute(out mute0);
                  }
                }
              }
              finally { Marshal.ReleaseComObject(ctl); }
            }
          }
          finally { Marshal.ReleaseComObject(en); }
        }
        finally { Marshal.ReleaseComObject(mgr); }
      }
      finally { Marshal.ReleaseComObject(device); }
      if (!found) return new { ok = false, error = "Aplikasi tidak ditemukan di mixer." };
      return new { ok = true, data = new { volume = (double)level0, muted = mute0 != 0 } };
    }
    catch (Exception e) { return new { ok = false, error = e.Message }; }
  }
}
`;

function buildDaemonScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    '$code = @\'',
    CORE_AUDIO_CS,
    "'@",
    'Add-Type -TypeDefinition $code',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '[Console]::InputEncoding = [System.Text.Encoding]::UTF8',
    "Write-Output 'HYRES|{\"ready\":true}'",
    'while ($true) {',
    '  $line = [Console]::In.ReadLine()',
    '  if ($null -eq $line) { break }',
    '  if ($line.Trim().Length -eq 0) { continue }',
    '  try {',
    '    $req = ConvertFrom-Json -InputObject $line',
    '    $id = [string]$req.id',
    '    $op = [string]$req.op',
    '    $out = $null',
    "    if ($op -eq 'snapshot') { $out = [VolumeMixer]::Snapshot() }",
    "    elseif ($op -eq 'setMaster') {",
    '      $v = $null; $m = $null',
    '      if ($null -ne $req.args) {',
    '        if ($null -ne $req.args.volume) { $v = [double]$req.args.volume }',
    '        if ($null -ne $req.args.muted) { $m = [bool]$req.args.muted }',
    '      }',
    '      $out = [VolumeMixer]::SetMaster($v, $m)',
    "    } elseif ($op -eq 'setSession') {",
    '      $pidv = [int]$req.args.pid',
    '      $v = $null; $m = $null',
    '      if ($null -ne $req.args) {',
    '        if ($null -ne $req.args.volume) { $v = [double]$req.args.volume }',
    '        if ($null -ne $req.args.muted) { $m = [bool]$req.args.muted }',
    '      }',
    '      $out = [VolumeMixer]::SetSession($pidv, $v, $m)',
    '    } else { throw "Operasi tidak dikenal: " + $op }',
    '    $resp = [ordered]@{ id = $id }',
    '    foreach ($prop in $out.PSObject.Properties) { $resp[$prop.Name] = $prop.Value }',
    '    $json = $resp | ConvertTo-Json -Compress -Depth 9',
    "    Write-Output ('HYRES|' + $json)",
    '  } catch {',
    '    $msg = $_.Exception.Message -replace "[\r\n]+", " "',
    "    Write-Output ('HYERR|' + $msg)",
    '  }',
    '}',
  ].join('\n');
}

const DAEMON_SCRIPT = buildDaemonScript();
const scriptPath = path.join(os.tmpdir(), `hy-mixer-${process.pid}.ps1`);

/** @internal Test/debug hook. */
export const _debugDaemonScript = DAEMON_SCRIPT;

let child: ChildProcess | null = null;
let ready = false;
let booting: Promise<void> | null = null;
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

function failAll(message: string) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(message));
  }
  pending.clear();
}

function handleLine(line: string) {
  if (line.startsWith('HYERR|')) {
    failAll(line.slice('HYERR|'.length));
    return;
  }
  if (!line.startsWith('HYRES|')) return;
  const payload = line.slice('HYRES|'.length);
  let obj: any;
  try {
    obj = JSON.parse(payload);
  } catch {
    return;
  }
  if (obj && obj.ready === true) ready = true;
  const id = obj && obj.id != null ? String(obj.id) : null;
  if (id && pending.has(id)) {
    const p = pending.get(id)!;
    clearTimeout(p.timer);
    pending.delete(id);
    p.resolve(obj);
  }
}

function ensureScript() {
  fs.writeFileSync(scriptPath, DAEMON_SCRIPT, 'utf8');
}

function spawnDaemon(): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureScript();
    if (child) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Mta', '-File', scriptPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    let settled = false;
    const finishBoot = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (d) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.includes('"ready":true')) finishBoot(resolve);
        handleLine(line);
      }
    });
    child.stderr!.on('data', (d) => {
      const msg = String(d).trim();
      if (msg) {
        failAll(msg);
        finishBoot(() => reject(new Error(msg)));
      }
    });
    child.on('exit', (code) => {
      ready = false;
      const msg = `Mixer daemon keluar (${code}).`;
      failAll(msg);
      finishBoot(() => reject(new Error(msg)));
      child = null;
    });
    const bootTimer = setTimeout(() => {
      failAll('Mixer daemon tidak merespons.');
      finishBoot(() => reject(new Error('Mixer daemon tidak merespons.')));
    }, 20_000);
    bootTimer.unref?.();
  });
}

function ensureDaemon(): Promise<void> {
  if (child && ready) return Promise.resolve();
  if (booting) return booting;
  booting = spawnDaemon().finally(() => {
    booting = null;
  });
  return booting;
}

function call(op: string, args?: Record<string, unknown>): Promise<any> {
  return ensureDaemon().then(
    () =>
      new Promise((resolve, reject) => {
        const target = child;
        if (!target || !target.stdin || target.stdin.destroyed) {
          reject(new Error('Mixer daemon tidak tersedia.'));
          return;
        }
        const id = String(++seq);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Mixer timeout.'));
        }, 15_000);
        pending.set(id, { resolve, reject, timer });
        target.stdin.write(JSON.stringify({ id, op, args }) + '\n');
      }),
  );
}

function requireOk(r: any, fallback: string): any {
  if (!r || r.ok !== true) throw new Error((r && r.error) || fallback);
  return r.data;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Snapshot of the default render device: master volume + audio sessions. */
export async function mixerSnapshot(): Promise<MixerSnapshot> {
  const r = await call('snapshot');
  return requireOk(r, 'Mixer gagal.');
}

/** Set the master (system) volume. Volume must be 0..1. */
export async function setMasterVolume(volume: number): Promise<{ volume: number; muted: boolean }> {
  const r = await call('setMaster', { volume: clamp01(volume) });
  return requireOk(r, 'Gagal mengubah volume sistem.');
}

/** Mute / unmute the master volume. */
export async function setMasterMuted(muted: boolean): Promise<{ volume: number; muted: boolean }> {
  const r = await call('setMaster', { muted });
  return requireOk(r, 'Gagal mengubah mute sistem.');
}

/** Set the volume (0..1) of an app audio session by pid. */
export async function setSessionVolume(pid: number, volume: number): Promise<{ volume: number; muted: boolean }> {
  const r = await call('setSession', { pid, volume: clamp01(volume) });
  return requireOk(r, 'Gagal mengubah volume aplikasi.');
}

/** Mute / unmute an app audio session by pid. */
export async function setSessionMuted(pid: number, muted: boolean): Promise<{ volume: number; muted: boolean }> {
  const r = await call('setSession', { pid, muted });
  return requireOk(r, 'Gagal mengubah mute aplikasi.');
}
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Run a PowerShell script (hidden window) and resolve with its stdout (trimmed). */
export function runPowerShell(script: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let errOut = '';
    let done = false;
    const killTimer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('PowerShell timed out.'));
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { errOut += d.toString('utf8'); });
    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(killTimer);
      reject(e);
    });
    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(killTimer);
      if (out.trim()) resolve(out.trim());
      else if (errOut && errOut.trim()) reject(new Error(errOut.trim()));
      else resolve('');
    });
  });
}

/** Escape a single-quoted PowerShell string literal. */
export function psQuote(v: string): string {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/**
 * Run a PowerShell script block elevated (UAC). The body is written to a
 * temp .ps1 file and executed by an elevated PowerShell wrapper; the
 * wrapper redirects stdout/stderr into temp files (no Start-Process
 * redirection, which is incompatible with -Verb RunAs in PS 5.1).
 * Resolves with the captured output (stdout, else stderr).
 */
export async function runElevatedPowerShell(body: string, timeoutMs = 180_000): Promise<string> {
  const tmp = path.join(os.tmpdir(), `hy-ps-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const scriptPath = `${tmp}.ps1`;
  const wrapperPath = `${tmp}-w.ps1`;
  const outPath = `${tmp}.out`;
  const errPath = `${tmp}.err`;
  await fs.promises.writeFile(scriptPath, body, 'utf-8');

  // Wrapper (runs elevated): execute the body, tee stdout/stderr into temp files.
  const wrapper = `$ErrorActionPreference = 'Continue'\n& ${psQuote(scriptPath)} > ${psQuote(outPath)} 2> ${psQuote(errPath)}\n`;
  await fs.promises.writeFile(wrapperPath, wrapper, 'utf-8');

  // ShellExecute set only (-Verb RunAs): no -RedirectStandard* here.
  const launcher =
    `Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(wrapperPath)}) ` +
    `-Verb RunAs -Wait -WindowStyle Hidden`;

  try {
    let launchError = '';
    try {
      await runPowerShell(launcher, Math.min(timeoutMs, 180_000));
    } catch (e: any) {
      launchError = String(e?.message || e || '');
    }
    const out = await fs.promises.readFile(outPath, 'utf-8').catch(() => '');
    const err = await fs.promises.readFile(errPath, 'utf-8').catch(() => '');
    if (!launchError) {
      if (out.trim()) return out.trim();
      if (err.trim()) throw new Error(err.trim());
      return '';
    }
    if (/cancel/i.test(launchError)) throw new Error('Izin administrator (UAC) dibatalkan.');
    throw new Error(launchError);
  } finally {
    for (const p of [scriptPath, wrapperPath, outPath, errPath]) {
      await fs.promises.rm(p, { force: true }).catch(() => {});
    }
  }
}

export interface ElevatedStreamPaths {
  scriptPath: string;
  wrapperPath: string;
  outPath: string;
  errPath: string;
  statePath: string;
  cancelPath: string;
}

/**
 * Handles for a long-running elevated PowerShell job. The script is expected to:
 *   - set its state file to 'running' early,
 *   - write progress lines to stdout (redirected to the out file),
 *   - finish with 'done' / 'cancelled'.
 * Server code polls `readState()` / `readOut()` while the elevated process runs
 * in the background (no blocking wait, no long timeout cap).
 */
export interface ElevatedStreamHandles {
  statePath: string;
  cancelPath: string;
  outPath: string;
  errPath: string;
  readState(): Promise<string>;
  readOut(): Promise<string>;
  readErr(): Promise<string>;
  cancel(): Promise<void>;
  cleanup(): Promise<void>;
}

/** Create the temp files + write the elevated body script. */
export function elevatedStreamPaths(): ElevatedStreamPaths {
  const tmp = path.join(os.tmpdir(), `hy-ps-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  return {
    scriptPath: `${tmp}.ps1`,
    wrapperPath: `${tmp}-w.ps1`,
    outPath: `${tmp}.out`,
    errPath: `${tmp}.err`,
    statePath: `${tmp}.state`,
    cancelPath: `${tmp}.cancel`,
  };
}

function buildWrapper(scriptPath: string, outPath: string, errPath: string, statePath: string): string {
  // If the script never managed to write a state (parse error/early crash),
  // mark the job as failed. Otherwise the script controls 'running'/'done'/'cancelled'.
  return (
    `$ErrorActionPreference = 'Continue'\n` +
    `& ${psQuote(scriptPath)} > ${psQuote(outPath)} 2> ${psQuote(errPath)}\n` +
    `if (-not (Test-Path -LiteralPath ${psQuote(statePath)})) { Set-Content -LiteralPath ${psQuote(statePath)} -Value 'error' -NoNewline -Encoding utf8 }\n`
  );
}

const cleanupPaths = (p: ElevatedStreamPaths) =>
  Promise.all(
    [p.scriptPath, p.wrapperPath, p.outPath, p.errPath, p.statePath, p.cancelPath].map((f) =>
      fs.promises.rm(f, { force: true }).catch(() => {})
    ),
  );

/**
 * Launch an elevated PowerShell script in the background (UAC), without waiting
 * for it to finish. Returns handles to poll output/state and to request cancel.
 * Throws if the user declines the UAC prompt.
 */
export async function startElevatedStream(scriptBody: string, paths?: ElevatedStreamPaths): Promise<ElevatedStreamHandles> {
  const p = paths ?? elevatedStreamPaths();
  await fs.promises.writeFile(p.scriptPath, scriptBody, 'utf-8');
  await fs.promises.writeFile(p.wrapperPath, buildWrapper(p.scriptPath, p.outPath, p.errPath, p.statePath), 'utf-8');

  const launcher =
    `Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(p.wrapperPath)}) ` +
    `-Verb RunAs -WindowStyle Hidden`;

  try {
    await runPowerShell(launcher, 20_000);
  } catch (e: any) {
    await cleanupPaths(p);
    const msg = String(e?.message || e || '');
    if (/cancel/i.test(msg)) throw new Error('Izin administrator (UAC) dibatalkan.');
    throw new Error(msg);
  }

  return {
    statePath: p.statePath,
    cancelPath: p.cancelPath,
    outPath: p.outPath,
    errPath: p.errPath,
    readState: () => fs.promises.readFile(p.statePath, 'utf-8').catch(() => ''),
    readOut: () => fs.promises.readFile(p.outPath, 'utf-8').catch(() => ''),
    readErr: () => fs.promises.readFile(p.errPath, 'utf-8').catch(() => ''),
    cancel: async () => {
      await fs.promises.writeFile(p.cancelPath, '1', 'utf-8').catch(() => {});
    },
    cleanup: async () => {
      await cleanupPaths(p);
    },
  };
}

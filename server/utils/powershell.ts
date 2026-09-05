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

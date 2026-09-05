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
 * temp .ps1 file and its stdout/stderr are redirected to temp files.
 * Resolves with the captured output (stdout, else stderr).
 */
export async function runElevatedPowerShell(body: string, timeoutMs = 180_000): Promise<string> {
  const tmp = path.join(os.tmpdir(), `hy-ps-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const scriptPath = `${tmp}.ps1`;
  const outPath = `${tmp}.out`;
  const errPath = `${tmp}.err`;
  await fs.promises.writeFile(scriptPath, body, 'utf-8');

  const launcher =
    `Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(scriptPath)}) ` +
    `-Verb RunAs -Wait -RedirectStandardOutput ${psQuote(outPath)} -RedirectStandardError ${psQuote(errPath)}`;

  try {
    await runPowerShell(launcher, Math.min(timeoutMs, 60_000));
    const out = await fs.promises.readFile(outPath, 'utf-8').catch(() => '');
    const err = await fs.promises.readFile(errPath, 'utf-8').catch(() => '');
    if (out.trim()) return out.trim();
    if (err.trim()) return err.trim();
    return '';
  } finally {
    for (const p of [scriptPath, outPath, errPath]) {
      await fs.promises.rm(p, { force: true }).catch(() => {});
    }
  }
}

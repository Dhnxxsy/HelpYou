import { describe, it, expect } from 'vitest';
import { resolveExe, regStatus, parseRegCapture } from '../server/organizer/startup-manager.js';

describe('resolveExe', () => {
  it('extracts an exe from a quoted command with args', () => {
    expect(resolveExe('"C:\\Program Files\\App\\app.exe" --flag')).toBe('C:\\Program Files\\App\\app.exe');
  });

  it('extracts an exe from an unquoted path', () => {
    expect(resolveExe('C:\\tools\\app.exe -n')).toBe('C:\\tools\\app.exe');
  });

  it('handles quoted commands matching earlier substrings', () => {
    expect(resolveExe('"C:\\A B\\prog.exe" "C:\\data file.txt"')).toBe('C:\\A B\\prog.exe');
  });

  it('expands environment variables', () => {
    process.env.FO_T = 'C:\\x';
    expect(resolveExe('%FO_T%\\app.exe /run')).toBe('C:\\x\\app.exe');
  });

  it('returns null when no executable is present', () => {
    expect(resolveExe('https://example.com/start')).toBeNull();
    expect(resolveExe('')).toBeNull();
    expect(resolveExe('explorer.exe')).toBe('explorer.exe');
  });
});

describe('regStatus', () => {
  it('accepts the bare OK success marker', () => {
    expect(regStatus('OK')).toEqual({ ok: true, value: 'OK' });
  });
  it('parses OK:value replies', () => {
    expect(regStatus('OK:some-data')).toEqual({ ok: true, value: 'some-data' });
  });
  it('parses ERR:replies', () => {
    expect(regStatus('ERR:Gagal')).toEqual({ ok: false, error: 'Gagal' });
  });
  it('treats unknown output as failure', () => {
    const r = regStatus('unexpected text');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('unexpected text');
  });
});

describe('parseRegCapture', () => {
  it('parses a String capture', () => {
    const r = parseRegCapture('String|str:C:\\x app\\run.exe');
    expect(r).toEqual({ kind: 'String', packed: 'str:C:\\x app\\run.exe', display: 'C:\\x app\\run.exe' });
  });
  it('tolerates an OK: prefix (regStatus already strips it)', () => {
    const r = parseRegCapture('OK:ExpandString|str:%ProgramFiles%\\prog.exe');
    expect(r?.kind).toBe('ExpandString');
    expect(r?.display).toBe('%ProgramFiles%\\prog.exe');
  });
  it('keeps %VAR% untouched for ExpandString', () => {
    expect(parseRegCapture('ExpandString|str:%SystemRoot%\\foo.exe')?.display).toBe('%SystemRoot%\\foo.exe');
  });
  it('annotates DWORD captures', () => {
    expect(parseRegCapture('DWord|dword:42')?.display).toBe('42 (DWORD)');
  });
  it('joins multi-string values', () => {
    expect(parseRegCapture('MultiString|multi:alpha\u0001beta gamma\u0001third')?.display).toBe('alpha, beta gamma, third');
  });
  it('labels binary captures', () => {
    expect(parseRegCapture('Binary|b64:QQ==')?.display).toBe('[data biner]');
  });
  it('returns null for unrecognizable output', () => {
    expect(parseRegCapture('String|')).toBeNull();
    expect(parseRegCapture('garbage')).toBeNull();
  });
});
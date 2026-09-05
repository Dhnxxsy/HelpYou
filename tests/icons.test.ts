import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizeIconPath } from '../server/organizer/icons.js';

let tmp: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-icon-test-'));
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.FO_ICON_TEST_DIR;
});

function makeFile(name: string): string {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, 'placeholder');
  return p;
}

describe('normalizeIconPath', () => {
  it('returns null for empty, null, or bare names', () => {
    expect(normalizeIconPath('')).toBeNull();
    expect(normalizeIconPath(undefined)).toBeNull();
    expect(normalizeIconPath(null)).toBeNull();
    expect(normalizeIconPath('notepad.exe')).toBeNull();
    expect(normalizeIconPath('relative\\app.exe')).toBeNull();
  });

  it('keeps a plain absolute path as-is', () => {
    const f = makeFile('app.exe');
    expect(normalizeIconPath(f)).toBe(f);
  });

  it('strips a trailing icon index and optional spaces', () => {
    const f = makeFile('app.exe');
    expect(normalizeIconPath(f + ',0')).toBe(f);
    expect(normalizeIconPath(f + ', -7')).toBe(f);
  });

  it('strips surrounding quotes, with and without an index', () => {
    const f = makeFile('app.exe');
    expect(normalizeIconPath(`"${f}"`)).toBe(f);
    expect(normalizeIconPath(`"${f}",0`)).toBe(f);
  });

  it('expands %ENV% variables', () => {
    const f = makeFile('app.exe');
    process.env.FO_ICON_TEST_DIR = tmp;
    expect(normalizeIconPath('%FO_ICON_TEST_DIR%\\app.exe')).toBe(f);
  });

  it('returns null when the target does not exist', () => {
    expect(normalizeIconPath('C:\\Windows\\definitely-missing-app-xyz.exe')).toBeNull();
  });
});
import { describe, it, expect } from 'vitest';
import { resolveExe } from '../server/organizer/startup-manager.js';

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
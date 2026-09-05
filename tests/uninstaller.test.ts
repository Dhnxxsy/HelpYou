import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseCommandLine, toUninstallCommand, expandEnv, residueRoots, residueKind, isSelfPath } from '../server/organizer/uninstaller.js';
import type { InstalledApp } from '../shared/types.js';

describe('parseCommandLine', () => {
  it('parses a quoted path plus args', () => {
    const parsed = parseCommandLine('"C:\\Program Files\\App\\unins000.exe" /SILENT');
    expect(parsed).not.toBeNull();
    expect(parsed!.command).toBe('C:\\Program Files\\App\\unins000.exe');
    expect(parsed!.args).toEqual(['/SILENT']);
  });

  it('parses an unquoted path', () => {
    const parsed = parseCommandLine('C:\\Progra~1\\App\\unins.exe /q');
    expect(parsed!.command).toBe('C:\\Progra~1\\App\\unins.exe');
    expect(parsed!.args).toEqual(['/q']);
  });

  it('handles multiple quoted args with spaces', () => {
    const parsed = parseCommandLine('"C:\\a b\\x.exe" "--opt one" "-x"');
    expect(parsed!.command).toBe('C:\\a b\\x.exe');
    expect(parsed!.args).toEqual(['--opt one', '-x']);
  });

  it('returns null for empty input', () => {
    expect(parseCommandLine('')).toBeNull();
    expect(parseCommandLine('   ')).toBeNull();
  });
});

describe('expandEnv', () => {
  it('expands environment variables', () => {
    process.env.FO_TEST_VAR = 'hello';
    expect(expandEnv('%FO_TEST_VAR%\\sub')).toBe('hello\\sub');
  });

  it('leaves unknown variables untouched', () => {
    expect(expandEnv('%FO_DOES_NOT_EXIST%')).toBe('%FO_DOES_NOT_EXIST%');
  });
});

describe('toUninstallCommand', () => {
  it('converts /I{GUID} to /X{GUID} and adds silent flags for MSI', () => {
    const parsed = parseCommandLine('C:\\Windows\\System32\\MsiExec.exe /I{9BA26291-2A2A-4A2A-9A2A-2A2A2A2A2A2A}');
    const out = toUninstallCommand(parsed!, true);
    expect(out.command.toLowerCase()).toContain('msiexec');
    const joined = out.args.join(' ');
    expect(joined).toContain('/X{9BA26291-2A2A-4A2A-9A2A-2A2A2A2A2A2A}');
    expect(joined).toContain('/qn');
    expect(joined).toContain('/norestart');
  });

  it('leaves non-MSI commands untouched', () => {
    const parsed = parseCommandLine('"C:\\App\\unins000.exe" /SILENT');
    const out = toUninstallCommand(parsed!, true);
    expect(out.command).toBe('C:\\App\\unins000.exe');
    expect(out.args).toEqual(['/SILENT']);
  });

  it('does not duplicate silent flags when already present', () => {
    const parsed = parseCommandLine('MsiExec.exe /X{GUID} /qn');
    const out = toUninstallCommand(parsed!, true);
    const qnCount = out.args.filter((a) => a === '/qn').length;
    expect(qnCount).toBe(1);
  });
});

describe('residueRoots', () => {
  let base: string;
  let appData: string;
  let localAppData: string;
  let programData: string;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-residue-'));
    appData = path.join(base, 'Roaming');
    localAppData = path.join(base, 'Local');
    programData = path.join(base, 'ProgramData');
    fs.mkdirSync(appData, { recursive: true });
    fs.mkdirSync(localAppData, { recursive: true });
    fs.mkdirSync(programData, { recursive: true });
    process.env.APPDATA = appData;
    process.env.LOCALAPPDATA = localAppData;
    process.env.PROGRAMDATA = programData;
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('includes an existing install location', () => {
    const loc = path.join(localAppData, 'ContohAplikasi');
    fs.mkdirSync(loc, { recursive: true });
    const app: InstalledApp = { key: 'x', name: 'Contoh Aplikasi', installLocation: loc };
    const roots = residueRoots(app);
    expect(roots).toContain(loc);
    expect(roots).toContain(path.join(appData, 'Contoh Aplikasi'));
    expect(roots).toContain(path.join(programData, 'Contoh Aplikasi'));
  });
});

describe('residueKind', () => {
  it('classifies executables', () => {
    expect(residueKind('C:\\X\\app.exe', false)).toBe('executable');
    expect(residueKind('C:\\X\\lib.dll', false)).toBe('executable');
    expect(residueKind('C:\\X\\setup.msi', false)).toBe('executable');
    expect(residueKind('C:\\X\\run.bat', false)).toBe('executable');
  });

  it('classifies shortcuts, folders and plain files', () => {
    expect(residueKind('C:\\X\\Start HelpYou.lnk', false)).toBe('shortcut');
    expect(residueKind('C:\\X\\data.url', false)).toBe('shortcut');
    expect(residueKind('C:\\X', true)).toBe('folder');
    expect(residueKind('C:\\X\\notes.txt', false)).toBe('file');
  });
});

describe('isSelfPath', () => {
  it('protects the running executable and its folder', () => {
    expect(isSelfPath(process.execPath)).toBe(true);
    expect(isSelfPath(path.dirname(process.execPath))).toBe(true);
    expect(isSelfPath(path.join(path.dirname(process.execPath), 'resources'))).toBe(true);
  });

  it('is case-insensitive on Windows', () => {
    expect(isSelfPath(process.execPath.toUpperCase())).toBe(true);
  });

  it('leaves unrelated paths untouched', () => {
    const fake = path.join(os.tmpdir(), 'fo-elsewhere-file.exe');
    expect(isSelfPath(fake)).toBe(false);
    expect(isSelfPath(path.join(os.tmpdir(), 'whatever'))).toBe(false);
  });
});
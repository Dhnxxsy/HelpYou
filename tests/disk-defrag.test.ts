import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { normalizeDrive, isDefraggable, defragProgress, tailLines, buildAnalyzeScript, buildOptimizeScript } from '../server/organizer/disk-defrag.js';

describe('defrag normalizeDrive', () => {
  it('normalizes common drive formats to an uppercase letter', () => {
    expect(normalizeDrive('C')).toBe('C');
    expect(normalizeDrive('c')).toBe('C');
    expect(normalizeDrive('C:\\')).toBe('C');
    expect(normalizeDrive('d:/')).toBe('D');
    expect(normalizeDrive('  E: ')).toBe('E');
  });

  it('rejects non-drive input', () => {
    expect(() => normalizeDrive('C:\\Users\\data')).toThrow();
    expect(() => normalizeDrive('')).toThrow();
    expect(() => normalizeDrive('12:')).toThrow();
  });
});

describe('defrag isDefraggable', () => {
  it('accepts NTFS and ReFS', () => {
    expect(isDefraggable('NTFS')).toBe(true);
    expect(isDefraggable('ReFS')).toBe(true);
  });

  it('rejects other filesystems', () => {
    expect(isDefraggable('exFAT')).toBe(false);
    expect(isDefraggable('FAT32')).toBe(false);
    expect(isDefraggable('FAT')).toBe(false);
    expect(isDefraggable('')).toBe(false);
  });
});

describe('defrag defragProgress', () => {
  it('picks the last percent token', () => {
    const out = [
      'Invoking optimization on C: ...',
      'Defragmentation 10% complete',
      'Defragmentation 45% complete',
      'Defragmentation 88% complete',
      'Post optimization report:',
      '   Total percent of fragmentation: 2%',
    ].join('\n');
    expect(defragProgress(out)).toBe(2);
  });

  it('ignores values outside 0-100 and empty input', () => {
    expect(defragProgress('')).toBe(undefined);
    expect(defragProgress('no numbers here')).toBe(undefined);
    expect(defragProgress('[12:00:00] phase 120% ??')).toBe(undefined);
  });

  it('handles retrim lines on SSDs', () => {
    expect(defragProgress('Retrim 25% complete\nRetrim 50% complete')).toBe(50);
  });
});

describe('defrag tailLines', () => {
  it('returns the last N lines', () => {
    const out = ['a', 'b', 'c', 'd'].join('\n');
    expect(tailLines(out, 2)).toBe('c\nd');
    expect(tailLines(out, 10)).toBe(out);
  });
});

const describePs = process.platform === 'win32' ? describe : describe.skip;

describePs('generated PowerShell syntax', () => {
  const paths = {
    outPath: 'C:\\\\out.log',
    errPath: 'C:\\\\err.log',
    statePath: 'C:\\\\state.txt',
    cancelPath: 'C:\\\\cancel.txt',
  };

  const assertParses = (body: string) => {
    const file = path.join(os.tmpdir(), `defrag-syntax-${randomUUID()}.ps1`);
    fs.writeFileSync(file, body, 'utf-8');
    try {
      const cmd =
        `[void][Reflection.Assembly]::LoadWithPartialName('System.Management.Automation');` +
        `$r=$null;$e=$null;` +
        `[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$r,[ref]$e)|Out-Null;` +
        `if($e.Count){$e|ForEach-Object{$_.Message};exit 1}`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { stdio: 'pipe' });
    } finally {
      fs.rmSync(file, { force: true });
    }
  };

  it('analyze script is valid PowerShell', () => {
    expect(() => assertParses(buildAnalyzeScript('C', paths))).not.toThrow();
  });

  it('optimize script is valid PowerShell', () => {
    expect(() => assertParses(buildOptimizeScript('C', paths))).not.toThrow();
  });
});
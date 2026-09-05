import { describe, it, expect } from 'vitest';
import { junkCatalog, cleanJunk } from '../server/organizer/disk-cleaner.js';
import { analyzeDirectory } from '../server/organizer/space-analyzer.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const isWindows = process.platform === 'win32';

describe('junkCatalog', () => {
  it.skipIf(!isWindows)('lists standard and admin targets with unique ids', () => {
    const cat = junkCatalog();
    expect(cat.length).toBeGreaterThan(0);
    const ids = new Set(cat.map((t) => t.id));
    expect(ids.size).toBe(cat.length);
    expect(cat.some((t) => t.admin)).toBe(true);
    expect(cat.some((t) => !t.admin)).toBe(true);
    expect(cat.every((t) => t.path && t.label && t.note)).toBe(true);
  });

  it('never allows arbitrary paths be cleaned', async () => {
    const res = await cleanJunk(['C:\\totally\\fake\\target', 'garbage-id']);
    expect(res.length).toBe(2);
    expect(res.every((r) => r.ok === false)).toBe(true);
  });
});

describe('analyzeDirectory', () => {
  let base: string;
  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-disk-'));
    fs.mkdirSync(path.join(base, 'sub'));
    fs.writeFileSync(path.join(base, 'a.bin'), Buffer.alloc(300));
    fs.writeFileSync(path.join(base, 'sub', 'b.bin'), Buffer.alloc(7000));
  });
  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('sums sizes, branches and top files', async () => {
    const res = await analyzeDirectory(base);
    expect(res.totalBytes).toBe(7300);
    expect(res.totalFiles).toBe(2);
    expect(res.totalDirs).toBe(1);
    expect(res.truncated).toBe(false);
    const branchByPath = new Map(res.branches.map((b) => [b.path, b]));
    expect(branchByPath.get(path.join(base, 'sub'))?.kind).toBe('dir');
    expect(branchByPath.get(path.join(base, 'sub'))?.sizeBytes).toBe(7000);
    expect(branchByPath.get(path.join(base, 'a.bin'))?.kind).toBe('file');
    expect(res.topFiles[0].sizeBytes).toBe(7000);
    expect(res.topFiles.some((f) => f.name === 'a.bin')).toBe(true);
  });

  it('throws for a missing root', async () => {
    await expect(analyzeDirectory(path.join(base, 'nope'))).rejects.toThrow();
  });
});
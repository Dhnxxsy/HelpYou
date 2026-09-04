import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanDirectory, moveFile } from '../server/organizer/scanner.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fotest-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeFile(rel: string, size: number) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(size));
}

describe('scanDirectory', () => {
  it('scans and categorizes files', async () => {
    makeFile('a.mp4', 1000);
    makeFile('b.jpg', 2000);
    makeFile('sub/c.ts', 3000);
    makeFile('sub/d.pdf', 4000);

    const result = await scanDirectory(tmp, { maxDepth: 10 });
    expect(result.summary.totalFiles).toBe(4);
    expect(result.summary.totalFolders).toBeGreaterThanOrEqual(1);
    expect(result.summary.byCategory.video).toBe(1);
    expect(result.summary.byCategory.image).toBe(1);
    expect(result.summary.byCategory.code).toBe(1);
    expect(result.summary.byCategory.document).toBe(1);
  });

  it('respects minSize filter', async () => {
    makeFile('a.mp4', 1024);
    makeFile('b.pdf', 500);
    const result = await scanDirectory(tmp, { minSize: 800 });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('ignores system directories', async () => {
    makeFile('node_modules/x.js', 100);
    makeFile('visible.txt', 100);
    const result = await scanDirectory(tmp, { maxDepth: 10 });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('respects extra exclude dirs', async () => {
    makeFile('temp_cache/a.txt', 100);
    makeFile('keep.txt', 100);
    const result = await scanDirectory(tmp, { maxDepth: 10, excludeDirs: ['temp_cache'] });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('does not scan into an existing _TerSortir folder', async () => {
    makeFile('_TerSortir/Video/a.mp4', 100);
    makeFile('root.txt', 100);
    const result = await scanDirectory(tmp, { maxDepth: 10 });
    expect(result.summary.totalFiles).toBe(1);
  });

  it('isCancel-aware', async () => {
    makeFile('a.mp4', 100);
    let c = 0;
    const result = await scanDirectory(tmp, { shouldCancel: () => (++c > 0) });
    expect(result.summary.totalFiles).toBeLessThanOrEqual(1);
  });

  it('detects duplicate files by content and reports them', async () => {
    const content = Buffer.from('hello-world-duplicate-content-0123456789');
    for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(tmp, `same-${i}.txt`), content);
    fs.writeFileSync(path.join(tmp, 'different.txt'), Buffer.from('totally-different-content'));

    const result = await scanDirectory(tmp, { maxDepth: 10 });
    expect(result.summary.totalFiles).toBe(4);
    expect(result.duplicateGroups.length).toBe(1);
    expect(result.duplicateGroups[0].files.length).toBe(3);
    expect(result.duplicateGroups[0].reclaimable).toBe(result.duplicateGroups[0].size * 2);
  });

  it('classifies empty and post-move-empty folders', async () => {
    makeFile('filled/file.txt', 10);
    fs.mkdirSync(path.join(tmp, 'empty'), { recursive: true });

    const result = await scanDirectory(tmp, { maxDepth: 10 });
    expect(result.emptyFolders.some(f => path.basename(f) === 'empty')).toBe(true);
    // the folder containing a file becomes empty after sorting
    expect(result.postMoveEmptyFolders.some(f => path.basename(f) === 'filled')).toBe(true);
  });

  it('applies custom sort rules into their own folders and keeps skip-rule files', async () => {
    makeFile('DRAFT-note.txt', 100);
    makeFile('draft-2.log', 100);
    makeFile('temp.tmp', 100);
    makeFile('normal.pdf', 100);
    const rules = [
      { id: 'a', action: 'sort', matchOn: 'name', operation: 'starts', value: 'draft', folder: 'Drafting', enabled: true },
      { id: 'b', action: 'skip', matchOn: 'name', operation: 'ends', value: '.tmp', enabled: true },
    ] as any;

    const result = await scanDirectory(tmp, { maxDepth: 10, rules });

    const custom = result.moves.filter(m => m.customFolder === 'Drafting');
    expect(custom.length).toBe(2);
    expect(custom.every(m => path.dirname(m.dest) === path.join(tmp, '_TerSortir', 'Drafting'))).toBe(true);
    // skip rule: .tmp files never get a move entry
    expect(result.moves.some(m => m.dest.endsWith('.tmp'))).toBe(false);
    expect(result.moves.map(m => path.basename(m.dest)).sort()).toEqual(['DRAFT-note.txt', 'draft-2.log', 'normal.pdf']);
  });

  it('post-move-empty analysis respects skip rules (folder keeps skipped file)', async () => {
    makeFile('keep/bin/temp.tmp', 20);
    makeFile('keep/bin/real.doc', 30);
    const rules = [{ id: 's', action: 'skip', matchOn: 'name', operation: 'contains', value: '.tmp', enabled: true }] as any;

    const result = await scanDirectory(tmp, { maxDepth: 10, rules });
    // 'real.doc' moves but 'temp.tmp' stays → folder must NOT be flagged as post-move-empty
    expect(result.postMoveEmptyFolders.some(f => f.endsWith('\\bin') || f.endsWith('/bin'))).toBe(false);
    expect(result.moves.some(m => m.dest.endsWith('real.doc'))).toBe(true);
  });
});

describe('moveFile', () => {
  it('moves file and creates destination dirs, avoiding collisions', () => {
    makeFile('a.mp4', 100);
    const src = path.join(tmp, 'a.mp4');
    const dest = path.join(tmp, '_out', 'Video', 'a.mp4');
    const r = moveFile(src, dest);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.existsSync(src)).toBe(false);

    // now create another file with same name and move -> collision suffix
    makeFile('b.mp4', 100);
    const r2 = moveFile(path.join(tmp, 'b.mp4'), dest);
    expect(r2.ok).toBe(true);
    expect(fs.existsSync(path.join(tmp, '_out', 'Video', 'a (1).mp4'))).toBe(true);
  });

  it('reports missing source', () => {
    const r = moveFile(path.join(tmp, 'nope.txt'), path.join(tmp, 'x.txt'));
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
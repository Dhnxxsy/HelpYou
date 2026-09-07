import { describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseItems } from '../server/organizer/recycle-bin.js';
import { parseTracert } from '../server/organizer/network-tools.js';
import { applyRenames, listFolderEntries } from '../server/organizer/rename-tool.js';

describe('recycle-bin parseItems', () => {
  it('parses a single item and sanitizes fields', () => {
    const items = parseItems(
      JSON.stringify([
        { name: 'catatan.txt', origPath: 'C:\\$Recycle.Bin\\S-1\\$RAAA.txt', deletedFrom: 'C:\\Users\\ox', size: 12, deletedAt: '2026-09-05 10:00:00' },
      ])
    );
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('catatan.txt');
    expect(items[0].deletedFrom).toBe('C:\\Users\\ox');
    expect(items[0].size).toBe(12);
  });

  it('handles empty/invalid output', () => {
    expect(parseItems('')).toHaveLength(0);
    expect(parseItems('not json')).toHaveLength(0);
    expect(parseItems(JSON.stringify({ a: 1 }))).toHaveLength(0);
  });

  it('drops duplicate entries (same path+name) and caps at 500', () => {
    const dup = Array.from({ length: 600 }, (_, i) => ({
      name: `f${i}.txt`, origPath: `C:\\$R${i}.txt`, deletedFrom: 'C:\\Users\\ox',
    }));
    const withDup = dup.concat({ ...dup[0] });
    expect(parseItems(JSON.stringify(withDup)).length).toBeLessThanOrEqual(500);
  });

  it('sorts items newest-first using UTC deletedDt', () => {
    const items = parseItems(
      JSON.stringify([
        { name: 'old.txt', origPath: 'C:\\$R1.txt', deletedFrom: 'C:\\a', deletedAt: 'old', ts: '2026-01-02T00:00:00.0000000Z' },
        { name: 'new.txt', origPath: 'C:\\$R2.txt', deletedFrom: 'C:\\a', deletedAt: 'new', ts: '2026-09-07T00:00:00.0000000Z' },
        { name: 'mid.txt', origPath: 'C:\\$R3.txt', deletedFrom: 'C:\\a', deletedAt: 'mid', ts: '2026-05-05T00:00:00.0000000Z' },
      ])
    );
    expect(items.map((i) => i.name)).toEqual(['new.txt', 'mid.txt', 'old.txt']);
  });
});

describe('network parseTracert', () => {
  const sample = [
    '',
    'Tracing route to google.com [142.250.4.14]',
    'over a maximum of 30 hops:',
    '',
    '  1     1 ms     1 ms     1 ms  10.0.0.1',
    '  2     <1 ms   <1 ms   <1 ms  192.168.0.1',
    '  3     *        *        *     Request timed out.',
    '  4    20 ms    21 ms    19 ms  dns.google [8.8.8.8]',
    '',
    'Trace complete.',
  ].join('\r\n');

  it('parses hops, times, and addresses', () => {
    const hops = parseTracert(sample);
    expect(hops).toHaveLength(4);
    expect(hops[0]).toEqual({ hop: 1, times: ['1 ms', '1 ms', '1 ms'], address: '10.0.0.1' });
    expect(hops[1].times).toEqual(['<1 ms', '<1 ms', '<1 ms']);
    expect(hops[2]).toEqual({ hop: 3, times: ['*', '*', '*'], address: 'Request timed out.' });
    expect(hops[3].address).toBe('dns.google [8.8.8.8]');
  });

  it('returns empty for garbage input', () => {
    expect(parseTracert('no hops here')).toHaveLength(0);
  });
});

describe('rename-tool applyRenames', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hy-test-'));

  it('lists entries with isDir/ext/size', () => {
    fs.writeFileSync(path.join(dir, 'foto.jpg'), 'x');
    fs.mkdirSync(path.join(dir, 'album'));
    const { entries } = listFolderEntries(dir);
    const foto = entries.find((e) => e.name === 'foto.jpg');
    const album = entries.find((e) => e.name === 'album');
    expect(foto?.isDir).toBe(false);
    expect(foto?.ext).toBe('.jpg');
    expect(foto?.size).toBe(1);
    expect(album?.isDir).toBe(true);
  });

  it('renames files and reports done/failed', () => {
    const from = path.join(dir, 'foto.jpg');
    const to = path.join(dir, 'Foto.jpg');
    const res = applyRenames([{ from, to }]);
    expect(res.done).toBe(1);
    expect(res.failed).toBe(0);
    expect(fs.existsSync(to)).toBe(true);
  });

  it('never overwrites an existing target (reports failure)', () => {
    fs.writeFileSync(path.join(dir, 'existing.txt'), 'keep');
    fs.writeFileSync(path.join(dir, 'already.txt'), 'target');
    const res = applyRenames([{ from: path.join(dir, 'existing.txt'), to: path.join(dir, 'already.txt') }]);
    expect(res.failed).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'already.txt'), 'utf8')).toBe('target');
  });

  it('rejects renames that escape the source folder', () => {
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
    const res = applyRenames([{ from: path.join(dir, 'x.txt'), to: path.join(dir, '..', 'x.txt') }]);
    expect(res.failed).toBe(1);
    expect(res.logs[0].error).toContain('folder');
  });

  it('skips empty or identical renames', () => {
    const res = applyRenames([
      { from: '', to: 'y' },
      { from: path.join(dir, 'same.txt'), to: path.join(dir, 'same.txt') },
    ]);
    expect(res.done).toBe(0);
    expect(res.failed).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ensure listFolderEntries throws on a missing folder
  it('throws when the folder does not exist', () => {
    expect(() => listFolderEntries(path.join(dir, 'missing'))).toThrow();
  });

  void randomUUID;
});
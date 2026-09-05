import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createNote, updateNote, deleteNote, getNote, listNotes } from '../server/organizer/notepad.js';

describe('notepad notes store', () => {
  let base: string;
  const prev = process.env.FO_DATA;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-notes-'));
    process.env.FO_DATA = base;
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
    if (prev === undefined) delete process.env.FO_DATA;
    else process.env.FO_DATA = prev;
  });

  it('creates and reads back a note', () => {
    const a = createNote({ title: '  Ide   besar  ', content: 'hello world' });
    expect(a.id).toBeDefined();
    expect(a.title).toBe('Ide besar');
    expect(a.content).toBe('hello world');
    expect(a.pinned).toBe(false);

    const got = getNote(a.id);
    expect(got?.title).toBe('Ide besar');
  });

  it('uses a fallback title for empty input', () => {
    const n = createNote({ title: '   ', content: 'x' });
    expect(n.title).toBe('Catatan Baru');
  });

  it('updates title, content and pinned', () => {
    const n = createNote({ title: 'Old', content: 'a' });
    const updated = updateNote(n.id, { title: 'New', content: 'b', pinned: true });
    expect(updated?.title).toBe('New');
    expect(updated?.content).toBe('b');
    expect(updated?.pinned).toBe(true);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(n.updatedAt);
  });

  it('returns null when updating/deleting a missing note', () => {
    expect(updateNote('nope', { title: 'x' })).toBeNull();
    expect(deleteNote('nope')).toBe(false);
  });

  it('lists pinned notes first, then by updatedAt desc', () => {
    const b = createNote({ title: 'B', content: '' });
    const a = createNote({ title: 'A', content: '' });
    updateNote(b.id, { pinned: true });
    const list = listNotes();
    expect(list[0].id).toBe(b.id);
    updateNote(a.id, { title: 'A2' }); // bump updatedAt
    const list2 = listNotes();
    const idxB = list2.findIndex((n) => n.id === b.id);
    const idxA = list2.findIndex((n) => n.id === a.id);
    expect(idxB).toBeLessThan(idxA);
    // non-pinned sorted with newest first: A was touched last
    expect(list2[idxA].title).toBe('A2');
  });

  it('deletes a note permanently', () => {
    const n = createNote({ title: 'Temp', content: 'y' });
    expect(deleteNote(n.id)).toBe(true);
    expect(getNote(n.id)).toBeNull();
  });

  it('truncates absurd input lengths', () => {
    const n = createNote({ title: 't'.repeat(500), content: 'c'.repeat(2_500_000) });
    expect(n.title.length).toBeLessThanOrEqual(200);
    expect(n.content.length).toBeLessThanOrEqual(2_000_000);
  });

  it('persists creations to disk across module reads', () => {
    const n = createNote({ title: 'Disk', content: 'persisted' });
    const fromDisk = JSON.parse(fs.readFileSync(path.join(base, '.file-organizer', 'notes.json'), 'utf-8'));
    expect(fromDisk.notes.some((x: any) => x.id === n.id)).toBe(true);
  });
});
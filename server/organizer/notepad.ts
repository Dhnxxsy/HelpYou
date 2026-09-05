import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Note } from '../../shared/types.js';

const MAX_TITLE_CHARS = 200;
const MAX_CONTENT_CHARS = 2_000_000;

/** Storage root is resolved on every call so tests can point FO_DATA at a temp dir. */
function dataDir(): string {
  const root = process.env.FO_DATA ? path.resolve(process.env.FO_DATA) : process.cwd();
  return path.join(root, '.file-organizer');
}

const storeFile = (): string => path.join(dataDir(), 'notes.json');

function readStore(): Note[] {
  try {
    const file = storeFile();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(raw?.notes)) {
        return raw.notes.filter((n: unknown): n is Note => !!n && typeof (n as Note).id === 'string');
      }
    }
  } catch {
    /* ignore corrupt store */
  }
  return [];
}

function writeStore(notes: Note[]) {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storeFile(), JSON.stringify({ notes }, null, 2));
}

function cleanTitle(title: unknown): string {
  const s = String(title ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TITLE_CHARS);
  return s || 'Catatan Baru';
}

function sortNotes(notes: Note[]): Note[] {
  return notes.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function listNotes(): Note[] {
  return sortNotes(readStore());
}

export function getNote(id: string): Note | null {
  return readStore().find((n) => n.id === id) ?? null;
}

export function createNote(input: { title?: string; content?: string; pinned?: boolean } = {}): Note {
  const store = readStore();
  const now = Date.now();
  const note: Note = {
    id: randomUUID(),
    title: cleanTitle(input.title),
    content: typeof input.content === 'string' ? input.content.slice(0, MAX_CONTENT_CHARS) : '',
    pinned: !!input.pinned,
    createdAt: now,
    updatedAt: now,
  };
  store.push(note);
  writeStore(store);
  return note;
}

export function updateNote(id: string, patch: { title?: string; content?: string; pinned?: boolean }): Note | null {
  const store = readStore();
  const note = store.find((n) => n.id === id);
  if (!note) return null;
  if (typeof patch.title === 'string') note.title = cleanTitle(patch.title);
  if (typeof patch.content === 'string') note.content = patch.content.slice(0, MAX_CONTENT_CHARS);
  if (typeof patch.pinned === 'boolean') note.pinned = patch.pinned;
  note.updatedAt = Date.now();
  writeStore(store);
  return note;
}

export function deleteNote(id: string): boolean {
  const store = readStore();
  const next = store.filter((n) => n.id !== id);
  if (next.length === store.length) return false;
  writeStore(next);
  return true;
}
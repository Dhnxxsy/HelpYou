import fs from 'fs';
import path from 'path';

export interface MoveLogEntry {
  from: string;
  to: string;
  time: number;
}

const DATA_ROOT = process.env.FO_DATA ? path.resolve(process.env.FO_DATA) : process.cwd();
const LOG_DIR = path.join(DATA_ROOT, '.file-organizer');
const LOG_FILE = path.join(LOG_DIR, 'move-log.json');

interface MoveLogFile {
  history: { id: string; date: string; moves: MoveLogEntry[] }[];
}

export function readMoveLog(): MoveLogFile {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    }
  } catch {}
  return { history: [] };
}

export function appendMoveHistory(id: string, moves: { from: string; to: string }[]) {
  const log = readMoveLog();
  const now = Date.now();
  const entries: MoveLogEntry[] = moves.map(m => ({ from: m.from, to: m.to, time: now }));
  log.history.push({ id, date: new Date().toISOString(), moves: entries });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

export function getMoveHistory(id: string) {
  const log = readMoveLog();
  return log.history.find(h => h.id === id) || null;
}

export function removeMoveHistory(id: string) {
  const log = readMoveLog();
  const idx = log.history.findIndex(h => h.id === id);
  if (idx >= 0) {
    log.history.splice(idx, 1);
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  }
}

export function listMoveHistory() {
  return readMoveLog().history;
}

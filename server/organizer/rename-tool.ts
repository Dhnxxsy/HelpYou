import fs from 'fs';
import path from 'path';
import type { RenameApplyResult, RenameEntry } from '../../shared/types.js';

export function listFolderEntries(dir: string, limit = 2000): { path: string; entries: RenameEntry[] } {
  const abs = path.resolve(dir);
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    throw new Error(`Tidak dapat membaca folder: ${abs}`);
  }

  const entries: RenameEntry[] = [];
  for (const e of dirents) {
    if (e.name.startsWith('$')) continue;
    let size = 0;
    let modifiedAt = 0;
    try {
      const st = fs.statSync(path.join(abs, e.name));
      size = st.size;
      modifiedAt = st.mtimeMs;
    } catch { /* ignore */ }
    const ext = e.isFile() ? path.extname(e.name).toLowerCase() : '';
    entries.push({
      path: path.join(abs, e.name),
      name: e.name,
      ext,
      isDir: e.isDirectory(),
      size,
      modifiedAt,
    });
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'id');
  });

  return { path: abs, entries: entries.slice(0, limit) };
}

/**
 * Apply renames. A target may change the basename inside the same folder
 * (including a case-only change). Existing destination files are never
 * overwritten.
 */
export function applyRenames(items: { from: string; to: string }[]): RenameApplyResult {
  const logs: RenameApplyResult['logs'] = [];
  let done = 0;
  let failed = 0;

  for (const r of items) {
    const from = r?.from || '';
    const to = r?.to || '';
    if (!from || !to || from === to) continue;
    try {
      if (!fs.existsSync(from)) throw new Error('Sumber tidak ditemukan.');
      const srcDir = path.dirname(from);
      const newName = path.basename(to);
      if (!newName || path.dirname(to).toLowerCase() !== srcDir.toLowerCase()) {
        throw new Error('Nama baru harus di dalam folder yang sama.');
      }
      const dest = path.join(srcDir, newName);
      // case-only rename is allowed; any other existing target is a conflict
      if (fs.existsSync(dest) && dest.toLowerCase() !== from.toLowerCase()) {
        throw new Error('Nama sudah dipakai (ditimpa dilarang).');
      }
      fs.renameSync(from, dest);
      done++;
      logs.push({ ok: true, from, to: dest });
    } catch (e: any) {
      failed++;
      logs.push({ ok: false, from, to, error: e?.message || 'Gagal.' });
    }
  }

  return { ok: failed === 0, done, failed, logs };
}
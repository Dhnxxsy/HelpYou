import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import type { DriveInfo, FolderEntry, FolderListing } from '../../shared/types.js';

const isWindows = process.platform === 'win32';

function getDrivePaths(): string[] {
  if (isWindows) {
    const drives: string[] = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const p = `${letter}:\\`;
      if (fs.existsSync(p)) drives.push(p);
    }
    return drives;
  }
  return ['/'];
}

export function listDrives(): DriveInfo[] {
  const drives: DriveInfo[] = [];
  for (const root of getDrivePaths()) {
    try {
      const stat = fs.statfsSync(root);
      drives.push({
        name: root.replace(/\\$/, ''),
        path: root,
        size: stat.blocks * stat.bsize,
        free: stat.bavail * stat.bsize,
        used: (stat.blocks - stat.bavail) * stat.bsize,
        isSystem: /^[A-Z]:\\$/.test(root),
      });
    } catch {
      drives.push({ name: root.replace(/\\$/, ''), path: root, size: 0, free: 0, used: 0 });
    }
  }
  return drives;
}

export function listFolder(folderPath: string): FolderListing {
  const abs = path.resolve(folderPath);
  const parent = path.dirname(abs);
  const entries: FolderEntry[] = [];

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    throw new Error(`Tidak dapat membaca folder: ${abs}`);
  }

  for (const e of dirents) {
    if (e.name.startsWith('$')) continue;
    if (e.isDirectory()) {
      let isEmpty = true;
      try {
        isEmpty = fs.readdirSync(path.join(abs, e.name)).length === 0;
      } catch { /* ignore */ }
      entries.push({ name: e.name, path: path.join(abs, e.name), isEmpty });
    } else {
      try {
        const st = fs.statSync(path.join(abs, e.name));
        entries.push({
          name: e.name,
          path: path.join(abs, e.name),
          isEmpty: false,
          version: formatVersion(st.size),
          lastModified: st.mtimeMs,
        });
      } catch { /* ignore */ }
    }
  }

  entries.sort((a, b) => {
    const aDir = a.lastModified === undefined && a.isEmpty !== undefined;
    // folders first
    if (a.isEmpty !== undefined && b.isEmpty === undefined) return -1;
    if (a.isEmpty === undefined && b.isEmpty !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });

  return { path: abs, parent: parent === abs ? null : parent, entries };
}

function formatVersion(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Windows: resolve a path that may be a drive root or subfolder path */
export function resolveUserPath(input: string): { path: string; exists: boolean } {
  const p = path.resolve(input.trim());
  return { path: p, exists: fs.existsSync(p) };
}

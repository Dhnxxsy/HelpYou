import fs from 'fs';
import path from 'path';
import type { FileCategory, ScanFile, ScanResult, ScanSummary, ScanFolder, SizeBand, SortRule } from '../../shared/types.js';
import { categoryForExtension, sizeBandForSize } from './categories.js';
import { findDuplicateGroups } from './duplicates.js';
import { pMap } from './async.js';
import { matchRules } from './rules.js';

export const ALL_CATEGORIES: FileCategory[] = [
  'video', 'image', 'audio', 'document', 'archive', 'program', 'code',
  'design', 'ebook', 'font', 'data', 'virtual', 'disc-image', 'torrent', 'other',
];

export interface ScanOptions {
  /** Max depth to recurse, 0 = unlimited */
  maxDepth?: number;
  /** min file size to include (bytes) */
  minSize?: number;
  /** exclude extra dirs by name */
  excludeDirs?: string[];
  /** detect duplicate files by content (default true) */
  detectDuplicates?: boolean;
  /** custom sort/skip rules (evaluated in order, first match wins) */
  rules?: SortRule[];
  onProgress?: (scanned: number, current: string) => void;
  shouldCancel?: () => boolean;
}

const STAT_CONCURRENCY = 24;

export function defaultOrganizeFolderName(): string {
  return '_TerSortir';
}

const IGNORED_DIRS = new Set([
  '$recycle.bin', 'system volume information', 'windows', 'program files',
  'program files (x86)', 'programdata', '.git', 'node_modules', '$sysreset',
  'recovery', 'perflogs', 'msocache', 'winsxs', 'appdata', 'boot',
]);

// We never recurse into existing organized folders to avoid re-sorting them.
const ORGANIZE_DIR_NAMES = new Set(['_tersortir', '_tersortir/_tersortir']);

export function normalizePath(p: string): string {
  return path.resolve(p);
}

export async function scanDirectory(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const rootAbs = normalizePath(root);
  if (!fs.existsSync(rootAbs)) throw new Error(`Folder tidak ditemukan: ${rootAbs}`);
  if (!fs.statSync(rootAbs).isDirectory()) throw new Error(`Bukan folder: ${rootAbs}`);

  const excludeDirs = new Set((options.excludeDirs || []).map(d => d.toLowerCase()));
  const maxDepth = options.maxDepth && options.maxDepth > 0 ? options.maxDepth : Infinity;
  const minSize = options.minSize || 0;
  const detectDuplicates = options.detectDuplicates !== false;

  // ---- 1. Walk (sync, dirent-only — no stat calls needed yet) ----
  const rawFiles: { path: string; name: string }[] = [];
  const dirPaths: string[] = [];
  let scanned = 0;

  const walk = (dir: string, depth: number) => {
    if (options.shouldCancel?.()) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (options.shouldCancel?.()) return;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (IGNORED_DIRS.has(lower) || excludeDirs.has(lower) || ORGANIZE_DIR_NAMES.has(lower)) continue;
        dirPaths.push(full);
        if (depth < maxDepth) walk(full, depth + 1);
        continue;
      }

      if (entry.isFile()) rawFiles.push({ path: full, name: entry.name });
    }
  };

  walk(rootAbs, 0);

  // ---- 2. stat all files in parallel (the expensive part) ----
  const stats = await pMap(
    rawFiles,
    async raw => {
      if (options.shouldCancel?.()) return null;
      try {
        const s = await fs.promises.stat(raw.path);
        scanned++;
        options.onProgress?.(scanned, raw.path);
        return { raw, s };
      } catch {
        return null;
      }
    },
    { concurrency: STAT_CONCURRENCY, shouldCancel: options.shouldCancel }
  );

  const files: ScanFile[] = [];
  for (const it of stats) {
    if (!it) continue;
    const { raw, s } = it;
    if (s.size < minSize) continue;
    const ext = path.extname(raw.name).toLowerCase();
    files.push({
      path: raw.path,
      name: raw.name,
      ext,
      size: s.size,
      category: categoryForExtension(ext),
      sizeBand: sizeBandForSize(s.size),
      modifiedAt: s.mtimeMs,
    });
  }

  const folders: ScanFolder[] = dirPaths.map(d => ({
    path: d,
    name: path.basename(d),
    itemCount: 0,
    totalSize: 0,
  }));

  const summary: ScanSummary = {
    totalFiles: files.length,
    totalFolders: folders.length,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    byCategory: { video: 0, image: 0, audio: 0, document: 0, archive: 0, program: 0, code: 0, design: 0, ebook: 0, font: 0, data: 0, virtual: 0, 'disc-image': 0, torrent: 0, other: 0 },
    categoryCount: 0,
  };
  for (const f of files) summary.byCategory[f.category]++;

  const organizeFolder = path.join(rootAbs, defaultOrganizeFolderName());
  const allFilesToSort = files.filter(f => !isOrganizeFolderContents(f.path, organizeFolder) && isInRoot(f.path, rootAbs));

  // Custom rules: files matched by a 'sort' rule get their own folder;
  // files matched by a 'skip' rule are left in place (not moved at all).
  const ruleMatches = matchRules(allFilesToSort, options.rules || []);
  const movingFiles: ScanFile[] = [];

  // Group by destination directory (category -> size band, or custom rule folder)
  const grouped: Record<string, ScanFile[]> = {};
  const moves: { path: string; dest: string; ruleId?: string; customFolder?: string }[] = [];

  for (const f of allFilesToSort) {
    const match = ruleMatches.get(f.path);
    if (match && !match.folder) continue; // skip rule — file stays
    movingFiles.push(f);

    if (match?.folder) {
      const dir = path.join(organizeFolder, match.folder);
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(f);
      moves.push({ path: f.path, dest: path.join(dir, f.name), ruleId: match.ruleId, customFolder: match.folder });
      continue;
    }

    const dir = path.join(
      organizeFolder,
      categoryFolderName(f.category),
      sizeBandFolderName(f.sizeBand)
    );
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
    moves.push({ path: f.path, dest: path.join(dir, f.name) });
  }

  // ---- 3. largest files (top 25, files that actually move) ----
  const largestFiles = [...movingFiles].sort((a, b) => b.size - a.size).slice(0, 25);

  // ---- 4. empty / post-move-empty folder analysis ----
  const { emptyFolders, postMoveEmptyFolders } = classifyEmptyFolders(dirPaths, files, movingFiles, organizeFolder);

  // ---- 5. duplicate detection (only candidate same-size groups get hashed) ----
  const duplicateGroups = detectDuplicates && !options.shouldCancel?.()
    ? await findDuplicateGroups(allFilesToSort, { concurrency: 8, shouldCancel: options.shouldCancel })
    : [];

  return {
    root: rootAbs,
    summary,
    files,
    folders,
    grouped,
    moves,
    organizeFolder,
    duplicateGroups,
    emptyFolders,
    postMoveEmptyFolders,
    largestFiles,
  };
}

function categoryFolderName(c: FileCategory): string {
  const names: Record<string, string> = {
    video: 'Video', image: 'Gambar', audio: 'Audio', document: 'Dokumen',
    archive: 'Arsip', program: 'Program', code: 'Kode-Source', design: 'Desain',
    ebook: 'Buku', font: 'Font', data: 'Data-Database', virtual: 'Virtual-Machine',
    'disc-image': 'Image-Disk', torrent: 'Torrent', other: 'Lainnya',
  };
  return names[c] || 'Lainnya';
}

export function sizeBandFolderName(b: SizeBand): string {
  const names: Record<SizeBand, string> = {
    tiny: 'Di-bawah-100KB', small: '100KB-1MB', medium: '1-10MB', large: '10-100MB', huge: 'Lebih-100MB',
  };
  return names[b];
}

function isInRoot(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isOrganizeFolderContents(filePath: string, organizeFolder: string): boolean {
  const rel = path.relative(organizeFolder, filePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isInsidePath(child: string, parentDir: string): boolean {
  const rel = path.relative(parentDir, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** User-friendly: is `child` strictly inside (or equal to) `parentDir`. */
export function isSameOrInside(child: string, parentDir: string): boolean {
  const rel = path.relative(parentDir, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Compute:
 *  emptyFolders            — dirs with no files anywhere below them (safe to delete now).
 *  postMoveEmptyFolders    — dirs that contain files now, but every tracked file there is
 *                            scheduled to move away (files excluded by skip-rules / not
 *                            sortable count as "remaining"), so they become empty after sort.
 * Deletion always re-verifies emptiness server-side for safety.
 */
function classifyEmptyFolders(
  dirPaths: string[],
  allFiles: ScanFile[],
  movingFiles: ScanFile[],
  organizeFolder: string
): { emptyFolders: string[]; postMoveEmptyFolders: string[] } {
  const candidates = dirPaths.filter(d => !isSameOrInside(d, organizeFolder));
  const moving = new Set(movingFiles.map(f => f.path));

  const direct = new Map<string, number>();
  const directRemain = new Map<string, number>();
  for (const f of allFiles) {
    const p = path.dirname(f.path);
    direct.set(p, (direct.get(p) || 0) + 1);
    if (!moving.has(f.path)) directRemain.set(p, (directRemain.get(p) || 0) + 1);
  }

  const children = new Map<string, string[]>();
  for (const d of candidates) {
    const par = path.dirname(d);
    if (!children.has(par)) children.set(par, []);
    children.get(par)!.push(d);
  }

  const depth = (p: string) => p.split(path.sep).length;
  const sorted = [...candidates].sort((a, b) => depth(b) - depth(a));

  const subAll = new Map<string, number>();
  const subRemain = new Map<string, number>();
  const emptyTree = new Set<string>();
  const postMove = new Set<string>();
  for (const d of sorted) {
    let allN = direct.get(d) || 0;
    let remainN = directRemain.get(d) || 0;
    for (const c of children.get(d) || []) {
      allN += subAll.get(c) || 0;
      remainN += subRemain.get(c) || 0;
    }
    subAll.set(d, allN);
    subRemain.set(d, remainN);
    if (allN === 0) emptyTree.add(d);
    else if (remainN === 0) postMove.add(d);
  }

  const emptyFolders = sorted.filter(d => emptyTree.has(d));
  const postMoveEmptyFolders = sorted.filter(d => postMove.has(d));
  return { emptyFolders, postMoveEmptyFolders };
}

export function safeMove(from: string, to: string): { ok: boolean; error?: string } {
  try {
    if (from === to) return { ok: true };
    if (!fs.existsSync(from)) return { ok: false, error: 'Sumber tidak ditemukan' };

    // Handle name collisions: if a file already exists at dest, rename with suffix
    let dest = to;
    const dir = path.dirname(to);
    const ext = path.extname(to);
    const base = path.basename(to, ext);
    let counter = 1;
    while (fs.existsSync(dest) && path.resolve(dest) !== path.resolve(from)) {
      dest = path.join(dir, `${base} (${counter})${ext}`);
      counter++;
      if (counter > 999) return { ok: false, error: 'Terlalu banyak nama duplikat' };
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(from, dest);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export function moveFile(from: string, to: string): { ok: boolean; error?: string; dest?: string } {
  try {
    if (from === to) return { ok: true, dest: to };
    if (!fs.existsSync(from)) return { ok: false, error: 'Sumber tidak ditemukan' };

    let dest = to;
    const dir = path.dirname(to);
    const ext = path.extname(to);
    const base = path.basename(to, ext);
    let counter = 1;
    while (fs.existsSync(dest) && path.resolve(dest) !== path.resolve(from)) {
      dest = path.join(dir, `${base} (${counter})${ext}`);
      counter++;
      if (counter > 999) return { ok: false, error: 'Terlalu banyak nama duplikat' };
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(from, dest);
    return { ok: true, dest };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
import fs from 'fs';
import path from 'path';
import type { DiskScanResult, DiskBranch, DiskFile } from '../../shared/types.js';
import { pMap } from './async.js';

const MAX_FILES = 200_000;
const MAX_DEPTH = 48;
const TOP_FILES = 20;

export interface AnalyzeOptions {
  onProgress?: (scanned: number, current: string) => void;
  shouldCancel?: () => boolean;
}

/**
 * Walk a folder and compute size statistics: immediate-children breakdown
 * (top folders + files), the largest files overall, and totals. The walk is
 * bounded (file count + depth) so enormous trees cannot hang the app.
 */
export async function analyzeDirectory(root: string, opts: AnalyzeOptions = {}): Promise<DiskScanResult> {
  const rootAbs = path.resolve(root);
  if (!fs.existsSync(rootAbs)) throw new Error(`Folder tidak ditemukan: ${rootAbs}`);
  if (!fs.statSync(rootAbs).isDirectory()) throw new Error(`Bukan folder: ${rootAbs}`);

  let fileCount = 0;
  let dirCount = 0;
  let totalBytes = 0;
  let truncated = false;
  let lastReport = 0;

  const heap: DiskFile[] = [];
  const branches: DiskBranch[] = [];

  const report = (current: string) => {
    const now = Date.now();
    if (now - lastReport > 120) {
      lastReport = now;
      opts.onProgress?.(fileCount, current);
    }
  };

  const pushHeap = (f: DiskFile) => {
    if (heap.length < TOP_FILES) {
      heap.push(f);
      heap.sort((a, b) => b.sizeBytes - a.sizeBytes);
    } else if (f.sizeBytes > heap[heap.length - 1].sizeBytes) {
      heap[heap.length - 1] = f;
      heap.sort((a, b) => b.sizeBytes - a.sizeBytes);
    }
  };

  interface Agg {
    bytes: number;
    items: number;
  }

  const walk = async (dir: string, depth: number): Promise<Agg> => {
    let acc: Agg = { bytes: 0, items: 0 };
    if (opts.shouldCancel?.()) return acc;
    if (fileCount >= MAX_FILES) {
      truncated = true;
      return acc;
    }
    const isRoot = path.resolve(dir) === rootAbs;
    let dirents: fs.Dirent[] = [];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return acc;
    }
    const dirs: string[] = [];
    const filePaths: { path: string; name: string }[] = [];
    for (const e of dirents) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) dirs.push(full);
      else if (e.isFile()) filePaths.push({ path: full, name: e.name });
    }

    const stats = await pMap(
      filePaths,
      async (f) => {
        if (opts.shouldCancel?.()) return null;
        try {
          return { ...f, size: (await fs.promises.stat(f.path)).size };
        } catch {
          return null;
        }
      },
      { concurrency: 48, shouldCancel: opts.shouldCancel }
    );

    for (const s of stats) {
      if (!s) continue;
      fileCount++;
      totalBytes += s.size;
      acc.bytes += s.size;
      acc.items++;
      pushHeap({ path: s.path, name: s.name, sizeBytes: s.size });
      if (isRoot) {
        branches.push({ path: s.path, name: s.name, kind: 'file', sizeBytes: s.size, itemCount: 1 });
      }
      if (fileCount >= MAX_FILES) {
        truncated = true;
        break;
      }
      report(s.path);
    }

    for (const d of dirs) {
      if (opts.shouldCancel?.()) return acc;
      if (fileCount >= MAX_FILES) {
        truncated = true;
        break;
      }
      if (depth >= MAX_DEPTH) {
        acc.items++;
        continue;
      }
      const sub = await walk(d, depth + 1);
      acc.bytes += sub.bytes;
      acc.items += sub.items;
      dirCount++;
      if (isRoot) {
        branches.push({ path: d, name: path.basename(d), kind: 'dir', sizeBytes: sub.bytes, itemCount: sub.items });
      }
    }
    return acc;
  };

  await walk(rootAbs, 0);

  branches.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const scanResult: DiskScanResult = {
    root: rootAbs,
    totalBytes,
    totalFiles: fileCount,
    totalDirs: dirCount,
    truncated,
    branches: branches.slice(0, 60),
    topFiles: heap.slice(0, TOP_FILES),
  };
  opts.onProgress?.(fileCount, 'Selesai');
  return scanResult;
}

/** Format bytes for logs (kept tiny; the UI formats for display). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
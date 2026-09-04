import crypto from 'crypto';
import fs from 'fs';
import type { DuplicateGroup, ScanFile } from '../../shared/types.js';
import { pMap, type PoolOpts } from './async.js';

const CHUNK = 64 * 1024;

/** Fast pre-filter hash: sha256 of head + tail chunk. Cheap even for huge files. */
async function hashHeadTail(p: string): Promise<string | null> {
  try {
    const size = (await fs.promises.stat(p)).size;
    const h = crypto.createHash('sha256');
    if (size === 0) return h.digest('hex');

    const fd = await fs.promises.open(p, 'r');
    try {
      const headLen = Math.min(CHUNK, size);
      const head = Buffer.alloc(headLen);
      await fd.read(head, 0, headLen, 0);
      h.update(head);

      const tailLen = Math.min(CHUNK, size - headLen);
      if (tailLen > 0) {
        const tail = Buffer.alloc(tailLen);
        await fd.read(tail, 0, tailLen, size - tailLen);
        h.update(tail);
      }
    } finally {
      await fd.close();
    }
    return h.digest('hex');
  } catch {
    return null;
  }
}

/** Full content hash — only run on candidates that already share head+tail. */
function hashFull(p: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      const h = crypto.createHash('sha256');
      const rs = fs.createReadStream(p);
      rs.on('data', d => h.update(d as Buffer));
      rs.on('error', () => resolve(null));
      rs.on('end', () => resolve(h.digest('hex')));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Detect duplicate files by content.
 * Optimized: same-size grouping first, then head+tail quick hash,
 * then a full sha256 only for close candidates.
 */
export async function findDuplicateGroups(files: ScanFile[], opts: PoolOpts = {}): Promise<DuplicateGroup[]> {
  const bySize = new Map<number, ScanFile[]>();
  for (const f of files) {
    if (f.size === 0) continue;
    if (!bySize.has(f.size)) bySize.set(f.size, []);
    bySize.get(f.size)!.push(f);
  }

  const groups: DuplicateGroup[] = [];
  let gi = 0;

  for (const [size, list] of bySize) {
    if (opts.shouldCancel?.()) break;
    if (list.length < 2) continue;

    const partials = await pMap(list, async f => ({ f, h: await hashHeadTail(f.path) }), opts);

    const byPart = new Map<string, ScanFile[]>();
    for (const it of partials) {
      if (!it.h) continue;
      if (!byPart.has(it.h)) byPart.set(it.h, []);
      byPart.get(it.h)!.push(it.f);
    }

    for (const partList of byPart.values()) {
      if (opts.shouldCancel?.()) break;
      if (partList.length < 2) continue;

      const fulls = await pMap(partList, async f => ({ f, h: await hashFull(f.path) }), opts);

      const byFull = new Map<string, ScanFile[]>();
      for (const it of fulls) {
        if (!it.h) continue;
        if (!byFull.has(it.h)) byFull.set(it.h, []);
        byFull.get(it.h)!.push(it.f);
      }

      for (const [hash, fl] of byFull) {
        if (fl.length < 2) continue;
        fl.sort((a, b) => a.path.localeCompare(b.path));
        groups.push({
          id: 'dup-' + (++gi),
          size,
          hash,
          files: fl,
          reclaimable: size * (fl.length - 1),
        });
      }
    }
  }

  groups.sort((a, b) => b.reclaimable - a.reclaimable);
  return groups;
}
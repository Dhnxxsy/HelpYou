import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { listDrives, listFolder } from '../organizer/system.js';
import { scanDirectory, moveFile, isSameOrInside } from '../organizer/scanner.js';
import { createScanJob, updateScanJob, completeScanJob, failScanJob, getScanJob, cancelScanJob, markScanJobCancelled } from '../jobs/scanJobs.js';
import type { ScanJob } from '../jobs/scanJobs.js';
import { appendMoveHistory, getMoveHistory, removeMoveHistory, listMoveHistory } from '../organizer/history.js';
import { readSettings, saveSettings, parseIgnoreList } from '../organizer/settings.js';
import { sanitizeRules } from '../organizer/rules.js';

export const api = Router();

// GET /api/system/info
api.get('/system/info', (_req, res) => {
  res.json({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  });
});

// GET /api/drives
api.get('/drives', (_req, res) => {
  try {
    res.json({ drives: listDrives() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/folders?path=
api.get('/folders', (req: Request, res: Response) => {
  try {
    const p = (req.query.path as string) || '';
    if (!p) return res.status(400).json({ error: 'path required' });
    res.json(listFolder(p));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/settings
api.get('/settings', (_req, res) => {
  res.json(readSettings());
});

// PUT /api/settings  body: partial ScanSettings
api.put('/settings', (req: Request, res: Response) => {
  try {
    const patch = req.body || {};
    const next = saveSettings(patch);
    res.json(next);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/scan  body: { path, maxDepth?, excludeDirs?, minSize?, detectDuplicates? }
api.post('/scan', (req: Request, res: Response) => {
  try {
    const { path: root, maxDepth, excludeDirs, minSize, detectDuplicates } = req.body || {};
    if (!root) return res.status(400).json({ error: 'path required' });

    const settings = readSettings();
    const mergedExcludes = parseIgnoreList([...(settings.extraIgnoreDirs || []), ...(Array.isArray(excludeDirs) ? excludeDirs : [])]);

    const jobId = randomUUID();
    const job = createScanJob(jobId, {
      root,
      maxDepth: typeof maxDepth === 'number' ? maxDepth : settings.maxDepth || undefined,
      excludeDirs: mergedExcludes,
      minSize:
        typeof minSize === 'number'
          ? minSize
          : settings.minSizeKB && settings.minSizeKB > 0
            ? settings.minSizeKB * 1024
            : undefined,
      detectDuplicates: typeof detectDuplicates === 'boolean' ? detectDuplicates : settings.detectDuplicates,
      rules: sanitizeRules(settings.rules || []),
    });
    startScanExecution(job);
    res.json({ jobId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function startScanExecution(job: ScanJob) {
  try {
    const cfg = job.config;
    const result = await scanDirectory(cfg.root, {
      maxDepth: cfg.maxDepth,
      excludeDirs: cfg.excludeDirs,
      minSize: cfg.minSize,
      detectDuplicates: cfg.detectDuplicates,
      rules: cfg.rules,
      shouldCancel: () => getScanJob(job.id)?.cancelled === true,
      onProgress: (scanned, current) => {
        updateScanJob(job.id, { progress: scanned, message: `Memindai: ${path.basename(current)}` });
      },
    });
    if (getScanJob(job.id)?.cancelled) {
      markScanJobCancelled(job.id);
      return;
    }
    completeScanJob(job.id, result);
    saveSettings({ lastRoot: cfg.root });
  } catch (e: any) {
    failScanJob(job.id, e.message);
  }
}

// GET /api/scan/:id  -> progress or result
api.get('/scan/:id', (req: Request, res: Response) => {
  const job = getScanJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (job.status === 'running') {
    res.json({ status: job.status, progress: job.progress, message: job.message });
  } else if (job.status === 'done') {
    res.json({ status: 'done', result: job.result });
  } else if (job.status === 'cancelled') {
    res.json({ status: 'cancelled' });
  } else {
    res.json({ status: 'error', error: job.error });
  }
});

// POST /api/scan/:id/cancel
api.post('/scan/:id/cancel', (req: Request, res: Response) => {
  const job = getScanJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  cancelScanJob(req.params.id);
  res.json({ ok: true });
});

// POST /api/apply  body: { root, moves: {from,to}[] , dryRun? }
api.post('/apply', (req: Request, res: Response) => {
  try {
    const { root, moves, dryRun } = req.body || {};
    if (!Array.isArray(moves)) return res.status(400).json({ error: 'moves array required' });

    const id: string | null = dryRun ? null : 'apply-' + Date.now();
    const logs: { ok: boolean; from: string; to: string; error?: string }[] = [];
    let moved = 0;
    let failed = 0;
    let totalBytes = 0;
    let skipped = 0;
    const actuallyMoved: { from: string; to: string }[] = [];

    for (const m of moves) {
      if (dryRun) {
        logs.push({ ok: true, from: m.from, to: m.to });
        moved++;
        continue;
      }
      const r = moveFile(m.from, m.to);
      if (r.ok) {
        moved++;
        totalBytes += getFileSize(r.dest || m.to);
        if (r.dest !== m.to) skipped++;
        actuallyMoved.push({ from: m.from, to: r.dest || m.to });
        logs.push({ ok: true, from: m.from, to: r.dest || m.to });
      } else {
        failed++;
        logs.push({ ok: false, from: m.from, to: m.to, error: r.error });
      }
    }

    if (!dryRun && actuallyMoved.length > 0 && id) {
      appendMoveHistory(id, actuallyMoved);
    }

    res.json({ id, moved, failed, totalBytes, skipped, logs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/duplicates/move  body: { root, files: string[] }
// Moves duplicate files to <root>/_TerSortir/Duplikat/<id>/ (undoable via history).
api.post('/duplicates/move', (req: Request, res: Response) => {
  try {
    const { root, files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array required' });
    }
    const rootAbs = path.resolve(String(root || '.'));
    const id = 'dup-' + Date.now();
    const destRoot = path.join(rootAbs, '_TerSortir', 'Duplikat', id);
    const actualMoves: { from: string; to: string }[] = [];
    const logs: { ok: boolean; from: string; to: string; error?: string }[] = [];
    let moved = 0;
    let failed = 0;
    let totalBytes = 0;

    for (const f of files) {
      const dest = path.join(destRoot, path.basename(String(f)));
      const r = moveFile(String(f), dest);
      if (r.ok) {
        moved++;
        const to = r.dest || dest;
        totalBytes += getFileSize(to);
        actualMoves.push({ from: String(f), to });
        logs.push({ ok: true, from: String(f), to });
      } else {
        failed++;
        logs.push({ ok: false, from: String(f), to: dest, error: r.error });
      }
    }

    if (moved > 0) appendMoveHistory(id, actualMoves);
    res.json({ id, moved, failed, totalBytes, destRoot, logs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/folders/delete-empty  body: { root, folders: string[] }
// Only removes folders that are STILL empty at deletion time (double safety).
api.post('/folders/delete-empty', (req: Request, res: Response) => {
  try {
    const { root, folders } = req.body || {};
    if (!Array.isArray(folders)) return res.status(400).json({ error: 'folders array required' });

    const rootAbs = path.resolve(String(root || '.'));
    const organizeFolder = path.join(rootAbs, '_TerSortir');

    const depth = (p: string) => p.split(path.sep).length;
    const sorted = [...new Set(folders.map((f: string) => path.resolve(f)))].sort((a, b) => depth(b) - depth(a));

    const results: { path: string; ok: boolean; reason?: string }[] = [];
    let deleted = 0;
    let skipped = 0;

    for (const abs of sorted) {
      if (!isSameOrInside(abs, rootAbs) || abs === rootAbs || isSameOrInside(abs, organizeFolder)) {
        skipped++;
        results.push({ path: abs, ok: false, reason: 'folder dilindungi' });
        continue;
      }
      try {
        const entries = fs.readdirSync(abs);
        if (entries.length > 0) {
          skipped++;
          results.push({ path: abs, ok: false, reason: 'masih berisi item' });
          continue;
        }
        fs.rmdirSync(abs);
        deleted++;
        results.push({ path: abs, ok: true });
      } catch (e: any) {
        if (e?.code === 'ENOENT') {
          deleted++;
          results.push({ path: abs, ok: true });
        } else {
          skipped++;
          results.push({ path: abs, ok: false, reason: e.message });
        }
      }
    }

    res.json({ deleted, skipped, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/open  body: { path }  -> reveal/open folder in the OS file manager
api.post('/open', (req: Request, res: Response) => {
  try {
    const p = (req.body || {}).path as string;
    if (!p) return res.status(400).json({ error: 'path required' });
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) return res.status(400).json({ error: 'path tidak ditemukan' });
    const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(cmd, [abs], { detached: true, stdio: 'ignore' });
    child.unref();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/history
api.get('/history', (_req, res) => {
  res.json({ history: listMoveHistory() });
});

// POST /api/undo  body: { id }
api.post('/undo', (req: Request, res: Response) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const entry = getMoveHistory(id);
    if (!entry) return res.status(404).json({ error: 'history not found' });

    const logs: { ok: boolean; from: string; to: string; error?: string }[] = [];
    let restored = 0;
    let failed = 0;
    for (const m of entry.moves.slice().reverse()) {
      const r = moveFile(m.to, m.from);
      if (r.ok) {
        restored++;
        logs.push({ ok: true, from: m.to, to: m.from });
      } else {
        failed++;
        logs.push({ ok: false, from: m.to, to: m.from, error: r.error });
      }
    }
    removeMoveHistory(id);
    res.json({ restored, failed, logs, id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function getFileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}
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
import {
  listInstalledApps,
  createUninstallRun,
  getUninstallRun,
  launchUninstall,
  launchUninstallAsAdmin,
  scanResidue,
  deleteResidue,
} from '../organizer/uninstaller.js';
import type { InstalledApp } from '../../shared/types.js';
import { extractIconRaw, warmIcons } from '../organizer/icons.js';
import { scanJunk, cleanJunk, cleanJunkElevated } from '../organizer/disk-cleaner.js';
import { analyzeDirectory } from '../organizer/space-analyzer.js';
import { listVolumes, normalizeDrive, buildAnalyzeScript, buildOptimizeScript, defragProgress, tailLines } from '../organizer/disk-defrag.js';
import { elevatedStreamPaths, startElevatedStream, type ElevatedStreamHandles } from '../utils/powershell.js';
import { listStartupItems, setStartupItemEnabled, deleteStartupItem } from '../organizer/startup-manager.js';
import { getSystemInfo } from '../organizer/system-info.js';
import { listFolderEntries, applyRenames } from '../organizer/rename-tool.js';
import { listRecycleBin, restoreRecycleItem, emptyRecycleBin } from '../organizer/recycle-bin.js';
import { listProcesses, killProcess } from '../organizer/process-manager.js';
import { pingHost, traceHost, dnsLookup, scanPorts } from '../organizer/network-tools.js';
import type { DiskScanResult, StartupItem, DefragAnalyzeResult, DefragJobStatus } from '../../shared/types.js';
import { listNotes, getNote, createNote, updateNote, deleteNote } from '../organizer/notepad.js';
import { listVaultItems, hideItems, unhideItem, deleteVaultItem, inspectItem, preparePreview, openPreviewStream } from '../organizer/vault.js';
import { listCatalog, launchApp, revealTarget, addCustomApp, removeCustomApp, hideApp, unhideApp, listGamePanelKeys, setGamePanelKeys } from '../organizer/apps-center.js';

export const api = Router();

/* -------------------- tiny in-memory response cache -------------------- */

const routeCache = new Map<string, { expires: number; value: unknown }>();

/** Run `fn`, serve cached result for `ttlMs` unless already fresh. */
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = routeCache.get(key);
  if (hit && hit.expires > now) return Promise.resolve(hit.value as T);
  return Promise.resolve()
    .then(fn)
    .then((value) => {
      routeCache.set(key, { expires: now + ttlMs, value });
      return value;
    });
}

/** Drop all cache keys sharing the given prefix (called after mutations). */
function invalidateCache(prefix: string) {
  for (const key of [...routeCache.keys()]) {
    if (key.startsWith(prefix)) routeCache.delete(key);
  }
}

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

/* ---------------- Uninstaller tool ---------------- */

function toApp(body: any): InstalledApp | null {
  if (!body || typeof body !== 'object') return null;
  const name = String(body.name || '');
  if (!name) return null;
  return {
    key: String(body.key || ''),
    name,
    displayVersion: body.displayVersion ? String(body.displayVersion) : undefined,
    publisher: body.publisher ? String(body.publisher) : undefined,
    installDate: body.installDate ? String(body.installDate) : undefined,
    installLocation: body.installLocation ? String(body.installLocation) : undefined,
    uninstallString: body.uninstallString ? String(body.uninstallString) : undefined,
    quietUninstallString: body.quietUninstallString ? String(body.quietUninstallString) : undefined,
    estimatedSizeKb: typeof body.estimatedSizeKb === 'number' ? body.estimatedSizeKb : undefined,
    displayIcon: body.displayIcon ? String(body.displayIcon) : undefined,
    arch: body.arch ? String(body.arch) : undefined,
    hkcu: !!body.hkcu,
  };
}

// GET /api/uninstaller/apps?force=1
api.get('/uninstaller/apps', async (_req: Request, res: Response) => {
  try {
    const force = _req.query.force === '1';
    const apps = await listInstalledApps(force);
    res.json({ apps, count: apps.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/uninstaller/run  body: { app, silent }
api.post('/uninstaller/run', async (req: Request, res: Response) => {
  const app = toApp(req.body?.app);
  if (!app) return res.status(400).json({ error: 'aplikasi tidak valid' });
  const run = createUninstallRun(app);
  const silent = req.body?.silent !== false;
  await launchUninstall(run, app, silent);
  res.json({ runId: run.id, launched: run.launched, error: run.error || null });
});

// POST /api/uninstaller/run/admin  body: { app, silent }
api.post('/uninstaller/run/admin', async (req: Request, res: Response) => {
  const app = toApp(req.body?.app);
  if (!app) return res.status(400).json({ error: 'aplikasi tidak valid' });
  const run = createUninstallRun(app);
  const silent = req.body?.silent !== false;
  await launchUninstallAsAdmin(run, app, silent);
  res.json({ runId: run.id, launched: run.launched, error: run.error || null });
});

// GET /api/uninstaller/runs/:id
api.get('/uninstaller/runs/:id', (req: Request, res: Response) => {
  const run = getUninstallRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'not found' });
  res.json({
    id: run.id,
    name: run.name,
    startedAt: run.startedAt,
    launched: run.launched,
    finished: run.finished,
    exitCode: run.exitCode,
    error: run.error || null,
    asAdmin: !!run.asAdmin,
    verified: typeof run.verified === 'boolean' ? run.verified : undefined,
  });
});

// POST /api/uninstaller/residue  body: { app }
api.post('/uninstaller/residue', async (req: Request, res: Response) => {
  const app = toApp(req.body?.app);
  if (!app) return res.status(400).json({ error: 'aplikasi tidak valid' });
  try {
    const entries = await scanResidue(app);
    res.json({ entries, count: entries.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/uninstaller/residue/delete  body: { app, paths }
api.post('/uninstaller/residue/delete', async (req: Request, res: Response) => {
  const app = toApp(req.body?.app);
  if (!app || !Array.isArray(req.body?.paths)) {
    return res.status(400).json({ error: 'parameter tidak valid' });
  }
  try {
    const results = await deleteResidue(app, req.body.paths.map((p: any) => String(p)));
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/uninstaller/icon?path=<DisplayIcon>  — app icon as an image
api.get('/uninstaller/icon', async (req: Request, res: Response) => {
  const raw = String(req.query.path || '');
  if (!raw) return res.status(400).json({ error: 'path required' });
  try {
    const icon = await extractIconRaw(raw);
    if (!icon) return res.status(404).json({ error: 'icon tidak tersedia' });
    res.set('Content-Type', icon.mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(icon.buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/uninstaller/icons  body: { paths: string[] }  — warm the icon cache
api.post('/uninstaller/icons', async (req: Request, res: Response) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths.map((p: any) => String(p)) : [];
  const cached = await warmIcons(paths);
  res.json({ paths: paths.length, cached });
});

/* ---------------- Apps & Games Center tool ---------------- */

// GET /api/apps/list?force=1&showHidden=1 — categorized catalog of installed apps & games
api.get('/apps/list', async (_req: Request, res: Response) => {
  try {
    const catalog = await listCatalog(_req.query.force === '1', _req.query.showHidden === '1');
    res.json(catalog);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/apps/game-panel — keys of the user-curated game shelf
api.get('/apps/game-panel', (_req: Request, res: Response) => {
  try {
    res.json({ keys: listGamePanelKeys() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/game-panel  body: { keys: string[] } — replace the whole shelf
api.post('/apps/game-panel', (req: Request, res: Response) => {
  try {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys : null;
    if (!keys) {
      res.status(400).json({ error: 'Body harus berisi array keys.' });
      return;
    }
    const result = setGamePanelKeys(keys);
    if (!result.ok) res.status(422).json({ error: result.error });
    else res.json({ ok: true, keys: result.keys });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/hide  body: { exe?, name?, source? } — hide an entry from the menu (not uninstall)
api.post('/apps/hide', (req: Request, res: Response) => {
  try {
    const { exe, name, source } = req.body || {};
    const result = hideApp({ exe, name, source });
    if (!result.ok) res.status(422).json({ error: result.error });
    else res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/unhide  body: { exe?, name?, source? } — bring a hidden entry back
api.post('/apps/unhide', (req: Request, res: Response) => {
  try {
    const { exe, name, source } = req.body || {};
    const result = unhideApp({ exe, name, source });
    if (!result.ok) res.status(422).json({ error: result.error });
    else res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/launch  body: { exe, args?, cwd? }
api.post('/apps/launch', async (req: Request, res: Response) => {
  try {
    const { exe, args, cwd } = req.body || {};
    res.json(await launchApp(String(exe || ''), args ? String(args) : undefined, cwd ? String(cwd) : undefined));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/open-folder  body: { exe?, cwd? }
api.post('/apps/open-folder', async (req: Request, res: Response) => {
  try {
    const { exe, cwd } = req.body || {};
    res.json(await revealTarget(exe ? String(exe) : undefined, cwd ? String(cwd) : undefined));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/custom  body: { name?, exe, args?, cwd? } — add a manually-chosen app
api.post('/apps/custom', async (req: Request, res: Response) => {
  try {
    const { name, exe, args, cwd } = req.body || {};
    const result = addCustomApp({ name, exe, args, cwd });
    if (!result.ok) res.status(422).json({ error: result.error });
    else res.json({ ok: true, entry: result.entry });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/apps/custom/remove  body: { exe } — remove a manually-added app
api.post('/apps/custom/remove', async (req: Request, res: Response) => {
  try {
    const { exe } = req.body || {};
    const result = removeCustomApp(String(exe || ''));
    if (!result.ok) res.status(422).json({ error: result.error });
    else res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Junk cleaner tool ---------------- */

// GET /api/cleaner/scan  — scan whitelisted junk locations (sizes + counts)
api.get('/cleaner/scan', async (_req: Request, res: Response) => {
  try {
    const result = await scanJunk();
    res.json({ result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cleaner/clean  body: { targetIds }  (non-elevated targets)
api.post('/cleaner/clean', async (req: Request, res: Response) => {
  try {
    const targetIds = Array.isArray(req.body?.targetIds) ? req.body.targetIds.map((x: any) => String(x)) : [];
    if (targetIds.length === 0) return res.status(400).json({ error: 'Pilih lokasi sampah terlebih dahulu.' });
    const results = await cleanJunk(targetIds);
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cleaner/clean/admin  body: { targetIds }  — elevated cleanup for admin targets
api.post('/cleaner/clean/admin', async (req: Request, res: Response) => {
  try {
    const targetIds = Array.isArray(req.body?.targetIds) ? req.body.targetIds.map((x: any) => String(x)) : [];
    if (targetIds.length === 0) return res.status(400).json({ error: 'Pilih lokasi sampah terlebih dahulu.' });
    const results = await cleanJunkElevated(targetIds);
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Disk space analyzer tool ---------------- */

interface DiskJob {
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  result?: DiskScanResult;
  error?: string;
}
const diskJobs = new Map<string, DiskJob>();

// POST /api/disk/analyze  body: { path }
api.post('/disk/analyze', (req: Request, res: Response) => {
  try {
    const root = String(req.body?.path || '');
    if (!root) return res.status(400).json({ error: 'path required' });
    const jobId = randomUUID();
    const job: DiskJob = { status: 'running', progress: 0, message: 'Menyiapkan pemindaian…' };
    diskJobs.set(jobId, job);
    (async () => {
      try {
        const result = await analyzeDirectory(root, {
          onProgress: (scanned, current) => {
            const j = diskJobs.get(jobId);
            if (j && j.status === 'running') {
              j.progress = scanned;
              j.message = `Memindai file: ${path.basename(current)}`;
            }
          },
          shouldCancel: () => diskJobs.get(jobId)?.status === 'cancelled',
        });
        const j = diskJobs.get(jobId);
        if (j && j.status === 'cancelled') {
          diskJobs.delete(jobId);
          return;
        }
        diskJobs.set(jobId, { ...job, status: 'done', progress: 1, message: 'Selesai', result });
      } catch (e: any) {
        diskJobs.set(jobId, { status: 'error', progress: 0, message: '', error: e.message });
      }
    })();
    res.json({ jobId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/disk/analyze/:id
api.get('/disk/analyze/:id', (req: Request, res: Response) => {
  const job = diskJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (job.status === 'running') {
    res.json({ status: 'running', progress: job.progress, message: job.message });
  } else if (job.status === 'done') {
    res.json({ status: 'done', result: job.result });
  } else {
    res.json({ status: 'error', error: job.error });
  }
});

// POST /api/disk/analyze/:id/cancel
api.post('/disk/analyze/:id/cancel', (req: Request, res: Response) => {
  const job = diskJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (job.status === 'running') job.status = 'cancelled';
  res.json({ ok: true });
});

/* ---------------- Disk defrag / optimize tool ---------------- */

interface DefragJob {
  kind: 'analyze' | 'optimize';
  status: 'running' | 'done' | 'cancelled' | 'error';
  progress?: number;
  log: string;
  result?: DefragAnalyzeResult;
  error?: string;
  handle?: ElevatedStreamHandles;
  timer?: ReturnType<typeof setTimeout>;
}
const defragJobs = new Map<string, DefragJob>();

async function pollDefragJob(jobId: string, job: DefragJob) {
  const handle = job.handle!;
  const state = await handle.readState();
  const out = await handle.readOut();
  const err = await handle.readErr();
  const progress = defragProgress(out);
  const base = tailLines(out || err, 30);
  job.progress = progress;
  job.log = base || job.log;

  if (state === 'done') {
    if (job.kind === 'analyze') {
      const line = out.split('\n').map((s) => s.trim()).find((s) => s.startsWith('DATA:'));
      if (line) {
        try {
          job.result = JSON.parse(line.slice(5));
        } catch {
          /* fall through: keep log only */
        }
      }
    }
    job.status = 'done';
    clearTimeout(job.timer);
    await handle.cleanup();
    return;
  }
  if (state === 'cancelled') {
    job.status = 'cancelled';
    clearTimeout(job.timer);
    await handle.cleanup();
    return;
  }
  if (state === 'error') {
    job.status = 'error';
    job.error = tailLines(err || out, 20).trim() || 'Gagal menjalankan optimasi.';
    clearTimeout(job.timer);
    await handle.cleanup();
    return;
  }
  // still running → keep polling
  job.timer = setTimeout(() => void pollDefragJob(jobId, job), 1000);
}

// GET /api/disk/defrag/volumes
api.get('/disk/defrag/volumes', async (_req: Request, res: Response) => {
  try {
    res.json({ volumes: await listVolumes() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/disk/defrag/analyze  body: { path: 'C:\' }
api.post('/disk/defrag/analyze', async (req: Request, res: Response) => {
  try {
    const drive = normalizeDrive(req.body?.path);
    const jobId = randomUUID();
    const paths = elevatedStreamPaths();
    const handle = await startElevatedStream(buildAnalyzeScript(drive, paths), paths);
    const job: DefragJob = { kind: 'analyze', status: 'running', log: 'Menganalisis fragmentasi…', handle };
    defragJobs.set(jobId, job);
    void pollDefragJob(jobId, job);
    res.json({ jobId });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/disk/defrag/optimize  body: { path: 'C:\' }
api.post('/disk/defrag/optimize', async (req: Request, res: Response) => {
  try {
    const drive = normalizeDrive(req.body?.path);
    const jobId = randomUUID();
    const paths = elevatedStreamPaths();
    const handle = await startElevatedStream(buildOptimizeScript(drive, paths), paths);
    const job: DefragJob = { kind: 'optimize', status: 'running', log: 'Menunggu izin administrator…', handle };
    defragJobs.set(jobId, job);
    void pollDefragJob(jobId, job);
    res.json({ jobId });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/disk/defrag/:id
api.get('/disk/defrag/:id', (req: Request, res: Response) => {
  const job = defragJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const body: DefragJobStatus = {
    status: job.status,
    progress: job.progress,
    log: job.log,
  };
  if (job.status === 'done') body.result = job.result;
  if (job.status === 'error') body.error = job.error;
  res.json(body);
});

// POST /api/disk/defrag/:id/cancel
api.post('/disk/defrag/:id/cancel', (req: Request, res: Response) => {
  const job = defragJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (job.status === 'running') {
    void job.handle?.cancel();
    job.status = 'cancelled';
    job.log += '\nMenghentikan…';
  }
  res.json({ ok: true });
});

/* ---------------- Startup manager tool ---------------- */

const RUN_KEY_PREFIXES = [
  'HKCU:\\software\\microsoft\\windows\\currentversion\\run',
  'HKLM:\\software\\microsoft\\windows\\currentversion\\run',
  'HKLM:\\software\\wow6432node\\microsoft\\windows\\currentversion\\run',
];

function toStartupItem(body: any): StartupItem | null {
  if (!body || typeof body !== 'object') return null;
  const type = String(body.type || '');
  if (type !== 'registry' && type !== 'file') return null;
  const name = String(body.name || '');
  if (!name) return null;
  if (type === 'registry') {
    const hive = String(body.hive || '');
    const registryPath = String(body.registryPath || '');
    const valueName = String(body.valueName || '');
    if (!registryPath || !valueName || !hive) return null;
    const lower = registryPath.toLowerCase();
    if (!RUN_KEY_PREFIXES.some((p) => lower === p.toLowerCase() || lower.startsWith(p.toLowerCase() + '\\'))) return null;
  }
  return {
    id: String(body.id || ''),
    type,
    name,
    command: String(body.command || ''),
    location: String(body.location || ''),
    hive: body.hive as StartupItem['hive'],
    registryPath: body.registryPath ? String(body.registryPath) : undefined,
    valueName: body.valueName ? String(body.valueName) : undefined,
    filePath: body.filePath ? String(body.filePath) : undefined,
    args: body.args ? String(body.args) : undefined,
    admin: !!body.admin,
    enabled: !!body.enabled,
    exePath: body.exePath ? String(body.exePath) : undefined,
    exists: typeof body.exists === 'boolean' ? body.exists : undefined,
    folderPath: body.folderPath ? String(body.folderPath) : undefined,
  };
}

// GET /api/startup/list
api.get('/startup/list', async (_req: Request, res: Response) => {
  try {
    const items = await listStartupItems();
    res.json({ items, count: items.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/startup/toggle  body: { item, enabled }
api.post('/startup/toggle', async (req: Request, res: Response) => {
  const item = toStartupItem(req.body?.item);
  if (!item) return res.status(400).json({ error: 'item tidak valid' });
  try {
    const out = await setStartupItemEnabled(item, req.body?.enabled !== false);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/startup/delete  body: { item }
api.post('/startup/delete', async (req: Request, res: Response) => {
  const item = toStartupItem(req.body?.item);
  if (!item) return res.status(400).json({ error: 'item tidak valid' });
  try {
    const out = await deleteStartupItem(item);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- System info tool ---------------- */

// GET /api/system/report
api.get('/system/report', async (_req: Request, res: Response) => {
  try {
    res.json({ report: await cached('system/report', 60_000, getSystemInfo) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Batch rename tool ---------------- */

// POST /api/rename/list  body: { dir }
api.post('/rename/list', (req: Request, res: Response) => {
  try {
    const dir = String(req.body?.dir || '').trim();
    if (!dir) return res.status(400).json({ error: 'path required' });
    const out = listFolderEntries(dir);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/rename/apply  body: { renames: {from,to}[] }
api.post('/rename/apply', (req: Request, res: Response) => {
  try {
    const renames = Array.isArray(req.body?.renames) ? req.body.renames : [];
    if (!renames.length) return res.status(400).json({ error: 'tidak ada nama yang diubah' });
    const result = applyRenames(renames.map((r: any) => ({ from: String(r?.from || ''), to: String(r?.to || '') })));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Recycle bin tool ---------------- */

// GET /api/recycle/list
api.get('/recycle/list', async (_req: Request, res: Response) => {
  try {
    res.json(await cached('recycle/list', 5_000, listRecycleBin));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recycle/restore  body: { path, from, name }
api.post('/recycle/restore', async (req: Request, res: Response) => {
  try {
    const p = String(req.body?.path || '').trim();
    const from = String(req.body?.from || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!p) return res.status(400).json({ error: 'path required' });
    const out = await restoreRecycleItem(p, from, name);
    if (out.ok) invalidateCache('recycle/list');
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recycle/empty  body: { drive? }
api.post('/recycle/empty', async (req: Request, res: Response) => {
  try {
    const drive = req.body?.drive ? String(req.body.drive) : undefined;
    const out = await emptyRecycleBin(drive);
    if (out.ok) invalidateCache('recycle/list');
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Process manager tool ---------------- */

// GET /api/process/list
api.get('/process/list', async (_req: Request, res: Response) => {
  try {
    res.json({ processes: await cached('process/list', 3_000, listProcesses) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/process/kill  body: { pid }
api.post('/process/kill', async (req: Request, res: Response) => {
  try {
    const pid = Number(req.body?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'pid tidak valid' });
    const out = await killProcess(pid);
    if (out.ok) invalidateCache('process/list');
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Network tools ---------------- */

// POST /api/network/ping  body: { host, count? }
api.post('/network/ping', async (req: Request, res: Response) => {
  try {
    const host = String(req.body?.host || '').trim();
    if (!host) return res.status(400).json({ error: 'host diperlukan' });
    const count = Math.max(1, Math.min(10, Math.floor(Number(req.body?.count) || 4)));
    const rows = await cached(`net:ping:${host.toLowerCase()}`, 10_000, () => pingHost(host, count));
    res.json({ host, rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/network/trace  body: { host }
api.post('/network/trace', async (req: Request, res: Response) => {
  try {
    const host = String(req.body?.host || '').trim();
    if (!host) return res.status(400).json({ error: 'host diperlukan' });
    const hops = await cached(`net:trace:${host.toLowerCase()}`, 60_000, () => traceHost(host));
    res.json({ host, hops });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/network/dns  body: { host }
api.post('/network/dns', async (req: Request, res: Response) => {
  try {
    const host = String(req.body?.host || '').trim();
    if (!host) return res.status(400).json({ error: 'host diperlukan' });
    const rows = await cached(`net:dns:${host.toLowerCase()}`, 30_000, () => dnsLookup(host));
    res.json({ host, rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/network/ports  body: { host }
api.post('/network/ports', async (req: Request, res: Response) => {
  try {
    const host = String(req.body?.host || '').trim();
    if (!host) return res.status(400).json({ error: 'host diperlukan' });
    const rows = await cached(`net:ports:${host.toLowerCase()}`, 30_000, () =>
      scanPorts(host, [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 8080, 8443])
    );
    res.json({ host, rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Notepad tool ---------------- */

// GET /api/notes
api.get('/notes', (_req: Request, res: Response) => {
  try {
    res.json({ notes: listNotes() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/notes/:id
api.get('/notes/:id', (req: Request, res: Response) => {
  try {
    const note = getNote(req.params.id);
    if (!note) return res.status(404).json({ error: 'Catatan tidak ditemukan' });
    res.json({ note });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/notes  body: { title?, content?, pinned? }
api.post('/notes', (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const note = createNote({
      title: typeof b.title === 'string' ? b.title : undefined,
      content: typeof b.content === 'string' ? b.content : undefined,
      pinned: !!b.pinned,
    });
    res.status(201).json({ note });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/notes/:id  body: partial note
api.put('/notes/:id', (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const note = updateNote(req.params.id, {
      title: typeof b.title === 'string' ? b.title : undefined,
      content: typeof b.content === 'string' ? b.content : undefined,
      pinned: typeof b.pinned === 'boolean' ? b.pinned : undefined,
    });
    if (!note) return res.status(404).json({ error: 'Catatan tidak ditemukan' });
    res.json({ note });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/notes/:id
api.delete('/notes/:id', (req: Request, res: Response) => {
  try {
    const ok = deleteNote(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Catatan tidak ditemukan' });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Secret vault (encrypted locker) tool ---------------- */

// GET /api/vault/list
api.get('/vault/list', (_req: Request, res: Response) => {
  try {
    res.json({ items: listVaultItems() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/vault/hide  body: { password, items: string[] }
api.post('/vault/hide', async (req: Request, res: Response) => {
  try {
    const password = String(req.body?.password || '');
    const items = Array.isArray(req.body?.items) ? req.body.items.map((x: any) => String(x)) : [];
    const result = await hideItems(password, items);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/vault/unhide  body: { id, password }
api.post('/vault/unhide', (req: Request, res: Response) => {
  try {
    const id = String(req.body?.id || '');
    const password = String(req.body?.password || '');
    if (!id) return res.status(400).json({ error: 'id diperlukan' });
    const result = unhideItem(id, password);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/vault/inspect  body: { id, password }  → list file names inside an unlocked item
api.post('/vault/inspect', (req: Request, res: Response) => {
  try {
    const id = String(req.body?.id || '');
    const password = String(req.body?.password || '');
    if (!id) return res.status(400).json({ error: 'id diperlukan' });
    res.json({ item: inspectItem(id, password) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// In-memory one-time preview tokens (never written to disk; expire quickly).
const previewTokens = new Map<string, { id: string; index: number; key: Buffer; name: string; size: number; contentType: string; expires: number }>();

// POST /api/vault/preview  body: { id, index, password }  → short-lived streaming token
api.post('/vault/preview', (req: Request, res: Response) => {
  try {
    const id = String(req.body?.id || '');
    const index = Number(req.body?.index);
    const password = String(req.body?.password || '');
    if (!id || !Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'parameter tidak valid' });
    const meta = preparePreview(id, index, password);
    const ttl = 120_000;
    const token = randomUUID();
    previewTokens.set(token, {
      id,
      index,
      key: meta.key,
      name: meta.name,
      size: meta.size,
      contentType: meta.contentType,
      expires: Date.now() + ttl,
    });
    setTimeout(() => previewTokens.delete(token), ttl).unref();
    res.json({ token, name: meta.name, size: meta.size, contentType: meta.contentType });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/vault/preview/:token  → stream decrypted content (AES stream, never written to disk)
api.get('/vault/preview/:token', (req: Request, res: Response) => {
  const t = previewTokens.get(req.params.token);
  if (!t || t.expires < Date.now()) {
    previewTokens.delete(req.params.token);
    return res.status(410).json({ error: 'Token pratinjau kedaluwarsa.' });
  }
  try {
    const { stream, size } = openPreviewStream(t.id, t.index, t.key);
    res.set('Content-Type', t.contentType);
    res.set('Content-Length', String(t.size || size));
    res.set('Cache-Control', 'no-store');
    stream.on('error', () => {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    });
    stream.pipe(res);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/vault/items/:id
api.delete('/vault/items/:id', (req: Request, res: Response) => {
  try {
    const ok = deleteVaultItem(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Item tidak ditemukan' });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
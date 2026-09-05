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
import { listStartupItems, setStartupItemEnabled, deleteStartupItem } from '../organizer/startup-manager.js';
import type { DiskScanResult, StartupItem } from '../../shared/types.js';

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
    if (!RUN_KEY_PREFIXES.some((p) => lower === p || lower.startsWith(p + '\\'))) return null;
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
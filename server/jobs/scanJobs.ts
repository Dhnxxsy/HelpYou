import type { ScanResult, SortRule } from '../../shared/types.js';

export interface ScanJobConfig {
  root: string;
  maxDepth?: number;
  excludeDirs?: string[];
  minSize?: number;
  detectDuplicates?: boolean;
  rules?: SortRule[];
}

export interface ScanJob {
  id: string;
  config: ScanJobConfig;
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  error?: string;
  cancelled?: boolean;
  result?: ScanResult;
}

const jobs = new Map<string, ScanJob>();

export function createScanJob(id: string, config: ScanJobConfig): ScanJob {
  const job: ScanJob = { id, config, status: 'running', progress: 0, message: 'Memulai...' };
  jobs.set(id, job);
  return job;
}

export function updateScanJob(id: string, updates: Partial<Pick<ScanJob, 'progress' | 'message'>>) {
  const j = jobs.get(id);
  if (!j) return;
  if (updates.progress !== undefined) j.progress = updates.progress;
  if (updates.message !== undefined) j.message = updates.message;
}

export function completeScanJob(id: string, result: ScanResult) {
  const j = jobs.get(id);
  if (!j) return;
  j.status = 'done';
  j.result = result;
  j.progress = result.summary.totalFiles;
  j.message = 'Selesai';
}

export function failScanJob(id: string, error: string) {
  const j = jobs.get(id);
  if (!j) return;
  j.status = 'error';
  j.error = error;
}

export function cancelScanJob(id: string) {
  const j = jobs.get(id);
  if (j && j.status === 'running') j.cancelled = true;
}

export function markScanJobCancelled(id: string) {
  const j = jobs.get(id);
  if (!j) return;
  j.status = 'cancelled';
  j.cancelled = true;
}

export function getScanJob(id: string): ScanJob | undefined {
  return jobs.get(id);
}
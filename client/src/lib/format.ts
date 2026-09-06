import { getCurrentLocale, tGlobal } from './i18n';

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || bytes < 0 || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return tGlobal('{n} ms', { n: Math.round(ms) });
  return tGlobal('{n} dtk', { n: (ms / 1000).toFixed(1) });
}

export function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(getCurrentLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

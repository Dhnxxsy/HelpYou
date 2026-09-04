import type { ScanFile, SortRule } from '../../shared/types.js';

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001F]/g;
const RESERVED = new Set(['.', '..', '_tersortir', 'duplikat']);

/** Normalize a custom folder name; returns null if unusable. */
export function sanitizeFolderName(input: string): string | null {
  const cleaned = String(input || '')
    .trim()
    .replace(ILLEGAL, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  if (!cleaned) return null;
  if (RESERVED.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

/** Validate & normalize an arbitrary rules payload into usable SortRule[]. */
export function sanitizeRules(rules: unknown): SortRule[] {
  if (!Array.isArray(rules)) return [];
  const out: SortRule[] = [];
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const any = r as any;
    const id = typeof any.id === 'string' && any.id ? any.id : '' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const action: SortRule['action'] = any.action === 'skip' ? 'skip' : 'sort';
    const matchOn: SortRule['matchOn'] = any.matchOn === 'path' ? 'path' : 'name';
    const operation: SortRule['operation'] = ['contains', 'starts', 'ends', 'regex'].includes(any.operation)
      ? any.operation
      : 'contains';
    const value = String(any.value ?? '').trim();
    if (!value) continue;
    if (operation === 'regex') {
      try {
        new RegExp(value);
      } catch {
        continue;
      }
    }
    let folder: string | undefined;
    if (action === 'sort') {
      const f = sanitizeFolderName(any.folder);
      if (!f) continue;
      folder = f;
    }
    out.push({
      id,
      name: String(any.name ?? '').trim().slice(0, 40),
      action,
      matchOn,
      operation,
      value: value.slice(0, 200),
      folder,
      enabled: any.enabled !== false,
    });
  }
  return out;
}

export interface RuleMatch {
  ruleId: string;
  /** present only for 'sort' rules (the destination folder). undefined => skip */
  folder?: string;
}

/**
 * Evaluate enabled rules for a list of files.
 * Rules are checked in order; the first match wins.
 * 'skip' rules map the file path to a match without a folder.
 */
export function matchRules(files: ScanFile[], rules: SortRule[]): Map<string, RuleMatch> {
  const active = rules.filter(r => r.enabled);
  if (active.length === 0) return new Map();
  const out = new Map<string, RuleMatch>();
  for (const f of files) {
    for (const r of active) {
      const haystack = r.matchOn === 'path' ? f.path : f.name;
      const lc = haystack.toLowerCase();
      const needle = r.value.toLowerCase();
      let hit = false;
      switch (r.operation) {
        case 'starts': hit = lc.startsWith(needle); break;
        case 'ends': hit = lc.endsWith(needle); break;
        case 'regex':
          try {
            hit = new RegExp(r.value).test(haystack);
          } catch {
            hit = false;
          }
          break;
        default:
          hit = lc.includes(needle);
          break;
      }
      if (hit) {
        out.set(f.path, r.action === 'sort' ? { ruleId: r.id, folder: r.folder } : { ruleId: r.id });
        break;
      }
    }
  }
  return out;
}
import fs from 'fs';
import path from 'path';
import type { ScanSettings } from '../../shared/types.js';

const DATA_ROOT = process.env.FO_DATA ? path.resolve(process.env.FO_DATA) : process.cwd();
const DIR = path.join(DATA_ROOT, '.file-organizer');
const FILE = path.join(DIR, 'settings.json');

const DEFAULTS: ScanSettings = {
  lastRoot: null,
  extraIgnoreDirs: [],
  maxDepth: null,
  minSizeKB: null,
  detectDuplicates: true,
  rules: [],
};

export function readSettings(): ScanSettings {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      return {
        ...DEFAULTS,
        ...raw,
        extraIgnoreDirs: Array.isArray(raw.extraIgnoreDirs) ? raw.extraIgnoreDirs.filter((d: unknown) => typeof d === 'string') : [],
        rules: Array.isArray(raw.rules) ? raw.rules.filter((r: unknown) => r && typeof r === 'object') : [],
      };
    }
  } catch { /* ignore corrupt settings */ }
  return { ...DEFAULTS };
}

export function saveSettings(patch: Partial<ScanSettings>): ScanSettings {
  const next = { ...readSettings(), ...patch };
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

/** helper: parse a comma/newline separated list of folder names */
export function parseIgnoreList(input: string | string[] | undefined): string[] {
  if (Array.isArray(input)) return input.map(x => String(x).trim()).filter(Boolean);
  if (!input) return [];
  return String(input)
    .split(/[\n,;]/)
    .map(s => s.trim())
    .filter(Boolean);
}
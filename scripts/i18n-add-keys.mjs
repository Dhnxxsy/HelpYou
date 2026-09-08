import fs from 'node:fs';
import path from 'node:path';

/**
 * Uniform helper to add new i18n keys across all 13 dictionaries.
 * - Keys are inserted in sorted (id) position, matching each dict's style.
 * - Idempotent: keys already present in a dictionary are skipped.
 * - Preserves each file's existing line-ending style (CRLF vs LF).
 * - Escapes apostrophes / backslashes inside keys and values.
 * - After writing, re-syncs client/src/i18n/keys.txt from en.ts.
 *
 * Usage:
 *   node scripts/i18n-add-keys.mjs            # apply + sync keys.txt
 *   node scripts/i18n-add-keys.mjs --dry-run  # preview without writing
 *
 * To add keys: put them in KEYS below. The Indonesian phrase is the key;
 * provide the 13 translations exactly like the entries already in the file.
 */
const dir = 'client/src/i18n';
const CODES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'ar', 'tr', 'zh', 'ja', 'ko'];

/** Add an object per Indonesian key with all 13 translations (en, es, fr, de, pt, it, nl, ru, ar, tr, zh, ja, ko). */
const KEYS = {};

const DRY = process.argv.includes('--dry-run');

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function extractKey(line) {
  let m = line.match(/^[ \t]*'((?:[^'\\]|\\.)*)'[ \t]*:/);
  if (m) return m[1] || null;
  m = line.match(/^[ \t]*"((?:[^"\\]|\\.)*)"[ \t]*:/);
  return m ? m[1] : null;
}

function syncKeysTxt() {
  const src = fs.readFileSync(path.join(dir, 'en.ts'), 'utf8');
  const keys = [];
  for (const line of src.split(/\r?\n/)) {
    const k = extractKey(line);
    if (k != null) keys.push(k);
  }
  fs.writeFileSync(
    path.join(dir, 'keys.txt'),
    [...new Set(keys)].sort((a, b) => a.localeCompare(b, 'id')).join('\r\n') + '\r\n',
    'utf8'
  );
  return keys.length;
}

let totalAdded = 0;
let totalSkipped = 0;
for (const code of CODES) {
  const file = path.join(dir, code + '.ts');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';

  let added = 0;
  let skipped = 0;
  for (const [key, dict] of Object.entries(KEYS)) {
    if (lines.some((l) => extractKey(l) === key)) {
      skipped++;
      continue;
    }
    const entry = `  '${key}': '${esc(dict[code])}',`;
    let insert = lines.findIndex((l) => {
      const k = extractKey(l);
      return k != null && k.localeCompare(key, 'id') > 0;
    });
    if (insert === -1) insert = lines.findIndex((l) => l.trim() === '};');
    if (insert === -1) throw new Error(file + ': closing brace not found');
    lines.splice(insert, 0, entry);
    added++;
  }

  if (DRY) {
    console.log(`${code}: ${added} to add, ${skipped} already present`);
  } else if (added > 0) {
    fs.writeFileSync(file, lines.join(eol), 'utf8');
    console.log(`${code}: +${added} (${skipped} skipped)`);
  } else {
    console.log(`${code}: up to date`);
  }
  totalAdded += added;
  totalSkipped += skipped;
}

if (DRY) {
  console.log(`[dry-run] would add ${totalAdded} keys, ${totalSkipped} already present`);
  process.exit(0);
}

const enTotal = syncKeysTxt();
console.log(`done: added ${totalAdded} keys across ${CODES.length} dictionaries; keys.txt synced (${enTotal} keys)`);
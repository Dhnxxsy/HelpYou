import fs from 'fs';
import path from 'path';

const SRC = path.resolve('client/src');
const OUT = path.resolve('client/src/i18n/keys.txt');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!(e.name === 'i18n')) walk(p, acc);
    } else if (/\.tsx?$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const files = walk(SRC);
const keys = new Set();
// capture t('...') / tGlobal('...') first-arg string literals (single/double quotes)
const re = /\bt(?:Global)?\(\s*(['"`])([\s\S]*?[^\\])\1/gs;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf-8');
  let m;
  while ((m = re.exec(src)) !== null) {
    const q = m[1];
    const inner = m[2];
    if (q === '`') continue; // template literal keys are not expected
    // unescape
    const key = inner.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (key.trim().length && secondArgIsOnlyVars(m[0])) {
      keys.add(key);
    }
  }
}

function secondArgIsOnlyVars(full) {
  // heuristic: no need; accept all
  return true;
}

const list = [...keys].sort((a, b) => a.localeCompare(b, 'id'));
fs.writeFileSync(OUT, list.join('\r\n') + '\r\n');
console.log(`files=${files.length} uniqueKeys=${list.length} -> ${OUT}`);
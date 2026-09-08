import fs from 'node:fs';
import path from 'node:path';

const dir = 'client/src/i18n';
const CODES = ['es', 'fr', 'de', 'pt', 'it', 'nl', 'ru', 'ar', 'tr', 'zh', 'ja', 'ko', 'id'];

/** Sync keys.txt when SYNC_KEYS=1 OR the --sync flag is passed (cross-platform). */
const SYNC = process.env.SYNC_KEYS === '1' || process.argv.includes('--sync');

function load(file) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  src = src.replace(/export default d;?/, '');
  src = src.replace(/const d: Record<string, string> =/, 'const d =');
  const m = new Function(src + '\nreturn d;')();
  return m;
}

const en = load(path.join(dir, 'en.ts'));
const enKeys = Object.keys(en);
console.log('en keys:', enKeys.length);
if (SYNC) {
  fs.writeFileSync(path.join(dir, 'keys.txt'), [...enKeys].sort().join('\r\n') + '\r\n', 'utf8');
  console.log('keys.txt synced (' + enKeys.length + ' keys)');
}

let bad = 0;
for (const code of CODES) {
  if (code === 'id') {
    // 'id' is the identity dictionary (empty object) by design.
    console.log('id: identity ({} by design)');
    continue;
  }
  let d;
  try {
    d = load(path.join(dir, code + '.ts'));
  } catch (e) {
    console.log(code + ': PARSE ERROR ' + e.message);
    bad++;
    continue;
  }
  const missing = enKeys.filter((k) => !(k in d));
  const extra = Object.keys(d).filter((k) => !enKeys.includes(k));
  const ok = missing.length === 0 && extra.length === 0;
  if (!ok) bad++;
  console.log(
    code + ':', Object.keys(d).length,
    ok ? 'OK' :
      'DIFF' + (missing.length ? ' missing=' + missing.length : '') + (extra.length ? ' extra=' + extra.length : '')
  );
}
console.log(bad ? 'FAIL' : 'ALL OK');
process.exit(bad ? 1 : 0);
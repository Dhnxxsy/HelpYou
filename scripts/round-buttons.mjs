import fs from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(d, dirs) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, dirs);
    else if (e.name.endsWith('.tsx')) files.push(p);
  }
})('client/src');

function transformButtonClass(inner) {
  let out = inner;

  // .btn* / .tool-btn / .chip / .kbd define their own radius in CSS — drop
  // small explicit radii so the component radius wins (pill for .btn).
  const hasBase = /(^|\s)(\.btn[\w-]*|tool-btn)\s/.test(out);
  if (hasBase) {
    out = out.replace(/\srounded-(sm|md|lg|\[[0-9]*(px|rem)\])/g, '');
  }

  // Bump remaining small radii on buttons to full rounding.
  if (/rounded-(sm|md|lg|\[[0-9]+(px|rem)\])/.test(out)) {
    const isSquareIcon = /\sw-\d+\sh-\d+\s/.test(out) && /\sgrid\s+place-items-center/.test(out);
    if (isSquareIcon) out = out.replace(/\srounded-(sm|md|lg|\[[0-9]+(px|rem)\])/g, ' rounded-full');
    else out = out.replace(/\srounded-(sm|md|lg|\[[0-9]+(px|rem)\])/g, ' rounded-xl');
  }

  return out;
}

const re = /<(button)[^>]*className\s*=\s*(?:\{\s*`([^`]*)`\s*\}|\{\s*'([^']*)'\s*\}|"([^"]*)")[^>]*>/g;

let changed = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let out = src;
  let modified = false;
  out = out.replace(re, (m, tag, t1, s1, d1) => {
    const inner = (t1 ?? s1 ?? d1 ?? '');
    const next = transformButtonClass(inner);
    if (next !== inner) {
      modified = true;
      const orig = inner;
      const repl = next;
      if (t1 !== undefined) return m.replace(orig, repl);
      if (s1 !== undefined) return m.replace(orig, repl);
      return m.replace(orig, repl);
    }
    return m;
  });
  if (modified) {
    fs.writeFileSync(f, out);
    changed++;
    console.log('rounded', f);
  }
}
console.log(`files changed: ${changed}`);
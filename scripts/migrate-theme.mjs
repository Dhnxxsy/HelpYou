import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('client/src');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.tsx')) files.push(p);
  }
})(ROOT);

const R = (re, sub) => [re, sub];

// Applied to the FULL file (safe token replacements — these exact class
// fragments never appear in icon path data or identifiers).
const GLOBAL = [
  R(/bg-white\/\[0\.015\]/g, 'bg-[var(--surface-3)]'),
  R(/bg-white\/15/g, 'bg-[var(--overlay-2)]'),
  R(/bg-white\/\[0\.12\]/g, 'bg-[var(--overlay-2)]'),
  R(/bg-white\/\[0\.1\]/g, 'bg-[var(--overlay-2)]'),
  R(/bg-white\/\[0\.09\]/g, 'bg-[var(--overlay-2)]'),
  R(/bg-white\/\[0\.08\]/g, 'bg-[var(--overlay-2)]'),
  R(/bg-white\/\[0\.07\]/g, 'bg-[var(--overlay)]'),
  R(/bg-white\/\[0\.06\]/g, 'bg-[var(--overlay)]'),
  R(/bg-white\/\[0\.05\]/g, 'bg-[var(--overlay)]'),
  R(/bg-white\/\[0\.04\]/g, 'bg-[var(--overlay)]'),
  R(/bg-white\/\[0\.03\]/g, 'bg-[var(--overlay)]'),
  R(/bg-white\/\[0\.02\]/g, 'bg-[var(--overlay)]'),
  R(/bg-white\/10/g, 'bg-[var(--overlay-2)]'),
  R(/bg-white\/5/g, 'bg-[var(--overlay)]'),
  R(/border-white\/30/g, 'border-[var(--border-2)]'),
  R(/border-white\/20/g, 'border-[var(--border-2)]'),
  R(/border-white\/15/g, 'border-[var(--border-2)]'),
  R(/border-white\/\[0\.12\]/g, 'border-[var(--border-2)]'),
  R(/border-white\/\[0\.09\]/g, 'border-[var(--border-2)]'),
  R(/border-white\/\[0\.08\]/g, 'border-[var(--border-2)]'),
  R(/border-white\/\[0\.06\]/g, 'border-[var(--border)]'),
  R(/border-white\/\[0\.05\]/g, 'border-[var(--border)]'),
  R(/border-white\/10/g, 'border-[var(--border)]'),
  R(/border-white\/5/g, 'border-[var(--border)]'),
  R(/ring-white\/20/g, 'ring-[var(--border-2)]'),
  R(/ring-white\/30/g, 'ring-[var(--border-2)]'),
  R(/border-t-white\b/g, 'border-t-[var(--text-2)]'),
  // --- scrim ---
  R(/bg-black\/80/g, 'bg-[var(--scrim)]'),
  R(/bg-black\/70/g, 'bg-[var(--scrim)]'),
  R(/bg-black\/60/g, 'bg-[var(--scrim)]'),
  R(/bg-black\/40/g, 'bg-[var(--scrim)]'),
  // --- neutral text ---
  R(/text-gray-100/g, 'text-[var(--text)]'),
  R(/text-gray-200/g, 'text-[var(--text)]'),
  R(/text-gray-300/g, 'text-[var(--text-2)]'),
  R(/text-gray-400/g, 'text-[var(--text-2)]'),
  R(/text-gray-500/g, 'text-[var(--text-3)]'),
  R(/text-gray-600/g, 'text-[var(--text-3)]'),
  R(/text-gray-700/g, 'text-[var(--text-3)]'),
  R(/text-zinc-300/g, 'text-[var(--text)]'),
  R(/text-zinc-400/g, 'text-[var(--text-2)]'),
  R(/text-zinc-500/g, 'text-[var(--text-3)]'),
  // --- accent ---
  R(/text-indigo-300\/90/g, 'text-[var(--accent-strong)]'),
  R(/text-indigo-300\/80/g, 'text-[var(--accent-strong)]'),
  R(/text-indigo-400\/70/g, 'text-[var(--accent-strong)]'),
  R(/text-indigo-300/g, 'text-[var(--accent-strong)]'),
  R(/text-indigo-400/g, 'text-[var(--accent-strong)]'),
  R(/text-indigo-200/g, 'text-[var(--accent-strong)]'),
  R(/text-fuchsia-300/g, 'text-[var(--accent-strong)]'),
  R(/text-violet-300/g, 'text-[var(--accent-strong)]'),
  R(/text-violet-200/g, 'text-[var(--accent-strong)]'),
  R(/text-sky-300/g, 'text-[var(--accent-strong)]'),
  R(/text-cyan-300/g, 'text-[var(--accent-strong)]'),
  R(/text-cyan-400\/50/g, 'text-[var(--accent-strong)]'),
  R(/bg-indigo-500\/\[0\.08\]/g, 'bg-[var(--accent-soft)]'),
  R(/bg-indigo-500\/12/g, 'bg-[var(--accent-soft)]'),
  R(/bg-indigo-500\/20/g, 'bg-[var(--accent-soft)]'),
  R(/bg-indigo-500\/15/g, 'bg-[var(--accent-soft)]'),
  R(/bg-indigo-500\/10/g, 'bg-[var(--accent-soft)]'),
  R(/bg-indigo-500\/40/g, 'bg-[var(--accent-soft-2)]'),
  R(/bg-indigo-500\b(?![/[\d])/g, 'bg-[var(--accent-deep)]'),
  R(/bg-fuchsia-500\/20/g, 'bg-[var(--accent-soft)]'),
  R(/bg-fuchsia-500\/10/g, 'bg-[var(--accent-soft)]'),
  R(/bg-violet-500\/\[0\.04\]/g, 'bg-[var(--accent-soft)]'),
  R(/bg-violet-500\/10/g, 'bg-[var(--accent-soft)]'),
  R(/bg-cyan-500\/10/g, 'bg-[var(--accent-soft)]'),
  R(/bg-sky-500\/10/g, 'bg-[var(--accent-soft)]'),
  R(/hover:bg-indigo-500\/30/g, 'hover:bg-[var(--accent-soft-2)]'),
  R(/hover:bg-indigo-500\/25/g, 'hover:bg-[var(--accent-soft-2)]'),
  R(/hover:bg-indigo-500\/15/g, 'hover:bg-[var(--accent-soft-2)]'),
  R(/group-hover:bg-indigo-500/g, 'group-hover:bg-[var(--accent-deep)]'),
  R(/border-indigo-500\/25/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-500\/20/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-500\/15/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-400\/40/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-400\/30/g, 'border-[var(--accent-border)]'),
  R(/border-fuchsia-400\/40/g, 'border-[var(--accent-border)]'),
  R(/border-fuchsia-500\/20/g, 'border-[var(--accent-border)]'),
  R(/border-fuchsia-500\/40/g, 'border-[var(--accent-border)]'),
  R(/border-violet-500\/20/g, 'border-[var(--accent-border)]'),
  R(/border-violet-500\/25/g, 'border-[var(--accent-border)]'),
  R(/border-violet-400\/10/g, 'border-[var(--accent-border)]'),
  R(/border-violet-400\/30/g, 'border-[var(--accent-border)]'),
  R(/border-sky-400\/30/g, 'border-[var(--accent-border)]'),
  R(/border-cyan-400\/40/g, 'border-[var(--accent-border)]'),
  R(/border-cyan-500\/20/g, 'border-[var(--accent-border)]'),
  R(/!border-sky-500\/30/g, '!border-[var(--accent-border)]'),
  R(/border-violet-400\/40/g, 'border-[var(--accent-border)]'),
  R(/!text-sky-300/g, '!text-[var(--accent-strong)]'),
  R(/border-t-indigo-400/g, 'border-t-[var(--accent-strong)]'),
  R(/border-t-violet-400/g, 'border-t-[var(--accent-strong)]'),
  R(/border-t-fuchsia-400/g, 'border-t-[var(--accent-strong)]'),
  R(/border-t-sky-400/g, 'border-t-[var(--accent-strong)]'),
  R(/border-t-cyan-400/g, 'border-t-[var(--accent-strong)]'),
  R(/focus-visible:ring-indigo-400\/60/g, 'focus-visible:ring-[var(--ring)]'),
  R(/focus-visible:ring-indigo-400\/50/g, 'focus-visible:ring-[var(--ring)]'),
  R(/focus:ring-indigo-400\/60/g, 'focus:ring-[var(--ring)]'),
  R(/ring-indigo-500\/20/g, 'ring-[var(--accent-border)]'),
  R(/shadow-indigo-500\/30/g, 'shadow-[0_10px_30px_-10px_var(--accent-glow)]'),
  R(/shadow-indigo-500\/20/g, 'shadow-[0_10px_30px_-10px_var(--accent-glow)]'),
  R(/shadow-indigo-500\/25/g, 'shadow-[0_10px_30px_-10px_var(--accent-glow)]'),
  R(/shadow-fuchsia-500\/35/g, 'shadow-[0_10px_30px_-10px_var(--accent-glow)]'),
  R(/shadow-violet-500\/25/g, 'shadow-[0_10px_30px_-10px_var(--accent-glow)]'),
  R(/from-indigo-500 to-fuchsia-500/g, 'from-[var(--accent-deep)] to-[var(--accent-2)]'),
  R(/from-indigo-400 to-fuchsia-400/g, 'from-[var(--accent)] to-[var(--accent-2)]'),
  R(/from-fuchsia-500 to-indigo-600/g, 'from-[var(--accent-deep)] to-[var(--accent-2)]'),
  R(/from-fuchsia-500 to-indigo-500/g, 'from-[var(--accent-deep)] to-[var(--accent-2)]'),
  R(/from-indigo-500\/60 to-fuchsia-500\/60/g, 'from-[var(--accent)] to-[var(--accent-2)]'),
  R(/to-fuchsia-500/g, 'to-[var(--accent-2)]'),
  // --- status: ok ---
  R(/text-emerald-300/g, 'text-[var(--ok-strong)]'),
  R(/text-emerald-200/g, 'text-[var(--ok-strong)]'),
  R(/text-emerald-400/g, 'text-[var(--ok-strong)]'),
  R(/bg-emerald-500\/12/g, 'bg-[var(--ok-soft)]'),
  R(/bg-emerald-500\/15/g, 'bg-[var(--ok-soft)]'),
  R(/bg-emerald-500\/20/g, 'bg-[var(--ok-soft)]'),
  R(/bg-emerald-500\/10/g, 'bg-[var(--ok-soft)]'),
  R(/bg-emerald-400/g, 'bg-[var(--ok)]'),
  R(/bg-emerald-500\b/g, 'bg-[var(--ok)]'),
  R(/border-emerald-500\/30/g, 'border-[var(--ok-border)]'),
  R(/border-emerald-500\/25/g, 'border-[var(--ok-border)]'),
  R(/border-emerald-500\/20/g, 'border-[var(--ok-border)]'),
  R(/border-emerald-400\/40/g, 'border-[var(--ok-border)]'),
  R(/border-t-emerald-400/g, 'border-t-[var(--ok-strong)]'),
  // --- status: warn ---
  R(/text-amber-200/g, 'text-[var(--warn-strong)]'),
  R(/text-amber-300\/80/g, 'text-[var(--warn-strong)]'),
  R(/text-amber-300/g, 'text-[var(--warn-strong)]'),
  R(/text-amber-400/g, 'text-[var(--warn-strong)]'),
  R(/text-amber-100/g, 'text-[var(--warn-strong)]'),
  R(/bg-amber-500\/12/g, 'bg-[var(--warn-soft)]'),
  R(/bg-amber-500\/15/g, 'bg-[var(--warn-soft)]'),
  R(/bg-amber-500\/20/g, 'bg-[var(--warn-soft)]'),
  R(/bg-amber-500\/10/g, 'bg-[var(--warn-soft)]'),
  R(/bg-amber-400/g, 'bg-[var(--warn)]'),
  R(/bg-amber-500\b/g, 'bg-[var(--warn)]'),
  R(/border-amber-500\/30/g, 'border-[var(--warn-border)]'),
  R(/border-amber-500\/25/g, 'border-[var(--warn-border)]'),
  R(/border-amber-500\/20/g, 'border-[var(--warn-border)]'),
  R(/border-amber-400\/40/g, 'border-[var(--warn-border)]'),
  R(/shadow-amber-500\/30/g, 'shadow-[0_10px_30px_-10px_var(--warn-glow)]'),
  // --- status: danger ---
  R(/text-rose-400/g, 'text-[var(--danger-strong)]'),
  R(/text-rose-300\/80/g, 'text-[var(--danger-strong)]'),
  R(/text-rose-300/g, 'text-[var(--danger-strong)]'),
  R(/text-rose-200/g, 'text-[var(--danger-strong)]'),
  R(/hover:text-rose-300/g, 'hover:text-[var(--danger-strong)]'),
  R(/hover:text-rose-400/g, 'hover:text-[var(--danger-strong)]'),
  R(/bg-rose-500\/\[0\.06\]/g, 'bg-[var(--danger-soft)]'),
  R(/bg-rose-500\/15/g, 'bg-[var(--danger-soft)]'),
  R(/bg-rose-500\/12/g, 'bg-[var(--danger-soft)]'),
  R(/bg-rose-500\/20/g, 'bg-[var(--danger-soft)]'),
  R(/bg-rose-500\/10/g, 'bg-[var(--danger-soft)]'),
  R(/bg-rose-500\/25/g, 'bg-[var(--danger-soft)]'),
  R(/bg-rose-500\/\[0\.08\]/g, 'bg-[var(--danger-soft)]'),
  R(/border-rose-500\/30/g, 'border-[var(--danger-border)]'),
  R(/border-rose-500\/25/g, 'border-[var(--danger-border)]'),
  R(/border-rose-500\/20/g, 'border-[var(--danger-border)]'),
  // --- final catch-alls ---
  R(/text-violet-400\/50/g, 'text-[var(--accent-strong)]'),
  R(/text-sky-400/g, 'text-[var(--accent-strong)]'),
  R(/text-amber-500\/80/g, 'text-[var(--warn-strong)]'),
  R(/bg-violet-500\/15/g, 'bg-[var(--accent-soft)]'),
  R(/bg-gray-600/g, 'bg-[var(--bg-3)]'),
  R(/bg-gray-700/g, 'bg-[var(--bg-2)]'),
  R(/border-indigo-400\/70/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-400\/60/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-400\/10/g, 'border-[var(--accent-border)]'),
  R(/border-indigo-500\/30/g, 'border-[var(--accent-border)]'),
  R(/border-fuchsia-400\/10/g, 'border-[var(--accent-border)]'),
  R(/border-violet-500\/30/g, 'border-[var(--accent-border)]'),
  R(/border-sky-400\/40/g, 'border-[var(--accent-border)]'),
  R(/border-fuchsia-400\/60/g, 'border-[var(--accent-border)]'),
  R(/border-t-fuchsia-500/g, 'border-t-[var(--accent-strong)]'),
  R(/border-t-amber-400/g, 'border-t-[var(--warn-strong)]'),
  R(/border-emerald-500\b/g, 'border-[var(--ok-border)]'),
  R(/shadow-violet-500\/20/g, 'shadow-[0_10px_30px_-10px_var(--accent-glow)]'),
  R(/to-fuchsia-600\/90/g, 'to-[var(--accent-2)]'),
  R(/from-violet-500\/90/g, 'from-[var(--accent-deep)]'),
];

function applyGlobal(src) {
  let out = src;
  for (const [re, sub] of GLOBAL) out = out.replace(re, sub);
  return out;
}

const VIVID = /(^|\s)(from-|to-|via-|bg-gradient-to|bg-\[var\(--accent|bg-\[var\(--ok|bg-\[var\(--danger|bg-\[var\(--warn)/;

function textWhiteContext(inner) {
  if (VIVID.test(inner)) {
    return inner.replace(/\bhover:text-\[var\(--text\)\]/g, 'hover:text-white').replace(/\bgroup-hover:text-\[var\(--text\)\]/g, 'group-hover:text-white');
  }
  return inner
    .replace(/\bhover:text-white\b/g, 'hover:text-[var(--text)]')
    .replace(/\bgroup-hover:text-white\b/g, 'group-hover:text-[var(--text)]')
    .replace(/\btext-white\b/g, 'text-[var(--text)]');
}

let changed = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  let modified = false;

  // remove PageHeader accent/glow attribute lines
  const before = src;
  src = src.replace(/([ \t]+)accent="[^"]*"\r?\n/g, '');
  src = src.replace(/([ \t]+)glow="[^"]*"\r?\n/g, '');

  const g = applyGlobal(src);
  if (g !== src) modified = true;
  src = g;

  src = src.replace(/className\s*=\s*"([^"]*)"/g, (m, inner) => {
    const out = textWhiteContext(inner);
    if (out !== inner) modified = true;
    return `className="${out}"`;
  });
  src = src.replace(/className\s*=\s*\{'([^']*)'\}/g, (m, inner) => {
    const out = textWhiteContext(inner);
    if (out !== inner) modified = true;
    return `className={'${out}'}`;
  });
  src = src.replace(/className\s*=\s*\{\`([^\`]*)\`\}/g, (m, inner) => {
    const out = textWhiteContext(inner);
    if (out !== inner) modified = true;
    return `className={\`${out}\`}`;
  });

  if (modified) {
    fs.writeFileSync(file, src);
    changed++;
    console.log('migrated', path.relative('client/src', file));
  }
}
console.log(`files changed: ${changed}`);
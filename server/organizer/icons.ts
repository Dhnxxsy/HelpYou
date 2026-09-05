import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { expandEnv } from './uninstaller.js';

/**
 * App-icon extraction. Registry DisplayIcon values almost always point to an
 * .exe/.dll with an optional ",<index>" suffix (icon resource). We resolve the
 * real file, pull its first associated icon via GDI+, cache it as PNG in the
 * OS temp dir and serve it to the renderer through the API server.
 */

const CONVERT_EXTS = new Set(['.exe', '.dll', '.msi', '.bat', '.cmd', '.symlink', '.lnk', '.url']);
const DIRECT_IMAGE_EXTS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

let iconsDirCache: string | null = null;
function iconsDir(): string {
  if (!iconsDirCache) {
    iconsDirCache = path.join(os.tmpdir(), 'file-organizer-icons');
    try {
      fs.mkdirSync(iconsDirCache, { recursive: true });
    } catch { /* ignore */ }
  }
  return iconsDirCache;
}

/** Normalize a registry DisplayIcon into an existing absolute file, or null. */
export function normalizeIconPath(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  let v = expandEnv(s);
  const q1 = /^"(.*)"$/.exec(v);
  if (q1) v = q1[1];
  v = v.replace(/,\s*-?\d+\s*$/, '').trim();
  const q2 = /^"(.*)"$/.exec(v);
  if (q2) v = q2[1];
  v = v.trim();
  if (!/^[a-zA-Z]:[\\/]/.test(v)) return null;
  if (!fs.existsSync(v)) return null;
  return v;
}

function hashOf(p: string): string {
  return crypto.createHash('sha1').update(p.toLowerCase()).digest('hex');
}

function pngCacheFile(p: string): string {
  return path.join(iconsDir(), hashOf(p) + '.png');
}

const esc = (v: string) => "'" + String(v).replace(/'/g, "''") + "'";

function runPowerShell(script: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const t = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve();
    }, timeoutMs);
    child.on('error', () => { clearTimeout(t); resolve(); });
    child.on('close', () => { clearTimeout(t); resolve(); });
  });
}

/**
 * Extract a single icon (or serve a plain image file) as bytes ready to be sent
 * to the renderer. Returns null when there is nothing usable.
 */
export async function extractIconRaw(raw?: string | null): Promise<{ buf: Buffer; mime: string } | null> {
  const src = normalizeIconPath(raw);
  if (!src) return null;

  const ext = path.extname(src).toLowerCase();
  const direct = DIRECT_IMAGE_EXTS[ext];

  if (direct) {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(src);
    } catch {
      return null;
    }
    if (ext === '.png') {
      try { fs.writeFileSync(pngCacheFile(src), buf); } catch { /* cache is optional */ }
    }
    return { buf, mime: ext === '.png' ? 'image/png' : direct };
  }

  if (!CONVERT_EXTS.has(ext) && ext) {
    // Unknown extension (scripts, drivers, bare files…): skip.
    return null;
  }

  const cache = pngCacheFile(src);
  if (fs.existsSync(cache)) {
    try { return { buf: fs.readFileSync(cache), mime: 'image/png' }; } catch { /* fall through */ }
  }

  const script =
    `$ErrorActionPreference='SilentlyContinue'\n` +
    `Add-Type -AssemblyName System.Drawing\n` +
    `$src=${esc(src)}\n` +
    `$dst=${esc(cache)}\n` +
    `$i = [System.Drawing.Icon]::ExtractAssociatedIcon($src)\n` +
    `if ($i) {\n` +
    `  $bmp = $i.ToBitmap()\n` +
    `  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)\n` +
    `  $bmp.Dispose()\n` +
    `  $i.Dispose()\n` +
    `}\n`;
  await runPowerShell(script);
  try {
    return { buf: fs.readFileSync(cache), mime: 'image/png' };
  } catch {
    return null;
  }
}

/**
 * Batch-warm the icon cache for many apps with a single PowerShell run so the
 * first paint of the uninstaller list does not spawn one process per icon.
 * Returns the number of paths processed.
 */
export async function warmIcons(paths: string[]): Promise<number> {
  const py = new Map<string, { src: string; dst: string }>();
  const seen = new Set<string>();
  let count = 0;

  for (const raw of paths) {
    const src = normalizeIconPath(raw);
    if (!src || seen.has(src)) continue;
    seen.add(src);

    const ext = path.extname(src).toLowerCase();
    if (DIRECT_IMAGE_EXTS[ext] === 'image/png') {
      try { fs.writeFileSync(pngCacheFile(src), fs.readFileSync(src)); } catch { /* ignore */ }
      count++;
      continue;
    }
    if (DIRECT_IMAGE_EXTS[ext] || (ext && !CONVERT_EXTS.has(ext))) {
      count++;
      continue;
    }
    const dst = pngCacheFile(src);
    if (!fs.existsSync(dst)) {
      py.set(src, { src, dst });
    }
    count++;
  }

  if (py.size === 0) return count;

  let body = '';
  for (const { src, dst } of py.values()) {
    body += `  @{ s = ${esc(src)}; d = ${esc(dst)} },\n`;
  }
  const script =
    `$ErrorActionPreference='SilentlyContinue'\n` +
    `Add-Type -AssemblyName System.Drawing\n` +
    `$items = @(\n${body}  @{ s = ''; d = '' }\n)\n` +
    `foreach ($it in $items) {\n` +
    `  if (-not $it.s -or (Test-Path -LiteralPath $it.d -PathType Leaf)) { continue }\n` +
    `  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($it.s)\n` +
    `  if ($icon) {\n` +
    `    $bmp = $icon.ToBitmap()\n` +
    `    $bmp.Save($it.d, [System.Drawing.Imaging.ImageFormat]::Png)\n` +
    `    $bmp.Dispose()\n` +
    `    $icon.Dispose()\n` +
    `  }\n` +
    `}\n`;
  await runPowerShell(script, 30_000);
  return count;
}
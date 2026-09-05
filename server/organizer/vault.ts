import { randomUUID, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { Readable } from 'stream';
import type {
  VaultItemMeta,
  VaultHideResult,
  VaultHideEntry,
  VaultUnhideResult,
  VaultUnhideLog,
  VaultInspectResult,
} from '../../shared/types.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const KEY_LEN = 32;
const MIN_PASSWORD = 4;
const MAX_TOTAL = 512 * 1024 * 1024; // 512 MB per item
const WIPE_PASSES = 2;

/** Cheat code typed while the app is open — unlocks every vault item without the per-item sandi. */
export const MASTER_CHEAT = 'bukadong';

export const PREVIEW_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

export function isPreviewable(name: string): boolean {
  const ext = path.extname(name).slice(1).toLowerCase();
  return !!PREVIEW_MIME[ext];
}

interface VaultFileEntry {
  /** path relative to the hidden root (restore target = origParent + rel) */
  rel: string;
  size: number;
}

interface VaultHeader {
  v: number;
  type: 'file' | 'folder';
  /** root name of the hidden item */
  name: string;
  /** absolute parent directory where the item was taken from */
  origParent: string;
  files: VaultFileEntry[];
}

function dataRoot(): string {
  const root = process.env.FO_DATA ? path.resolve(process.env.FO_DATA) : process.cwd();
  return path.join(root, '.file-organizer');
}

function vaultRoot(): string {
  return path.join(dataRoot(), 'vault');
}

function masterKeyFile(): string {
  return path.join(dataRoot(), '.masterkey');
}

function itemDir(id: string): string {
  return path.join(vaultRoot(), id);
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/* ------------------------ key derivation ------------------------ */

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
}

function encryptBlock(key: Buffer, iv: Buffer, plain: Buffer): Buffer {
  const c = createCipheriv(ALGO, key, iv);
  return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
}

function decryptBlock(key: Buffer, blob: Buffer, offset = 0): Buffer {
  const iv = blob.subarray(offset, offset + IV_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(offset + IV_LEN, blob.length - TAG_LEN);
  const d = createDecipheriv(ALGO, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Best-effort `attrib +h` so the vault never shows in a normal Explorer view. */
function applyHiddenAttr(target: string): void {
  if (process.platform !== 'win32') return;
  try {
    if (fs.existsSync(target)) execFile('attrib', ['+h', target], { timeout: 5000 });
  } catch {
    /* best-effort */
  }
}

/** Machine-bound random key that allows the cheat code path to unwrap any user key. */
function getOrCreateMasterKey(): Buffer {
  const file = masterKeyFile();
  try {
    if (fs.existsSync(file)) {
      const hex = fs.readFileSync(file, 'utf-8').trim();
      const key = Buffer.from(hex, 'hex');
      if (key.length === KEY_LEN) return key;
    }
    const key = randomBytes(KEY_LEN);
    fs.writeFileSync(file, key.toString('hex'), { mode: 0o600 });
    applyHiddenAttr(file);
    return key;
  } catch (e: any) {
    throw new Error('Tidak dapat menyiapkan kunci rahasia: ' + (e?.message || ''));
  }
}

/**
 * Resolve the item's real AES key:
 *  - password === MASTER_CHEAT  → unwrap user key from `mask.enc` using the machine master key
 *  - otherwise                  → scrypt(password, salt)
 */
function resolveUserKey(dir: string, meta: any, password: string): Buffer {
  const pwd = String(password ?? '');
  if (pwd === MASTER_CHEAT) {
    const master = getOrCreateMasterKey();
    const maskPath = path.join(dir, 'mask.enc');
    if (!fs.existsSync(maskPath)) throw new Error('Kunci rahasia tidak tersedia untuk item ini.');
    const wrapped = decryptBlock(master, fs.readFileSync(maskPath));
    if (wrapped.length !== KEY_LEN) throw new Error('Kunci rahasia rusak.');
    return wrapped;
  }
  const salt = Buffer.from(String(meta?.kdf?.salt || ''), 'hex');
  if (salt.length !== SALT_LEN) throw new Error('Metadata brankas rusak.');
  return deriveKey(pwd, salt);
}

/* --------------------------- wipe/delete ------------------------ */

/**
 * Overwrite a file with random data (WIPE_PASSES) before deleting it.
 * The file is first renamed to a random name so the original filename is
 * not tied to the leftover blocks, then unlinked (never goes to Recycle Bin).
 */
function secureDelete(abs: string): boolean {
  try {
    if (!fs.existsSync(abs)) return true;

    const rand = randomBytes(8).toString('hex');
    const tmp = path.join(path.dirname(abs), `.hx-${rand}.tmp`);
    const renamed = (() => {
      try {
        fs.renameSync(abs, tmp);
        return tmp;
      } catch {
        return abs;
      }
    })();

    const size = fs.statSync(renamed).size;
    if (size > 0) {
      const fd = fs.openSync(renamed, 'r+');
      try {
        const chunk = Buffer.allocUnsafe(4 * 1024 * 1024);
        for (let pass = 0; pass < WIPE_PASSES; pass++) {
          let written = 0;
          while (written < size) {
            const n = Math.min(chunk.length, size - written);
            randomBytes(n).copy(chunk, 0, 0, n);
            fs.writeSync(fd, chunk, 0, n, written);
            written += n;
          }
          fs.fsyncSync(fd);
        }
      } finally {
        fs.closeSync(fd);
      }
    }
    fs.unlinkSync(renamed);
    return true;
  } catch {
    return false;
  }
}

/** Remove a whole file, then prune empty parent dirs up to (not including) stop. */
function secureDeleteWithPrune(fileAbs: string, rootAbs: string): boolean {
  const ok = secureDelete(fileAbs);
  if (ok) {
    let d = path.dirname(fileAbs);
    while (d !== rootAbs && isInside(d, rootAbs) && d !== path.parse(d).root) {
      try {
        fs.rmdirSync(d);
      } catch {
        break;
      }
      d = path.dirname(d);
    }
  }
  return ok;
}

/* --------------------------- collect ---------------------------- */

function collectFiles(abs: string, isDir: boolean): { root: string; isDir: boolean; files: VaultFileEntry[] } | string {
  if (isDir) {
    const out: VaultFileEntry[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.isFile()) out.push({ rel: path.relative(abs, p), size: fs.statSync(p).size });
      }
    };
    try {
      walk(abs);
    } catch (e: any) {
      return e?.message || 'Gagal membaca folder';
    }
    return { root: abs, isDir: true, files: out };
  }
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return 'Bukan file biasa';
    return { root: abs, isDir: false, files: [{ rel: path.basename(abs), size: st.size }] };
  } catch (e: any) {
    return e?.message || 'File tidak dapat dibaca';
  }
}

/** Stream a single file's plaintext into an encrypted `<outPath>` blob: iv(12) + ciphertext + tag(16). */
function encryptFileToBlob(srcFile: string, outPath: string, key: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const iv = randomBytes(IV_LEN);
    const out = fs.createWriteStream(outPath);
    out.write(iv);
    const cipher = createCipheriv(ALGO, key, iv);
    cipher.pipe(out, { end: false });
    const rs = fs.createReadStream(srcFile);
    rs.on('data', (chunk) => {
      if (!cipher.write(chunk)) rs.pause();
    });
    cipher.on('drain', () => rs.resume());
    rs.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    rs.on('end', () => {
      cipher.end();
      cipher.on('end', () => {
        out.write(cipher.getAuthTag());
        out.end();
      });
      cipher.on('error', reject);
    });
  });
}

/* ----------------------------- API ------------------------------ */

export function listVaultItems(): VaultItemMeta[] {
  try {
    if (!fs.existsSync(vaultRoot())) return [];
    const out: VaultItemMeta[] = [];
    for (const ent of fs.readdirSync(vaultRoot())) {
      const metaFile = path.join(vaultRoot(), ent, 'meta.json');
      if (!fs.existsSync(metaFile)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        if (!raw || typeof raw.id !== 'string') continue;
        out.push({
          id: raw.id,
          type: raw.type === 'folder' ? 'folder' : 'file',
          createdAt: Number(raw.createdAt) || 0,
          count: Number(raw.count) || 0,
          totalSize: Number(raw.totalSize) || 0,
        });
      } catch {
        /* skip corrupt entry */
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  } catch {
    return [];
  }
}

/** Encrypt one or more items (files or folders) into the vault and remove the plaintext sources. */
export async function hideItems(password: string, items: string[]): Promise<VaultHideResult> {
  const pwd = String(password ?? '').trim();
  if (pwd.length < MIN_PASSWORD) throw new Error(`Sandi minimal ${MIN_PASSWORD} karakter.`);
  if (!Array.isArray(items) || items.length === 0) throw new Error('Tidak ada item untuk disembunyikan.');

  const vroot = vaultRoot();
  const entries: VaultHideEntry[] = [];

  for (const rawPath of items) {
    const src = path.resolve(String(rawPath ?? ''));
    if (isInside(src, vroot)) {
      entries.push({ path: src, ok: false, error: 'Item berada di dalam brankas.' });
      continue;
    }
    if (isInside(src, dataRoot())) {
      entries.push({ path: src, ok: false, error: 'Item berada di dalam folder aplikasi HelpYou.' });
      continue;
    }
    if (isInside(vroot, src)) {
      entries.push({ path: src, ok: false, error: 'Item berisi brankas — tidak boleh disembunyikan.' });
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(src);
    } catch (e: any) {
      entries.push({ path: src, ok: false, error: e?.message || 'Tidak ditemukan' });
      continue;
    }
    const collected = collectFiles(src, stat.isDirectory());
    if (typeof collected === 'string') {
      entries.push({ path: src, ok: false, error: collected });
      continue;
    }
    if (collected.files.length === 0) {
      entries.push({ path: src, ok: false, error: 'Folder kosong (tidak ada file di dalamnya).' });
      continue;
    }
    const totalSize = collected.files.reduce((s, f) => s + f.size, 0);
    if (totalSize > MAX_TOTAL) {
      entries.push({ path: src, ok: false, error: 'Terlalu besar (maks 512 MB per item).' });
      continue;
    }

    const id = randomUUID();
    const dir = itemDir(id);
    const header: VaultHeader = {
      v: 1,
      type: collected.isDir ? 'folder' : 'file',
      name: path.basename(src),
      origParent: path.dirname(src),
      files: collected.files,
    };

    try {
      fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
      const salt = randomBytes(SALT_LEN);
      const userKey = deriveKey(pwd, salt);

      const meta = {
        id,
        type: header.type,
        createdAt: Date.now(),
        count: collected.files.length,
        totalSize,
        kdf: { salt: salt.toString('hex') },
      };
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));

      const headerIv = randomBytes(IV_LEN);
      fs.writeFileSync(path.join(dir, 'header.enc'), encryptBlock(userKey, headerIv, Buffer.from(JSON.stringify(header), 'utf-8')));

      // Wrap the user key with the machine master key → cheat code path works for forgetting sandi.
      const master = getOrCreateMasterKey();
      fs.writeFileSync(path.join(dir, 'mask.enc'), encryptBlock(master, randomBytes(IV_LEN), userKey));

      for (let i = 0; i < collected.files.length; i++) {
        const f = collected.files[i];
        const readPath = collected.isDir ? path.join(src, f.rel) : src;
        await encryptFileToBlob(readPath, path.join(dir, 'data', `${i}.enc`), userKey);
        secureDeleteWithPrune(readPath, src);
      }

      applyHiddenAttr(vroot);
      entries.push({ path: src, ok: true, id });
    } catch (e: any) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      entries.push({ path: src, ok: false, error: e?.message || 'Gagal mengenkripsi.' });
    }
  }

  return {
    done: entries.filter((x) => x.ok).length,
    failed: entries.length - entries.filter((x) => x.ok).length,
    entries,
  };
}

function readHeader(dir: string, userKey: Buffer): VaultHeader {
  const headerBlob = fs.readFileSync(path.join(dir, 'header.enc'));
  const header = JSON.parse(decryptBlock(userKey, headerBlob).toString('utf-8'));
  if (!Array.isArray(header.files)) throw new Error('Header brankas rusak.');
  return header as VaultHeader;
}

/* API key validators — wrong password throws for both normal and cheat paths. */
function openItem(id: string, password: string): { dir: string; key: Buffer; header: VaultHeader } {
  const dir = itemDir(id);
  const meta = safeJson(path.join(dir, 'meta.json')) as any;
  if (!meta || typeof meta.id !== 'string') throw new Error('Item tidak ditemukan di brankas.');
  try {
    const key = resolveUserKey(dir, meta, password);
    const header = readHeader(dir, key);
    return { dir, key, header };
  } catch (e: any) {
    if (e?.message === 'Kunci rahasia tidak tersedia untuk item ini.' || e?.message?.startsWith('Tidak dapat menyiapkan')) {
      throw e;
    }
    throw new Error('Sandi salah atau data rusak.');
  }
}

/** List the file names inside a vault item after unlocking with sandi / cheat code. */
export function inspectItem(id: string, password: string): VaultInspectResult {
  const { header } = openItem(id, password);
  return {
    type: header.type,
    name: header.name,
    count: header.files.length,
    totalSize: header.files.reduce((s, f) => s + f.size, 0),
    files: header.files.map((f) => ({ name: f.rel, size: f.size })),
  };
}

/** Validate sandi / cheat code and return what is needed to stream `index` for preview. */
export function preparePreview(id: string, index: number, password: string): { key: Buffer; name: string; size: number; contentType: string } {
  const { key, header } = openItem(id, password);
  const f = header.files[index];
  if (!f) throw new Error('File tidak ditemukan di brankas.');
  const name = f.rel;
  const contentType = PREVIEW_MIME[path.extname(name).slice(1).toLowerCase()];
  if (!contentType) throw new Error('Tipe file tidak bisa dipratinjau.');
  return { key, name, size: f.size, contentType };
}

/**
 * Decrypt and stream a single file from the vault WITHOUT writing plaintext to disk.
 * Layout of each blob: iv(12) + ciphertext + tag(16).
 */
export function openPreviewStream(id: string, index: number, key: Buffer): { name: string; size: number; stream: Readable } {
  const dir = itemDir(id);
  const blobPath = path.join(dir, 'data', `${index}.enc`);
  if (!fs.existsSync(blobPath)) throw new Error('File tidak ditemukan di brankas.');

  const stat = fs.statSync(blobPath);
  const bodyLen = stat.size - IV_LEN - TAG_LEN;
  if (bodyLen < 0) throw new Error('Data brankas rusak.');

  const header = Buffer.alloc(IV_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  const fd = fs.openSync(blobPath, 'r');
  fs.readSync(fd, header, 0, IV_LEN, 0);
  fs.readSync(fd, tag, 0, TAG_LEN, stat.size - TAG_LEN);
  fs.closeSync(fd);

  const decipher = createDecipheriv(ALGO, key, Buffer.from(header));
  decipher.setAuthTag(Buffer.from(tag));
  const rs = fs.createReadStream(blobPath, { start: IV_LEN, end: stat.size - TAG_LEN - 1 });
  return { name: '', size: bodyLen, stream: rs.pipe(decipher) };
}

/** Decrypt a vault item and write every file back to its original location. */
export function unhideItem(id: string, password: string): VaultUnhideResult {
  const { header, key: userKey } = openItem(id, password);

  const logs: VaultUnhideLog[] = [];
  let restored = 0;
  let failed = 0;

  header.files.forEach((f, i) => {
    const baseRestore = header.type === 'folder' ? path.join(header.origParent, header.name) : header.origParent;
    const target = path.normalize(path.join(baseRestore, header.files[i].rel));
    try {
      if (fs.existsSync(target)) {
        throw new Error('Sudah ada file di lokasi asli (dicegah agar tidak ditimpa).');
      }
      const blob = fs.readFileSync(path.join(itemDir(id), 'data', `${i}.enc`));
      const plain = decryptBlock(userKey, blob);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, plain);
      restored++;
      logs.push({ ok: true, from: `${id}/data/${i}.enc`, to: target });
    } catch (e: any) {
      failed++;
      logs.push({ ok: false, from: `${id}/data/${i}.enc`, to: target, error: e?.message || 'Gagal pulihkan.' });
    }
  });

  return { ok: failed === 0, restored, failed, logs };
}

/** Permanently remove a vault item (files are not restored). */
export function deleteVaultItem(id: string): boolean {
  const dir = itemDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function safeJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export { secureDelete };
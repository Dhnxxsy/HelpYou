import { randomUUID, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { VaultItemMeta, VaultHideResult, VaultHideEntry, VaultUnhideResult, VaultUnhideLog } from '../../shared/types.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const MIN_PASSWORD = 4;
const MAX_TOTAL = 512 * 1024 * 1024; // 512 MB per item

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

function itemDir(id: string): string {
  return path.join(vaultRoot(), id);
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/* ------------------------ key derivation ------------------------ */

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}

function encryptBlock(key: Buffer, iv: Buffer, plain: Buffer): Buffer {
  const c = createCipheriv(ALGO, key, iv);
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}

function decryptBlock(key: Buffer, blob: Buffer, offset = 0): Buffer {
  const iv = blob.subarray(offset, offset + IV_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(offset + IV_LEN, blob.length - TAG_LEN);
  const d = createDecipheriv(ALGO, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Overwrite a file with random data before deleting it (best-effort anti-forensics). */
function secureDelete(abs: string): boolean {
  try {
    const size = fs.statSync(abs).size;
    if (size > 0) {
      const fd = fs.openSync(abs, 'r+');
      try {
        const chunk = Buffer.allocUnsafe(Math.min(size, 4 * 1024 * 1024));
        let written = 0;
        while (written < size) {
          const n = Math.min(chunk.length, size - written);
          randomBytes(n).copy(chunk, 0, 0, n);
          fs.writeSync(fd, chunk, 0, n, written);
          written += n;
        }
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
    fs.unlinkSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** Stream a single file's plaintext into an encrypted `<outPath>` blob: iv(12) + tag(16) + ciphertext. */
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

/** Remove a whole file from disk best-effort, then prune empty parent dirs up to (not including) stop. */
function secureDeleteWithPrune(fileAbs: string, type: 'file' | 'folder', rootAbs: string): boolean {
  const ok = secureDelete(fileAbs);
  if (ok && type === 'folder') {
    let d = path.dirname(fileAbs);
    const stop = rootAbs;
    while (d !== stop && isInside(d, stop) && d !== path.parse(d).root) {
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
      const key = deriveKey(pwd, salt);

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
      fs.writeFileSync(
        path.join(dir, 'header.enc'),
        Buffer.concat([headerIv, encryptBlock(key, headerIv, Buffer.from(JSON.stringify(header), 'utf-8'))]),
      );

      for (let i = 0; i < collected.files.length; i++) {
        const f = collected.files[i];
        const readPath = collected.isDir ? path.join(src, f.rel) : src;
        await encryptFileToBlob(readPath, path.join(dir, 'data', `${i}.enc`), key);
        secureDeleteWithPrune(readPath, header.type, src);
      }

      entries.push({ path: src, ok: true, id });
    } catch (e: any) {
      entries.push({ path: src, ok: false, error: e?.message || 'Gagal mengenkripsi.' });
    }
  }

  return {
    done: entries.filter((x) => x.ok).length,
    failed: entries.length - entries.filter((x) => x.ok).length,
    entries,
  };
}

/** Decrypt a vault item and write every file back to its original location. */
export function unhideItem(id: string, password: string): VaultUnhideResult {
  const pwd = String(password ?? '');
  const dir = itemDir(id);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) throw new Error('Item tidak ditemukan di brankas.');

  const meta = safeJson(path.join(dir, 'meta.json')) as { kdf?: { salt?: string } } | null;
  const salt = Buffer.from(meta?.kdf?.salt || '', 'hex');
  if (salt.length !== SALT_LEN) throw new Error('Metadata brankas rusak.');
  const key = deriveKey(pwd, salt);

  let header: VaultHeader;
  try {
    const headerBlob = fs.readFileSync(path.join(dir, 'header.enc'));
    header = JSON.parse(decryptBlock(key, headerBlob).toString('utf-8'));
  } catch {
    throw new Error('Sandi salah atau data rusak.');
  }
  if (!Array.isArray(header.files)) throw new Error('Header brankas rusak.');

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
      const blob = fs.readFileSync(path.join(dir, 'data', `${i}.enc`));
      const plain = decryptBlock(key, blob);
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
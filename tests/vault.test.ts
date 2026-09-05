import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hideItems, unhideItem, deleteVaultItem, listVaultItems, inspectItem, preparePreview, openPreviewStream, isPreviewable } from '../server/organizer/vault.js';

describe('secret vault (encrypted locker)', () => {
  let base: string;
  let dataDir: string;
  const prev = process.env.FO_DATA;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-vault-'));
    process.env.FO_DATA = base;
    dataDir = path.join(base, '.file-organizer');
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
    if (prev === undefined) delete process.env.FO_DATA;
    else process.env.FO_DATA = prev;
  });

  it('rejects short passwords and empty items', async () => {
    await expect(hideItems('abc', ['x'])).rejects.toThrow('minimal');
    await expect(hideItems('abcd', [])).rejects.toThrow('Tidak ada item');
  });

  it('hides a single file: vault entry created, plaintext removed', async () => {
    const dir = path.join(base, 'src');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'foto-ktp.jpg');
    const payload = 'secret-bytes-1234567890';
    fs.writeFileSync(file, Buffer.from(payload));

    const res = await hideItems('rahasia123', [file]);
    expect(res.done).toBe(1);
    expect(res.failed).toBe(0);
    expect(fs.existsSync(file)).toBe(false);

    const items = listVaultItems();
    expect(items.length).toBe(1);
    expect(items[0].type).toBe('file');
    expect(items[0].count).toBe(1);
    expect(items[0].totalSize).toBe(Buffer.byteLength(payload));

    // plaintext must NOT be recoverable from any vault blob
    const read = fs.readdirSync(path.join(dataDir, 'vault')); // entries are uuid dirs
    for (const id of read) {
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else expect(fs.readFileSync(p).includes('secret-bytes')).toBe(false);
        }
      };
      walk(path.join(dataDir, 'vault', id));
    }
    return res;
  });

  it('decrypts with wrong password fails', () => {
    const items = listVaultItems();
    expect(items.length).toBe(1);
    expect(() => unhideItem(items[0].id, 'salah-sandi')).toThrow('Sandi salah');
    // content still hidden
    const dir = path.join(base, 'src');
    expect(fs.existsSync(path.join(dir, 'foto-ktp.jpg'))).toBe(false);
  });

  it('restores the file to its original path with the right password', () => {
    const items = listVaultItems();
    const out = unhideItem(items[0].id, 'rahasia123');
    expect(out.ok).toBe(true);
    expect(out.restored).toBe(1);
    expect(fs.readFileSync(path.join(base, 'src', 'foto-ktp.jpg'), 'utf-8')).toBe('secret-bytes-1234567890');
  });

  it('hides a whole folder and restores its structure', async () => {
    const tree = path.join(base, 'proyek');
    fs.mkdirSync(path.join(tree, 'sub', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'readme.txt'), 'lihat saya');
    fs.writeFileSync(path.join(tree, 'sub', 'data.bin'), Buffer.from([0, 1, 2, 3]));
    fs.writeFileSync(path.join(tree, 'sub', 'nested', 'deep.md'), '# rahasia');

    const res = await hideItems('kunci-folder', [tree]);
    expect(res.done).toBe(1);
    expect(fs.existsSync(tree)).toBe(true);
    expect(fs.existsSync(path.join(tree, 'readme.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tree, 'sub', 'nested', 'deep.md'))).toBe(false);

    const items = listVaultItems();
    const folderItem = items.find((i) => i.type === 'folder');
    expect(folderItem).toBeDefined();
    expect(folderItem!.count).toBe(3);

    const out = unhideItem(folderItem!.id, 'kunci-folder');
    expect(out.ok).toBe(true);
    expect(out.restored).toBe(3);
    expect(fs.readFileSync(path.join(tree, 'readme.txt'), 'utf-8')).toBe('lihat saya');
    expect(fs.readFileSync(path.join(tree, 'sub', 'nested', 'deep.md'), 'utf-8')).toBe('# rahasia');
    expect(fs.readFileSync(path.join(tree, 'sub', 'data.bin'))).toEqual(Buffer.from([0, 1, 2, 3]));
  });

  it('refuses to overwrite an existing file during restore', async () => {
    const dir = path.join(base, 'conflict');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'asli');
    await hideItems('abcd1234', [path.join(dir, 'a.txt')]);
    // recreate same file at original location
    fs.writeFileSync(path.join(dir, 'a.txt'), 'ada-lagi');

    const items = listVaultItems();
    const out = unhideItem(items[0].id, 'abcd1234');
    expect(out.ok).toBe(false);
    expect(out.failed).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf-8')).toBe('ada-lagi');
  });

  it('blocks the app data folder itself', async () => {
    const res = await hideItems('abcd', [dataDir]);
    expect(res.failed).toBe(1);
    expect(res.entries[0].error).toContain('folder aplikasi');
  });

  it('deletes a vault item permanently', async () => {
    const dir = path.join(base, 'to-delete');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
    const res = await hideItems('abcd1234', [path.join(dir, 'x.txt')]);
    expect(res.done).toBe(1);
    const before = listVaultItems();
    expect(deleteVaultItem(before[0].id)).toBe(true);
    expect(listVaultItems().length).toBe(before.length - 1);
    expect(deleteVaultItem('nonexistent')).toBe(false);
  });

  describe('v1.0.22: cheat code, inspection, and protected preview', () => {
    let itemId: string;
    let sDir: string;
    const payload = 'data-pribadi-untuk-pratinjau';

    beforeAll(async () => {
      sDir = path.join(base, 'secret22');
      fs.mkdirSync(sDir, { recursive: true });
      fs.writeFileSync(path.join(sDir, 'moment.jpg'), payload);
      const res = await hideItems('sandi-lupa-sekali', [path.join(sDir, 'moment.jpg')]);
      expect(res.done).toBe(1);
      itemId = res.entries[0].id!;
    });

    it('original filename/name never leaks into any vault file on disk', () => {
      const ids = listVaultItems();
      expect(ids.some((i) => i.id === itemId)).toBe(true);
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else {
            const buf = fs.readFileSync(p);
            const s = buf.toString('latin1');
            expect(s.includes('moment')).toBe(false);
            expect(s.includes('foto-ktp')).toBe(false);
            expect(s.includes('sandi')).toBe(false);
          }
        }
      };
      walk(path.dirname(itemDirHelper(itemId)));
      // meta.json (plaintext) must not carry the item name either
      expect(fs.readFileSync(path.join(dirOf(itemId), 'meta.json'), 'utf-8')).not.toContain('moment');
      expect(fs.readFileSync(path.join(dirOf(itemId), 'meta.json'), 'utf-8').includes('secret-bytes')).toBe(false);
    });

    it('inspect needs a valid sandi', () => {
      expect(() => inspectItem(itemId, 'salah')).toThrow('Sandi salah');
      const out = inspectItem(itemId, 'sandi-lupa-sekali');
      expect(out.name).toBe('moment.jpg');
      expect(out.files).toEqual([{ name: 'moment.jpg', size: Buffer.byteLength(payload) }]);
    });

    it('cheat code "bukadong" unlocks the item even after forgetting the sandi', () => {
      const out = inspectItem(itemId, 'bukadong');
      expect(out.name).toBe('moment.jpg');
      expect(out.files[0].name).toBe('moment.jpg');
      // it also works for unhide
      const dir = sDir;
      fs.writeFileSync(path.join(dir, 'moment.jpg'), payload); // restore guard needs target absent, so keep a copy elsewhere
      const out2 = unhideItem(itemId, 'bukadong');
      expect(out2.ok).toBe(false); // target exists again → refused to overwrite (still proves key resolved)
      fs.unlinkSync(path.join(dir, 'moment.jpg'));
      const out3 = unhideItem(itemId, 'bukadong');
      expect(out3.ok).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'moment.jpg'), 'utf-8')).toBe(payload);
    });

    it('preview streams decrypted bytes after password validation (no disk write)', async () => {
      const meta = preparePreview(itemId, 0, 'sandi-lupa-sekali');
      expect(meta.name).toBe('moment.jpg');
      expect(meta.contentType).toBe('image/jpeg');
      expect(meta.size).toBe(Buffer.byteLength(payload));
      const { stream } = openPreviewStream(itemId, 0, meta.key);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      expect(Buffer.concat(chunks).toString('utf-8')).toBe(payload);
    });

    it('preview refuses non-media files and rejects a wrong sandi', () => {
      expect(isPreviewable('catatan.txt')).toBe(false);
      expect(() => preparePreview(itemId, 0, 'palsu')).toThrow('Sandi salah');
    });
  });
});

// helpers to resolve vault paths in test scope
function itemDirHelper(id: string): string {
  return path.join(process.env.FO_DATA!, '.file-organizer', 'vault', id);
}
function dirOf(id: string): string {
  return itemDirHelper(id);
}
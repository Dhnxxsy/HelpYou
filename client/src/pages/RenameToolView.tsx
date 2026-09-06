import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import FolderPicker from '../components/FolderPicker';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useI18n, tGlobal } from '../lib/i18n';
import type { RenameApplyResult, RenameEntry } from '@shared/types';

type Editable = { key: string; from: string; to: string };

export default function RenameToolView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<RenameEntry[]>([]);
  const [editable, setEditable] = useState<Editable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [result, setResult] = useState<RenameApplyResult | null>(null);
  const [applying, setApplying] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirKey = dir.trim().toLowerCase();

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api<{ path: string; entries: RenameEntry[] }>('/api/rename/list', {
        method: 'POST',
        body: JSON.stringify({ dir: path }),
      });
      setEntries(res.entries || []);
      setEditable((res.entries || []).map((e) => ({ key: e.path, from: e.name, to: e.name })));
    } catch (e: any) {
      setError(e.message || t('Gagal membaca folder.'));
      setEntries([]);
      setEditable([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dir.trim()) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => load(dir.trim()), 350);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [dir, load]);

  const syncTo = (from: string, to: string) => {
    setEditable((prev) => prev.map((e) => (e.key === from ? { ...e, to } : e)));
  };

  const applyPattern = (transform: (name: string, i: number, entry: RenameEntry) => string) => {
    setEditable((prev) => prev.map((e, i) => {
      const entry = entries.find((en) => en.path === e.key);
      if (!entry) return e;
      return { ...e, to: transform(entry.name, i, entry) };
    }));
  };

  const addPrefix = () => {
    const p = window.prompt(tGlobal('Awalan untuk semua nama:')) ?? '';
    applyPattern((n) => p + n);
  };

  const addSuffix = () => {
    const s = window.prompt(tGlobal('Akhiran (sebelum ekstensi) untuk semua nama:')) ?? '';
    applyPattern((n, _i, entry) => {
      const ext = entry.isDir ? '' : entry.ext;
      const base = ext ? n.slice(0, n.length - ext.length) : n;
      return base + s + ext;
    });
  };

  const findReplace = () => {
    const find = window.prompt(tGlobal('Cari teks:')) ?? '';
    const rep = window.prompt(tGlobal('Ganti dengan:')) ?? '';
    applyPattern((n) => n.replaceAll(find, rep));
  };

  const seqNumber = () => {
    const st = window.prompt(tGlobal('Nama baru (gunakan {n} untuk nomor urut, mis. Foto {n}):')) ?? '';
    if (!st.includes('{n}')) return;
    const start = Number(window.prompt(tGlobal('Nomor mulai (default 1):')) ?? '1') || 1;
    applyPattern((_n, i, entry) => {
      const ext = entry.isDir ? '' : entry.ext;
      return st.replaceAll('{n}', String(start + i).padStart(2, '0')) + ext;
    });
  };

  const resetNames = () => setEditable((prev) => prev.map((e) => ({ ...e, to: e.from })));

  const applyAll = async () => {
    const renames = editable.filter((e) => e.from !== e.to).map((e) => ({ from: e.key, to: e.to }));
    if (!renames.length) return;
    setApplying(true);
    setError('');
    setResult(null);
    try {
      const res = await api<RenameApplyResult>('/api/rename/apply', {
        method: 'POST',
        body: JSON.stringify({ renames }),
      });
      setResult(res);
      setTimeout(() => load(dir.trim()), 400);
    } catch (e: any) {
      setError(e.message || t('Gagal menerapkan perubahan.'));
    } finally {
      setApplying(false);
    }
  };

  const filteredEntries = entries.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));
  const changedCount = editable.filter((e) => e.from !== e.to).length;
  const duplicateInTarget = (() => {
    const seen = new Map<string, string>();
    for (const e of editable) {
      if (e.from === e.to) continue;
      const key = e.to.toLowerCase();
      if (seen.has(key) && seen.get(key) !== e.from) return true;
      seen.set(key, e.from);
    }
    return false;
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="rename"
        title={t('Ganti Nama Massal')}
        desc={t('Rename banyak file sekaligus dengan pola — cari & ganti, awalan/akhiran, atau penomoran. Nama asli tidak ditimpa.')}
        onBack={onBack}
        actions={
          <div className="chip bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]">
            {t('{n} perubahan tertunda', { n: changedCount })}
          </div>
        }
      />

      {error && <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="card p-5">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] mb-2 font-semibold">{t('1 · Pilih Folder')}</div>
        <FolderPicker value={dir} onChange={setDir} />
      </div>

      {loading && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] rounded-full mx-auto" />
          <p className="text-sm text-[var(--text-2)] mt-3">{t('Membaca isi folder…')}</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] font-semibold mr-1">{t('2 · Terapkan Pola')}</div>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={findReplace}>{t('Cari & Ganti')}</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={addPrefix}>{t('Awalan')}</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={addSuffix}>{t('Akhiran')}</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={seqNumber}>{t('Nomor Urut')}</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs ml-auto" onClick={resetNames}>{t('Reset')}</button>
          </div>

          <div className="flex items-center gap-2">
            <Icon name="search" className="w-4 h-4 text-[var(--text-3)]" />
            <input
              className="input-field !py-2 text-sm flex-1"
              placeholder={t('Cari nama…')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="text-xs text-[var(--text-3)] tabular-nums">{filteredEntries.length}/{entries.length}</span>
          </div>

          {duplicateInTarget && (
            <p className="text-xs text-[var(--warn-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" /> {t('Ada nama tujuan yang sama (bentrok). Perbaiki sebelum menerapkan.')}</p>
          )}

          <div className="max-h-[420px] overflow-y-auto border border-[var(--border)] rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg-2)] text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">{t('Nama Lama')}</th>
                  <th className="px-2 py-2 text-[var(--text-3)] w-6"></th>
                  <th className="text-left px-3 py-2 font-semibold">{t('Nama Baru')}</th>
                  <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell">{t('Ukuran')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredEntries.map((entry) => {
                  const ed = editable.find((e) => e.key === entry.path);
                  const changed = ed && ed.to !== entry.name;
                  return (
                    <tr key={entry.path} className="hover:bg-[var(--overlay)]">
                      <td className="px-3 py-1.5 text-[var(--text-2)] truncate max-w-[180px]">
                        <span className="flex items-center gap-1.5">
                          <Icon name={entry.isDir ? 'folder' : 'package'} className={`w-3.5 h-3.5 shrink-0 ${entry.isDir ? 'text-[var(--warn-strong)]' : 'text-[var(--text-3)]'}`} />
                          <span className="truncate">{entry.name}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[var(--text-3)]"><Icon name="arrowRight" className="w-3.5 h-3.5" /></td>
                      <td className="px-3 py-1.5">
                        {ed ? (
                          <input
                            className={`input-field !py-1.5 text-sm w-full ${changed ? '!border-[var(--accent-border)]' : ''}`}
                            value={ed.to}
                            onChange={(e) => syncTo(entry.path, e.target.value)}
                          />
                        ) : (
                          <span className="text-[var(--text-2)]">{entry.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-[var(--text-3)] tabular-nums hidden sm:table-cell">
                        {entry.isDir ? (entry.size ? formatBytes(entry.size) : 'Dir') : formatBytes(entry.size)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-3)]">
              {t('{n} nama akan diubah. Nama yang sama dengan aslinya diabaikan.', { n: changedCount })}
            </p>
            <button className="btn-primary" onClick={applyAll} disabled={applying || changedCount === 0 || duplicateInTarget}>
              <Icon name={applying ? 'replay' : 'check'} className={`w-4 h-4 ${applying ? 'animate-spin' : ''}`} />
              {applying ? t('Menerapkan…') : t('Terapkan ({n})', { n: changedCount })}
            </button>
          </div>

          {result && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${result.failed === 0 ? 'border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-strong)]' : 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)]'}`}>
              <div className="font-semibold mb-1">
                {result.failed === 0 ? t('Selesai. {done} file/folder diubah namanya.', { done: result.done }) : t('{done} sukses, {failed} gagal.', { done: result.done, failed: result.failed })}
              </div>
              <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                {result.logs.filter((l) => !l.ok).map((l, i) => (
                  <li key={i} className="text-[var(--danger-strong)]">• {l.from} → {l.to}: {l.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> {t('Kembali ke Beranda')}
      </button>
    </div>
  );
}
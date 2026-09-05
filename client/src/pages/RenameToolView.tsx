import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import FolderPicker from '../components/FolderPicker';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { RenameApplyResult, RenameEntry } from '@shared/types';

type Editable = { key: string; from: string; to: string };

export default function RenameToolView({ onBack }: { onBack: () => void }) {
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
      setError(e.message || 'Gagal membaca folder.');
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
    const p = window.prompt('Awalan untuk semua nama:') ?? '';
    applyPattern((n) => p + n);
  };

  const addSuffix = () => {
    const s = window.prompt('Akhiran (sebelum ekstensi) untuk semua nama:') ?? '';
    applyPattern((n, _i, entry) => {
      const ext = entry.isDir ? '' : entry.ext;
      const base = ext ? n.slice(0, n.length - ext.length) : n;
      return base + s + ext;
    });
  };

  const findReplace = () => {
    const find = window.prompt('Cari teks:') ?? '';
    const rep = window.prompt('Ganti dengan:') ?? '';
    applyPattern((n) => n.replaceAll(find, rep));
  };

  const seqNumber = () => {
    const st = window.prompt('Nama baru (gunakan {n} untuk nomor urut, mis. Foto {n}):') ?? '';
    if (!st.includes('{n}')) return;
    const start = Number(window.prompt('Nomor mulai (default 1):') ?? '1') || 1;
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
      setError(e.message || 'Gagal menerapkan perubahan.');
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 grid place-items-center shadow-lg shadow-fuchsia-500/25">
              <Icon name="rename" className="w-5 h-5 text-white" />
            </span>
            Ganti Nama Massal
          </h1>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xl">
            Rename banyak file sekaligus dengan pola — cari & ganti, awalan/akhiran, atau penomoran. Nama asli tidak ditimpa.
          </p>
        </div>
        <div className="chip bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20">
          {changedCount} perubahan tertunda
        </div>
      </div>

      {error && <p className="text-sm text-rose-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="card p-5">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">1 · Pilih Folder</div>
        <FolderPicker value={dir} onChange={setDir} />
      </div>

      {loading && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-fuchsia-400/40 border-t-fuchsia-400 rounded-full mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Membaca isi folder…</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mr-1">2 · Terapkan Pola</div>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={findReplace}>Cari & Ganti</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={addPrefix}>Awalan</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={addSuffix}>Akhiran</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={seqNumber}>Nomor Urut</button>
            <button className="btn-ghost !py-1.5 !px-2.5 text-xs ml-auto" onClick={resetNames}>Reset</button>
          </div>

          <div className="flex items-center gap-2">
            <Icon name="search" className="w-4 h-4 text-gray-500" />
            <input
              className="input-field !py-2 text-sm flex-1"
              placeholder="Cari nama…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="text-xs text-gray-500 tabular-nums">{filteredEntries.length}/{entries.length}</span>
          </div>

          {duplicateInTarget && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" /> Ada nama tujuan yang sama (bentrok). Perbaiki sebelum menerapkan.</p>
          )}

          <div className="max-h-[420px] overflow-y-auto border border-white/10 rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0d0d17] text-[10px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Nama Lama</th>
                  <th className="px-2 py-2 text-gray-600 w-6"></th>
                  <th className="text-left px-3 py-2 font-semibold">Nama Baru</th>
                  <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell">Ukuran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredEntries.map((entry) => {
                  const ed = editable.find((e) => e.key === entry.path);
                  const changed = ed && ed.to !== entry.name;
                  return (
                    <tr key={entry.path} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-1.5 text-gray-300 truncate max-w-[180px]">
                        <span className="flex items-center gap-1.5">
                          <Icon name={entry.isDir ? 'folder' : 'package'} className={`w-3.5 h-3.5 shrink-0 ${entry.isDir ? 'text-amber-300' : 'text-gray-500'}`} />
                          <span className="truncate">{entry.name}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-600"><Icon name="arrowRight" className="w-3.5 h-3.5" /></td>
                      <td className="px-3 py-1.5">
                        {ed ? (
                          <input
                            className={`input-field !py-1.5 text-sm w-full ${changed ? '!border-fuchsia-500/40' : ''}`}
                            value={ed.to}
                            onChange={(e) => syncTo(entry.path, e.target.value)}
                          />
                        ) : (
                          <span className="text-gray-400">{entry.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-gray-500 tabular-nums hidden sm:table-cell">
                        {entry.isDir ? (entry.size ? formatBytes(entry.size) : 'Dir') : formatBytes(entry.size)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {changedCount} nama akan diubah. Nama yang sama dengan aslinya diabaikan.
            </p>
            <button className="btn-primary" onClick={applyAll} disabled={applying || changedCount === 0 || duplicateInTarget}>
              <Icon name={applying ? 'replay' : 'check'} className={`w-4 h-4 ${applying ? 'animate-spin' : ''}`} />
              {applying ? 'Menerapkan…' : `Terapkan (${changedCount})`}
            </button>
          </div>

          {result && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${result.failed === 0 ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/25 bg-rose-500/10 text-rose-200'}`}>
              <div className="font-semibold mb-1">
                {result.failed === 0 ? `Selesai. ${result.done} file/folder diubah namanya.` : `${result.done} sukses, ${result.failed} gagal.`}
              </div>
              <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                {result.logs.filter((l) => !l.ok).map((l, i) => (
                  <li key={i} className="text-rose-300">• {l.from} → {l.to}: {l.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>
    </div>
  );
}
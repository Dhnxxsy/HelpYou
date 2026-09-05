import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { RecycleItem, RecycleListResult } from '@shared/types';

export default function RecycleBinView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<RecycleListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api<RecycleListResult>('/api/recycle/list'));
    } catch (e: any) {
      setError(e.message || 'Gagal membaca Tempat Sampah.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const restore = async (item: RecycleItem) => {
    setBusy(item.origPath || item.name);
    try {
      await api('/api/recycle/restore', { method: 'POST', body: JSON.stringify({ path: item.origPath || item.name, from: item.deletedFrom || '', name: item.name }) });
      await load();
    } catch (e: any) {
      setError(e.message || 'Gagal memulihkan.');
    } finally {
      setBusy(null);
    }
  };

  const empty = async () => {
    if (!window.confirm('Kosongkan seluruh isi Tempat Sampah? Tindakan ini tidak dapat dibatalkan.')) return;
    setBusy('__empty__');
    try {
      await api('/api/recycle/empty', { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e: any) {
      setError(e.message || 'Gagal mengosongkan Tempat Sampah.');
    } finally {
      setBusy(null);
    }
  };

  const rows = (data?.items || []).filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center shadow-lg shadow-emerald-500/25">
              <Icon name="recycle" className="w-5 h-5 text-white" />
            </span>
            Tempat Sampah
          </h1>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xl">
            Pulihkan file/folder yang terhapus, atau kosongkan isi Tempat Sampah semuanya.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost !py-2 !px-3 text-xs" onClick={load} disabled={loading || !!busy}>
            <Icon name="replay" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang
          </button>
          <button className="btn-danger !py-2 !px-3 text-xs" onClick={empty} disabled={!data?.count || !!busy}>
            <Icon name="trash" className="w-4 h-4" /> Kosongkan
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      {loading && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Membaca Tempat Sampah…</p>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Icon name="search" className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="input-field pl-9 !py-2 text-sm" placeholder="Cari di Tempat Sampah…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="chip bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
              {data.count} item · {formatBytes(data.totalBytes)}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="card p-10 text-center">
              <Icon name="recycle" className="w-10 h-10 text-gray-600 mx-auto" />
              <p className="text-sm text-gray-400 mt-3">{data.count === 0 ? 'Tempat Sampah kosong. Semua bersih!' : 'Tidak ada hasil yang cocok.'}</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">Lokasi Asal</th>
                    <th className="text-right px-4 py-2.5 font-semibold hidden sm:table-cell">Ukuran</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Dihapus</th>
                    <th className="text-right px-3 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((item, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 max-w-[220px]">
                        <span className="flex items-center gap-2 truncate">
                          <Icon name="box" className="w-4 h-4 text-gray-500 shrink-0" />
                          <span className="truncate text-gray-200">{item.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[220px] hidden md:table-cell">{item.deletedFrom || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums text-right hidden sm:table-cell">{item.size > 0 ? formatBytes(item.size) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{item.deletedAt || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button className="btn-secondary !py-1.5 !px-2.5 text-xs !border-emerald-500/30 !text-emerald-300" disabled={busy === (item.origPath || item.name)} onClick={() => restore(item)}>
                          <Icon name="undo" className={`w-3.5 h-3.5 ${busy === (item.origPath || item.name) ? 'animate-spin' : ''}`} /> Pulihkan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>
    </div>
  );
}
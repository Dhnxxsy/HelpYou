import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import AppIcon from '../components/AppIcon';
import { api } from '../lib/api';
import type { StartupItem } from '@shared/types';

function locLabel(item: StartupItem): string {
  if (item.type === 'registry') {
    const key = item.registryPath?.toLowerCase() ?? '';
    const isHkcu = key.includes('hkcu');
    const isWow = key.includes('wow6432node');
    return isWow ? 'HKLM (32-bit)' : isHkcu ? 'HKCU' : 'HKLM';
  }
  return item.folderPath ?? 'Startup';
}

export default function StartupToolView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StartupItem | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ items: StartupItem[] }>('/api/startup/list');
      setItems(res.items || []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat daftar startup.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const on = items.filter((i) => i.enabled);
    const off = items.filter((i) => !i.enabled);
    return { on, off };
  }, [items]);

  const stats = useMemo(() => ({
    total: items.length,
    enabled: grouped.on.length,
    admin: items.filter((i) => i.admin).length,
  }), [items, grouped]);

  const toggle = async (item: StartupItem, enabled: boolean) => {
    setBusyId(item.id);
    setError('');
    try {
      const res = await api<{ ok?: boolean; error?: string }>('/api/startup/toggle', {
        method: 'POST',
        body: JSON.stringify({ item, enabled }),
      });
      if (!res.ok) throw new Error(res.error || 'Gagal mengubah status.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Gagal mengubah status.');
    } finally {
      setBusyId('');
    }
  };

  const doDelete = async () => {
    const item = deleteTarget;
    setDeleteTarget(null);
    if (!item) return;
    setBusyId(item.id);
    setError('');
    try {
      const res = await api<{ ok?: boolean; error?: string }>('/api/startup/delete', {
        method: 'POST',
        body: JSON.stringify({ item }),
      });
      if (!res.ok) throw new Error(res.error || 'Gagal menghapus.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Gagal menghapus.');
    } finally {
      setBusyId('');
    }
  };

  const openLocation = async (item: StartupItem) => {
    const p = item.folderPath || item.filePath || item.registryPath;
    if (!p) return;
    try { await api('/api/open', { method: 'POST', body: JSON.stringify({ path: p }) }); } catch { /* ignore */ }
  };

  const Row = ({ item, index }: { item: StartupItem; index: number }) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <AppIcon
        name={item.name}
        index={index}
        className="w-9 h-9"
        iconUrl={item.exePath ? '/api/uninstaller/icon?path=' + encodeURIComponent(item.exePath) : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-200">{item.name}</span>
          {item.admin && (
            <span className="chip bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]" title="Perubahan membutuhkan izin administrator">
              <Icon name="lock" className="w-3 h-3" /> Admin
            </span>
          )}
          {item.exists === false && (
            <span className="chip bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px]">
              <Icon name="alert" className="w-3 h-3" /> File tidak ditemukan
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500 truncate" title={item.command}>{item.command || '—'}</div>
        <div className="text-[10px] text-gray-600 flex items-center gap-1">
          <Icon name="folder" className="w-3 h-3" /> {locLabel(item)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button className="btn-ghost !p-2 text-gray-400" title="Buka lokasi" disabled={!!busyId} onClick={() => openLocation(item)}>
          <Icon name="external" className="w-4 h-4" />
        </button>
        <button className="btn-ghost !p-2 text-gray-400 hover:!text-rose-300" title="Hapus" disabled={!!busyId} onClick={() => setDeleteTarget(item)}>
          <Icon name="trash" className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggle(item, !item.enabled)}
          disabled={!!busyId}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${item.enabled ? 'bg-emerald-500' : 'bg-white/15'} ${busyId === item.id ? 'opacity-60' : ''}`}
          title={item.enabled ? 'Nonaktifkan saat startup' : 'Aktifkan saat startup'}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${item.enabled ? 'translate-x-[16px]' : ''}`} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="gauge"
        accent="from-cyan-500 to-blue-600"
        glow="shadow-cyan-500/30"
        title="Pengelola Startup"
        desc="Kelola program yang berjalan otomatis saat Windows menyala. Nonaktifkan atau hapus item yang tidak diperlukan."
        onBack={onBack}
        actions={
          <button className="btn-outline !py-2 !px-3 text-xs" onClick={load} disabled={loading}>
            <Icon name="replay" className="w-4 h-4" /> Muat Ulang
          </button>
        }
      />

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Total Item</div>
          <div className="text-lg font-semibold tabular-nums text-white mt-0.5">{stats.total}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Aktif</div>
          <div className="text-lg font-semibold tabular-nums text-emerald-300 mt-0.5">{stats.enabled}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Butuh Admin</div>
          <div className="text-lg font-semibold tabular-nums text-amber-300 mt-0.5">{stats.admin}</div>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      {loading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-cyan-400/40 border-t-cyan-400 rounded-full mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Membaca registri & folder Startup…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <Icon name="gauge" className="w-8 h-8 text-cyan-400/50 mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Tidak ada item startup yang terdeteksi.</p>
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-xs uppercase tracking-wider text-emerald-300/80 font-semibold">Aktif ({grouped.on.length})</h3>
            </div>
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02] divide-y divide-white/5">
              {grouped.on.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-500">Tidak ada item aktif.</p>}
              {grouped.on.map((item, i) => <Row key={item.id} item={item} index={i} />)}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Nonaktif ({grouped.off.length})</h3>
            </div>
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02] divide-y divide-white/5">
              {grouped.off.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-500">Tidak ada item nonaktif.</p>}
              {grouped.off.map((item, i) => <Row key={item.id} item={item} index={grouped.on.length + i} />)}
            </div>
          </section>
        </>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>

      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        icon="trash"
        title="Hapus item startup?"
        description={`${deleteTarget?.name ?? ''} akan dihapus (untuk item folder Startup, berkas dipindah ke Recycle Bin).${deleteTarget?.admin ? ' Item dari HKLM memerlukan izin administrator (UAC).' : ''}`}
        confirmLabel="Ya, hapus"
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}
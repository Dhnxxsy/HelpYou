import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useI18n, tGlobal } from '../lib/i18n';
import type { RecycleItem, RecycleListResult } from '@shared/types';

export default function RecycleBinView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<RecycleListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      setData(await api<RecycleListResult>('/api/recycle/list'));
    } catch (e: any) {
      setError(e.message || t('Gagal membaca Tempat Sampah.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  const restore = async (item: RecycleItem) => {
    setBusy(item.origPath || item.name);
    try {
      await api('/api/recycle/restore', { method: 'POST', body: JSON.stringify({ path: item.origPath || item.name, from: item.deletedFrom || '', name: item.name }) });
      await load(false);
    } catch (e: any) {
      setError(e.message || t('Gagal memulihkan.'));
    } finally {
      setBusy(null);
    }
  };

  const empty = async () => {
    if (!window.confirm(t('Kosongkan seluruh isi Tempat Sampah? Tindakan ini tidak dapat dibatalkan.'))) return;
    setBusy('__empty__');
    try {
      await api('/api/recycle/empty', { method: 'POST', body: JSON.stringify({}) });
      await load(false);
    } catch (e: any) {
      setError(e.message || t('Gagal mengosongkan Tempat Sampah.'));
    } finally {
      setBusy(null);
    }
  };

  const rows = (data?.items || []).filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="recycle"
        title={t('Tempat Sampah')}
        desc={t('Pulihkan file/folder yang terhapus, atau kosongkan isi Tempat Sampah semuanya.')}
        onBack={onBack}
        actions={
          <>
            <button className="btn-ghost !py-2 !px-3 text-xs" onClick={() => load(false)} disabled={loading || refreshing || !!busy}>
              <Icon name="replay" className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? t('Menyegarkan…') : t('Muat Ulang')}
            </button>
            <button className="btn-danger !py-2 !px-3 text-xs" onClick={empty} disabled={!data?.count || !!busy}>
              <Icon name="trash" className="w-4 h-4" /> {t('Kosongkan')}
            </button>
          </>
        }
      />

      {error && <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      {loading && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--ok-border)] border-t-[var(--ok-strong)] rounded-full mx-auto" />
          <p className="text-sm text-[var(--text-2)] mt-3">{t('Membaca Tempat Sampah…')}</p>
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Icon name="search" className="w-4 h-4 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="input-field pl-9 !py-2 text-sm" placeholder={t('Cari di Tempat Sampah…')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="chip bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]">
              {t('{n} item · {size}', { n: data.count, size: formatBytes(data.totalBytes) })}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="card p-10 text-center">
              <Icon name="recycle" className="w-10 h-10 text-[var(--text-3)] mx-auto" />
              <p className="text-sm text-[var(--text-2)] mt-3">{data.count === 0 ? t('Tempat Sampah kosong. Semua bersih!') : t('Tidak ada hasil yang cocok.')}</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--overlay)] text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">{t('Nama')}</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">{t('Lokasi Asal')}</th>
                    <th className="text-right px-4 py-2.5 font-semibold hidden sm:table-cell">{t('Ukuran')}</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">{t('Dihapus')}</th>
                    <th className="text-right px-3 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((item, i) => (
                    <tr key={i} className="hover:bg-[var(--overlay)]">
                      <td className="px-4 py-2.5 max-w-[220px]">
                        <span className="flex items-center gap-2 truncate">
                          <Icon name="box" className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                          <span className="truncate text-[var(--text)]">{item.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-3)] truncate max-w-[220px] hidden md:table-cell">{item.deletedFrom || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-3)] tabular-nums text-right hidden sm:table-cell">{item.size > 0 ? formatBytes(item.size) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-3)] hidden sm:table-cell">{item.deletedAt || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button className="btn-secondary !py-1.5 !px-2.5 text-xs !border-[var(--ok-border)] !text-[var(--ok-strong)]" disabled={busy === (item.origPath || item.name)} onClick={() => restore(item)}>
                          <Icon name="undo" className={`w-3.5 h-3.5 ${busy === (item.origPath || item.name) ? 'animate-spin' : ''}`} /> {t('Pulihkan')}
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
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> {t('Kembali ke Beranda')}
      </button>
    </div>
  );
}
import { useEffect, useMemo, useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import AppIcon from '../components/AppIcon';
import { formatBytes } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { AppEntry } from '@shared/types';

type ViewTab = 'all' | 'apps' | 'games';

const SOURCE_ICON: Record<AppEntry['source'], IconName> = {
  menu: 'link',
  registry: 'package',
  steam: 'play',
  epic: 'sparkle',
};

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

function sourceLabel(source: AppEntry['source']): string {
  if (source === 'menu') return 'Pintasan';
  if (source === 'registry') return 'Registri';
  if (source === 'steam') return 'Steam';
  return 'Epic Games';
}

export default function AppsCenterView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [games, setGames] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ViewTab>('all');
  const [sort, setSort] = useState<'name' | 'size'>('name');
  const [launching, setLaunching] = useState<string | null>(null);
  const [okToast, setOkToast] = useState(false);
  const [errToast, setErrToast] = useState(false);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ apps: AppEntry[]; games: AppEntry[] }>(`/api/apps/list${force ? '?force=1' : ''}`);
      const a = data.apps || [];
      const g = data.games || [];
      setApps(a);
      setGames(g);
      warmIcons([...a, ...g]);
    } catch (e: any) {
      setError(e.message || t('Gagal membuka aplikasi.'));
    } finally {
      setLoading(false);
    }
  }

  function warmIcons(list: AppEntry[]) {
    const unique = [...new Set(list.map((e) => e.icon).filter((p): p is string => !!p))];
    if (unique.length === 0) return;
    fetch('/api/uninstaller/icons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: unique.slice(0, 800) }),
    }).catch(() => {});
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!okToast) return;
    const tm = setTimeout(() => setOkToast(false), 3200);
    return () => clearTimeout(tm);
  }, [okToast]);

  useEffect(() => {
    if (!errToast) return;
    const tm = setTimeout(() => setErrToast(false), 4200);
    return () => clearTimeout(tm);
  }, [errToast]);

  const visible = useMemo(() => {
    let list = tab === 'apps' ? apps : tab === 'games' ? games : [...apps, ...games];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || (e.publisher || '').toLowerCase().includes(q));
    return [...list].sort((a, b) =>
      sort === 'size'
        ? (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1)
        : a.name.localeCompare(b.name, 'id')
    );
  }, [apps, games, tab, search, sort]);

  const totalSize = useMemo(
    () => [...apps, ...games].reduce((s, e) => s + (e.sizeBytes ?? 0), 0),
    [apps, games]
  );

  async function openApp(e: AppEntry, key: string) {
    if (!e.exe || launching) return;
    setLaunching(key);
    try {
      const res = await api<{ ok: boolean; error?: string }>('/api/apps/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exe: e.exe, args: e.args, cwd: e.cwd }),
      });
      if (res.ok) setOkToast(true);
      else setErrToast(true);
    } catch {
      setErrToast(true);
    } finally {
      setLaunching(null);
    }
  }

  async function openFolder(e: AppEntry) {
    if (!e.exe && !e.cwd) return;
    try {
      const res = await api<{ ok: boolean; error?: string }>('/api/apps/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exe: e.exe, cwd: e.cwd }),
      });
      if (res.ok) setOkToast(true);
      else setErrToast(true);
    } catch {
      setErrToast(true);
    }
  }

  const countAll = apps.length + games.length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">{t('Toolbox — Utilitas Sistem')}</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-gradient">{t('Pusat Aplikasi & Game')}</span>
          </h1>
          <p className="text-sm text-[var(--text-2)] mt-1.5 max-w-2xl">
            {t('Temukan semua aplikasi & game terpasang di PC-mu, buka langsung dalam sekali klik, atau telusuri lokasi berkasnya.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatsPill label={t('Aplikasi')} value={apps.length.toLocaleString('id-ID')} />
          <StatsPill label={t('Game')} value={games.length.toLocaleString('id-ID')} />
          <StatsPill label={t('Total ukuran')} value={formatBytes(totalSize)} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)]" />
          <input
            className="input pl-9"
            placeholder={t('Cari di seluruh aplikasi & game…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl bg-[var(--bg-soft)] border border-[var(--border)] p-0.5">
            {(['all', 'apps', 'games'] as ViewTab[]).map((v) => (
              <button
                key={v}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tab === v
                    ? 'bg-[var(--accent-strong)] text-white shadow'
                    : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                }`}
                onClick={() => setTab(v)}
              >
                {v === 'all' ? t('Semua') : v === 'apps' ? t('Aplikasi') : t('Game')}
              </button>
            ))}
          </div>
          <select className="input !w-auto !py-2 pr-9" value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'size')}>
            <option value="name">{t('Urut Nama (A-Z)')}</option>
            <option value="size">{t('Urut Ukuran Terbesar')}</option>
          </select>
          <button className="btn-secondary !py-2 !px-3.5 text-xs" onClick={() => load(true)} disabled={loading}>
            <Icon name="replay" className="w-3.5 h-3.5" /> {t('Muat Ulang')}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)] text-sm p-4 flex items-center gap-2.5">
          <Icon name="alert" className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Grid */}
      {loading && countAll === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="card p-4 skeleton h-40" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card py-14 text-center text-sm text-[var(--text-3)] flex flex-col items-center gap-2">
          <Icon name="gamepad" className="w-6 h-6 text-[var(--text-3)]" />
          {countAll === 0
            ? t('Tidak ada aplikasi atau game yang cocok.')
            : t('Tidak ada aplikasi atau game yang cocok.')}
          <button className="btn-ghost !py-2 !px-3 text-xs mt-2" onClick={() => load(true)}>{t('Coba muat ulang')}</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {visible.map((e, idx) => {
            const key = `${e.source}:${e.name}:${e.exe || e.cwd || ''}`;
            const busy = launching === key;
            return (
              <div
                key={key}
                className="card p-3.5 flex flex-col gap-3 hover:border-[var(--accent-border)] transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <AppIcon
                    name={e.name}
                    index={idx}
                    iconUrl={e.icon ? `/api/uninstaller/icon?path=${encodeURIComponent(e.icon)}` : undefined}
                    className="w-11 h-11"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-snug truncate" title={e.name}>
                      {e.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-3)] truncate mt-0.5 flex items-center gap-1" title={subtitle(e)}>
                      <Icon name={SOURCE_ICON[e.source]} className="w-3 h-3 shrink-0" />
                      {subtitle(e)}
                    </p>
                  </div>
                  {e.sizeBytes !== undefined && e.sizeBytes > 0 && (
                    <span className="text-[10px] text-[var(--text-3)] shrink-0 pt-0.5">{formatBytes(e.sizeBytes)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <button
                    className="btn-accent flex-1 !py-2 !px-3 text-xs"
                    disabled={!e.exe || busy}
                    onClick={() => openApp(e, key)}
                  >
                    <Icon name={busy ? 'clock' : 'play'} className="w-3.5 h-3.5" />
                    {busy ? t('Menjalankan…') : t('Buka')}
                  </button>
                  <button
                    className="btn-secondary !py-2 !px-3 text-xs"
                    disabled={!e.exe && !e.cwd}
                    title={t('Buka Lokasi')}
                    onClick={() => openFolder(e)}
                  >
                    <Icon name="folderOpen" className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 space-y-2 w-[92%] max-w-sm">
        {okToast && (
          <div className="card !bg-[var(--ok-soft)] border-[var(--ok-border)] text-[var(--ok-strong)] px-4 py-3 text-sm flex items-center gap-2.5 shadow-lg animate-fade-in">
            <Icon name="check" className="w-4 h-4 shrink-0" /> {t('Berhasil dibuka.')}
          </div>
        )}
        {errToast && (
          <div className="card !bg-[var(--danger-soft)] border-[var(--danger-border)] text-[var(--danger-strong)] px-4 py-3 text-sm flex items-center gap-2.5 shadow-lg animate-fade-in">
            <Icon name="alert" className="w-4 h-4 shrink-0" /> {t('Gagal membuka aplikasi.')}
          </div>
        )}
      </div>
    </div>
  );

  function subtitle(e: AppEntry): string {
    const parts: string[] = [];
    if (e.publisher) parts.push(e.publisher);
    if (e.version) parts.push(e.version);
    parts.push(`Dari: ${sourceLabel(e.source)}`);
    return parts.join(' · ');
  }
}

function StatsPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !bg-[var(--overlay)] px-4 py-2 text-center shrink-0">
      <div className="text-lg font-bold leading-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</div>
    </div>
  );
}
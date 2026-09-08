import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '../components/Icon';
import AppIcon from '../components/AppIcon';
import { formatBytes } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { pickExeFile } from '../lib/platform';
import type { AppEntry } from '@shared/types';

type ViewTab = 'all' | 'apps' | 'games';

const SOURCE_ICON: Record<AppEntry['source'], IconName> = {
  menu: 'link',
  registry: 'package',
  steam: 'play',
  epic: 'sparkle',
  custom: 'pin',
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
  if (source === 'custom') return 'Manual';
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
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addExe, setAddExe] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
    if (!okMsg) return;
    const tm = setTimeout(() => setOkMsg(null), 3200);
    return () => clearTimeout(tm);
  }, [okMsg]);

  useEffect(() => {
    if (!errMsg) return;
    const tm = setTimeout(() => setErrMsg(null), 4200);
    return () => clearTimeout(tm);
  }, [errMsg]);

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
      if (res.ok) setOkMsg(t('Berhasil dibuka.'));
      else setErrMsg(t('Gagal membuka aplikasi.'));
    } catch {
      setErrMsg(t('Gagal membuka aplikasi.'));
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
      if (res.ok) setOkMsg(t('Berhasil dibuka.'));
      else setErrMsg(t('Gagal membuka aplikasi.'));
    } catch {
      setErrMsg(t('Gagal membuka aplikasi.'));
    }
  }

  async function pickFile() {
    const picked = await pickExeFile();
    if (!picked) return;
    setAddExe(picked);
    setAddError(null);
    setAddName((prev) => {
      if (prev.trim()) return prev;
      return picked.replace(/\\/g, '/').split('/').pop()?.replace(/\.exe$/i, '') || picked;
    });
  }

  function openAddModal() {
    setAddName('');
    setAddExe('');
    setAddError(null);
    setShowAdd(true);
  }

  async function submitAdd() {
    if (!addExe.trim()) {
      setAddError(t('Pilih berkas aplikasi (.exe).'));
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await api<{ ok: boolean; error?: string }>('/api/apps/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), exe: addExe.trim() }),
      });
      if (!res.ok) {
        setAddError(res.error || t('Gagal menambahkan aplikasi.'));
        return;
      }
      setShowAdd(false);
      setOkMsg(t('Aplikasi ditambahkan.'));
      await load(true);
    } catch (e: any) {
      setAddError(e.message || t('Gagal menambahkan aplikasi.'));
    } finally {
      setAddBusy(false);
    }
  }

  async function removeCustom(e: AppEntry) {
    if (!e.exe) return;
    try {
      const res = await api<{ ok: boolean; error?: string }>('/api/apps/custom/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exe: e.exe }),
      });
      if (res.ok) {
        setOkMsg(t('Aplikasi dihapus.'));
        await load(true);
      } else {
        setErrMsg(t('Gagal menghapus aplikasi.'));
      }
    } catch {
      setErrMsg(t('Gagal menghapus aplikasi.'));
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
          <div className="flex items-center h-10 rounded-xl bg-[var(--bg-soft)] border border-[var(--border)] p-0.5">
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
          <button className="btn-primary !h-10 !px-4 text-xs" onClick={openAddModal}>
            <Icon name="plus" className="w-3.5 h-3.5" /> {t('Tambah Manual')}
          </button>
          <button className="btn-secondary !h-10 !px-3.5 text-xs" onClick={() => load(true)} disabled={loading}>
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
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 mt-auto">
                  <button
                    className="btn-primary !h-9 !px-2 !pr-3 text-xs min-w-0"
                    disabled={!e.exe || busy}
                    onClick={() => openApp(e, key)}
                  >
                    <span className="w-6 h-6 rounded-full bg-white/15 grid place-items-center shrink-0">
                      <Icon name={busy ? 'clock' : 'play'} className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate">{busy ? t('Menjalankan…') : e.kind === 'game' ? t('Main') : t('Buka')}</span>
                  </button>
                  <button
                    className="btn-secondary !w-9 !h-9 !p-0 grid place-items-center text-[var(--text-2)] hover:!border-[var(--accent-border)] hover:!text-[var(--accent-strong)]"
                    disabled={!e.exe && !e.cwd}
                    title={t('Buka Lokasi')}
                    onClick={() => openFolder(e)}
                  >
                    <Icon name="folderOpen" className="w-4 h-4" />
                  </button>
                  {e.source === 'custom' && (
                    <button
                      className="btn-secondary !w-9 !h-9 !p-0 grid place-items-center text-[var(--danger-strong)] hover:!bg-[var(--danger-soft)] hover:!border-[var(--danger-border)]"
                      title={t('Hapus dari daftar')}
                      onClick={() => removeCustom(e)}
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add-app modal */}
      {showAdd &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={t('Tambah Aplikasi Manual')}>
            <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={() => setShowAdd(false)} />
            <div className="relative card p-6 w-full max-w-md border-[var(--border-2)] animate-scale-in max-h-[85vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 border bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]">
                  <Icon name="folderSearch" className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-[var(--text)] leading-tight flex-1">
                  {t('Tambah Aplikasi Manual')}
                </h3>
                <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)] shrink-0" onClick={() => setShowAdd(false)} title={t('Tutup')}>
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">{t('Nama (opsional)')}</label>
                  <input className="input" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t('Isi otomatis dari nama berkas')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">{t('Lokasi berkas (.exe)')}</label>
                  <div className="flex gap-2">
                    <input className="input flex-1" value={addExe} onChange={(e) => { setAddExe(e.target.value); setAddError(null); }} placeholder="C:\Program Files\Aplikasi\app.exe" spellCheck={false} />
                    <button className="btn-secondary !h-10 !px-3 text-xs shrink-0" onClick={pickFile} title={t('Pilih Berkas')}>
                      <Icon name="folderSearch" className="w-3.5 h-3.5" /> {t('Pilih Berkas')}
                    </button>
                  </div>
                </div>
                {addError && (
                  <div className="text-xs text-[var(--danger-strong)] bg-[var(--danger-soft)] border border-[var(--danger-border)] rounded-lg px-3 py-2 flex items-center gap-2">
                    <Icon name="alert" className="w-3.5 h-3.5 shrink-0" /> {addError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button className="btn-secondary !h-10 !px-4 text-xs" onClick={() => setShowAdd(false)}>{t('Batal')}</button>
                  <button className="btn-primary !h-10 !px-4 text-xs" onClick={submitAdd} disabled={addBusy}>
                    <Icon name={addBusy ? 'clock' : 'check'} className="w-3.5 h-3.5" /> {addBusy ? t('Menambah…') : t('Simpan')}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Toasts */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 space-y-2 w-[92%] max-w-sm">
        {okMsg && (
          <div className="card !bg-[var(--ok-soft)] border-[var(--ok-border)] text-[var(--ok-strong)] px-4 py-3 text-sm flex items-center gap-2.5 shadow-lg animate-fade-in">
            <Icon name="check" className="w-4 h-4 shrink-0" /> {okMsg}
          </div>
        )}
        {errMsg && (
          <div className="card !bg-[var(--danger-soft)] border-[var(--danger-border)] text-[var(--danger-strong)] px-4 py-3 text-sm flex items-center gap-2.5 shadow-lg animate-fade-in">
            <Icon name="alert" className="w-4 h-4 shrink-0" /> {errMsg}
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
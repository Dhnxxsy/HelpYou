import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '../components/Icon';
import AppIcon from '../components/AppIcon';
import { formatBytes } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { pickExeFile } from '../lib/platform';
import { appKeyOf } from '@shared/appKeys';
import type { AppEntry } from '@shared/types';

type ViewTab = 'all' | 'apps' | 'games';
type PickerTab = 'games' | 'custom';

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
  const [showHidden, setShowHidden] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addExe, setAddExe] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [panelKeys, setPanelKeys] = useState<string[]>([]);
  const [panelBusy, setPanelBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>('games');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSel, setPickerSel] = useState<Set<string>>(new Set());

  async function load(force = false, includeHidden = showHidden) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (force) qs.set('force', '1');
      if (includeHidden) qs.set('showHidden', '1');
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const data = await api<{ apps: AppEntry[]; games: AppEntry[] }>(`/api/apps/list${suffix}`);
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
    api<{ keys: string[] }>('/api/apps/game-panel')
      .then((d) => setPanelKeys(Array.isArray(d.keys) ? d.keys : []))
      .catch(() => {});
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

  const panelEntries = useMemo(() => {
    const all = new Map([...apps, ...games].filter((e) => !e.hidden).map((e) => [appKeyOf(e), e]));
    const ordered: AppEntry[] = [];
    for (const k of panelKeys) {
      const e = all.get(k);
      if (e) ordered.push(e);
    }
    return ordered;
  }, [apps, games, panelKeys]);

  const panelSize = useMemo(
    () => panelEntries.reduce((s, e) => s + (e.sizeBytes ?? 0), 0),
    [panelEntries]
  );

  const pickerGames = useMemo(
    () =>
      [...games]
        .filter((g) => !g.hidden)
        .sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1)),
    [games]
  );

  const pickerCustom = useMemo(
    () =>
      [...apps]
        .filter((e) => e.source === 'custom' && !e.hidden)
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [apps]
  );

  const pickerList = useMemo(() => {
    const base = pickerTab === 'games' ? pickerGames : pickerCustom;
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.publisher || '').toLowerCase().includes(q)
    );
  }, [pickerTab, pickerGames, pickerCustom, pickerSearch]);

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

  async function toggleHidden(e: AppEntry) {
    const hiding = !e.hidden;
    try {
      const res = await api<{ ok: boolean; error?: string }>(`/api/apps/${hiding ? 'hide' : 'unhide'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exe: e.exe, name: e.name, source: e.source }),
      });
      if (res.ok) {
        setOkMsg(hiding ? t('Disembunyikan.') : t('Ditampilkan kembali.'));
        await load();
      } else {
        setErrMsg(t('Gagal mengubah status.'));
      }
    } catch {
      setErrMsg(t('Gagal mengubah status.'));
    }
  }

  function toggleShowHidden() {
    const next = !showHidden;
    setShowHidden(next);
    void load(false, next);
  }

  function openPanelPicker() {
    setPickerSearch('');
    setPickerTab('games');
    setPickerSel(new Set(panelKeys));
    setPickerOpen(true);
  }

  function togglePick(key: string) {
    setPickerSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function savePanel(next: Set<string>) {
    if (panelBusy) return;
    setPanelBusy(true);
    try {
      const res = await api<{ ok: boolean; keys: string[] }>('/api/apps/game-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [...next] }),
      });
      if (!res.ok) throw new Error(t('Gagal menyimpan rak game.'));
      setPanelKeys(res.keys);
      setPickerOpen(false);
      setOkMsg(t('Rak game disimpan.'));
    } catch (e: any) {
      setErrMsg(e.message || t('Gagal menyimpan rak game.'));
    } finally {
      setPanelBusy(false);
    }
  }

  async function removeFromPanel(e: AppEntry) {
    const next = new Set(panelKeys);
    next.delete(appKeyOf(e));
    await savePanel(next);
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
          <div className="flex items-center h-10 rounded-xl bg-[var(--bg-soft)] border border-[var(--accent-border)] p-0.5">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !showPanel ? 'bg-[var(--accent-strong)] text-white shadow' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
              onClick={() => setShowPanel(false)}
            >
              <Icon name="apps" className="w-3.5 h-3.5" /> {t('Katalog')}
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                showPanel
                  ? 'bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent-2)] text-white shadow-md shadow-[0_8px_22px_-8px_var(--accent-glow)]'
                  : 'text-[var(--accent-strong)] hover:text-[var(--accent-2)]'
              }`}
              onClick={() => setShowPanel(true)}
            >
              <Icon name="gamepad" className="w-3.5 h-3.5" /> {t('Rak Game')}
            </button>
          </div>
          <select className="input !w-auto !py-2 pr-9" value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'size')}>
            <option value="name">{t('Urut Nama (A-Z)')}</option>
            <option value="size">{t('Urut Ukuran Terbesar')}</option>
          </select>
          <button className="btn-soft !h-10 !px-4 text-xs" onClick={toggleShowHidden}>
            <Icon name={showHidden ? 'eye' : 'eyeOff'} className="w-3.5 h-3.5" /> {t('Tampilkan tersembunyi')}
          </button>
          <button className="btn-soft !h-10 !px-4 text-xs" onClick={openAddModal}>
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

      {/* Rak Game — curated game shelf */}
      {showPanel ? (
        <div className="space-y-4">
          <div className="game-banner p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] shadow-lg shadow-[0_12px_30px_-10px_var(--accent-glow)]">
              <Icon name="gamepad" className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow mb-1 text-[var(--accent-2)]">GAME SHELF</div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                <span className="text-gradient">{t('Rak Game')}</span>
              </h2>
              <p className="text-sm text-[var(--text-2)] mt-1">{t('Koleksi game favoritmu dalam satu tempat.')}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <StatsPill label={t('Game')} value={panelEntries.length.toLocaleString('id-ID')} />
              <StatsPill label={t('Total ukuran')} value={formatBytes(panelSize)} />
              <button className="game-play !h-10 !px-4 text-xs" onClick={openPanelPicker} disabled={countAll === 0}>
                <Icon name="plus" className="w-3.5 h-3.5" /> {t('Tambah Game')}
              </button>
            </div>
          </div>

          {panelEntries.length === 0 ? (
            <div className="card py-14 text-center text-sm text-[var(--text-3)] flex flex-col items-center gap-2 border-dashed border-[var(--accent-border)]">
              <div className="w-12 h-12 rounded-2xl grid place-items-center bg-[var(--accent-soft)] text-[var(--accent-strong)] border border-[var(--accent-border)]">
                <Icon name="gamepad" className="w-6 h-6" />
              </div>
              <p className="font-medium text-[var(--text-2)]">{t('Belum ada game di rak.')}</p>
              <p className="text-xs">{t('Pilih game dari daftar untuk memulainya.')}</p>
              <button className="game-play mt-3 !h-10 !px-4 text-xs" onClick={openPanelPicker} disabled={countAll === 0}>
                <Icon name="plus" className="w-3.5 h-3.5" /> {t('Tambah Game')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {panelEntries.map((e, idx) => {
                const key = appKeyOf(e);
                const busy = launching === key;
                return (
                  <div key={key} className="game-shelf-card flex flex-col gap-3 group">
                    {e.sizeBytes !== undefined && e.sizeBytes > 0 && (
                      <div className="game-rank">{idx + 1}</div>
                    )}
                    <div className="flex items-start gap-3">
                      <AppIcon
                        name={e.name}
                        index={idx}
                        iconUrl={e.icon ? `/api/uninstaller/icon?path=${encodeURIComponent(e.icon)}` : undefined}
                        className="w-14 h-14 rounded-xl"
                      />
                      <div className="min-w-0 flex-1 pr-8">
                        <p className="font-bold text-sm leading-snug truncate" title={e.name}>
                          {e.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-3)] truncate mt-1">{subtitle(e)}</p>
                        <span className="inline-block text-[10px] font-semibold mt-1.5 text-[var(--accent-strong)] bg-[var(--accent-soft)] border border-[var(--accent-border)] px-1.5 py-0.5 rounded-md">
                          {e.kind === 'game' ? t('Game') : t('Aplikasi')}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 mt-auto">
                      <button
                        className="game-play !h-9 text-xs min-w-0"
                        disabled={!e.exe || busy}
                        onClick={() => openApp(e, key)}
                      >
                        <Icon name={busy ? 'clock' : 'play'} className="w-3.5 h-3.5 shrink-0" />
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
                      <button
                        className="btn-secondary !w-9 !h-9 !p-0 grid place-items-center text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:!text-[var(--danger-strong)] hover:!border-[var(--danger-border)]"
                        title={t('Keluarkan dari rak')}
                        onClick={() => removeFromPanel(e)}
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
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
                className={`card p-3.5 flex flex-col gap-3 transition-colors group ${
                  e.hidden ? 'opacity-60 border-dashed' : 'hover:border-[var(--accent-border)]'
                }`}
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
                    {e.hidden && (
                      <p className="text-[10px] font-medium text-[var(--accent-strong)] mt-0.5 flex items-center gap-1">
                        <Icon name="eyeOff" className="w-3 h-3" /> {t('Tersembunyi')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-start gap-1 shrink-0">
                    {e.sizeBytes !== undefined && e.sizeBytes > 0 && (
                      <span className="text-[10px] text-[var(--text-3)] pt-0.5">{formatBytes(e.sizeBytes)}</span>
                    )}
                    <button
                      className={`grid place-items-center w-6 h-6 rounded-lg transition-all ${
                        e.hidden
                          ? 'text-[var(--accent-strong)] bg-[var(--accent-soft)]'
                          : 'text-[var(--text-3)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger-strong)]'
                      }`}
                      title={e.hidden ? t('Tampilkan kembali') : t('Sembunyikan')}
                      onClick={() => void toggleHidden(e)}
                    >
                      <Icon name={e.hidden ? 'eye' : 'eyeOff'} className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 mt-auto">
                  <button
                    className="btn-soft !h-9 text-xs min-w-0"
                    disabled={!e.exe || busy}
                    onClick={() => openApp(e, key)}
                  >
                    <Icon name={busy ? 'clock' : 'play'} className="w-3.5 h-3.5 shrink-0" />
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
        </>
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
                  <button className="btn-soft !h-10 !px-4 text-xs" onClick={submitAdd} disabled={addBusy}>
                    <Icon name={addBusy ? 'clock' : 'check'} className="w-3.5 h-3.5" /> {addBusy ? t('Menambah…') : t('Simpan')}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Game-spicker modal */}
      {pickerOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={t('Tambah ke Rak Game')}>
            <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
            <div className="relative card p-6 w-full max-w-lg border-[var(--border-2)] animate-scale-in max-h-[88vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] text-white shadow-lg shadow-[0_10px_26px_-10px_var(--accent-glow)]">
                  <Icon name="gamepad" className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-[var(--text)] leading-tight flex-1">
                  {t('Tambah ke Rak Game')}
                </h3>
                <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)] shrink-0" onClick={() => setPickerOpen(false)} title={t('Tutup')}>
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[var(--text-3)] -mt-2 mb-4">
                {t('Pilih item yang sudah ada di Pusat Aplikasi & Game.')}
              </p>

              <div className="relative mb-3">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)]" />
                <input className="input pl-9" placeholder={t('Cari di seluruh aplikasi & game…')} value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
              </div>

              <div className="flex items-center h-10 rounded-xl bg-[var(--bg-soft)] border border-[var(--border)] p-0.5 mb-3">
                {(['games', 'custom'] as PickerTab[]).map((v) => (
                  <button
                    key={v}
                    className={`flex items-center gap-1.5 flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      pickerTab === v ? 'bg-[var(--accent-strong)] text-white shadow' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                    }`}
                    onClick={() => setPickerTab(v)}
                  >
                    <Icon name={v === 'games' ? 'gamepad' : 'pin'} className="w-3.5 h-3.5" />
                    {v === 'games' ? t('Game') : t('Aplikasi Manual')}
                  </button>
                ))}
              </div>

              <div className="max-h-[38vh] overflow-y-auto space-y-1.5 pr-1">
                {pickerList.length === 0 ? (
                  <div className="text-center text-xs text-[var(--text-3)] py-8 flex flex-col items-center gap-2">
                    <Icon name="search" className="w-5 h-5" />
                    {t('Tidak ada item yang cocok.')}
                  </div>
                ) : (
                  pickerList.map((e) => {
                    const key = appKeyOf(e);
                    const on = pickerSel.has(key);
                    return (
                      <button
                        key={key}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                          on
                            ? 'border-[var(--accent-2)] bg-[var(--accent-soft)] shadow-md shadow-[0_10px_24px_-12px_var(--accent-glow)]'
                            : 'border-[var(--border)] bg-[var(--bg-soft)] hover:border-[var(--accent-border)]'
                        }`}
                        onClick={() => togglePick(key)}
                      >
                        <span
                          className={`grid place-items-center w-5 h-5 rounded-md border shrink-0 transition-colors ${
                            on ? 'bg-[var(--accent-strong)] border-transparent text-white' : 'border-[var(--border-2)] text-transparent'
                          }`}
                        >
                          <Icon name="check" className="w-3.5 h-3.5" />
                        </span>
                        <AppIcon
                          name={e.name}
                          index={pickerList.indexOf(e)}
                          iconUrl={e.icon ? `/api/uninstaller/icon?path=${encodeURIComponent(e.icon)}` : undefined}
                          className="w-9 h-9 rounded-lg shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate">{e.name}</span>
                          <span className="block text-[11px] text-[var(--text-3)] truncate">{subtitle(e)}</span>
                        </span>
                        {e.sizeBytes !== undefined && e.sizeBytes > 0 && (
                          <span className="text-[11px] text-[var(--text-3)] shrink-0">{formatBytes(e.sizeBytes)}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-4 mt-1">
                <div className="text-xs text-[var(--text-3)] pl-1">
                  {pickerSel.size > 0 ? t('{n} dipilih', { n: String(pickerSel.size) }) : t('Belum ada yang dipilih.')}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary !h-10 !px-4 text-xs" onClick={() => setPickerOpen(false)}>{t('Batal')}</button>
                  <button className="game-play !h-10 !px-4 text-xs" onClick={() => void savePanel(pickerSel)} disabled={panelBusy}>
                    <Icon name={panelBusy ? 'clock' : 'check'} className="w-3.5 h-3.5" />
                    {panelBusy ? t('Menyimpan…') : t('Simpan ({n})', { n: String(pickerSel.size) })}
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
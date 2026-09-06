import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import AppIcon from '../components/AppIcon';
import { formatBytes } from '../lib/format';
import { useI18n, tGlobal } from '../lib/i18n';
import type { InstalledApp, ResidueEntry } from '@shared/types';

function kindLabel(kind: ResidueEntry['kind']): string {
  if (kind === 'folder') return tGlobal('Folder');
  if (kind === 'executable') return tGlobal('Program (EXE)');
  if (kind === 'shortcut') return tGlobal('Pintasan');
  return tGlobal('File');
}

const KIND_ICON: Record<ResidueEntry['kind'], IconName> = {
  folder: 'folder',
  executable: 'play',
  shortcut: 'link',
  file: 'external',
};

function bytesOfApp(app: InstalledApp): number | undefined {
  return app.estimatedSizeKb !== undefined ? app.estimatedSizeKb * 1024 : undefined;
}

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

export default function UninstallerView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'size'>('name');
  const [silent, setSilent] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirmApp, setConfirmApp] = useState<InstalledApp | null>(null);
  const [runApp, setRunApp] = useState<InstalledApp | null>(null);
  const [runSilent, setRunSilent] = useState(true);
  const [residueApp, setResidueApp] = useState<InstalledApp | null>(null);

  async function loadApps(force = false) {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ apps: InstalledApp[] }>(`/api/uninstaller/apps${force ? '?force=1' : ''}`);
      const list = data.apps || [];
      setApps(list);
      warmIcons(list);
    } catch (e: any) {
      setError(e.message || t('Gagal memuat daftar program.'));
    } finally {
      setLoading(false);
    }
  }

  function warmIcons(list: InstalledApp[]) {
    const unique = [...new Set(list.map((a) => a.displayIcon).filter((p): p is string => !!p))];
    if (unique.length === 0) return;
    fetch('/api/uninstaller/icons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: unique }),
    }).catch(() => {});
  }

  useEffect(() => {
    loadApps();
  }, []);

  const filtered = useMemo(() => {
    let list = apps;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => a.name.toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q));
    }
    const sizeOf = (a: InstalledApp) => bytesOfApp(a) ?? -1;
    list = [...list].sort((a, b) => (sort === 'size' ? sizeOf(b) - sizeOf(a) : a.name.localeCompare(b.name, 'id')));
    return list;
  }, [apps, search, sort]);

  const totalSize = useMemo(() => apps.reduce((s, a) => s + (bytesOfApp(a) ?? 0), 0), [apps]);

  function askUninstall(app: InstalledApp) {
    setConfirmApp(app);
  }

  function launchUninstall(app: InstalledApp) {
    setRunSilent(silent);
    setRunApp(app);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">{t('Toolbox — Utilitas Sistem')}</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-gradient">{t('Uninstaller Program')}</span>
          </h1>
          <p className="text-sm text-[var(--text-2)] mt-1.5 max-w-2xl">
            {t('Hapus pasang aplikasi dengan cepat dan bersih — termasuk bekas folder, data aplikasi, dan pintasan Start Menu.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatsPill label={t('Program')} value={apps.length.toLocaleString('id-ID')} />
          <StatsPill label={t('Total terduga')} value={formatBytes(totalSize)} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)]" />
          <input
            className="input pl-9"
            placeholder={t('Cari program atau penerbit...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input !w-auto !py-2 pr-9" value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'size')}>
            <option value="name">{t('Urut Nama (A-Z)')}</option>
            <option value="size">{t('Urut Ukuran Terbesar')}</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer select-none px-1" title={t('Jalankan uninstaller tanpa dialog bila memungkinkan')}>
            <input type="checkbox" className="accent-indigo-500 w-4 h-4" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
            {t('Mode senyap')}
          </label>
          <button className="btn-secondary !py-2 !px-3.5 text-xs" onClick={() => loadApps(true)} disabled={loading}>
            <Icon name="replay" className="w-3.5 h-3.5" /> {t('Muat Ulang')}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)] text-sm p-4 flex items-center gap-2.5">
          <Icon name="alert" className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* List */}
      {loading && apps.length === 0 ? (
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4 skeleton" />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
          {filtered.length === 0 ? (
            <div className="py-14 text-center text-sm text-[var(--text-3)] flex flex-col items-center gap-2">
              <Icon name="package" className="w-6 h-6 text-[var(--text-3)]" />
              {apps.length === 0 ? t('Belum ada aplikasi terdeteksi.') : t('Tidak ada program yang cocok.')}
              <button className="btn-ghost !py-2 !px-3 text-xs mt-2" onClick={() => loadApps(true)}>{t('Coba muat ulang')}</button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((app, idx) => (
                <AppRow
                  key={app.key + '|' + app.hkcu + '|' + idx}
                  app={app}
                  index={idx}
                  expanded={openKey === app.key + '|' + app.hkcu}
                  onToggle={() => setOpenKey((k) => (k === app.key + '|' + app.hkcu ? null : app.key + '|' + app.hkcu))}
                  onUninstall={() => askUninstall(app)}
                  onResidue={() => setResidueApp(app)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-[var(--text-3)]">{t('{count} program · ukuran adalah perkiraan dari registry', { count: filtered.length.toLocaleString('id-ID') })}</p>

      {/* Confirm uninstall */}
      <ConfirmDialog
        open={!!confirmApp}
        tone="danger"
        icon="trash"
        title={confirmApp ? t('Uninstall {name}?', { name: confirmApp.name }) : ''}
        description={confirmApp ? t('Aplikasi akan di-uninstall {mode}. Anda bisa membersihkan sisa file setelahnya.', { mode: silent ? t('tanpa menampilkan dialog (mode senyap)') : t('dengan wizard normal') }) : ''}
        confirmLabel={t('Ya, uninstall')}
        onClose={() => setConfirmApp(null)}
        onConfirm={() => {
          const app = confirmApp;
          setConfirmApp(null);
          if (app) launchUninstall(app);
        }}
      />

      {/* Uninstall modal */}
      {runApp && (
        <RunModal
          app={runApp}
          initialSilent={runSilent}
          onClose={() => setRunApp(null)}
          onResidue={(a) => { setRunApp(null); setResidueApp(a); }}
          onChanged={() => loadApps(false)}
        />
      )}

      {/* Residue modal */}
      {residueApp && <ResidueModal app={residueApp} onClose={() => setResidueApp(null)} />}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> {t('Kembali ke Beranda')}
      </button>
    </div>
  );
}

function StatsPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-[var(--text)] mt-0.5">{value}</div>
    </div>
  );
}

function AppRow({ app, index, expanded, onToggle, onUninstall, onResidue }: {
  app: InstalledApp;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUninstall: () => void;
  onResidue: () => void;
}) {
  const { t } = useI18n();
  const canUninstall = !!(app.uninstallString || app.quietUninstallString);
  return (
    <div className="row">
      <div className="flex items-center gap-3 px-4 py-3">
        <AppIcon name={app.name} index={index} iconUrl={app.displayIcon ? '/api/uninstaller/icon?path=' + encodeURIComponent(app.displayIcon) : undefined} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-[var(--text)] truncate">{app.name}</span>
            {app.displayVersion && <span className="chip bg-[var(--overlay)] text-[var(--text-2)] border border-[var(--border)] text-[10px] shrink-0">{app.displayVersion}</span>}
          </div>
          <div className="text-xs text-[var(--text-3)] truncate mt-0.5">
            {[app.publisher, app.arch, bytesOfApp(app) !== undefined ? formatBytes(bytesOfApp(app)) : null].filter(Boolean).join(' · ') || t('Program terpasang')}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end text-xs text-[var(--text-3)] shrink-0 mr-1">
          {app.installDate ? <span className="tabular-nums">{formatInstallDate(app.installDate)}</span> : <span>—</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button className="btn-ghost !p-2 text-[var(--text-2)]" title={t('Periksa residu')} onClick={onResidue}>
            <Icon name="broom" className="w-4 h-4" />
          </button>
          <button
            className="btn-danger !py-2 !px-3.5 !text-xs"
            disabled={!canUninstall}
            title={canUninstall ? t('Uninstall') : t('Tidak punya uninstaller')}
            onClick={onUninstall}
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('Uninstall')}</span>
          </button>
          <button className="btn-ghost !p-2 text-[var(--text-2)]" onClick={onToggle} title={t('Detail')}>
            <Icon name="chevronRight" className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 grid sm:grid-cols-2 gap-x-6 gap-y-2.5 animate-fade-in">
          {app.publisher && <DetailRow label={t('Penerbit')} value={app.publisher} />}
          {app.displayVersion && <DetailRow label={t('Versi')} value={app.displayVersion} />}
          {app.installDate && <DetailRow label={t('Tanggal pasang')} value={formatInstallDate(app.installDate)} />}
          {app.arch && <DetailRow label={t('Tipe')} value={app.arch} />}
          {bytesOfApp(app) !== undefined && <DetailRow label={t('Ukuran terduga')} value={formatBytes(bytesOfApp(app))} />}
          {app.installLocation ? (
            <div className="flex items-center justify-between gap-3">
              <DetailRow label={t('Lokasi')} value={app.installLocation} />
              <button className="btn-ghost !py-1.5 !px-2.5 text-xs shrink-0" onClick={() => openFolder(app.installLocation!)}>
                <Icon name="folderOpen" className="w-3.5 h-3.5" /> {t('Buka')}
              </button>
            </div>
          ) : <DetailRow label={t('Lokasi')} value={t('Tidak tersedia')} />}
          <DetailRow label={t('Perintah uninstall')} value={app.uninstallString || app.quietUninstallString || t('Tidak tersedia')} mono />
          <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1.5">
            <button className="btn-secondary !py-2 !px-3 text-xs" onClick={onResidue}>
              <Icon name="broom" className="w-3.5 h-3.5" /> {t('Periksa & Bersihkan Residu')}
            </button>
            {!canUninstall && (
              <span className="text-[11px] text-[var(--warn-strong)]/90 self-center">{t('Aplikasi ini tidak menyediakan uninstaller (mis. aplikasi portable).')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</div>
      <div className={`text-xs text-[var(--text-2)] mt-0.5 truncate ${mono ? 'font-mono' : ''}`} title={value}>{value || '—'}</div>
    </div>
  );
}

function formatInstallDate(d: string): string {
  // registry usually YYYYMMDD
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

async function openFolder(p: string) {
  try {
    await api('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Modal shell                                                          */
/* ------------------------------------------------------------------ */

function ModalShell({ icon, tone, title, children, onClose, wide }: {
  icon: IconName;
  tone: 'indigo' | 'emerald' | 'rose' | 'violet';
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const toneCls =
    tone === 'indigo' ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
    : tone === 'emerald' ? 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]'
    : tone === 'rose' ? 'bg-[var(--danger-soft)] text-[var(--danger-strong)] border-[var(--danger-border)]'
    : 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]';
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={onClose} />
      <div className={`relative card p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} border-[var(--border-2)] animate-scale-in max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-start gap-3.5 mb-5">
          <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 border ${toneCls}`}>
            <Icon name={icon} className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-[var(--text)] leading-tight">{title}</h3>
          </div>
          <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)] shrink-0" onClick={onClose} title={t('Tutup')}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Run modal                                                            */
/* ------------------------------------------------------------------ */

interface RunInfo {
  launched: boolean;
  finished: boolean;
  exitCode: number | null;
  error: string | null;
  asAdmin: boolean;
  verified?: boolean;
}

function RunModal({ app, initialSilent, onClose, onResidue, onChanged }: {
  app: InstalledApp;
  initialSilent: boolean;
  onClose: () => void;
  onResidue: (app: InstalledApp) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [info, setInfo] = useState<RunInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminTry, setAdminTry] = useState(false);

  async function startRun(asAdmin: boolean) {
    setError(null);
    setAdminTry(asAdmin);
    setInfo({ launched: true, finished: false, exitCode: null, error: null, asAdmin });
    try {
      const data = await api<{ runId: string }>(`/api/uninstaller/run${asAdmin ? '/admin' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app, silent: initialSilent }),
      });
      poll(data.runId);
    } catch (e: any) {
      setInfo(null);
      setError(e.message || t('Gagal memulai uninstaller.'));
    }
  }

  function poll(runId: string) {
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const r = await api<RunInfo>(`/api/uninstaller/runs/${runId}`);
        if (cancelled) return;
        setInfo(r);
        if (r.finished) {
          clearInterval(iv);
          onChanged();
        }
      } catch {
        if (!cancelled) {
          setError(t('Kehilangan koneksi ke server saat uninstall. Cek kembali programnya.'));
          clearInterval(iv);
        }
      }
    }, 1500);
    return () => { cancelled = true; clearInterval(iv); };
  }

  useEffect(() => {
    startRun(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = info && !info.finished;
  const success = info?.finished && (info.exitCode === 0 || info.exitCode === null || info.exitCode === 3010 || info.exitCode === 1641 || info.exitCode === 1605);
  // 0 = ok, 3010/1641 = reboot required, 1605 = already uninstalled

  return (
    <ModalShell icon="trash" tone="violet" title={t('Uninstall {name}', { name: app.name })} onClose={onClose}>
      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3.5 text-sm text-[var(--danger-strong)] flex flex-col gap-3">
          <span className="flex items-start gap-2">
            <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </span>
          {!adminTry && (
            <button className="btn-secondary !py-2 !px-3.5 text-xs self-start" onClick={() => startRun(true)}>
              <Icon name="shield" className="w-3.5 h-3.5" /> {t('Coba dengan Administrator (UAC)')}
            </button>
          )}
        </div>
      )}

      {!info && !error && (
        <div className="flex items-center gap-3 text-sm text-[var(--text-2)]">
          <div className="w-5 h-5 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
          {t('Menyiapkan uninstaller…')}
        </div>
      )}

      {running && (
        <div className="flex flex-col items-center gap-4 py-3 text-center">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
            <span className="absolute inset-0 m-auto w-full h-full rounded-full border border-[var(--accent-border)] animate-ping-slow" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">{t('Uninstall sedang berjalan…')}</div>
            <div className="text-xs text-[var(--text-2)] mt-1">
              {info?.asAdmin ? t('Di jalankan sebagai administrator.') : t('Selesaikan wizard uninstall (bila muncul) di layar Anda.')}
            </div>
          </div>
        </div>
      )}

      {info?.finished && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 flex items-start gap-3 text-sm ${success && info.verified !== false ? 'border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-strong)]' : 'border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn-strong)]'}`}>
            <Icon name={success && info.verified !== false ? 'check' : 'info'} className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              {success && info.verified !== false ? (
                <><b>Uninstall selesai{info.verified === true ? t(' — program sudah tidak terdaftar di sistem') : ''}.</b> {t('Klik di bawah untuk memeriksa sisa file dan membersihkannya sampai akar.')}</>
              ) : success && info.verified === false ? (
                <><b>{t('Uninstaller selesai, tapi program masih terdaftar di sistem.')}</b> {t('Uninstall mungkin perlu izin administrator, atau masih ada langkah yang harus diselesaikan di wizard-nya. Klik "Coba dengan Administrator" atau uninstall manual via Settings → Apps.')}</>
              ) : (
                <><b>{t('Uninstaller selesai dengan kode {exitCode}.', { exitCode: info.exitCode })}</b> {t('Program mungkin belum terhapus sepenuhnya — periksa residu untuk memastikan.')}</>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button className="btn-ghost !py-2 !px-3.5 text-sm" onClick={onClose}>{t('Selesai')}</button>
            <button className="btn-primary !py-2 !px-4 text-sm" onClick={() => onResidue(app)}>
              <Icon name="broom" className="w-4 h-4" /> {t('Periksa & Bersihkan Residu')}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* Residue modal                                                        */
/* ------------------------------------------------------------------ */

function ResidueModal({ app, onClose }: { app: InstalledApp; onClose: () => void }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<ResidueEntry[] | null>(null);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function scan() {
    setScanning(true);
    setNotice(null);
    try {
      const data = await api<{ entries: ResidueEntry[] }>('/api/uninstaller/residue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app }),
      });
      setEntries(data.entries || []);
    } catch (e: any) {
      setNotice({ ok: false, text: e.message || t('Gagal memindai residu.') });
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => { scan(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function remove(paths: string[]) {
    if (paths.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await api<{ results: { path: string; ok: boolean; error?: string }[] }>('/api/uninstaller/residue/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app, paths }),
      });
      const okCount = data.results.filter((r) => r.ok).length;
      const failed = data.results.filter((r) => !r.ok);
      setEntries((prev) => (prev || []).filter((e) => !paths.includes(e.path)));
      if (failed.length > 0) {
        setNotice({ ok: false, text: t('{okCount} dibersihkan, {failedCount} gagal: {reason}', { okCount, failedCount: failed.length, reason: failed[0].error || t('periksa ulang') }) });
      } else if (okCount > 0) {
        setNotice({ ok: true, text: t('{okCount} item dibersihkan ke Recycle Bin.', { okCount }) });
      }
    } catch (e: any) {
      setNotice({ ok: false, text: e.message || t('Gagal membersihkan residu.') });
    } finally {
      setBusy(false);
    }
  }

  const list = entries ?? [];
  const totalBytes = list.reduce((s, e) => s + e.sizeBytes, 0);

  return (
    <ModalShell icon="broom" tone="emerald" title={t('Residu: {name}', { name: app.name })} onClose={onClose} wide>
      {scanning ? (
        <div className="flex items-center gap-3 text-sm text-[var(--text-2)] py-4">
          <div className="w-5 h-5 rounded-full border-2 border-[var(--ok-border)] border-t-[var(--ok-strong)] animate-spin" />
          {t('Memindai sisa file… ini bisa beberapa saat.')}
        </div>
      ) : notice && !entries?.length ? (
        <Notice ok={notice.ok}>{notice.text}</Notice>
      ) : entries && entries.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-[var(--ok-soft)] border border-[var(--ok-border)] grid place-items-center text-[var(--ok-strong)]">
            <Icon name="check" className="w-6 h-6" />
          </div>
          <div className="text-sm font-semibold text-[var(--text)]">{t('Bersih! Tidak ditemukan sisa file')}</div>
          <div className="text-xs text-[var(--text-3)]">{t('Folder & data aplikasi sudah bersih dari {name}.', { name: app.name })}</div>
        </div>
      ) : (
        <>
          {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[var(--overlay)] text-[11px] uppercase tracking-wider text-[var(--text-3)] font-semibold">
              <div className="col-span-6">{t('Lokasi')}</div>
              <div className="col-span-3">{t('Jenis')}</div>
              <div className="col-span-3 text-right">{t('Ukuran')}</div>
            </div>
            <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
              {list.map((e) => (
                <div key={e.path} className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm ${e.kind === 'executable' ? 'bg-[var(--warn)]/[0.06]' : ''}`}>
                  <div className="col-span-6 truncate text-[var(--text-2)] font-mono text-xs" title={e.path}>{e.path}</div>
                  <div className="col-span-3 text-xs flex items-center gap-1.5">
                    <Icon name={KIND_ICON[e.kind]} className={`w-3.5 h-3.5 ${e.kind === 'executable' ? 'text-[var(--warn-strong)]' : 'text-[var(--text-3)]'}`} />
                    {e.kind === 'executable' ? (
                      <span className="chip bg-[var(--warn-soft)] text-[var(--warn-strong)] border border-[var(--warn-border)] text-[10px]" title={t('Berkas program (EXE) — akan dihapus ke Recycle Bin bila ditekan')}>{t('Program (EXE)')}</span>
                    ) : (
                      <span className="text-[var(--text-3)]">{kindLabel(e.kind)}</span>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-2">
                    <span className="text-xs text-[var(--text-2)] tabular-nums">{e.sizeBytes > 0 ? formatBytes(e.sizeBytes) : '—'}</span>
                    <button className="btn-ghost !p-1.5 text-[var(--text-2)] hover:text-[var(--danger-strong)]" title={t('Hapus')} disabled={busy} onClick={() => remove([e.path])}>
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="text-xs text-[var(--text-3)]">
              {t('{count} item · ±{size} · dihapus ke', { count: list.length, size: formatBytes(totalBytes) })}{' '}<b>Recycle Bin</b>{' '}{t('(bisa dikembalikan)')}
            </div>
            <div className="flex gap-2.5">
              <button className="btn-ghost !py-2 !px-3.5 text-sm" onClick={() => scan()} disabled={busy}>
                <Icon name="replay" className="w-3.5 h-3.5" /> {t('Pindai ulang')}
              </button>
              <button className="btn-primary !py-2 !px-4 text-sm" disabled={busy} onClick={() => remove(list.map((e) => e.path))}>
                <Icon name="broom" className="w-4 h-4" /> {t('Bersihkan Semua')}
              </button>
            </div>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3.5 text-sm flex items-start gap-2.5 ${ok ? 'border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-strong)]' : 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)]'}`}>
      <Icon name={ok ? 'check' : 'alert'} className="w-4 h-4 mt-0.5 shrink-0" /> {children}
    </div>
  );
}
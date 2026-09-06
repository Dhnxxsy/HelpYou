import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { checkForUpdate, downloadUpdate, installUpdate, isDesktop } from '../lib/platform';
import { useI18n, translateServerMessage } from '../lib/i18n';

type Mode = 'idle' | 'available' | 'downloading' | 'ready' | 'error' | 'hidden';

interface UpdateInfo {
  version?: string;
  size?: number;
}

function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '';
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2).replace('.', ',')} GB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export default function UpdateNotifier() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('idle');
  const [info, setInfo] = useState<UpdateInfo>({});
  const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  useEffect(() => {
    if (!isDesktop || !window.electron) return;
    const up = window.electron.updates;

    const offAvailable = up.on('available', (d) => {
      setMode((m) => (m === 'idle' ? 'available' : m));
      setInfo((p) => ({ ...p, version: (d as { version?: string }).version, size: (d as { size?: number }).size }));
    });
    const offProgress = up.on('progress', (d) => {
      setProgress({
        percent: Math.round((d as { percent?: number }).percent ?? 0),
        transferred: (d as { transferred?: number }).transferred ?? 0,
        total: (d as { total?: number }).total ?? 0,
      });
    });
    const offDownloaded = up.on('downloaded', (d) => {
      setInfo((p) => ({ ...p, version: (d as { version?: string }).version }));
      setMode('ready');
    });
    const offError = up.on('error', (d) => {
      setErrorMsg((d as { message?: string }).message);
      setMode('error');
    });

    checkForUpdate()
      .then((r) => {
        if (r?.status === 'error') {
          setErrorMsg(r.message);
          setMode('error');
        } else if (r?.status === 'available') {
          setMode((m) => (m === 'idle' ? 'available' : m));
          setInfo((p) => ({ ...p, version: r.version, size: r.size ?? p.size }));
        }
      })
      .catch(() => {});

    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  const startDownload = useCallback(() => {
    setMode('downloading');
    void downloadUpdate().then((r) => {
      if (!r.ok) {
        setErrorMsg(r.message);
        setMode('error');
      }
    });
  }, []);

  if (!isDesktop || mode === 'idle' || mode === 'hidden') return null;

  if (mode === 'error') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-[var(--warn-soft)] grid place-items-center text-[var(--warn-strong)] shrink-0">
            <Icon name="alert" className="w-4 h-4" />
          </div>
          <div className="flex-1 text-sm text-[var(--warn-strong)]">{translateServerMessage(errorMsg ?? t('Pemeriksaan pembaruan gagal. Coba lagi saat membuka aplikasi.'))}</div>
          <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)]" onClick={() => setMode('hidden')} title={t('Tutup')}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'available') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center text-white shrink-0">
            <Icon name="sparkle" className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-sm font-semibold text-[var(--text)]">
              {t('Pembaruan HelpYou {version} tersedia', { version: info.version })}
            </div>
            <p className="text-xs text-[var(--text-2)] mt-0.5">{t('Ukuran unduhan:')} <span className="font-semibold text-[var(--accent-strong)]">{fmtBytes(info.size) || '—'}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary !py-2 !px-4 text-xs" onClick={startDownload}>
              <Icon name="download" className="w-3.5 h-3.5" /> {t('Update Sekarang')}
            </button>
            <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)]" onClick={() => setMode('hidden')} title={t('Nanti saja (diingatkan saat aplikasi dibuka lagi)')}>
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'downloading') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
        <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center text-white shrink-0">
              <Icon name="sparkle" className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-semibold text-[var(--text)]">
                {t('Mengunduh pembaruan {version}…', { version: info.version })}
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[var(--overlay-2)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent-2)] transition-[width] duration-300" style={{ width: `${progress.percent || 3}%` }} />
              </div>
            </div>
            <span className="text-xs text-[var(--text-2)] tabular-nums shrink-0">
              {progress.total > 0 ? `${fmtBytes(progress.transferred)} / ${fmtBytes(progress.total)} · ` : ''}{progress.percent}%
            </span>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'ready'
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--ok-border)] bg-[var(--ok-soft)] px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-[var(--ok-soft)] border border-[var(--ok-border)] grid place-items-center text-[var(--ok-strong)] shrink-0">
          <Icon name="check" className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-semibold text-[var(--text)]">{t('Pembaruan {version} siap dipasang', { version: info.version })}</div>
          <p className="text-xs text-[var(--text-2)]">{t('Aplikasi akan ditutup, diperbarui, dan dibuka kembali otomatis.')}</p>
        </div>
        <button className="btn-primary !py-2 !px-3.5 text-xs" onClick={() => void installUpdate()}>
          <Icon name="download" className="w-3.5 h-3.5" /> {t('Update & Restart')}
        </button>
        <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)]" onClick={() => setMode('hidden')} title={t('Nanti saja (akan terpasang saat aplikasi ditutup)')}>
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
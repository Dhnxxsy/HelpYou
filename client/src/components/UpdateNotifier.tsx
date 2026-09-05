import { useEffect, useState } from 'react';
import Icon from './Icon';
import { checkForUpdate, installUpdate, isDesktop } from '../lib/platform';

type Mode = 'idle' | 'downloading' | 'ready' | 'error' | 'hidden';

export default function UpdateNotifier() {
  const [mode, setMode] = useState<Mode>('idle');
  const [version, setVersion] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isDesktop || !window.electron) return;
    const up = window.electron.updates;

    const offAvailable = up.on('available', (d) => {
      setVersion((d as { version?: string }).version);
      setProgress(0);
      setMode('downloading');
    });
    const offProgress = up.on('progress', (d) => {
      setProgress(Math.round((d as { percent?: number }).percent ?? 0));
    });
    const offDownloaded = up.on('downloaded', (d) => {
      setVersion((d as { version?: string }).version);
      setMode('ready');
    });

    checkForUpdate()
      .then((r) => {
        if (r?.status === 'error') setMode('error');
      })
      .catch(() => {});

    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
    };
  }, []);

  if (!isDesktop || mode === 'idle' || mode === 'hidden') return null;

  if (mode === 'error') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--warn-soft)] grid place-items-center text-[var(--warn-strong)] shrink-0">
            <Icon name="alert" className="w-4 h-4" />
          </div>
          <div className="flex-1 text-sm text-[var(--warn-strong)]">Pemeriksaan pembaruan gagal. Coba lagi saat membuka aplikasi.</div>
          <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)]" onClick={() => setMode('hidden')} title="Tutup">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'downloading') {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
        <div className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center text-white shrink-0">
              <Icon name="sparkle" className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-semibold text-[var(--text)]">
                Mengunduh pembaruan {version ? `v${version}` : ''}…
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[var(--overlay-2)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent-2)] transition-[width] duration-300" style={{ width: `${progress || 3}%` }} />
              </div>
            </div>
            <span className="text-xs text-[var(--text-2)] tabular-nums shrink-0">{progress}%</span>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'ready'
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--ok-border)] bg-[var(--ok-soft)] px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--ok-soft)] border border-[var(--ok-border)] grid place-items-center text-[var(--ok-strong)] shrink-0">
          <Icon name="check" className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-semibold text-[var(--text)]">Pembaruan {version ? `v${version}` : ''} siap dipasang</div>
          <p className="text-xs text-[var(--text-2)]">Aplikasi akan ditutup, diperbarui, dan dibuka kembali otomatis.</p>
        </div>
        <button className="btn-primary !py-2 !px-3.5 text-xs" onClick={() => void installUpdate()}>
          <Icon name="download" className="w-3.5 h-3.5" /> Update &amp; Restart
        </button>
        <button className="btn-ghost !p-2 text-[var(--text-2)] hover:text-[var(--text)]" onClick={() => setMode('hidden')} title="Nanti saja (pembaruan akan terpasang saat aplikasi ditutup)">
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
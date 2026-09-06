import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { isDesktop } from '@/lib/platform';
import type { WindowMaxState } from '@/lib/platform';
import { useI18n, tGlobal } from '../lib/i18n';

function WindowIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 12 12" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const MINIMIZE = 'M2 6h8';
const MAXIMIZE = 'M2.5 2.5h7v7h-7z';
const RESTORE = 'M4.5 2.5h5v5h-5z M2.5 4.5h5v5h-5z';
// Enter fullscreen — corner brackets expanding outward.
const ENTER_FULLSCREEN = 'M2.5 4V2.5H4 M9.5 4V2.5H8 M2.5 8v1.5H4 M9.5 8v1.5H8';
// Exit fullscreen — corner brackets collapsing inward.
const EXIT_FULLSCREEN = 'M4 2.5V4H2.5 M8 2.5V4h1.5 M2.5 8H4v1.5 M9.5 8H8v1.5';
const CLOSE = 'M3 3l6 6M9 3 3 9';

const INITIAL: WindowMaxState = { maximized: false, fullscreen: false };

export default function TitleBar() {
  const { t } = useI18n();
  const [state, setState] = useState<WindowMaxState>(INITIAL);

  useEffect(() => {
    if (!isDesktop || !window.electron) return;
    window.electron.windowControls.maxState().then(setState);
    return window.electron.windowControls.onMaxStateChange(setState);
  }, []);

  if (!isDesktop) return null;

  const controls = window.electron?.windowControls;
  const restoreable = state.maximized || state.fullscreen;

  return (
    <div className="fixed top-0 left-0 right-0 h-10 z-[60] flex items-stretch select-none border-b border-[var(--border)] bg-[var(--bg-2-glass)] backdrop-blur-xl" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <div className="flex items-center px-3 gap-2 text-[var(--text-2)] text-xs">
        <span className="w-4 h-4 rounded-lg bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] inline-block shadow-[0_0_12px_rgba(129,90,246,0.65)]" />
        <span className="font-semibold tracking-wide text-[13px] text-[var(--text)]">HelpYou</span>
      </div>

      <div className="flex-1" onDoubleClick={() => controls?.toggleMaximize().then((s) => setState((p) => ({ ...p, ...s })))} />

      <div className="flex items-stretch" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <button
          aria-label={t('Minimalkan')}
          onClick={() => controls?.minimize()}
          className="w-11 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--overlay-2)] transition-colors"
        >
          <WindowIcon d={MINIMIZE} />
        </button>
        <button
          aria-label={restoreable ? t('Pulihkan jendela') : t('Maksimalkan jendela')}
          onClick={() => controls?.toggleMaximize().then((s) => setState((p) => ({ ...p, ...s })))}
          className={`w-11 flex items-center justify-center transition-colors ${restoreable ? 'text-[var(--accent-strong)] hover:bg-[var(--accent-soft-2)]' : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--overlay-2)]'}`}
        >
          <WindowIcon d={restoreable ? RESTORE : MAXIMIZE} />
        </button>
        <button
          aria-label={state.fullscreen ? t('Keluar dari layar penuh') : t('Layar penuh')}
          onClick={() => controls?.toggleFullscreen().then((s) => setState((p) => ({ ...p, ...s })))}
          className={`w-11 flex items-center justify-center transition-colors ${state.fullscreen ? 'text-[var(--accent-strong)] hover:bg-[var(--accent-soft-2)]' : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--overlay-2)]'}`}
        >
          <WindowIcon d={state.fullscreen ? EXIT_FULLSCREEN : ENTER_FULLSCREEN} />
        </button>
        <button
          aria-label={t('Tutup')}
          onClick={() => controls?.close()}
          className="w-11 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] hover:bg-red-500/90 transition-colors"
        >
          <WindowIcon d={CLOSE} />
        </button>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { isDesktop } from '@/lib/platform';
import type { WindowMaxState } from '@/lib/platform';

function WindowIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 10 10" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const INITIAL: WindowMaxState = { maximized: false, fullscreen: false };

export default function TitleBar() {
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
    <div className="fixed top-0 left-0 right-0 h-10 z-[60] flex items-stretch select-none border-b border-white/10 bg-[#0a0a14]/85 backdrop-blur-xl" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <div className="flex items-center px-3 gap-2 text-zinc-400 text-xs">
        <span className="w-3.5 h-3.5 rounded-[5px] bg-gradient-to-br from-indigo-500 to-fuchsia-500 inline-block shadow-[0_0_10px_rgba(129,90,246,.6)]" />
        <span className="font-medium tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-zinc-200 to-zinc-400">File Organizer</span>
      </div>

      <div className="flex-1" onDoubleClick={() => controls?.toggleMaximize().then((s) => setState((p) => ({ ...p, ...s })))} />

      <div className="flex items-stretch" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <button
          aria-label="Minimalkan"
          onClick={() => controls?.minimize()}
          className="w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-indigo-500/25 transition-colors"
        >
          <WindowIcon d="M1 5h8" />
        </button>
        <button
          aria-label={restoreable ? 'Pulihkan jendela' : 'Maksimalkan jendela'}
          onClick={() => controls?.toggleMaximize().then((s) => setState((p) => ({ ...p, ...s })))}
          className="w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-indigo-500/25 transition-colors"
        >
          {restoreable ? <WindowIcon d="M3 1v6h6M1 3v6M1 1h6" /> : <WindowIcon d="M1 1h8v8H1z" />}
        </button>
        <button
          aria-label={state.fullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'}
          onClick={() => controls?.toggleFullscreen().then((s) => setState((p) => ({ ...p, ...s })))}
          className={`w-11 flex items-center justify-center text-zinc-400 transition-colors ${state.fullscreen ? 'text-indigo-300 hover:bg-indigo-500/25' : 'hover:text-white hover:bg-indigo-500/25'}`}
        >
          {state.fullscreen ? (
            // Exit fullscreen — arrows collapsing toward the center.
            <WindowIcon d="M4 4 1.5 1.5M6 4 8.5 1.5M4 6 1.5 8.5M6 6 8.5 8.5" />
          ) : (
            // Enter fullscreen — arrows expanding to the corners.
            <WindowIcon d="M4 1.5 1.5 4M8.5 1.5 6 4M1.5 6 4 8.5M6 8.5 8.5 6" />
          )}
        </button>
        <button
          aria-label="Tutup"
          onClick={() => controls?.close()}
          className="w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-500/90 transition-colors"
        >
          <WindowIcon d="M1 1l8 8M9 1 1 9" />
        </button>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { isDesktop } from '@/lib/platform';

function WindowIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 10 10" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop || !window.electron) return;
    window.electron.windowControls.isMaximized().then(setMaximized);
    window.electron.windowControls.onMaximizedChange(setMaximized);
  }, []);

  if (!isDesktop) return null;

  const controls = window.electron?.windowControls;

  return (
    <div className="fixed top-0 left-0 right-0 h-10 z-50 flex items-stretch select-none border-b border-white/10 bg-[#0a0a14]/85 backdrop-blur-xl" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <div className="flex items-center px-3 gap-2 text-zinc-400 text-xs">
        <span className="w-3.5 h-3.5 rounded-[5px] bg-gradient-to-br from-indigo-500 to-fuchsia-500 inline-block shadow-[0_0_10px_rgba(129,90,246,.6)]" />
        <span className="font-medium tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-zinc-200 to-zinc-400">File Organizer</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-stretch" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <button
          aria-label="Minimalkan"
          onClick={() => controls?.minimize()}
          className="w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-indigo-500/25 transition-colors"
        >
          <WindowIcon d="M1 5h8" />
        </button>
        <button
          aria-label={maximized ? 'Pulihkan' : 'Maksimalkan'}
          onClick={() => controls?.toggleMaximize().then(setMaximized)}
          className="w-11 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-indigo-500/25 transition-colors"
        >
          {maximized ? <WindowIcon d="M3 1v6h6M1 3v6M1 1h6" /> : <WindowIcon d="M1 1h8v8H1z" />}
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
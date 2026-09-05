import { useState } from 'react';
import Icon from './Icon';
import Logo from './Logo';
import { ACTIVE_TOOLS, type ToolId } from '../lib/tools';
import ThemePicker from './ThemePicker';

const VERSION = '1.0.27';

interface SidebarProps {
  current: string;
  onOpen: (tool: ToolId) => void;
  onHome: () => void;
}

export default function Sidebar({ current, onOpen, onHome }: SidebarProps) {
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <aside className="relative z-40 flex flex-col shrink-0 w-[76px] lg:w-60 border-r border-[var(--border)] bg-[var(--bg-2-glass)] backdrop-blur-xl transition-[width] duration-200">
      {/* Brand */}
      <button onClick={onHome} className="flex items-center gap-3 h-16 px-3 lg:px-4 group shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
        <div className="relative shrink-0 lg:ml-0.5">
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--accent)]/60 to-[var(--accent-2)]/60 blur-lg opacity-70 group-hover:opacity-100 transition-opacity" />
          <span className="relative w-9 h-9 rounded-xl grid place-items-center overflow-hidden bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] shadow-lg shadow-[0_10px_30px_-10px_var(--accent-glow)] group-hover:scale-105 transition-transform">
            <Logo className="w-full h-full" />
          </span>
        </div>
        <div className="hidden lg:block leading-tight text-left">
          <div className="font-bold text-[15px] tracking-tight text-[var(--text)]">HelpYou</div>
          <div className="text-[11px] text-[var(--text-3)]">Suite Tools Lokal</div>
        </div>
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-3 lg:px-3 pt-3 space-y-1.5">
        <div className="hidden lg:block eyebrow px-3 pb-2.5">Tools</div>

        <button
          onClick={onHome}
          title="Beranda"
          className={`nav-item ${current === 'home' ? 'active' : ''}`}
        >
          <span className="nav-icon">
            <Icon name="home" className="w-4 h-4" />
          </span>
          <span className="hidden lg:inline">Beranda</span>
        </button>

        {ACTIVE_TOOLS.map((t) => (
          <button
            key={t.tool}
            onClick={() => onOpen(t.tool)}
            title={t.short}
            className={`nav-item ${current === t.tool ? 'active' : ''}`}
          >
            <span className="nav-icon">
              <Icon name={t.icon} className="w-4 h-4" />
            </span>
            <span className="hidden lg:inline truncate">{t.short}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-3 lg:px-4 py-4 border-t border-[var(--border)]">
        <button
          onClick={() => setThemeOpen(true)}
          title="Ganti Tema"
          aria-label="Ganti Tema"
          className="w-full flex items-center gap-2.5 lg:gap-3 h-11 rounded-xl px-3 text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--overlay)] hover:text-[var(--text)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] text-white shadow-sm">
            <Icon name="palette" className="w-4 h-4" />
          </span>
          <span className="hidden lg:inline">Ganti Tema</span>
        </button>
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-[var(--text-3)] mt-3">
          <Icon name="shield" className="w-3.5 h-3.5 text-[var(--accent-strong)]" />
          100% lokal · tanpa telemetri
        </div>
        <div className="hidden lg:block mt-1 text-[11px] text-[var(--text-3)]">
          Brankas terenkripsi · data tidak keluar perangkat
        </div>
        <div className="mt-2.5 flex lg:hidden justify-center" title={`Versi ${VERSION}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
        </div>
        <div className="hidden lg:inline-flex chip mt-2.5">{VERSION}</div>
      </div>

      <ThemePicker open={themeOpen} onClose={() => setThemeOpen(false)} />
    </aside>
  );
}
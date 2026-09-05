import Icon from './Icon';
import { ACTIVE_TOOLS, type ToolId } from '../lib/tools';

const VERSION = '1.0.23';

interface SidebarProps {
  current: string;
  onOpen: (tool: ToolId) => void;
  onHome: () => void;
}

export default function Sidebar({ current, onOpen, onHome }: SidebarProps) {
  const expanded = true; // responsive collapse is handled purely by CSS below
  void expanded;

  return (
    <aside
      className="relative z-40 flex flex-col shrink-0 w-[76px] lg:w-60 border-r bg-[#0a0c16]/70 backdrop-blur-xl transition-[width] duration-200"
    >
      {/* Brand */}
      <button onClick={onHome} className="flex items-center gap-3 h-16 px-3 lg:px-4 group shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50">
        <div className="relative shrink-0 lg:ml-0.5">
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/60 to-fuchsia-500/60 blur-lg opacity-70 group-hover:opacity-100 transition-opacity" />
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
            <Icon name="sparkle" className="w-5 h-5" />
          </div>
        </div>
        <div className="hidden lg:block leading-tight text-left">
          <div className="font-bold text-[15px] tracking-tight text-white">HelpYou</div>
          <div className="text-[11px] text-gray-500">Suite Tools Lokal</div>
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
      <div className="shrink-0 px-3 lg:px-4 py-4 border-t border-white/[0.06]">
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-gray-500">
          <Icon name="shield" className="w-3.5 h-3.5 text-indigo-400/70" />
          100% lokal · tanpa telemetri
        </div>
        <div className="hidden lg:block mt-1.5 text-[11px] text-gray-600">
          Brankas terenkripsi · data tidak keluar perangkat
        </div>
        <div className="mt-2.5 flex lg:hidden justify-center" title={`Versi ${VERSION}`}>
          <span className="hidden" aria-hidden="true" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/70" aria-hidden="true" />
        </div>
        <div className="hidden lg:inline-flex chip bg-white/[0.04] text-gray-500 mt-2.5">{VERSION}</div>
      </div>
    </aside>
  );
}
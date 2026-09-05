import { useState } from 'react';
import HomeView, { type ToolId } from './pages/HomeView';
import OrganizerTool from './pages/OrganizerTool';
import UninstallerView from './pages/UninstallerView';
import Icon, { type IconName } from './components/Icon';
import TitleBar from './components/TitleBar';
import UpdateNotifier from './components/UpdateNotifier';
import { isDesktop } from './lib/platform';

type Tool = 'home' | ToolId;

const TOOLS: { id: Tool; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Beranda' },
  { id: 'organizer', icon: 'organize', label: 'File Organizer' },
  { id: 'uninstaller', icon: 'package', label: 'Uninstaller' },
];

export default function App() {
  const [tool, setTool] = useState<Tool>('home');

  return (
    <div className={`min-h-screen flex flex-col ${isDesktop ? 'pt-10' : ''}`}>
      <TitleBar />
      <UpdateNotifier />
      <Header tool={tool} onTool={setTool} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {tool === 'home' && <HomeView onOpen={setTool} />}
        {tool === 'organizer' && <OrganizerTool />}
        {tool === 'uninstaller' && <UninstallerView onBack={() => setTool('home')} />}
      </main>
      <Footer />
    </div>
  );
}

function Header({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <header className="sticky z-30 border-b border-white/10 bg-[#07070e]/75 backdrop-blur-xl" style={{ top: isDesktop ? 40 : 0 }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        {/* Brand */}
        <button className="flex items-center gap-3 group" onClick={() => onTool('home')} title="Ke Beranda">
          <div className="relative">
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/60 to-fuchsia-500/60 blur-lg" />
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <Icon name="sparkle" className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#07070e]" title="Berjalan lokal" />
          </div>
          <div className="leading-tight text-left">
            <div className="font-bold text-[15px] tracking-tight text-white">File Organizer</div>
            <div className="text-[11px] text-gray-500">Studio File Lokal</div>
          </div>
        </button>

        {/* Tool nav */}
        <nav className="ml-2 sm:ml-6 flex items-center gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTool(t.id)}
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tool === t.id
                  ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/25'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon name={t.icon} className="w-4 h-4" />
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <span className="chip bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hidden sm:inline-flex">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping-slow" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
            </span>
            100% Lokal
          </span>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <Icon name="shield" className="w-3.5 h-3.5" />
          File Organizer — berjalan 100% lokal. Data tidak pernah meninggalkan perangkat Anda.
        </span>
        <span className="hidden sm:block">Versi 1.0.7</span>
      </div>
    </footer>
  );
}
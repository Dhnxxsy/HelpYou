import { lazy, Suspense, useState } from 'react';
import HomeView, { type ToolId } from './pages/HomeView';
import Icon from './components/Icon';
import TitleBar from './components/TitleBar';
import UpdateNotifier from './components/UpdateNotifier';
import { isDesktop } from './lib/platform';

const OrganizerTool = lazy(() => import('./pages/OrganizerTool'));
const UninstallerView = lazy(() => import('./pages/UninstallerView'));
const JunkCleanerView = lazy(() => import('./pages/JunkCleanerView'));
const DiskAnalyzerView = lazy(() => import('./pages/DiskAnalyzerView'));
const StartupToolView = lazy(() => import('./pages/StartupToolView'));
const SystemInfoView = lazy(() => import('./pages/SystemInfoView'));
const RenameToolView = lazy(() => import('./pages/RenameToolView'));
const RecycleBinView = lazy(() => import('./pages/RecycleBinView'));
const ProcessManagerView = lazy(() => import('./pages/ProcessManagerView'));
const NetworkToolsView = lazy(() => import('./pages/NetworkToolsView'));
const NotepadView = lazy(() => import('./pages/NotepadView'));

type Tool = 'home' | ToolId;

export default function App() {
  const [tool, setTool] = useState<Tool>('home');

  return (
    <div className={`min-h-screen flex flex-col ${isDesktop ? 'pt-10' : ''}`}>
      <TitleBar />
      <UpdateNotifier />
      <Header onTool={setTool} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {tool === 'home' ? (
          <HomeView onOpen={setTool} />
        ) : (
          <Suspense fallback={<ToolFallback />}>
            {tool === 'organizer' && <OrganizerTool />}
            {tool === 'uninstaller' && <UninstallerView onBack={() => setTool('home')} />}
            {tool === 'junk' && <JunkCleanerView onBack={() => setTool('home')} />}
            {tool === 'disk' && <DiskAnalyzerView onBack={() => setTool('home')} />}
            {tool === 'startup' && <StartupToolView onBack={() => setTool('home')} />}
            {tool === 'system' && <SystemInfoView onBack={() => setTool('home')} />}
            {tool === 'rename' && <RenameToolView onBack={() => setTool('home')} />}
            {tool === 'recycle' && <RecycleBinView onBack={() => setTool('home')} />}
            {tool === 'process' && <ProcessManagerView onBack={() => setTool('home')} />}
            {tool === 'network' && <NetworkToolsView onBack={() => setTool('home')} />}
            {tool === 'notepad' && <NotepadView onBack={() => setTool('home')} />}
          </Suspense>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Header({ onTool }: { onTool: (t: Tool) => void }) {
  return (
    <header
      className="sticky z-30 border-b border-white/10 bg-[#07070e]/75 backdrop-blur-xl"
      style={{ top: isDesktop ? 40 : 0 }}
    >
      <div className="h-px w-full bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" aria-hidden="true" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        {/* Brand */}
        <button className="flex items-center gap-3 group" onClick={() => onTool('home')} title="Ke Beranda">
          <div className="relative">
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/60 to-fuchsia-500/60 blur-lg transition-opacity group-hover:opacity-100 opacity-80" />
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <Icon name="sparkle" className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#07070e]" title="Berjalan lokal" />
          </div>
          <div className="leading-tight text-left">
            <div className="font-bold text-[15px] tracking-tight text-white">HelpYou</div>
            <div className="text-[11px] text-gray-500">Suite Tools Lokal</div>
          </div>
        </button>
      </div>
    </header>
  );
}

function ToolFallback() {
  return (
    <div className="w-full py-20 grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-400/30 border-t-indigo-400 animate-spin" />
        <p className="text-sm text-gray-500">Menyiapkan tools…</p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <Icon name="shield" className="w-3.5 h-3.5 text-indigo-400/70" />
          HelpYou berjalan 100% lokal. Data tidak pernah meninggalkan perangkat Anda.
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-1.5">
            <Icon name="sparkle" className="w-3.5 h-3.5 text-fuchsia-400/70" />
            Tanpa iklan, tanpa telemetri
          </span>
          <span className="chip bg-white/[0.04] text-gray-500">Versi 1.0.20</span>
        </span>
      </div>
    </footer>
  );
}
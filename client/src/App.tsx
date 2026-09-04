import { useState } from 'react';
import OrganizeView from './pages/OrganizeView';
import HistoryView from './pages/HistoryView';
import Icon from './components/Icon';
import TitleBar from './components/TitleBar';
import UpdateNotifier from './components/UpdateNotifier';
import { isDesktop } from './lib/platform';

type Tab = 'organize' | 'history';

export default function App() {
  const [tab, setTab] = useState<Tab>('organize');

  return (
    <div className={`min-h-screen flex flex-col ${isDesktop ? 'pt-10' : ''}`}>
      <TitleBar />
      <UpdateNotifier />
      <Header tab={tab} onTab={setTab} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {tab === 'organize' ? <OrganizeView /> : <HistoryView />}
      </main>
      <Footer />
    </div>
  );
}

function Header({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <header className="sticky z-30 border-b border-white/10 bg-[#07070e]/75 backdrop-blur-xl" style={{ top: isDesktop ? 40 : 0 }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white shadow-lg shadow-indigo-500/30">
              <Icon name="sparkle" className="w-5 h-5" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#07070e]" title="Berjalan lokal" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[15px] tracking-tight text-white">File Organizer</div>
            <div className="text-[11px] text-gray-500">Organizer File Lokal</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="ml-4 sm:ml-8 flex items-center gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-1">
          <TabBtn active={tab === 'organize'} onClick={() => onTab('organize')} icon="organize" label="Rapihkan" />
          <TabBtn active={tab === 'history'} onClick={() => onTab('history')} icon="clock" label="Riwayat" />
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <span className="chip bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
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

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: 'organize' | 'clock'; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/25'
          : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
      }`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
    </button>
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
        <span className="hidden sm:block">Versi 1.0.0</span>
      </div>
    </footer>
  );
}
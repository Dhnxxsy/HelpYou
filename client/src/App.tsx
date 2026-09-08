import { lazy, Suspense, useEffect, useState } from 'react';
import HomeView from './pages/HomeView';
import TitleBar from './components/TitleBar';
import UpdateNotifier from './components/UpdateNotifier';
import Sidebar from './components/Sidebar';
import { isDesktop } from './lib/platform';
import { VaultMasterProvider, useVaultMaster, MASTER_CHEAT } from './lib/vaultMaster';
import { useI18n } from './lib/i18n';
import type { ToolId } from './lib/tools';

const OrganizerTool = lazy(() => import('./pages/OrganizerTool'));
const UninstallerView = lazy(() => import('./pages/UninstallerView'));
const JunkCleanerView = lazy(() => import('./pages/JunkCleanerView'));
const DiskAnalyzerView = lazy(() => import('./pages/DiskAnalyzerView'));
const StartupToolView = lazy(() => import('./pages/StartupToolView'));
const SystemInfoView = lazy(() => import('./pages/SystemInfoView'));
const RenameToolView = lazy(() => import('./pages/RenameToolView'));
const RecycleBinView = lazy(() => import('./pages/RecycleBinView'));
const NotepadView = lazy(() => import('./pages/NotepadView'));
const VaultView = lazy(() => import('./pages/VaultView'));
const BrowserView = lazy(() => import('./pages/BrowserView'));
const PaintView = lazy(() => import('./pages/PaintView'));
const MirrorView = lazy(() => import('./pages/MirrorView'));
const AppsCenterView = lazy(() => import('./pages/AppsCenterView'));
const ScreenCaptureView = lazy(() => import('./pages/ScreenCaptureView'));
const OverlayView = lazy(() => import('./overlay/OverlayView'));

type Tool = 'home' | ToolId;

export default function App() {
  const [tool, setTool] = useState<Tool>('home');
  const [isOverlay] = useState(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('overlay') === '1'
      );
    } catch {
      return false;
    }
  });

  if (isOverlay) {
    return (
      <Suspense fallback={<div className="ov-center h-screen bg-transparent"><div className="ov-spin" /></div>}>
        <OverlayView />
      </Suspense>
    );
  }

  return (
    <VaultMasterProvider>
      <GlobalCheatListener />
      <div className={`min-h-screen h-screen flex flex-col ${isDesktop ? 'pt-10' : ''}`}>
        <TitleBar />
        <div className="flex-1 flex min-h-0">
          <Sidebar current={tool} onOpen={setTool} onHome={() => setTool('home')} />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <UpdateNotifier />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  {tool === 'notepad' && <NotepadView onBack={() => setTool('home')} />}
                  {tool === 'vault' && <VaultView onBack={() => setTool('home')} />}
                  {tool === 'browser' && <BrowserView onBack={() => setTool('home')} />}
                  {tool === 'paint' && <PaintView onBack={() => setTool('home')} />}
                  {tool === 'mirror' && <MirrorView onBack={() => setTool('home')} />}
                  {tool === 'apps' && <AppsCenterView onBack={() => setTool('home')} />}
                  {tool === 'capture' && <ScreenCaptureView onBack={() => setTool('home')} />}
                </Suspense>
              )}
            </div>
          </main>
        </div>
      </div>
    </VaultMasterProvider>
  );
}

/** Global cheat-code detector: typing "bukadong" anywhere (except editable fields) unlocks the vault. */
function GlobalCheatListener() {
  const { activate } = useVaultMaster();
  useEffect(() => {
    if (!MASTER_CHEAT) return;
    let buf = '';
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName || '';
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      const k = e.key.length === 1 ? e.key : '';
      if (!k) return;
      buf = (buf + k.toLowerCase()).slice(-MASTER_CHEAT.length);
      if (buf === MASTER_CHEAT) {
        buf = '';
        activate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activate]);
  return null;
}

function ToolFallback() {
  const { t } = useI18n();
  return (
    <div className="w-full py-24 grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
        <p className="text-sm text-[var(--text-3)]">{t('Menyiapkan tools…')}</p>
      </div>
    </div>
  );
}
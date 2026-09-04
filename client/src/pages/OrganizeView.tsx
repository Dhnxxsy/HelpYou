import { useEffect, useMemo, useRef, useState } from 'react';
import FolderPicker from '../components/FolderPicker';
import DuplicatesPanel from '../components/DuplicatesPanel';
import EmptyFoldersPanel from '../components/EmptyFoldersPanel';
import LargestFilesPanel from '../components/LargestFilesPanel';
import Stepper, { type Step } from '../components/Stepper';
import Icon, { type IconName } from '../components/Icon';
import RulesPanel from '../components/RulesPanel';
import VirtualList from '../components/VirtualList';
import ConfirmDialog from '../components/ConfirmDialog';
import { CATEGORY_META } from '../lib/categories';
import { formatBytes, formatDuration } from '../lib/format';
import { downloadCSV } from '../lib/csv';
import type { FileCategory, SizeBand, SortRule } from '@shared/types';

interface ScanFileLite {
  path: string;
  name: string;
  size: number;
  category: FileCategory;
  sizeBand: SizeBand;
}
interface Move {
  path: string;
  dest: string;
  ruleId?: string;
  customFolder?: string;
}
interface ScanResult {
  root: string;
  summary: { totalFiles: number; totalFolders: number; totalSize: number; byCategory: Record<string, number> };
  files: ScanFileLite[];
  grouped: Record<string, ScanFileLite[]>;
  moves: Move[];
  organizeFolder: string;
  duplicateGroups: { id: string; size: number; hash: string; files: ScanFileLite[]; reclaimable: number }[];
  emptyFolders: string[];
  postMoveEmptyFolders: string[];
  largestFiles: ScanFileLite[];
}
interface ScanSettings {
  lastRoot?: string | null;
  extraIgnoreDirs: string[];
  maxDepth?: number | null;
  minSizeKB?: number | null;
  detectDuplicates: boolean;
  rules: SortRule[];
}
interface Flash { ok: boolean; text: string }

type Stage = 'pick' | 'scanning' | 'preview' | 'applying' | 'done';
type PreviewTab = 'plan' | 'duplicates' | 'empty' | 'largest';

const EMPTY_SETTINGS: ScanSettings = {
  lastRoot: null,
  extraIgnoreDirs: [],
  maxDepth: null,
  minSizeKB: null,
  detectDuplicates: true,
  rules: [],
};

const CUSTOM_COLORS = ['#818cf8', '#e879f9', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a3e635', '#94a3b8'];

const WIZARD_STEPS: Step[] = [
  { label: 'Pilih Folder', icon: 'folder' },
  { label: 'Analisis', icon: 'scan' },
  { label: 'Rencana', icon: 'organize' },
  { label: 'Selesai', icon: 'check' },
];

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'organize', title: 'Sortir otomatis', desc: 'File dikelompokkan ke _TerSortir berdasarkan jenis & ukuran.' },
  { icon: 'duplicate', title: 'Duplikat & folder kosong', desc: 'Temukan file kembar dan folder menganggur, bersihkan dengan aman.' },
  { icon: 'undo', title: 'Selalu bisa di-Undo', desc: 'Setiap pemindahan tercatat di Riwayat dan bisa dikembalikan.' },
];

export default function OrganizeView() {
  const [folder, setFolder] = useState('');
  const [stage, setStage] = useState<Stage>('pick');
  const [scanMsg, setScanMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<{ moved: number; failed: number; totalBytes: number } | null>(null);
  const [tab, setTab] = useState<PreviewTab>('plan');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<ScanSettings>(EMPTY_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [applyConfirm, setApplyConfirm] = useState(false);

  const timerRef = useRef<any>(null);
  const settingsTimer = useRef<any>(null);
  const jobIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (stage !== 'scanning') return;
    const t = setInterval(() => {
      if (startTimeRef.current) setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        setSettings({ ...EMPTY_SETTINGS, ...data });
        if (data?.lastRoot) setFolder(data.lastRoot);
      } catch { /* ignore */ }
    })();
    return () => clearInterval(timerRef.current);
  }, []);

  function updateSettings(patch: Partial<ScanSettings>) {
    setSettings(prev => {
      const merged = { ...prev, ...patch };
      clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(() => {
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        }).catch(() => {});
      }, 500);
      return merged;
    });
  }

  async function startScan() {
    if (!folder.trim()) { setError('Pilih folder terlebih dahulu.'); return; }
    setError(null);
    setFlash(null);
    setResult(null);
    setApplyState(null);
    setSelectedKey(null);
    setSearch('');
    setTab('plan');
    setStage('scanning');
    setProgress(0);
    setScanMsg('');
    startTimeRef.current = Date.now();
    setElapsed(0);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: folder,
          excludeDirs: settings.extraIgnoreDirs,
          maxDepth: settings.maxDepth || undefined,
          minSize: settings.minSizeKB && settings.minSizeKB > 0 ? settings.minSizeKB * 1024 : undefined,
          detectDuplicates: settings.detectDuplicates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memulai scan');
      jobIdRef.current = data.jobId;
      pollScan(data.jobId);
    } catch (e: any) {
      setError(e.message);
      setStage('pick');
    }
  }

  function pollScan(jobId: string) {
    clearInterval(timerRef.current);
    let failures = 0;
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/scan/' + jobId);
        if (!res.ok) throw new Error('Status scan gagal dimuat');
        const data = await res.json();
        failures = 0;
        if (data.status === 'running') {
          setProgress(data.progress || 0);
          setScanMsg(data.message || 'Memindai...');
        } else if (data.status === 'done') {
          clearInterval(timerRef.current);
          setProgress(data.result.summary.totalFiles);
          setResult(data.result);
          setStage('preview');
        } else if (data.status === 'cancelled') {
          clearInterval(timerRef.current);
          setStage('pick');
          setFlash({ ok: false, text: 'Scan dibatalkan.' });
        } else if (data.status === 'error') {
          clearInterval(timerRef.current);
          setError(data.error || 'Gagal scan');
          setStage('pick');
        }
      } catch {
        failures++;
        if (failures >= 8) {
          clearInterval(timerRef.current);
          setError('Gagal terhubung ke server selama scan. Coba mulai analisis dari awal.');
          setStage('pick');
        }
      }
    }, 300);
  }

  async function cancelScan() {
    if (!jobIdRef.current) return;
    try { await fetch('/api/scan/' + jobIdRef.current + '/cancel', { method: 'POST' }); } catch { /* ignore */ }
    clearInterval(timerRef.current);
    setStage('pick');
    setFlash({ ok: false, text: 'Scan dibatalkan.' });
  }

  async function apply() {
    if (!result) return;
    setStage('applying');
    setError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: result.root, moves: result.moves.map(m => ({ from: m.path, to: m.dest })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');
      setApplyState({ moved: data.moved, failed: data.failed, totalBytes: data.totalBytes });
      setStage('done');
    } catch (e: any) {
      setError(e.message);
      setStage('preview');
    }
  }

  function reset() {
    clearInterval(timerRef.current);
    setResult(null);
    setApplyState(null);
    setStage('pick');
    setProgress(0);
    setScanMsg('');
    startTimeRef.current = null;
    setElapsed(0);
    setFlash(null);
    setError(null);
    setSearch('');
  }

  async function openFolder(p: string) {
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }),
      });
    } catch { /* ignore */ }
  }

  function savePlanCSV() {
    if (!result) return;
    const shown = filteredMoves;
    downloadCSV(
      'file-organizer-rencana.csv',
      ['Kategori', 'Ukuran', 'Nama File', 'File Size', 'Dari', 'Ke'],
      shown.map(m => {
        const f = fileByPath.get(m.path);
        const d = m.dest.slice(result.organizeFolder.length + 1).split('\\');
        return [d[0] || '', d[1] || '', f?.name || baseName(m.path), f?.size ?? 0, m.path, m.dest];
      })
    );
  }

  // ---- derived data ----
  const fileByPath = useMemo(
    () => (result ? new Map(result.files.map(f => [f.path, f])) : new Map()),
    [result]
  );

  /** Group key of a move: custom rule folder, or the default file category. */
  const moveKey = (m: Move): string => m.customFolder || fileByPath.get(m.path)?.category || 'other';

  const catStats = useMemo(() => {
    const m = new Map<string, { n: number; size: number }>();
    if (!result) return m;
    for (const mv of result.moves) {
      const f = fileByPath.get(mv.path);
      if (!f) continue;
      const key = mv.customFolder || f.category;
      const c = m.get(key) || { n: 0, size: 0 };
      c.n++; c.size += f.size;
      m.set(key, c);
    }
    return m;
  }, [result, fileByPath]);

  const customCount = useMemo(() => result?.moves.filter(m => m.customFolder).length ?? 0, [result]);

  const filteredMoves = useMemo(() => {
    if (!result) return [];
    let list = result.moves;
    if (selectedKey) list = list.filter(m => moveKey(m) === selectedKey);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => {
        const f = fileByPath.get(m.path);
        return (f?.name || m.path).toLowerCase().includes(q) || m.dest.toLowerCase().includes(q);
      });
    }
    return list;
  }, [result, selectedKey, search, fileByPath]);

  const dupCount = result?.duplicateGroups.length ?? 0;
  const emptyCount = result?.emptyFolders.length ?? 0;
  const postEmptyCount = result?.postMoveEmptyFolders.length ?? 0;

  const wizardStep = stage === 'pick' ? 1 : stage === 'scanning' ? 2 : stage === 'preview' || stage === 'applying' ? 3 : 4;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Organizer Folder Lokal</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-gradient">Rapihkan File-mu</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xl">
            Pilih folder, tools mengelompokkan file jadi rapi otomatis. Dilengkapi deteksi duplikat, folder kosong, dan laporan file terbesar.
          </p>
        </div>
      </div>

      {/* Wizard */}
      <div className="card p-4 sm:p-5">
        <Stepper steps={WIZARD_STEPS} current={wizardStep} />
      </div>

      {flash && (
        <FlashBanner flash={flash} onClose={() => setFlash(null)} />
      )}

      {/* ============ STEP 1: PICK ============ */}
      {stage === 'pick' && (
        <div className="space-y-5 animate-slide-up">
          <div className="grid sm:grid-cols-3 gap-3">
            {FEATURES.map(f => (
              <div key={f.title} className="card card-hover p-4 flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/12 border border-indigo-500/20 grid place-items-center text-indigo-300 shrink-0">
                  <Icon name={f.icon} className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{f.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-5 sm:p-6 animate-slide-up">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white grid place-items-center text-xs font-bold">1</span>
                  <h2 className="text-lg font-semibold text-white">Pilih folder yang ingin dirapikan</h2>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 ml-9">
                  Bisa berupa drive (C:) atau subfolder seperti <code className="text-indigo-300/90">Downloads</code>.
                </p>
              </div>
              <button
                className="btn-ghost !p-2 text-gray-500"
                onClick={() => setSettingsOpen(o => !o)}
                title="Pengaturan scan"
              >
                <Icon name="settings" className={`w-[18px] h-[18px] transition-transform duration-300 ${settingsOpen ? 'rotate-90' : ''}`} />
              </button>
            </div>

            <FolderPicker value={folder} onChange={setFolder} />

            {settingsOpen && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mt-5 animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="eyebrow">Pengaturan Scan</div>
                  <span className="chip bg-white/[0.05] text-gray-400 border border-white/10 text-[10px]">tersimpan otomatis</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Lewati folder (pisah koma)</label>
                    <input
                      className="input"
                      placeholder="cth: video_bak, cache, draft"
                      value={settings.extraIgnoreDirs.join(', ')}
                      onChange={e => updateSettings({ extraIgnoreDirs: e.target.value.split(/[,;]/).map(s => s.trim()).filter(Boolean) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Kedalaman maksimum</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      placeholder="∞ (semua)"
                      value={settings.maxDepth ?? ''}
                      onChange={e => updateSettings({ maxDepth: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Min. ukuran file (KB)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      placeholder="0 (semua)"
                      value={settings.minSizeKB ?? ''}
                      onChange={e => updateSettings({ minSizeKB: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 mt-4 text-xs text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-indigo-500 w-4 h-4"
                    checked={settings.detectDuplicates}
                    onChange={e => updateSettings({ detectDuplicates: e.target.checked })}
                  />
                  Deteksi file duplikat (berdasarkan isi file)
                </label>
                <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-gray-400">
                    <span className="font-semibold text-gray-200">Aturan Sortir Kustom</span>
                    <span className="ml-2 chip bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                      {settings.rules.filter(r => r.enabled).length} aktif
                    </span>
                    <p className="text-[11px] text-gray-500 mt-1">Folder sendiri untuk kata kunci, atau lewati file tertentu. Berlaku saat scan berikutnya.</p>
                  </div>
                  <button className="btn-secondary !py-2 !px-3.5 text-xs" onClick={() => setRulesOpen(true)}>
                    <Icon name="settings" className="w-3.5 h-3.5" /> Kelola Aturan
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-6 pt-5 border-t border-white/10">
              <button className="btn-primary !py-3 !px-6" onClick={startScan} disabled={!folder}>
                <Icon name="scan" className="w-4 h-4" />
                Mulai Analisis Folder
              </button>
              {folder && <p className="text-xs text-gray-500">Folder terpilih: <span className="text-gray-300">{folder}</span></p>}
            </div>
            {error && <p className="mt-4 text-sm text-rose-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" />{error}</p>}
          </div>
        </div>
      )}

      {/* ============ STEP 2: SCANNING ============ */}
      {stage === 'scanning' && (
        <div className="card p-8 sm:p-10 flex flex-col items-center gap-6 animate-scale-in">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-4 border-indigo-500/20 border-t-indigo-400 animate-spin" />
            <span className="absolute inset-0 m-auto w-full h-full rounded-full border border-indigo-400/10 animate-ping-slow" />
          </div>
          <div className="text-center">
            <div className="font-semibold text-white">Menganalisis folder...</div>
            <div className="text-xs text-gray-400 mt-1.5 max-w-md truncate">{scanMsg || 'Membaca isi folder'}</div>
          </div>
          <div className="w-full max-w-md space-y-2.5">
            <div className="flex items-center gap-6 justify-between text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <Icon name="folder" className="w-3.5 h-3.5 text-indigo-400" />
                File dipindai
              </span>
              <span className="tabular-nums text-white/90 text-sm font-semibold">{progress.toLocaleString('id-ID')}</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 animate-indeterminate" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="truncate">Jumlah dan statistik dihitung saat berjalan</span>
              <span className="tabular-nums shrink-0 ml-2">{formatDuration(elapsed * 1000)}</span>
            </div>
          </div>
          <button className="btn-secondary text-sm" onClick={cancelScan}>
            <Icon name="stop" className="w-4 h-4" /> Batal Scan
          </button>
        </div>
      )}

      {/* ============ STEP 3: PREVIEW ============ */}
      {stage === 'preview' && result && (
        <div className="space-y-5 animate-slide-up">
          {error && <p className="text-sm text-rose-400"><Icon name="alert" className="w-4 h-4 inline mr-1" />{error}</p>}

          <PreviewSummary result={result} onOpen={() => openFolder(result.root)} />

          <div className="card p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white grid place-items-center text-xs font-bold">3</span>
                  <h2 className="text-lg font-semibold text-white">Tinjau rencana &amp; pindahkan file</h2>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 ml-9">
                  Semua file menuju <code className="text-indigo-300/90">{result.organizeFolder}</code> → <b>Jenis</b> → <b>Ukuran</b>
                  {customCount > 0 && <> · <span className="text-indigo-300">✨ {customCount} file mengikuti aturan kustom</span></>}.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap ml-9 lg:ml-0">
                <button className="btn-secondary !py-2 !px-3.5 text-xs" onClick={savePlanCSV} disabled={filteredMoves.length === 0}>
                  <Icon name="download" className="w-3.5 h-3.5" /> Ekspor CSV
                </button>
              </div>
            </div>

            {/* Category composition */}
            <CategoryBar stats={catStats} onPick={setSelectedKey} selected={selectedKey} />

            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4 mt-6">
              <TabBtn active={tab === 'plan'} onClick={() => setTab('plan')} icon="organize" label="Rencana" count={filteredMoves.length} />
              <TabBtn active={tab === 'duplicates'} onClick={() => setTab('duplicates')} icon="duplicate" label="Duplikat" count={dupCount} tone={dupCount > 0 ? 'amber' : undefined} />
              <TabBtn active={tab === 'empty'} onClick={() => setTab('empty')} icon="emptyBox" label="Folder Kosong" count={emptyCount} sub={postEmptyCount} tone={emptyCount > 0 ? 'indigo' : undefined} />
              <TabBtn active={tab === 'largest'} onClick={() => setTab('largest')} icon="chart" label="File Terbesar" count={result.largestFiles.length} />
            </div>

            {tab === 'plan' && (
              <PlanTab
                result={result}
                fileByPath={fileByPath}
                filteredMoves={filteredMoves}
                search={search}
                setSearch={setSearch}
                selectedKey={selectedKey}
                onClearFilter={() => setSelectedKey(null)}
              />
            )}
            {tab === 'duplicates' && (
              <DuplicatesPanel groups={result.duplicateGroups} root={result.root} onDone={text => setFlash({ ok: !text.startsWith('Gagal'), text })} />
            )}
            {tab === 'empty' && (
              <EmptyFoldersPanel current={result.emptyFolders} postMove={result.postMoveEmptyFolders} root={result.root} onDone={text => setFlash({ ok: !text.startsWith('Gagal'), text })} />
            )}
            {tab === 'largest' && <LargestFilesPanel files={result.largestFiles} root={result.root} />}

            <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-5 border-t border-white/10">
              <button className="btn-primary !py-3" onClick={() => setApplyConfirm(true)} disabled={result.moves.length === 0}>
                Pindahkan {result.moves.length} file <Icon name="arrowRight" className="w-4 h-4" />
              </button>
              <button className="btn-secondary" onClick={reset}>Ulangi / Pilih Folder Lain</button>
            </div>
            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1.5">
              <Icon name="info" className="w-3.5 h-3.5" />
              File akan <b>dipindahkan sungguhan</b> ke <code className="text-indigo-300/80">{result.organizeFolder}</code>. Setiap pemindahan tercatat di tab Riwayat dan bisa di-Undo.
            </p>
          </div>
        </div>
      )}

      {/* ============ STEP 3 (busy): APPLYING ============ */}
      {stage === 'applying' && (
        <div className="card p-10 flex flex-col items-center gap-5 animate-scale-in">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-4 border-fuchsia-500/20 border-t-fuchsia-500 animate-spin" />
            <span className="absolute inset-0 m-auto w-full h-full rounded-full border border-fuchsia-400/10 animate-ping-slow" />
          </div>
          <div className="font-semibold text-white">Menerapkan sortir...</div>
          <div className="text-xs text-gray-400">Memindahkan file ke struktur rapi. Proses ini usahakan jangan ditutup.</div>
        </div>
      )}

      {/* ============ STEP 4: DONE ============ */}
      {stage === 'done' && applyState && result && (
        <div className="card p-10 animate-slide-up flex flex-col items-center text-center">
          <div className="relative mb-5 animate-pop">
          <span className="absolute inset-0 rounded-2xl bg-emerald-500/25 blur-xl" />
          <div className="relative w-16 h-16 rounded-2xl bg-emerald-500/12 border border-emerald-500/30 grid place-items-center">
            <Icon name="check" className="w-9 h-9 text-emerald-300" />
          </div>
        </div>
          <h2 className="text-2xl font-bold text-white">Berhasil dirapikan! 🎉</h2>
          <p className="text-sm text-gray-400 mt-1.5">
            {applyState.moved} file dipindahkan ke <code className="text-indigo-300/90">{result.organizeFolder}</code>
          </p>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-7 w-full max-w-lg">
            <Stat label="Dipindahkan" value={applyState.moved.toLocaleString('id-ID')} accent="#34d399" />
            <Stat label="Total Ukuran" value={formatBytes(applyState.totalBytes)} accent="#60a5fa" />
            <Stat label="Gagal" value={applyState.failed.toLocaleString('id-ID')} accent={applyState.failed > 0 ? '#fb7185' : '#848a94'} />
          </div>

          {applyState.failed > 0 && (
            <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 max-w-lg flex gap-2.5 text-left">
              <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <b>{applyState.failed} file gagal dipindahkan</b>. Kemungkinan file sedang dipakai program lain atau akses ditolak. Cek kembali
                lewat tab <b>Riwayat</b> untuk melihat detail.
              </span>
            </div>
          )}

          {result.postMoveEmptyFolders.length > 0 && (
            <div className="mt-6 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200 max-w-lg flex gap-2.5 text-left">
              <Icon name="emptyBox" className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <b>{result.postMoveEmptyFolders.length} folder sumber</b> kini kosong. Gunakan <b>Scan Ulang</b> lalu buka tab <b>Folder Kosong</b> untuk menghapusnya dengan aman.
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <button className="btn-secondary" onClick={() => openFolder(result.organizeFolder)}>
              <Icon name="external" className="w-4 h-4" /> Buka Folder Hasil
            </button>
            <button className="btn-secondary" onClick={startScan}>
              <Icon name="replay" className="w-4 h-4" /> Scan Ulang
            </button>
            <button className="btn-primary" onClick={reset}>
              Rapihkan Folder Lain
            </button>
          </div>
        </div>
      )}

      <RulesPanel
        open={rulesOpen}
        rules={settings.rules}
        onSave={rules => { updateSettings({ rules }); setRulesOpen(false); }}
        onClose={() => setRulesOpen(false)}
      />

      <ConfirmDialog
        open={applyConfirm}
        tone="primary"
        icon="organize"
        title={`Pindahkan ${result?.moves.length ?? 0} file ke ${result ? shortName(result.organizeFolder) : ''}?`}
        description="File akan dipindahkan sungguhan ke struktur folder yang rapi. Setiap pemindahan tercatat dan bisa di-Undo dari tab Riwayat."
        confirmLabel="Ya, pindahkan"
        onConfirm={() => { setApplyConfirm(false); apply(); }}
        onClose={() => setApplyConfirm(false)}
      />
    </div>
  );
}

function shortName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

/* ---------- sub components ---------- */

function TabBtn({ active, onClick, icon, label, count, sub, tone }: {
  active: boolean; onClick: () => void; icon: IconName; label: string; count: number; sub?: number; tone?: 'amber' | 'indigo';
}) {
  const toneCls = tone === 'amber' ? 'bg-amber-500/15 text-amber-300' : tone === 'indigo' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-white/10 text-gray-400';
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        active ? 'bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
      }`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums ${toneCls}`}>
        {sub !== undefined ? `${count}/${sub}` : count}
      </span>
    </button>
  );
}

function FlashBanner({ flash, onClose }: { flash: Flash; onClose: () => void }) {
  const ok = flash.ok;
  return (
    <div className={`card p-4 border text-sm flex items-center justify-between gap-3 animate-fade-in ${ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/25 bg-amber-500/10 text-amber-200'}`}>
      <span className="flex items-center gap-2.5">
        <Icon name={ok ? 'check' : 'info'} className={`w-4 h-4 ${ok ? 'text-emerald-300' : 'text-amber-300'}`} />
        {flash.text}
      </span>
      <button className="text-gray-400 hover:text-white shrink-0" onClick={onClose} aria-label="Tutup"><Icon name="x" className="w-4 h-4" /></button>
    </div>
  );
}

function PreviewSummary({ result, onOpen }: { result: ScanResult; onOpen: () => void }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <InsightCard icon="folder" label="File ditemukan" value={result.summary.totalFiles.toLocaleString('id-ID')} sub={formatBytes(result.summary.totalSize)} />
      <InsightCard icon="folderOpen" label="Subfolder" value={result.summary.totalFolders.toLocaleString('id-ID')} sub="termasuk isi nested" />
      <InsightCard icon="chart" label="Total ukuran" value={formatBytes(result.summary.totalSize)} sub={`${result.summary.totalFiles.toLocaleString('id-ID')} file`} />
      <InsightCard icon="organize" label="Akan dipindahkan" value={result.moves.length.toLocaleString('id-ID')} sub="ke _TerSortir" highlight onClick={onOpen} />
    </div>
  );
}

function InsightCard({ icon, label, value, sub, accent, highlight, onClick }: {
  icon: IconName; label: string; value: string; sub?: string; accent?: string; highlight?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`card p-4 relative overflow-hidden transition-all duration-200 ${highlight ? 'border-indigo-400/40 bg-indigo-500/10 cursor-pointer hover:bg-indigo-500/15' : 'card-hover'}`}
      title={onClick ? 'Buka folder sumber' : undefined}
    >
      {highlight && <span className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-indigo-500/15 blur-2xl" />}
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg grid place-items-center ${highlight ? 'bg-indigo-500/20 text-indigo-200' : 'bg-white/[0.06] text-gray-400'}`}>
          <Icon name={icon} className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-white" style={{ color: accent ?? undefined }}>{value}</div>
      <div className="text-xs text-gray-400 font-medium">{label}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function groupMeta(key: string, idx: number): { icon: string; label: string; color: string } {
  const known = CATEGORY_META[key as FileCategory];
  if (known) return known;
  return { icon: '✨', label: key, color: CUSTOM_COLORS[idx % CUSTOM_COLORS.length] };
}

function CategoryBar({ stats, onPick, selected }: {
  stats: Map<string, { n: number; size: number }>;
  onPick: (key: string | null) => void;
  selected: string | null;
}) {
  const list = [...stats.entries()].map(([key, v], i) => ({ key, n: v.n, meta: groupMeta(key, i) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const totalN = list.reduce((s, x) => s + x.n, 0);
  if (list.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 mt-2">
      <div className="flex items-center justify-between mb-2.5">
        <div className="eyebrow">Komposisi Folder (akan dipindah)</div>
        <div className="text-[11px] text-gray-500">{totalN.toLocaleString('id-ID')} file</div>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-white/[0.04]">
        {list.map(x => (
          <div key={x.key} title={`${x.meta.label}: ${x.n}`} style={{ width: `${(x.n / totalN) * 100}%`, backgroundColor: x.meta.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {list.map(x => (
          <button
            key={x.key}
            onClick={() => onPick(selected === x.key ? null : x.key)}
            className={`flex items-center gap-1.5 text-xs transition ${selected === x.key ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: x.meta.color }} />
            {x.meta.icon} {x.meta.label}
            <span className="tabular-nums text-gray-500">{x.n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlanTab({ result, fileByPath, filteredMoves, search, setSearch, selectedKey, onClearFilter }: {
  result: ScanResult;
  fileByPath: Map<string, ScanFileLite>;
  filteredMoves: Move[];
  search: string;
  setSearch: (s: string) => void;
  selectedKey: string | null;
  onClearFilter: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Cari file di dalam rencana..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {selectedKey && (
          <button className="btn-ghost !py-2 !px-3 text-xs shrink-0" onClick={onClearFilter}>
            Hapus filter <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-white/[0.04] text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
          <div className="col-span-5 sm:col-span-4">File</div>
          <div className="col-span-3 sm:col-span-4">Folder Tujuan</div>
          <div className="col-span-2 sm:col-span-2">Ukuran</div>
          <div className="col-span-2 sm:col-span-2">Kelompok</div>
        </div>
        <div style={{ height: 416 }}>
          {filteredMoves.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
              <Icon name="search" className="w-5 h-5 text-gray-600" />
              Tidak ada file yang cocok dengan filter.
            </div>
          ) : (
            <VirtualList
              items={filteredMoves}
              rowHeight={38}
              rowKey={(m, i) => `${m.path}-${i}`}
              renderRow={(m) => {
                const file = fileByPath.get(m.path);
                const meta = m.customFolder
                  ? { icon: '✨', color: '#a5b4fc' }
                  : (CATEGORY_META[(m.dest.slice(result.organizeFolder.length + 1).split('\\')[0] as FileCategory)] || CATEGORY_META.other);
                return (
                  <div className="grid grid-cols-12 gap-2 px-4 items-center border-t border-white/5 text-sm">
                    <div className="col-span-5 sm:col-span-4 truncate text-gray-300" title={m.path}>
                      {file?.name || baseName(m.path)}
                    </div>
                    <div className="col-span-3 sm:col-span-4 truncate text-gray-400 text-xs">
                      {m.customFolder ? (
                        <span className="chip" style={{ color: '#a5b4fc' }}>✨ {m.customFolder}</span>
                      ) : (
                        <>
                          <span className="chip" style={{ color: meta.color }}>{meta.icon}</span>{' '}
                          {m.dest.slice(result.organizeFolder.length + 1).split('\\').slice(0, 2).join(' / ')}
                        </>
                      )}
                    </div>
                    <div className="col-span-2 sm:col-span-2 text-xs text-gray-400 tabular-nums">{formatBytes(file?.size)}</div>
                    <div className="col-span-2 sm:col-span-2">
                      {m.customFolder ? <span className="text-[10px] text-indigo-300/80">aturan kustom</span> : <span className="chip bg-white/10 text-gray-300">{file?.sizeBand}</span>}
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>
      {filteredMoves.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-2">{filteredMoves.length.toLocaleString('id-ID')} file · daftar dirender secara virtual agar tetap lancar</p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}
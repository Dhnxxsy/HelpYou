import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { useDrives } from '../lib/useDrives';
import { formatBytes } from '../lib/format';
import type { DiskScanResult, DiskBranch, DiskFile, DefragAnalyzeResult, DefragJobStatus } from '@shared/types';

interface JobStatus {
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress?: number;
  message?: string;
  result?: DiskScanResult;
  error?: string;
}

function parentOf(p: string): string {
  if (/^[A-Za-z]:[\\/]*$/.test(p)) return p;
  const parts = p.split(/[\\/]/).filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('\\') + '\\' : p;
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

const MEDIA_CHIP: Record<string, string> = {
  SSD: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  NVMe: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]',
  HDD: 'bg-[var(--warn-soft)] text-[var(--warn-strong)] border-[var(--warn-border)]',
  Unknown: 'bg-[var(--overlay)] text-[var(--text-3)] border-[var(--border)]',
};

function defragRecommendation(r: DefragAnalyzeResult): { label: string; cls: string } | null {
  if (!r.supported) return null;
  const ssd = /SSD|NVMe/i.test(r.mediaType);
  if (ssd) {
    return { label: 'Drive solid-state — optimasi berupa Retrim (aman & cepat)', cls: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]' };
  }
  if (r.fragPercent == null) return null;
  if (r.fragPercent >= 15) return { label: `Drive terfragmentasi ${Math.round(r.fragPercent)}% — disarankan defrag`, cls: 'bg-[var(--warn-soft)] text-[var(--warn-strong)] border-[var(--warn-border)]' };
  if (r.fragPercent < 5) return { label: 'Sedikit terfragmentasi — tidak perlu defrag', cls: 'bg-[var(--ok-soft)] text-[var(--ok-strong)] border-[var(--ok-border)]' };
  return { label: `Fragmentasi rendah (${Math.round(r.fragPercent)}%) — defrag opsional`, cls: 'bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)]' };
}

export default function DiskAnalyzerView({ onBack }: { onBack: () => void }) {
  const { drives } = useDrives();
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [root, setRoot] = useState('');
  const rootInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<DiskScanResult | null>(null);
  const [msg, setMsg] = useState('');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const jobRef = useRef<string | null>(null);

  const analyze = async (pathValue: string) => {
    const p = (pathValue || '').trim();
    if (!p) return;
    setError('');
    setRoot(p);
    setPhase('scanning');
    setResult(null);
    setCount(0);
    setMsg('Menyiapkan pemindaian…');
    try {
      const { jobId } = await api<{ jobId: string }>('/api/disk/analyze', { method: 'POST', body: JSON.stringify({ path: p }) });
      jobRef.current = jobId;
      poll(jobId);
    } catch (e: any) {
      setError(e.message || 'Gagal mulai pemindaian.');
      setPhase('idle');
    }
  };

  const poll = async (jobId: string) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 400));
      let st: JobStatus;
      try {
        st = await api<JobStatus>(`/api/disk/analyze/${jobId}`);
      } catch {
        continue;
      }
      if (st.status === 'running') {
        setCount(st.progress || 0);
        if (st.message) setMsg(st.message);
        continue;
      }
      if (st.status === 'done') {
        setResult(st.result || null);
        setPhase('done');
        jobRef.current = null;
        return;
      }
      if (st.status === 'error') {
        setError(st.error || 'Pemindaian gagal.');
        setPhase('idle');
        jobRef.current = null;
        return;
      }
      if (st.status === 'cancelled') {
        setPhase('idle');
        jobRef.current = null;
        return;
      }
    }
  };

  useEffect(() => () => {
    const j = jobRef.current;
    if (j) void api(`/api/disk/analyze/${j}/cancel`, { method: 'POST' }).catch(() => {});
  }, []);

  /* ---------------- defrag / optimize ---------------- */
  const [defragDrive, setDefragDrive] = useState('');
  const [defragVols, setDefragVols] = useState<Record<string, DefragAnalyzeResult | null>>({});
  const [defragBusy, setDefragBusy] = useState<Record<string, 'analyzing' | 'optimizing'>>({});
  const [defragStatus, setDefragStatus] = useState<Record<string, DefragJobStatus | null>>({});
  const defragJobRef = useRef<{ drive: string; jobId: string } | null>(null);

  const pollDefrag = async (drive: string, jobId: string, kind: 'analyze' | 'optimize') => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      let st: DefragJobStatus;
      try {
        st = await api<DefragJobStatus>(`/api/disk/defrag/${jobId}`);
      } catch {
        continue;
      }
      setDefragStatus((s) => ({ ...s, [drive]: st }));
      if (st.status === 'done' && st.result) setDefragVols((v) => ({ ...v, [drive]: st.result! }));
      if (st.status === 'done' || st.status === 'error' || st.status === 'cancelled') return;
    }
  };

  const startDefragAnalyze = async (drive: string) => {
    setDefragBusy((b) => ({ ...b, [drive]: 'analyzing' }));
    setDefragStatus((s) => ({ ...s, [drive]: null }));
    try {
      const { jobId } = await api<{ jobId: string }>('/api/disk/defrag/analyze', { method: 'POST', body: JSON.stringify({ path: drive }) });
      defragJobRef.current = { drive, jobId };
      await pollDefrag(drive, jobId, 'analyze');
    } catch (e: any) {
      setDefragStatus((s) => ({ ...s, [drive]: { status: 'error', log: '', error: e.message || 'Gagal memulai analisis defrag.' } }));
    } finally {
      setDefragBusy((b) => { const n = { ...b }; delete n[drive]; return n; });
    }
  };

  const startDefragOptimize = async (drive: string) => {
    setDefragBusy((b) => ({ ...b, [drive]: 'optimizing' }));
    setDefragStatus((s) => ({ ...s, [drive]: null }));
    try {
      const { jobId } = await api<{ jobId: string }>('/api/disk/defrag/optimize', { method: 'POST', body: JSON.stringify({ path: drive }) });
      defragJobRef.current = { drive, jobId };
      await pollDefrag(drive, jobId, 'optimize');
    } catch (e: any) {
      setDefragStatus((s) => ({ ...s, [drive]: { status: 'error', log: '', error: e.message || 'Gagal memulai optimasi.' } }));
    } finally {
      setDefragBusy((b) => { const n = { ...b }; delete n[drive]; return n; });
    }
  };

  const cancelDefrag = () => {
    const j = defragJobRef.current;
    if (j) void api(`/api/disk/defrag/${j.jobId}/cancel`, { method: 'POST' }).catch(() => {});
  };

  useEffect(() => () => {
    const j = defragJobRef.current;
    if (j) void api(`/api/disk/defrag/${j.jobId}/cancel`, { method: 'POST' }).catch(() => {});
  }, []);

  const defragLetter = (p: string) => (p || '').trim().charAt(0).toUpperCase();
  const defragResult = defragVols[defragDrive] || null;
  const rec = defragResult ? defragRecommendation(defragResult) : null;
  const defragRunning = defragBusy[defragDrive];
  const defragLive = defragStatus[defragDrive];

  const openPath = async (p: string) => {
    try { await api('/api/open', { method: 'POST', body: JSON.stringify({ path: p }) }); } catch { /* ignore */ }
  };

  const bars = (result?.branches || [])
    .slice()
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="disc"
        title="Analisis Ruang Disk"
        desc="Lihat apa yang memakan ruang di drive atau folder. Klik folder terbesar untuk menyusuri lebih dalam."
        onBack={onBack}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {drives.filter((d) => d.size > 0).map((d) => {
          const pct = Math.min(100, Math.round((d.used / d.size) * 100));
          return (
            <button
              key={d.path}
              onClick={() => analyze(d.path)}
              disabled={phase === 'scanning'}
              className="card card-hover p-4 text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center shadow-lg shadow-[0_10px_30px_-10px_var(--accent-glow)] shrink-0">
                  <Icon name="drive" className="w-6 h-6 text-[var(--text)]" />
                </span>
                <div className="min-w-0">
                  <div className="text-base font-bold text-[var(--text)]">{d.name}</div>
                  <div className="text-[10px] text-[var(--text-3)] truncate">{d.isSystem ? 'Drive Sistem' : 'Drive Lokal'}</div>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-[var(--overlay-2)] overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${pct > 90 ? 'from-[var(--danger)] to-[var(--danger-strong)]' : 'from-[var(--accent)] to-[var(--accent-2)]'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
                <span className="text-[var(--text-2)] tabular-nums">{formatBytes(d.used)} terpakai</span>
                <span className={pct > 90 ? 'text-[var(--danger-strong)] font-medium' : 'text-[var(--text-3)]'}>{pct}%</span>
              </div>
              <div className="text-[10px] text-[var(--text-3)] tabular-nums">dari {formatBytes(d.size)}</div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          ref={rootInput}
          defaultValue={root}
          placeholder="Masukkan folder, contoh: C:\Data atau D:\"
          className="input flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') analyze(rootInput.current?.value || ''); }}
        />
        <button className="btn-primary !px-5" onClick={() => analyze(rootInput.current?.value || '')} disabled={phase === 'scanning'}>
          <Icon name="search" className="w-4 h-4" /> Analisis
        </button>
      </div>

      <section className="card p-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center shadow-lg shadow-[0_10px_30px_-10px_var(--accent-glow)] shrink-0">
            <Icon name="drive" className="w-5 h-5 text-white" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)]">Defragmentasi &amp; Optimasi Drive</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Menjalankan optimizer bawaan Windows (Optimize-Volume / defrag.exe). HDD di-defrag, SSD/NVMe di-retrim. Butuh izin administrator (UAC).
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2">
          {drives.filter((d) => d.size > 0).map((d) => {
            const letter = defragLetter(d.path);
            const busy = defragBusy[letter];
            const selected = defragDrive === letter;
            return (
              <button
                key={d.path}
                onClick={() => setDefragDrive(letter)}
                disabled={!!busy}
                className={`px-3 h-9 rounded-full text-[13px] font-medium border transition-colors disabled:opacity-60 ${
                  selected
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]'
                    : 'bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                {letter}:
                {busy && (
                  <span className="ml-2 inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin align-[-2px]" />
                )}
              </button>
            );
          })}
        </div>

        {defragDrive && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--overlay)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-outline !h-8 !px-3 !text-xs" onClick={() => startDefragAnalyze(defragDrive)} disabled={!!defragRunning}>
                <Icon name="scan" className="w-3.5 h-3.5" /> Analisis Fragmentasi
              </button>
              <button
                className="btn-primary !h-8 !px-3 !text-xs"
                onClick={() => startDefragOptimize(defragDrive)}
                disabled={defragRunning === 'optimizing' || !defragResult?.supported}
                title={!defragResult?.supported ? 'Analisis dulu (drive mungkin tidak didukung)' : undefined}
              >
                <Icon name="sparkle" className="w-3.5 h-3.5" /> Optimalkan / Defrag
              </button>
              {defragRunning === 'optimizing' && (
                <button className="btn-ghost !h-8 !px-3 !text-xs text-[var(--danger-strong)]" onClick={cancelDefrag}>
                  <Icon name="stop" className="w-3.5 h-3.5" /> Hentikan
                </button>
              )}
            </div>

            {defragResult && defragRunning !== 'analyzing' && (
              <div className="mt-3.5">
                <div className="flex flex-wrap gap-1.5">
                  <span className={`chip ${MEDIA_CHIP[defragResult.mediaType] || 'bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)]'}`}>
                    {defragResult.mediaType || 'Media'}
                  </span>
                  <span className="chip bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)]">{defragResult.fileSystem || '-'}</span>
                  {defragResult.fragPercent != null && (
                    <span className="chip bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)] tabular-nums">
                      Fragmentasi {Math.round(defragResult.fragPercent)}%
                    </span>
                  )}
                  {defragResult.fragmentedBytes != null && (
                    <span className="chip bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)] tabular-nums">
                      Ruang terfragmentasi {formatBytes(defragResult.fragmentedBytes)}
                    </span>
                  )}
                  {defragResult.fragmentedFiles != null && (
                    <span className="chip bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)] tabular-nums">
                      {defragResult.fragmentedFiles.toLocaleString('id-ID')} file terfragmentasi
                    </span>
                  )}
                  {defragResult.lastOptimized && (
                    <span className="chip bg-[var(--overlay)] text-[var(--text-2)] border-[var(--border)]">Optimasi terakhir {defragResult.lastOptimized}</span>
                  )}
                </div>
                {rec && (
                  <p className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] ${rec.cls}`}>
                    <Icon name={/tidak perlu|opsional/i.test(rec.label) ? 'check' : 'info'} className="w-3.5 h-3.5 shrink-0" />
                    {rec.label}
                  </p>
                )}
                {defragResult && !defragResult.supported && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-soft)] px-2.5 py-1 text-[11px] text-[var(--warn-strong)]">
                    <Icon name="alert" className="w-3.5 h-3.5 shrink-0" />
                    Drive tidak mendukung defragmentasi (butuh NTFS/ReFS).
                  </p>
                )}
              </div>
            )}

            {defragLive && (
              <div className="mt-3.5">
                {defragLive.status === 'running' && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                      {defragLive.progress != null ? (
                        <span className="tabular-nums font-medium text-[var(--accent-strong)]">{defragLive.progress}%</span>
                      ) : (
                        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
                      )}
                      <span>{defragLive.progress != null ? 'Bekerja…' : defragRunning === 'analyzing' ? 'Menganalisis fragmentasi…' : 'Mengoptimalkan drive…'}</span>
                    </div>
                    {defragLive.progress != null && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-[var(--overlay-2)] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${defragLive.progress}%` }} />
                      </div>
                    )}
                  </>
                )}
                {(defragLive.status === 'done' || defragLive.status === 'cancelled' || defragLive.status === 'error') && (
                  <p className={`flex items-center gap-1.5 text-xs font-medium ${
                    defragLive.status === 'done' ? 'text-[var(--ok-strong)]' : defragLive.status === 'cancelled' ? 'text-[var(--text-2)]' : 'text-[var(--danger-strong)]'
                  }`}>
                    <Icon name={defragLive.status === 'done' ? 'check' : defragLive.status === 'cancelled' ? 'x' : 'alert'} className="w-4 h-4 shrink-0" />
                    {defragLive.status === 'done' && 'Optimasi selesai.'}
                    {defragLive.status === 'cancelled' && 'Optimasi dihentikan.'}
                    {defragLive.status === 'error' && (defragLive.error || 'Optimasi gagal.')}
                  </p>
                )}
                {defragLive.log && defragLive.log.trim() && defragLive.status !== 'running' && (
                  <pre className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-[var(--bg)] p-3 font-mono text-[10px] leading-relaxed text-[var(--text-2)] whitespace-pre-wrap break-all">
                    {defragLive.log}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      {phase === 'scanning' && (
        <div className="card p-6 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] rounded-full shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-[var(--text)] font-medium truncate">{msg}</div>
              <div className="text-xs text-[var(--text-3)] tabular-nums">{count.toLocaleString('id-ID')} file diperiksa</div>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <>
          {root && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-[var(--text-2)] flex items-center gap-2 min-w-0">
                <Icon name="folder" className="w-4 h-4 text-[var(--accent-strong)] shrink-0" />
                <span className="truncate font-medium">{root}</span>
                <button className="btn-ghost !py-1 !px-2 text-[11px] shrink-0" onClick={() => analyze(parentOf(root))}>
                  <Icon name="arrowRight" className="w-3 h-3 rotate-180" /> Naik ke induk
                </button>
              </div>
              <button className="btn-ghost !py-1.5 !px-2.5 text-[11px] shrink-0" onClick={() => openPath(root)}>
                <Icon name="external" className="w-3.5 h-3.5" /> Buka lokasi
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Total Terpakai</div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text)] mt-0.5">{formatBytes(result.totalBytes)}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">File</div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text)] mt-0.5">{result.totalFiles.toLocaleString('id-ID')}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Folder</div>
              <div className="text-lg font-semibold tabular-nums text-[var(--text)] mt-0.5">{result.totalDirs.toLocaleString('id-ID')}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Status</div>
              <div className="text-lg font-semibold text-[var(--text)] mt-0.5">
                {result.truncated ? <span className="text-[var(--warn-strong)]">Pemangkas Aktif</span> : <span className="text-[var(--ok-strong)]">Lengkap</span>}
              </div>
            </div>
          </div>

          {result.truncated && (
            <p className="text-xs text-[var(--warn-strong)] flex items-center gap-1.5">
              <Icon name="alert" className="w-3.5 h-3.5 shrink-0" />
              Analisis dibatasi pada 200.000 file & kedalaman 48 lapis — ukuran ditampilkan bisa lebih kecil dari sebenarnya.
            </p>
          )}

          <div className="grid lg:grid-cols-2 gap-5 items-start">
            <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
              <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <Icon name="folder" className="w-4 h-4 text-[var(--accent-strong)]" /> Pengonsumsi Terbesar
              </div>
              {bars.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--text-3)]">Tidak ada isi terukur di lokasi ini.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {bars.map((b: DiskBranch) => (
                    <button key={b.path} onClick={() => analyze(b.path)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--overlay)] transition-colors">
                      <Icon name={b.kind === 'dir' ? 'folder' : 'external'} className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[var(--text)] truncate">{b.kind === 'dir' ? baseName(b.path) || b.path : b.name}</div>
                        <div className="mt-1 h-1.5 rounded-full bg-[var(--overlay-2)] overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${Math.max(2, Math.round((b.sizeBytes / result.totalBytes) * 100))}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-[var(--text)]">{formatBytes(b.sizeBytes)}</div>
                        <div className="text-[10px] text-[var(--text-3)] tabular-nums">{b.itemCount.toLocaleString('id-ID')} item</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
              <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <Icon name="chart" className="w-4 h-4 text-[var(--accent-strong)]" /> File Terbesar
              </div>
              {result.topFiles.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--text-3)]">Tidak ada file.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {result.topFiles.map((f: DiskFile) => (
                    <button key={f.path} onClick={() => openPath(f.path)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--overlay)] transition-colors">
                      <span className="w-8 h-8 rounded-lg bg-[var(--overlay)] border border-[var(--border)] grid place-items-center shrink-0">
                        <Icon name="external" className="w-3.5 h-3.5 text-[var(--text-2)]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[var(--text)] truncate">{f.name}</div>
                        <div className="text-[11px] text-[var(--text-3)] truncate">{f.path}</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums text-[var(--text)] shrink-0">{formatBytes(f.sizeBytes)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {phase === 'idle' && !error && result == null && (
        <div className="card p-8 text-center">
          <Icon name="disc" className="w-8 h-8 text-[var(--accent-strong)] mx-auto" />
          <p className="text-sm text-[var(--text-2)] mt-3">Pilih drive di atas, atau ketik folder untuk mulai menganalisis ruang disk.</p>
        </div>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>
    </div>
  );
}
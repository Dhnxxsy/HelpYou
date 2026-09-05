import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { useDrives } from '../lib/useDrives';
import { formatBytes } from '../lib/format';
import type { DiskScanResult, DiskBranch, DiskFile } from '@shared/types';

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
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { ProcessInfo } from '@shared/types';

export default function ProcessManagerView({ onBack }: { onBack: () => void }) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [selected, setSelected] = useState<ProcessInfo | null>(null);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await api<{ processes: ProcessInfo[] }>('/api/process/list');
      setProcesses(res.processes || []);
    } catch (e: any) {
      setError(e.message || 'Gagal membaca daftar proses.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  const kill = async (pid: number) => {
    setError('');
    try {
      const res = await api<{ ok: boolean; error?: string }>('/api/process/kill', {
        method: 'POST',
        body: JSON.stringify({ pid }),
      });
      if (!res.ok) throw new Error(res.error || 'Gagal menghentikan proses.');
      setConfirmPid(null);
      setSelected(null);
      await load(false);
    } catch (e: any) {
      setError(e.message || 'Gagal menghentikan proses.');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return processes;
    return processes.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q) || p.windowTitle.toLowerCase().includes(q)
    );
  }, [processes, query]);

  const memTotal = filtered.reduce((s, p) => s + p.memMB, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="activity"
        title="Pengelola Proses"
        desc="Lihat program yang sedang berjalan dan pemakaian memorinya, lalu hentikan proses yang macet."
        onBack={onBack}
        actions={
          <button className="btn-outline !py-2 !px-3 text-xs" onClick={() => load(false)} disabled={loading || refreshing}>
            <Icon name="replay" className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Menyegarkan…' : 'Muat Ulang'}
          </button>
        }
      />

      {error && <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Icon name="search" className="w-4 h-4 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input-field pl-9 !py-2 text-sm" placeholder="Cari nama / PID / jendela…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chip bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]">
          {filtered.length} proses · {formatBytes(memTotal * 1024 * 1024)}
        </div>
      </div>

      {loading && !processes.length && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] rounded-full mx-auto" />
          <p className="text-sm text-[var(--text-2)] mt-3">Membaca daftar proses…</p>
        </div>
      )}

      {!loading && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--overlay)] text-[10px] uppercase tracking-wider text-[var(--text-3)]">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Proses</th>
                <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">PID</th>
                <th className="text-right px-4 py-2.5 font-semibold">Memori</th>
                <th className="text-left px-4 py-2.5 font-semibold hidden md:table-cell">CPU (detik)</th>
                <th className="text-left px-4 py-2.5 font-semibold hidden lg:table-cell">Jendela</th>
                <th className="text-right px-3 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((p) => (
                <tr key={p.pid} className="hover:bg-[var(--overlay)]">
                  <td className="px-4 py-2 max-w-[240px]">
                    <button className="flex items-center gap-2 text-left" onClick={() => setSelected(p)}>
                      <Icon name="box" className={`w-4 h-4 shrink-0 ${p.windowTitle ? 'text-[var(--accent-strong)]' : 'text-[var(--text-3)]'}`} />
                      <span className="truncate text-[var(--text)]">{p.name}</span>
                      <span className="text-[10px] text-[var(--text-3)]">.exe</span>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-xs text-[var(--text-3)] tabular-nums hidden sm:table-cell">{p.pid}</td>
                  <td className="px-4 py-2 text-xs text-[var(--text-2)] tabular-nums text-right">{p.memMB.toFixed(1)} MB</td>
                  <td className="px-4 py-2 text-xs text-[var(--text-3)] tabular-nums hidden md:table-cell">{p.cpuSeconds.toFixed(0)}</td>
                  <td className="px-4 py-2 text-xs text-[var(--text-3)] truncate max-w-[160px] hidden lg:table-cell">{p.windowTitle || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {confirmPid === p.pid ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button className="btn-danger !py-1 !px-2 text-[11px]" onClick={() => kill(p.pid)}>Yakin?</button>
                        <button className="btn-ghost !py-1 !px-2 text-[11px]" onClick={() => setConfirmPid(null)}>Batal</button>
                      </div>
                    ) : (
                      <button className="btn-ghost !py-1 !px-2 text-[11px] hover:!bg-[var(--danger-soft)] hover:!text-[var(--danger-strong)]" onClick={() => setConfirmPid(p.pid)}>
                        Hentikan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--text-3)]">Tidak ada proses yang cocok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-sm grid place-items-center p-4" onClick={() => setSelected(null)}>
          <div className="card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 grid place-items-center text-white">
                <Icon name="activity" className="w-5 h-5" />
              </span>
              <div>
                <div className="font-bold text-[var(--text)]">{selected.name}.exe</div>
                <div className="text-xs text-[var(--text-3)]">PID {selected.pid} · Sesi {selected.sessionId}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-[var(--overlay)] border border-[var(--border)] py-3">
                <div className="text-lg font-bold text-[var(--text)] tabular-nums">{selected.memMB.toFixed(1)}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">MB RAM</div>
              </div>
              <div className="rounded-xl bg-[var(--overlay)] border border-[var(--border)] py-3">
                <div className="text-lg font-bold text-[var(--text)] tabular-nums">{selected.cpuSeconds.toFixed(0)}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Cpu (dtk)</div>
              </div>
              <div className="rounded-xl bg-[var(--overlay)] border border-[var(--border)] py-3">
                <div className="text-lg font-bold text-[var(--text)] tabular-nums truncate">{selected.path ? formatPathBase(selected.path) : '—'}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Path</div>
              </div>
            </div>
            <div className="rounded-xl bg-[var(--overlay)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-2)] break-all">{selected.path || 'Lokasi tidak dapat diakses.'}</div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost" onClick={() => setSelected(null)}>Tutup</button>
              <button className="btn-danger" onClick={() => { setConfirmPid(selected.pid); setSelected(null); }}>
                <Icon name="stop" className="w-4 h-4" /> Hentikan Proses
              </button>
            </div>
          </div>
        </div>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>
    </div>
  );
}

function formatPathBase(p: string): string {
  const base = p.replace(/\\/g, '/').split('/').pop() || '';
  return base.length > 12 ? base.slice(0, 10) + '…' : base;
}
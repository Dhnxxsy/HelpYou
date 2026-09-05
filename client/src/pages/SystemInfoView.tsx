import { useEffect, useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { SystemInfoReport } from '@shared/types';

export default function SystemInfoView({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<SystemInfoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ report: SystemInfoReport }>('/api/system/report');
      setReport(res.report);
    } catch (e: any) {
      setError(e.message || 'Gagal membaca informasi sistem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copySummary = async () => {
    if (!report) return;
    const r = report;
    const ramUsed = Math.max(0, r.ram.total - r.ram.free);
    const lines = [
      `=== Ringkasan Sistem ===`,
      `PC: ${r.pc.manufacturer} ${r.pc.model}`,
      `OS: ${r.os.caption} (build ${r.os.build}, ${r.os.arch})`,
      `CPU: ${r.cpu.name} — ${r.cpu.cores} core / ${r.cpu.logical} thread @ ~${r.cpu.clockGhz} GHz`,
      `RAM: ${formatBytes(ramUsed)} dari ${formatBytes(r.ram.total)}`,
      `Uptime: ${r.os.uptimeDays} hari`,
      `Host: ${r.os.hostname} (${r.os.user})`,
      `Serial: ${r.pc.serial}`,
      ...r.disks.filter((d) => d.total > 0).map((d) => `${d.drive} ${d.label || ''} — ${formatBytes(d.free)} bebas dari ${formatBytes(d.total)}`.trim()),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="cpu"
        accent="from-amber-500 to-orange-600"
        glow="shadow-amber-500/30"
        title="Info & Laporan Sistem"
        desc="Ringkasan perangkat keras, sistem operasi, memori, dan setiap drive — untuk memahami kondisi PC-mu."
        onBack={onBack}
        actions={
          <>
            <button className="btn-ghost !py-2 !px-3 text-xs" onClick={load} disabled={loading}>
              <Icon name="replay" className="w-4 h-4" /> Muat Ulang
            </button>
            <button className="btn-primary !py-2 !px-3 text-xs" onClick={copySummary} disabled={!report}>
              <Icon name="duplicate" className="w-4 h-4" /> Salin Ringkasan
            </button>
          </>
        }
      />

      {error && <p className="text-sm text-rose-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      {loading && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-amber-400/40 border-t-amber-400 rounded-full mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Membaca informasi sistem…</p>
        </div>
      )}

      {!loading && report && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Sistem Operasi" value={`${report.os.caption}\n${report.os.version || ''}\nBuild ${report.os.build} · ${report.os.arch}`} icon="disc" />
            <StatCard label="PC / Laptop" value={`${report.pc.manufacturer} ${report.pc.model}`.trim() || 'Tidak terdeteksi'} icon="cpu" />
            <StatCard label="Hostname" value={`${report.os.hostname}\n${report.os.user}`} icon="network" />
            <StatCard label="Uptime" value={`${report.os.uptimeDays} hari`} icon="clock" />
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2">
              <Icon name="cpu" className="w-4 h-4 text-amber-300" /> Prosesor
            </div>
            <div className="px-4 py-3 text-sm text-gray-200">{report.cpu.name || 'Tidak terdeteksi'}</div>
            <div className="px-4 pb-3 grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Core" value={String(report.cpu.cores)} />
              <MiniStat label="Thread" value={String(report.cpu.logical)} />
              <MiniStat label="Kecepatan" value={`~${report.cpu.clockGhz} GHz`} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white flex items-center justify-between">
              <span className="flex items-center gap-2"><Icon name="box" className="w-4 h-4 text-amber-300" /> Memori (RAM)</span>
              <span className="text-xs font-normal text-gray-400">{formatBytes(report.ram.free)} bebas</span>
            </div>
            <div className="px-4 py-3">
              <Bar used={report.ram.total - report.ram.free} total={report.ram.total} gradient="from-amber-500 to-orange-500" />
              <div className="text-[11px] text-gray-500 mt-1.5 tabular-nums">
                {formatBytes(report.ram.total - report.ram.free)} terpakai dari {formatBytes(report.ram.total)}
              </div>
            </div>
          </div>

          {report.battery && (
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
              <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white flex items-center justify-between">
                <span className="flex items-center gap-2"><Icon name="gauge" className="w-4 h-4 text-emerald-300" /> Baterai</span>
                <span className="text-xs font-normal text-gray-400">{report.battery.status}</span>
              </div>
              <div className="px-4 py-3">
                <Bar used={report.battery.capacityPercent} total={100} gradient="from-emerald-500 to-teal-500" />
                <div className="text-[11px] text-gray-500 mt-1.5 tabular-nums">{report.battery.capacityPercent}%</div>
              </div>
            </div>
          )}

          {report.gpu.length > 0 && (
            <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
              <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2">
                <Icon name="chart" className="w-4 h-4 text-amber-300" /> Kartu Grafis
              </div>
              <div className="divide-y divide-white/5">
                {report.gpu.map((g, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-gray-200">{g.name}</span>
                    <span className="text-gray-500 text-xs tabular-nums">{g.memMB > 0 ? `${g.memMB} MB` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-white flex items-center gap-2">
              <Icon name="drive" className="w-4 h-4 text-amber-300" /> Penyimpanan
            </div>
            <div className="divide-y divide-white/5">
              {report.disks.filter((d) => d.total > 0).length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-500">Tidak ada drive yang terdeteksi.</div>
              )}
              {report.disks.filter((d) => d.total > 0).map((d, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-200 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" /> {d.drive} {d.label && <span className="text-gray-500">· {d.label}</span>}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">{d.fileSystem || ''}</span>
                  </div>
                  <Bar used={d.total - d.free} total={d.total} gradient="from-amber-500 to-rose-500" />
                  <div className="text-[11px] text-gray-500 mt-1.5 tabular-nums">{formatBytes(d.free)} bebas dari {formatBytes(d.total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <InfoLine label="Nomor Seri (BIOS)" value={report.pc.serial || '—'} />
            <InfoLine label="Versi BIOS" value={report.pc.bios || '—'} />
            <InfoLine label="Serial OS" value={report.os.installDate || '—'} />
          </div>
        </div>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
        <Icon name={icon} className="w-3 h-3 text-amber-300/70" /> {label}
      </div>
      <div className="text-sm font-medium text-white mt-1 whitespace-pre-line leading-snug">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 py-2.5">
      <div className="text-lg font-bold text-white tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}

function Bar({ used, total, gradient }: { used: number; total: number; gradient: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${Math.max(1, pct)}%` }} />
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-sm text-gray-200 mt-0.5 truncate">{value}</div>
    </div>
  );
}
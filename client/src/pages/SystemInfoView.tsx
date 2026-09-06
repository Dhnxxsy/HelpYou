import { useEffect, useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { useI18n, tGlobal } from '../lib/i18n';
import type { SystemInfoReport } from '@shared/types';

export default function SystemInfoView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
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
      setError(e.message || t('Gagal membaca informasi sistem.'));
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
      t('=== Ringkasan Sistem ==='),
      t('PC: {pc}', { pc: `${r.pc.manufacturer} ${r.pc.model}` }),
      t('OS: {caption} (build {build}, {arch})', { caption: r.os.caption, build: r.os.build, arch: r.os.arch }),
      t('CPU: {name} — {cores} core / {logical} thread @ ~{clock} GHz', { name: r.cpu.name, cores: r.cpu.cores, logical: r.cpu.logical, clock: r.cpu.clockGhz }),
      t('RAM: {used} dari {total}', { used: formatBytes(ramUsed), total: formatBytes(r.ram.total) }),
      t('Uptime: {days} hari', { days: r.os.uptimeDays }),
      t('Host: {hostname} ({user})', { hostname: r.os.hostname, user: r.os.user }),
      t('Serial: {serial}', { serial: r.pc.serial }),
      ...r.disks.filter((d) => d.total > 0).map((d) =>
        t('{drive} {label} — {free} bebas dari {total}', { drive: d.drive, label: d.label || '', free: formatBytes(d.free), total: formatBytes(d.total) }).trim()
      ),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="cpu"
        title={t('Info & Laporan Sistem')}
        desc={t('Ringkasan perangkat keras, sistem operasi, memori, dan setiap drive — untuk memahami kondisi PC-mu.')}
        onBack={onBack}
        actions={
          <>
            <button className="btn-ghost !py-2 !px-3 text-xs" onClick={load} disabled={loading}>
              <Icon name="replay" className="w-4 h-4" /> {t('Muat Ulang')}
            </button>
            <button className="btn-primary !py-2 !px-3 text-xs" onClick={copySummary} disabled={!report}>
              <Icon name="duplicate" className="w-4 h-4" /> {t('Salin Ringkasan')}
            </button>
          </>
        }
      />

      {error && <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      {loading && (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-[var(--warn-border)] border-t-[var(--warn-strong)] rounded-full mx-auto" />
          <p className="text-sm text-[var(--text-2)] mt-3">{t('Membaca informasi sistem…')}</p>
        </div>
      )}

      {!loading && report && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label={t('Sistem Operasi')} value={`${report.os.caption}\n${report.os.version || ''}\nBuild ${report.os.build} · ${report.os.arch}`} icon="disc" />
            <StatCard label={t('PC / Laptop')} value={`${report.pc.manufacturer} ${report.pc.model}`.trim() || 'Tidak terdeteksi'} icon="cpu" />
            <StatCard label={t('Hostname')} value={`${report.os.hostname}\n${report.os.user}`} icon="network" />
            <StatCard label={t('Uptime')} value={`${report.os.uptimeDays} hari`} icon="clock" />
          </div>

          <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
            <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <Icon name="cpu" className="w-4 h-4 text-[var(--warn-strong)]" /> {t('Prosesor')}
            </div>
            <div className="px-4 py-3 text-sm text-[var(--text)]">{report.cpu.name || 'Tidak terdeteksi'}</div>
            <div className="px-4 pb-3 grid grid-cols-3 gap-3 text-center">
              <MiniStat label={t('Core')} value={String(report.cpu.cores)} />
              <MiniStat label={t('Thread')} value={String(report.cpu.logical)} />
              <MiniStat label={t('Kecepatan')} value={`~${report.cpu.clockGhz} GHz`} />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
            <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center justify-between">
              <span className="flex items-center gap-2"><Icon name="box" className="w-4 h-4 text-[var(--warn-strong)]" /> {t('Memori (RAM)')}</span>
              <span className="text-xs font-normal text-[var(--text-2)]">{formatBytes(report.ram.free)} bebas</span>
            </div>
            <div className="px-4 py-3">
              <Bar used={report.ram.total - report.ram.free} total={report.ram.total} gradient="from-amber-500 to-orange-500" />
              <div className="text-[11px] text-[var(--text-3)] mt-1.5 tabular-nums">
                {formatBytes(report.ram.total - report.ram.free)} terpakai dari {formatBytes(report.ram.total)}
              </div>
            </div>
          </div>

          {report.battery && (
            <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
              <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center justify-between">
                <span className="flex items-center gap-2"><Icon name="gauge" className="w-4 h-4 text-[var(--ok-strong)]" /> {t('Baterai')}</span>
                <span className="text-xs font-normal text-[var(--text-2)]">{report.battery.status}</span>
              </div>
              <div className="px-4 py-3">
                <Bar used={report.battery.capacityPercent} total={100} gradient="from-emerald-500 to-teal-500" />
                <div className="text-[11px] text-[var(--text-3)] mt-1.5 tabular-nums">{report.battery.capacityPercent}%</div>
              </div>
            </div>
          )}

          {report.gpu.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
              <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                <Icon name="chart" className="w-4 h-4 text-[var(--warn-strong)]" /> {t('Kartu Grafis')}
              </div>
              <div className="divide-y divide-white/5">
                {report.gpu.map((g, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-[var(--text)]">{g.name}</span>
                    <span className="text-[var(--text-3)] text-xs tabular-nums">{g.memMB > 0 ? `${g.memMB} MB` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--overlay)]">
            <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <Icon name="drive" className="w-4 h-4 text-[var(--warn-strong)]" /> {t('Penyimpanan')}
            </div>
            <div className="divide-y divide-white/5">
              {report.disks.filter((d) => d.total > 0).length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-[var(--text-3)]">{t('Tidak ada drive yang terdeteksi.')}</div>
              )}
              {report.disks.filter((d) => d.total > 0).map((d, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-[var(--text)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--warn)]" /> {d.drive} {d.label && <span className="text-[var(--text-3)]">· {d.label}</span>}
                    </span>
                    <span className="text-xs text-[var(--text-3)] tabular-nums">{d.fileSystem || ''}</span>
                  </div>
                  <Bar used={d.total - d.free} total={d.total} gradient="from-amber-500 to-rose-500" />
                  <div className="text-[11px] text-[var(--text-3)] mt-1.5 tabular-nums">{formatBytes(d.free)} bebas dari {formatBytes(d.total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <InfoLine label={t('Nomor Seri (BIOS)')} value={report.pc.serial || '—'} />
            <InfoLine label={t('Versi BIOS')} value={report.pc.bios || '—'} />
            <InfoLine label={t('Serial OS')} value={report.os.installDate || '—'} />
          </div>
        </div>
      )}

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> {t('Kembali ke Beranda')}
      </button>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] flex items-center gap-1.5">
        <Icon name={icon} className="w-3 h-3 text-[var(--warn-strong)]/70" /> {label}
      </div>
      <div className="text-sm font-medium text-[var(--text)] mt-1 whitespace-pre-line leading-snug">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--overlay)] border border-[var(--border)] py-2.5">
      <div className="text-lg font-bold text-[var(--text)] tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</div>
    </div>
  );
}

function Bar({ used, total, gradient }: { used: number; total: number; gradient: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-[var(--overlay-2)] overflow-hidden">
      <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${Math.max(1, pct)}%` }} />
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{label}</div>
      <div className="text-sm text-[var(--text)] mt-0.5 truncate">{value}</div>
    </div>
  );
}
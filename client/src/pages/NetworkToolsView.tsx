import { useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/api';
import { useI18n, tGlobal } from '../lib/i18n';
import type { DnsRow, PingRow, PortRow, TraceHop } from '@shared/types';

type Tab = 'ping' | 'trace' | 'dns' | 'ports';

const DEFAULT_HOST = 'google.com';
const DEFAULT_PORTS = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 8080, 8443];

export default function NetworkToolsView({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('ping');
  const [host, setHost] = useState(DEFAULT_HOST);
  const [busy, setBusy] = useState<Tab | null>(null);
  const [error, setError] = useState('');
  const [pings, setPings] = useState<PingRow[] | null>(null);
  const [hops, setHops] = useState<TraceHop[] | null>(null);
  const [dns, setDns] = useState<DnsRow[] | null>(null);
  const [ports, setPorts] = useState<PortRow[] | null>(null);

  const runPing = async () => {
    setBusy('ping'); setError('');
    try {
      const r = await api<{ rows: PingRow[] }>('/api/network/ping', { method: 'POST', body: JSON.stringify({ host, count: 4 }) });
      setPings(r.rows);
    } catch (e: any) { setError(e.message); setPings(null); } finally { setBusy(null); }
  };

  const runTrace = async () => {
    setBusy('trace'); setError(''); setHops(null);
    try {
      const r = await api<{ hops: TraceHop[] }>('/api/network/trace', { method: 'POST', body: JSON.stringify({ host }) });
      setHops(r.hops);
    } catch (e: any) { setError(e.message); setHops([]); } finally { setBusy(null); }
  };

  const runDns = async () => {
    setBusy('dns'); setError(''); setDns(null);
    try {
      const r = await api<{ rows: DnsRow[] }>('/api/network/dns', { method: 'POST', body: JSON.stringify({ host }) });
      setDns(r.rows);
    } catch (e: any) { setError(e.message); setDns([]); } finally { setBusy(null); }
  };

  const runPorts = async () => {
    setBusy('ports'); setError(''); setPorts(null);
    try {
      const r = await api<{ rows: PortRow[] }>('/api/network/ports', { method: 'POST', body: JSON.stringify({ host }) });
      setPorts(r.rows);
    } catch (e: any) { setError(e.message); setPorts([]); } finally { setBusy(null); }
  };

  const run = {
    ping: runPing,
    trace: runTrace,
    dns: runDns,
    ports: runPorts,
  }[tab];

  const TABS: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'ping', label: t('Ping'), icon: 'network' },
    { id: 'trace', label: t('Traceroute'), icon: 'external' },
    { id: 'dns', label: t('DNS Lookup'), icon: 'search' },
    { id: 'ports', label: t('Scan Port'), icon: 'lock' },
  ];

  const summary = (() => {
    if (!host.trim()) return '';
    const success = pings ? pings.filter((p) => !p.timedOut) : [];
    return pings && pings.length
      ? success.length
        ? t('Terhubung · {n} ms rata-rata', { n: (success.reduce((s, p) => s + p.ms, 0) / success.length).toFixed(0) })
        : t('Tidak ada balasan')
      : '';
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="network"
        title={t('Alat Jaringan')}
        desc={t('Ping, traceroute, cek DNS, dan pindai port untuk mendiagnosis koneksi.')}
        onBack={onBack}
      />

      {error && <p className="text-sm text-[var(--danger-strong)] flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-wider text-[var(--text-3)] mb-1.5 block font-semibold">{t('Host / Alamat')}</label>
          <input
            className="input-field !py-2.5 text-sm font-mono"
            placeholder={t('mis. google.com atau 8.8.8.8')}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          />
        </div>
        <button className="btn-primary !py-2.5" onClick={run} disabled={!host.trim() || !!busy}>
          <Icon name={busy === tab ? 'replay' : 'play'} className={`w-4 h-4 ${busy === tab ? 'animate-spin' : ''}`} />
          {busy === tab ? t('Berjalan…') : t('Jalankan')}
        </button>
      </div>

      {tab === 'ping' && summary && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${summary.startsWith('Terhubung') ? 'border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-strong)]' : 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)] flex items-center gap-2'}`}>
          {summary.startsWith('Terhubung') ? <Icon name="check" className="w-4 h-4" /> : <Icon name="alert" className="w-4 h-4" />}
          {summary}
        </div>
      )}

      <div className="flex gap-1 bg-[var(--overlay)] border border-[var(--border)] rounded-xl p-1 overflow-x-auto">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === tabItem.id ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white' : 'text-[var(--text-2)] hover:text-[var(--text)]'}`}
          >
            <Icon name={tabItem.icon} className="w-4 h-4" /> {tabItem.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {/* Ping */}
        {tab === 'ping' && (
          <div className="divide-y divide-white/5">
            {!pings && <EmptyBox loading={busy === 'ping'} label={t('Jalankan ping untuk mengukur latensi.')} />}
            {pings && pings.map((p) => (
              <div key={p.seq} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-[var(--text-3)] tabular-nums w-16">#{p.seq}</span>
                <span className={`flex items-center gap-2 ${p.timedOut ? 'text-[var(--danger-strong)]' : 'text-[var(--ok-strong)]'}`}>
                  <span className={`w-2 h-2 rounded-full ${p.timedOut ? 'bg-rose-400' : 'bg-[var(--ok)]'}`} />
                  {p.timedOut ? t('Tidak ada balasan (timeout)') : `${p.ms} ms`}
                </span>
                <span className="text-xs text-[var(--text-3)] tabular-nums">{p.ttl != null ? `TTL ${p.ttl}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trace */}
        {tab === 'trace' && (
          <div className="max-h-[440px] overflow-y-auto">
            {hops === null && <EmptyBox loading={busy === 'trace'} label={t('Traceroute bisa memakan waktu. Klik Jalankan.')} />}
            {hops !== null && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/5">
                  {hops.map((h) => (
                    <tr key={h.hop}>
                      <td className="px-4 py-2 text-xs text-[var(--text-3)] tabular-nums w-12">{h.hop}</td>
                      <td className="px-3 py-2 text-xs text-[var(--text-2)] tabular-nums w-44 whitespace-nowrap">
                        {h.times.length === 0 ? <span className="text-[var(--text-3)]">—</span> : h.times.join('  ')}
                      </td>
                      <td className="px-4 py-2 text-xs text-[var(--text-2)] font-mono">{h.address || t('(tidak ada rute / timeout)')}</td>
                    </tr>
                  ))}
                  {hops.length === 0 && <EmptyBox loading={false} label={t('Tidak ada hop yang terdeteksi.')} />}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* DNS */}
        {tab === 'dns' && (
          <div className="max-h-[440px] overflow-y-auto">
            {dns === null && <EmptyBox loading={busy === 'dns'} label={t('Cek catatan DNS untuk host ini.')} />}
            {dns !== null && (
              <table className="w-full text-sm">
                <thead className="bg-[var(--overlay)] text-[10px] uppercase tracking-wider text-[var(--text-3)]">
                  <tr><th className="text-left px-4 py-2.5 font-semibold w-16">{t('Tipe')}</th><th className="text-left px-4 py-2.5 font-semibold">{t('Nilai')}</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dns.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-xs font-semibold text-[var(--accent-strong)]">{r.type}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-2)] font-mono break-all">{r.value || r.name}</td>
                    </tr>
                  ))}
                  {dns.length === 0 && <EmptyBox loading={false} label={t('Tidak ada catatan yang ditemukan.')} />}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Ports */}
        {tab === 'ports' && (
          <div className="max-h-[440px] overflow-y-auto">
            {ports === null && <EmptyBox loading={busy === 'ports'} label={t('Pindai port umum pada host ini.')} />}
            {ports !== null && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-4">
                {ports.map((p) => (
                  <div key={p.port} className={`rounded-xl border px-3 py-2.5 ${p.open ? 'border-[var(--ok-border)] bg-[var(--ok-soft)]' : 'border-[var(--border)] bg-[var(--overlay)]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-[var(--text)]">{p.port}</span>
                      <span className={`w-2 h-2 rounded-full ${p.open ? 'bg-[var(--ok)]' : 'bg-[var(--bg-3)]'}`} />
                    </div>
                    <div className="text-[11px] text-[var(--text-3)] mt-0.5 truncate">{p.service || '—'}</div>
                    <div className={`text-[10px] mt-0.5 ${p.open ? 'text-[var(--ok-strong)]' : 'text-[var(--text-3)]'}`}>{p.open ? t('Terbuka') : t('Tertutup')} · {p.ms} ms</div>
                  </div>
                ))}
                {ports.length === 0 && <EmptyBox loading={false} label={t('Tidak ada hasil.')} />}
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> {t('Kembali ke Beranda')}
      </button>
    </div>
  );
}

function EmptyBox({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div className="px-4 py-10 text-center">
      {loading ? (
        <div className="animate-spin h-6 w-6 border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] rounded-full mx-auto" />
      ) : (
        <Icon name="network" className="w-8 h-8 text-[var(--text-3)] mx-auto" />
      )}
      <p className="text-sm text-[var(--text-3)] mt-3">{label}</p>
    </div>
  );
}
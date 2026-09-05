import { useState } from 'react';
import Icon, { type IconName } from '../components/Icon';
import { api } from '../lib/api';
import type { DnsRow, PingRow, PortRow, TraceHop } from '@shared/types';

type Tab = 'ping' | 'trace' | 'dns' | 'ports';

const DEFAULT_HOST = 'google.com';
const DEFAULT_PORTS = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 8080, 8443];

export default function NetworkToolsView({ onBack }: { onBack: () => void }) {
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
    { id: 'ping', label: 'Ping', icon: 'network' },
    { id: 'trace', label: 'Traceroute', icon: 'external' },
    { id: 'dns', label: 'DNS Lookup', icon: 'search' },
    { id: 'ports', label: 'Scan Port', icon: 'lock' },
  ];

  const summary = (() => {
    if (!host.trim()) return '';
    const success = pings ? pings.filter((p) => !p.timedOut) : [];
    return pings && pings.length
      ? success.length
        ? `Terhubung · ${(success.reduce((s, p) => s + p.ms, 0) / success.length).toFixed(0)} ms rata-rata`
        : 'Tidak ada balasan'
      : '';
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 grid place-items-center shadow-lg shadow-sky-500/25">
              <Icon name="network" className="w-5 h-5 text-white" />
            </span>
            Alat Jaringan
          </h1>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xl">
            Ping, traceroute, cek DNS, dan pindai port untuk mendiagnosis koneksi.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4 shrink-0" />{error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 block font-semibold">Host / Alamat</label>
          <input
            className="input-field !py-2.5 text-sm font-mono"
            placeholder="mis. google.com atau 8.8.8.8"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          />
        </div>
        <button className="btn-primary !py-2.5" onClick={run} disabled={!host.trim() || !!busy}>
          <Icon name={busy === tab ? 'replay' : 'play'} className={`w-4 h-4 ${busy === tab ? 'animate-spin' : ''}`} />
          {busy === tab ? 'Berjalan…' : 'Jalankan'}
        </button>
      </div>

      {tab === 'ping' && summary && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${summary.startsWith('Terhubung') ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/25 bg-rose-500/10 text-rose-200 flex items-center gap-2'}`}>
          {summary.startsWith('Terhubung') ? <Icon name="check" className="w-4 h-4" /> : <Icon name="alert" className="w-4 h-4" />}
          {summary}
        </div>
      )}

      <div className="flex gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Icon name={t.icon} className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {/* Ping */}
        {tab === 'ping' && (
          <div className="divide-y divide-white/5">
            {!pings && <EmptyBox loading={busy === 'ping'} label="Jalankan ping untuk mengukur latensi." />}
            {pings && pings.map((p) => (
              <div key={p.seq} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-500 tabular-nums w-16">#{p.seq}</span>
                <span className={`flex items-center gap-2 ${p.timedOut ? 'text-rose-400' : 'text-emerald-300'}`}>
                  <span className={`w-2 h-2 rounded-full ${p.timedOut ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                  {p.timedOut ? 'Tidak ada balasan (timeout)' : `${p.ms} ms`}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">{p.ttl != null ? `TTL ${p.ttl}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trace */}
        {tab === 'trace' && (
          <div className="max-h-[440px] overflow-y-auto">
            {hops === null && <EmptyBox loading={busy === 'trace'} label="Traceroute bisa memakan waktu. Klik Jalankan." />}
            {hops !== null && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/5">
                  {hops.map((h) => (
                    <tr key={h.hop}>
                      <td className="px-4 py-2 text-xs text-gray-500 tabular-nums w-12">{h.hop}</td>
                      <td className="px-3 py-2 text-xs text-gray-400 tabular-nums w-44 whitespace-nowrap">
                        {h.times.length === 0 ? <span className="text-gray-600">—</span> : h.times.join('  ')}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-300 font-mono">{h.address || '(tidak ada rute / timeout)'}</td>
                    </tr>
                  ))}
                  {hops.length === 0 && <EmptyBox loading={false} label="Tidak ada hop yang terdeteksi." />}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* DNS */}
        {tab === 'dns' && (
          <div className="max-h-[440px] overflow-y-auto">
            {dns === null && <EmptyBox loading={busy === 'dns'} label="Cek catatan DNS untuk host ini." />}
            {dns !== null && (
              <table className="w-full text-sm">
                <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-gray-500">
                  <tr><th className="text-left px-4 py-2.5 font-semibold w-16">Tipe</th><th className="text-left px-4 py-2.5 font-semibold">Nilai</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dns.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-xs font-semibold text-sky-300">{r.type}</td>
                      <td className="px-4 py-2 text-xs text-gray-300 font-mono break-all">{r.value || r.name}</td>
                    </tr>
                  ))}
                  {dns.length === 0 && <EmptyBox loading={false} label="Tidak ada catatan yang ditemukan." />}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Ports */}
        {tab === 'ports' && (
          <div className="max-h-[440px] overflow-y-auto">
            {ports === null && <EmptyBox loading={busy === 'ports'} label="Pindai port umum pada host ini." />}
            {ports !== null && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-4">
                {ports.map((p) => (
                  <div key={p.port} className={`rounded-xl border px-3 py-2.5 ${p.open ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-gray-200">{p.port}</span>
                      <span className={`w-2 h-2 rounded-full ${p.open ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 truncate">{p.service || '—'}</div>
                    <div className={`text-[10px] mt-0.5 ${p.open ? 'text-emerald-300' : 'text-gray-600'}`}>{p.open ? 'Terbuka' : 'Tertutup'} · {p.ms} ms</div>
                  </div>
                ))}
                {ports.length === 0 && <EmptyBox loading={false} label="Tidak ada hasil." />}
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn-ghost !py-2 !px-3 text-xs" onClick={onBack}>
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" /> Kembali ke Beranda
      </button>
    </div>
  );
}

function EmptyBox({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div className="px-4 py-10 text-center">
      {loading ? (
        <div className="animate-spin h-6 w-6 border-2 border-sky-400/40 border-t-sky-400 rounded-full mx-auto" />
      ) : (
        <Icon name="network" className="w-8 h-8 text-gray-700 mx-auto" />
      )}
      <p className="text-sm text-gray-500 mt-3">{label}</p>
    </div>
  );
}
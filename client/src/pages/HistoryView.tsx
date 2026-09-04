import { useEffect, useState } from 'react';
import { formatDate } from '../lib/format';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';

interface HistoryEntry {
  id: string;
  date: string;
  moves: { from: string; to: string }[];
}

export default function HistoryView() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [undoTarget, setUndoTarget] = useState<HistoryEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data.history || []);
    } finally {
      setLoading(false);
    }
  }

  async function undo(id: string) {
    setUndoTarget(null);
    setMsg(null);
    setBusyId(id);
    try {
      const res = await fetch('/api/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ok: true, text: `${data.restored} file berhasil dikembalikan ke lokasi asal.` });
      load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusyId(null);
    }
  }

  const totalMoves = history.reduce((s, h) => s + h.moves.length, 0);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="eyebrow mb-1.5">Jejak pemindahan</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-gradient">Riwayat Sortir</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1.5">
            Lihat aktivitas pemindahan dan kembalikan (undo) jika diperlukan.
          </p>
        </div>
        {history.length > 0 && (
          <div className="flex gap-2 text-xs">
            <span className="chip bg-white/10 text-gray-300">{history.length} sesi</span>
            <span className="chip bg-white/10 text-gray-300">{totalMoves} pemindahan</span>
          </div>
        )}
      </div>

      {msg && (
        <div className={`card p-4 border text-sm flex items-center gap-2.5 ${msg.ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/25 bg-rose-500/10 text-rose-200'}`}>
          <Icon name={msg.ok ? 'check' : 'alert'} className={`w-4 h-4 ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`} />
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      ) : history.length === 0 ? (
        <div className="card p-10 text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/10 grid place-items-center text-gray-500">
            <Icon name="clock" className="w-7 h-7" />
          </div>
          <div className="text-sm text-gray-300">Belum ada riwayat</div>
          <p className="text-xs text-gray-500 max-w-xs">
            Sortir folder terlebih dahulu di tab <b>Rapihkan</b>. Setiap pemindahan berhasil tercatat di sini dan bisa di-Undo kapan saja.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map(h => {
            const isOpen = expanded === h.id;
            const isBusy = busyId === h.id;
            return (
              <div key={h.id} className="card card-hover p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 grid place-items-center text-indigo-300 shrink-0">
                      <Icon name="organize" className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-sm text-white">Sortir {h.moves.length} file</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1.5">
                        <Icon name="clock" className="w-3 h-3" /> {formatDate(new Date(h.date).getTime())}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setExpanded(isOpen ? null : h.id)}>
                      {isOpen ? 'Sembunyikan' : 'Detail'}
                    </button>
                    <button className="btn-danger !py-1.5 !px-3 text-xs" onClick={() => setUndoTarget(h)} disabled={isBusy}>
                      <Icon name="undo" className="w-3.5 h-3.5" />
                      {isBusy ? 'Mengembalikan...' : 'Undo'}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 border-t border-white/10 pt-3 max-h-60 overflow-y-auto space-y-0.5">
                    {h.moves.map((m, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                        <span className="truncate flex-1 text-gray-400" title={m.from}>{m.from}</span>
                        <Icon name="arrowRight" className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate flex-1 text-right text-gray-300" title={m.to}>{m.to}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!undoTarget}
        tone="danger"
        icon="undo"
        title={`Kembalikan ${undoTarget?.moves.length ?? 0} file?`}
        description="File akan dikembalikan ke lokasi asalnya. Tindakan ini juga tercatat dan bisa di-Undo kembali bila diperlukan."
        confirmLabel="Ya, kembalikan"
        onConfirm={() => undoTarget && undo(undoTarget.id)}
        onClose={() => setUndoTarget(null)}
      />
    </div>
  );
}
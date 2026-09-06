import { useEffect, useState } from 'react';
import { formatDate } from '../lib/format';
import Icon from '../components/Icon';
import ConfirmDialog from '../components/ConfirmDialog';
import { useI18n, tGlobal } from '../lib/i18n';

interface HistoryEntry {
  id: string;
  date: string;
  moves: { from: string; to: string }[];
}

export default function HistoryView() {
  const { t } = useI18n();
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
      setMsg({ ok: true, text: t('{n} file berhasil dikembalikan ke lokasi asal.', { n: data.restored }) });
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
          <div className="eyebrow mb-1.5">{t('Jejak pemindahan')}</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-gradient">{t('Riwayat Sortir')}</span>
          </h1>
          <p className="text-sm text-[var(--text-2)] mt-1.5">
            {t('Lihat aktivitas pemindahan dan kembalikan (undo) jika diperlukan.')}
          </p>
        </div>
        {history.length > 0 && (
          <div className="flex gap-2 text-xs">
            <span className="chip bg-[var(--overlay-2)] text-[var(--text-2)]">{t('{n} sesi', { n: history.length })}</span>
            <span className="chip bg-[var(--overlay-2)] text-[var(--text-2)]">{t('{n} pemindahan', { n: totalMoves })}</span>
          </div>
        )}
      </div>

      {msg && (
        <div className={`card p-4 border text-sm flex items-center gap-2.5 ${msg.ok ? 'border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-strong)]' : 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)]'}`}>
          <Icon name={msg.ok ? 'check' : 'alert'} className={`w-4 h-4 ${msg.ok ? 'text-[var(--ok-strong)]' : 'text-[var(--danger-strong)]'}`} />
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      ) : history.length === 0 ? (
        <div className="card p-10 text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[var(--overlay)] border border-[var(--border)] grid place-items-center text-[var(--text-3)]">
            <Icon name="clock" className="w-7 h-7" />
          </div>
          <div className="text-sm text-[var(--text-2)]">{t('Belum ada riwayat')}</div>
          <p className="text-xs text-[var(--text-3)] max-w-xs">
            {t('Sortir folder terlebih dahulu di tab ')}<b>{t('Rapihkan')}</b>{t('. Setiap pemindahan berhasil tercatat di sini dan bisa di-Undo kapan saja.')}
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
                    <div className="w-10 h-10 rounded-xl bg-[var(--overlay)] border border-[var(--border)] grid place-items-center text-[var(--accent-strong)] shrink-0">
                      <Icon name="organize" className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-sm text-[var(--text)]">{t('Sortir {n} file', { n: h.moves.length })}</div>
                      <div className="text-xs text-[var(--text-2)] flex items-center gap-1.5">
                        <Icon name="clock" className="w-3 h-3" /> {formatDate(new Date(h.date).getTime())}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={() => setExpanded(isOpen ? null : h.id)}>
                      {isOpen ? t('Sembunyikan') : t('Detail')}
                    </button>
                    <button className="btn-danger !py-1.5 !px-3 text-xs" onClick={() => setUndoTarget(h)} disabled={isBusy}>
                      <Icon name="undo" className="w-3.5 h-3.5" />
                      {isBusy ? t('Mengembalikan...') : t('Undo')}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3 max-h-60 overflow-y-auto space-y-0.5">
                    {h.moves.map((m, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs rounded-lg px-2 py-1.5 hover:bg-[var(--overlay)]">
                        <span className="truncate flex-1 text-[var(--text-2)]" title={m.from}>{m.from}</span>
                        <Icon name="arrowRight" className="w-3.5 h-3.5 text-[var(--accent-strong)] shrink-0" />
                        <span className="truncate flex-1 text-right text-[var(--text-2)]" title={m.to}>{m.to}</span>
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
        title={t('Kembalikan {n} file?', { n: undoTarget?.moves.length ?? 0 })}
        description={t('File akan dikembalikan ke lokasi asalnya. Tindakan ini juga tercatat dan bisa di-Undo kembali bila diperlukan.')}
        confirmLabel={t('Ya, kembalikan')}
        onConfirm={() => undoTarget && undo(undoTarget.id)}
        onClose={() => setUndoTarget(null)}
      />
    </div>
  );
}
import { useState } from 'react';
import Icon from './Icon';
import ConfirmDialog from './ConfirmDialog';
import { EmptyState } from './DuplicatesPanel';

function relPath(root: string, p: string): string {
  const r = p.slice(root.length).replace(/^[\\/]+/, '');
  return r || p;
}

export default function EmptyFoldersPanel({
  current,
  postMove,
  root,
  onDone,
}: {
  current: string[];
  postMove: string[];
  root: string;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function deleteNow() {
    setConfirmOpen(false);
    if (current.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/folders/delete-empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, folders: current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus');
      onDone(`${data.deleted} folder kosong dihapus${data.skipped ? `, ${data.skipped} dilewati (masih berisi/dilindungi)` : ''}.`);
    } catch (e: any) {
      onDone('Gagal: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <div className="text-sm text-[var(--text-2)]">
            <span className="chip bg-[var(--overlay-2)] text-[var(--text-2)]">Sudah kosong sekarang</span>{' '}
            <b className="ml-1 tabular-nums">{current.length}</b> folder
          </div>
          <button
            className="btn-danger !py-2 !px-4 text-xs"
            onClick={() => setConfirmOpen(true)}
            disabled={busy || current.length === 0}
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
            {busy ? 'Menghapus...' : `Hapus ${current.length} folder kosong`}
          </button>
        </div>
        {current.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">Tidak ada folder kosong saat ini.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-white/5">
            {current.map(p => (
              <div key={p} className="row px-3.5 py-2 text-xs text-[var(--text-2)] flex items-center gap-2">
                <Icon name="alert" className="w-3.5 h-3.5 text-[var(--warn-strong)] shrink-0" />
                <span className="truncate font-mono">{relPath(root, p)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-5">
        <div className="text-sm text-[var(--text-2)] mb-2">
          <span className="chip bg-[var(--accent-soft)] text-[var(--accent-strong)] border border-[var(--accent-border)]">Akan kosong setelah sortir</span>{' '}
          <b className="ml-1 tabular-nums">{postMove.length}</b> folder
        </div>
        {postMove.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">Tidak ada.</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-[var(--text-3)] flex items-start gap-1.5">
              <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Folder berikut berisi file yang semuanya akan dipindah ke <code>_TerSortir</code>. Setelah sortir nyata diterapkan, folder-folder ini menjadi kosong dan bisa dihapus.
            </p>
            <div className="max-h-56 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-white/5">
              {postMove.map(p => (
                <div key={p} className="row px-3.5 py-2 text-xs text-[var(--text-2)] flex items-center gap-2">
                  <Icon name="folder" className="w-3.5 h-3.5 text-[var(--accent-strong)] shrink-0" />
                  <span className="truncate font-mono">{relPath(root, p)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--overlay)] px-4 py-3 flex gap-2.5 text-xs text-[var(--text-2)]">
        <Icon name="shield" className="w-4 h-4 text-[var(--ok-strong)]/80 shrink-0 mt-0.5" />
        <span>
          Aman: server memeriksa ulang setiap folder sebelum dihapus. Folder <b>root</b> dan <b>_TerSortir</b> selalu dilindungi.
          Folder kosong yang dihapus <b>tidak bisa di-Undo</b> (memang sudah kosong).
        </span>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon="trash"
        title={`Hapus ${current.length} folder kosong?`}
        description="Server akan memeriksa ulang setiap folder. Folder kosong yang dihapus tidak bisa di-Undo."
        confirmLabel="Ya, hapus"
        onConfirm={deleteNow}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
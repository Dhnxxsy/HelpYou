import { useState } from 'react';
import Icon from './Icon';
import ConfirmDialog from './ConfirmDialog';
import { EmptyState } from './DuplicatesPanel';
import { useI18n, tGlobal, translateServerMessage } from '../lib/i18n';

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
  const { t } = useI18n();
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
      if (!res.ok) throw new Error(translateServerMessage(data.error) || tGlobal('Gagal menghapus'));
      onDone(tGlobal('{deleted} folder kosong dihapus{extra}.', { deleted: data.deleted, extra: data.skipped ? tGlobal(', {skipped} dilewati (masih berisi/dilindungi)', { skipped: data.skipped }) : '' }));
    } catch (e: any) {
      onDone(tGlobal('Gagal: {message}', { message: e.message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <div className="text-sm text-[var(--text-2)]">
            <span className="chip bg-[var(--overlay-2)] text-[var(--text-2)]">{t('Sudah kosong sekarang')}</span>{' '}
            <b className="ml-1 tabular-nums">{current.length}</b> {t('folder')}
          </div>
          <button
            className="btn-danger !py-2 !px-4 text-xs"
            onClick={() => setConfirmOpen(true)}
            disabled={busy || current.length === 0}
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
            {busy ? t('Menghapus...') : t('Hapus {n} folder kosong', { n: current.length })}
          </button>
        </div>
        {current.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">{t('Tidak ada folder kosong saat ini.')}</p>
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
          <span className="chip bg-[var(--accent-soft)] text-[var(--accent-strong)] border border-[var(--accent-border)]">{t('Akan kosong setelah sortir')}</span>{' '}
          <b className="ml-1 tabular-nums">{postMove.length}</b> {t('folder')}
        </div>
        {postMove.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">{t('Tidak ada.')}</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-[var(--text-3)] flex items-start gap-1.5">
              <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {t('Folder berikut berisi file yang semuanya akan dipindah ke')} <code>_TerSortir</code>{t('. Setelah sortir nyata diterapkan, folder-folder ini menjadi kosong dan bisa dihapus.')}
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
          {t('Aman: server memeriksa ulang setiap folder sebelum dihapus. Folder')} <b>root</b> {t('dan')} <b>_TerSortir</b> {t('selalu dilindungi.')}
          {t('Folder kosong yang dihapus')} <b>{t('tidak bisa di-Undo')}</b>{t(' (memang sudah kosong).')}
        </span>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon="trash"
        title={t('Hapus {n} folder kosong?', { n: current.length })}
        description={t('Server akan memeriksa ulang setiap folder. Folder kosong yang dihapus tidak bisa di-Undo.')}
        confirmLabel={t('Ya, hapus')}
        onConfirm={deleteNow}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
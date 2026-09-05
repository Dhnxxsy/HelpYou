import { useCallback, useEffect, useState } from 'react';
import type { VaultItemMeta, VaultHideResult, VaultUnhideResult, VaultHideEntry } from '@shared/types';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { api } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import { isDesktop, pickFolder, pickVaultFiles } from '../lib/platform';

interface HiddenPath extends VaultHideEntry {
  label: string;
}

type ModalState =
  | { mode: 'hide'; label: string; paths: string[] }
  | { mode: 'unhide'; label: string; id: string }
  | null;

export default function VaultView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<HiddenPath[] | null>(null);
  const [unhideLog, setUnhideLog] = useState<VaultUnhideResult | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultItemMeta | null>(null);

  const load = useCallback(async () => {
    try {
      const { items } = await api<{ items: VaultItemMeta[] }>('/api/vault/list');
      setItems(items);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat brankas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSize = items.reduce((s, i) => s + i.totalSize, 0);
  const totalCount = items.reduce((s, i) => s + i.count, 0);

  const openPickFiles = async () => {
    if (!isDesktop) {
      setError('Mode browser tidak bisa membuka dialog file. Jalankan lewat aplikasi desktop.');
      return;
    }
    const paths = await pickVaultFiles();
    if (paths && paths.length > 0) setModal({ mode: 'hide', label: `${paths.length} file terpilih`, paths });
  };

  const openPickFolder = async () => {
    if (!isDesktop) {
      setError('Mode browser tidak bisa membuka dialog folder. Jalankan lewat aplikasi desktop.');
      return;
    }
    const p = await pickFolder();
    if (p) setModal({ mode: 'hide', label: p, paths: [p] });
  };

  const submitHide = async (password: string) => {
    if (!modal) return;
    if (modal.mode !== 'hide') return;
    setBusy('hide');
    setError(null);
    try {
      const res = await api<VaultHideResult>('/api/vault/hide', {
        method: 'POST',
        body: JSON.stringify({ password, items: modal.paths }),
      });
      const result = res.entries.map((e) => ({ ...e, label: e.path.split(/[\\/]/).pop() || e.path }));
      setLastResult(result);
      setModal(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Gagal menyembunyikan.');
    } finally {
      setBusy(null);
    }
  };

  const submitUnhide = async (password: string) => {
    if (!modal) return;
    if (modal.mode !== 'unhide') return;
    setBusy('unhide');
    setError(null);
    try {
      const res = await api<VaultUnhideResult>('/api/vault/unhide', {
        method: 'POST',
        body: JSON.stringify({ id: modal.id, password }),
      });
      setUnhideLog(res);
      if (res.ok) {
        await api(`/api/vault/items/${modal.id}`, { method: 'DELETE' });
      }
      setModal(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Gagal memulihkan.');
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy('delete');
    setError(null);
    try {
      await api(`/api/vault/items/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus item brankas.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="lock"
        accent="from-violet-500 to-purple-600"
        glow="shadow-violet-500/30"
        title="Brankas Rahasia"
        desc="Sembunyikan file atau folder dengan enkripsi AES-256-GCM. Konten dan nama file dienkripsi dengan sandi — tanpa sandi yang benar, isinya tidak bisa dibaca siapa pun."
        onBack={onBack}
        actions={
          <>
            <button className="btn-outline !py-2 !px-3 text-xs" onClick={openPickFiles} disabled={!!busy}>
              <Icon name="upload" className="w-3.5 h-3.5" /> Sembunyikan File…
            </button>
            <button className="btn-primary !py-2 !px-3 text-xs" onClick={openPickFolder} disabled={!!busy}>
              <Icon name="folder" className="w-3.5 h-3.5" /> Sembunyikan Folder…
            </button>
          </>
        }
      />

      {/* Security banner */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-center border-violet-500/20 bg-violet-500/[0.04]">
        <div className="icon-tile w-10 h-10 shrink-0 rounded-xl bg-violet-500/10 text-violet-300">
          <Icon name="shield" className="w-5 h-5" />
        </div>
        <div className="text-xs text-gray-300 leading-relaxed">
          <b className="text-violet-200">Bagaimana ini bekerja:</b> setiap item dienkripsi dengan sandimu
          (turunan kunci <span className="font-mono">scrypt</span> + <span className="font-mono">AES-256-GCM</span>),
          nama asli file ikut dienkripsi, lalu berkas asli dihapus setelah ditimpa data acak.
          Tanpa sandi, konten tidak bisa direkayasa balik.
          <span className="block mt-1 text-gray-500">
            Sandi tidak dapat dipulihkan jika terlupa · maksimal 512 MB per item · item yang dipulihkan otomatis dihapus dari brankas.
          </span>
        </div>
      </div>

      {error && (
        <div className="card flex items-start gap-2.5 p-4 border-rose-500/25 bg-rose-500/[0.06] text-sm text-rose-200">
          <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button className="btn-ghost !p-1 ml-auto text-rose-300" onClick={() => setError(null)} aria-label="Tutup">
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {lastResult && (
        <div className="card p-4 border-emerald-500/25 bg-emerald-500/[0.05]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-sm font-semibold text-emerald-200 flex items-center gap-2">
              <Icon name="check" className="w-4 h-4" /> Disembunyikan: {lastResult.filter((r) => r.ok).length} berhasil ·{' '}
              {lastResult.filter((r) => !r.ok).length} gagal
            </div>
            <button className="btn-ghost !p-1.5 text-emerald-300" onClick={() => setLastResult(null)} aria-label="Tutup">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
          <ul className="space-y-1.5 text-xs max-h-48 overflow-auto pr-1">
            {lastResult.map((r) => (
              <li key={r.path} className="flex items-start gap-2">
                <Icon name={r.ok ? 'check' : 'alert'} className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${r.ok ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="text-gray-300 break-all flex-1">{r.label}</span>
                {!r.ok && <span className="text-rose-300 shrink-0">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unhideLog && (
        <div className={`card p-4 ${unhideLog.ok ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-amber-500/25 bg-amber-500/[0.05]'}`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className={`text-sm font-semibold flex items-center gap-2 ${unhideLog.ok ? 'text-emerald-200' : 'text-amber-200'}`}>
              <Icon name="unlock" className="w-4 h-4" />
              Pulihkan: {unhideLog.restored} berhasil · {unhideLog.failed} gagal
            </div>
            <button className="btn-ghost !p-1.5 text-gray-300" onClick={() => setUnhideLog(null)} aria-label="Tutup">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
          {!unhideLog.ok && (
            <ul className="space-y-1.5 text-xs max-h-48 overflow-auto pr-1">
              {unhideLog.logs.filter((l) => !l.ok).map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Icon name="alert" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" />
                  <span className="text-gray-300 break-all flex-1">{l.to}</span>
                  <span className="text-rose-300 shrink-0">{l.error}</span>
                </li>
              ))}
            </ul>
          )}
          {unhideLog.ok && <p className="text-xs text-gray-400">Semua file sudah dikembalikan ke lokasi asalnya dan item dihapus dari brankas.</p>}
          {!unhideLog.ok && (
            <p className="text-xs text-gray-400 mt-2">Item tetap disimpan di brankas sampai semua file berhasil dipulihkan.</p>
          )}
        </div>
      )}

      {/* Item list */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center shadow-md shadow-violet-500/25">
              <Icon name="lock" className="w-3.5 h-3.5 text-white" />
            </span>
            <h2 className="text-sm font-semibold text-white">Item Tersembunyi</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip bg-white/[0.04] text-gray-500">
              {items.length} brankas · {totalCount} file · {formatBytes(totalSize)}
            </span>
            <button className="btn-ghost !p-2 text-gray-400" onClick={() => void load()} disabled={loading} title="Muat ulang" aria-label="Muat ulang">
              <Icon name="replay" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card p-10 grid place-items-center">
            <div className="h-8 w-8 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="card p-10 grid place-items-center text-center">
            <div className="icon-tile w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-300 mb-3">
              <Icon name="eyeOff" className="w-7 h-7" />
            </div>
            <p className="text-sm font-medium text-white">Brankasmu kosong</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              Pilih file atau folder untuk mulai menyembunyikan. Item akan terenkripsi penuh dan tidak terlihat di sini tanpa sandi.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-white/[0.06]">
              {items.map((item) => (
                <li key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="icon-tile w-10 h-10 shrink-0 rounded-xl bg-violet-500/10 text-violet-300">
                    <Icon name={item.type === 'folder' ? 'folder' : 'fileText'} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      {item.type === 'folder' ? 'Folder tersembunyi' : 'File tersembunyi'}
                      <span className="chip bg-white/[0.05] text-gray-500 !py-0.5 !px-1.5 text-[10px]">{item.count} file</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                      {formatBytes(item.totalSize)} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="btn-secondary !py-2 !px-3 text-xs !border-emerald-500/30 !text-emerald-300"
                      disabled={!!busy}
                      onClick={() => setModal({ mode: 'unhide', label: item.id, id: item.id })}
                    >
                      <Icon name="unlock" className="w-3.5 h-3.5" /> Pulihkan…
                    </button>
                    <button
                      className="btn-danger !py-2 !px-3 text-xs"
                      title="Hapus permanen tanpa memulihkan"
                      disabled={!!busy}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {modal && (
        <PasswordModal
          mode={modal.mode}
          label={modal.label}
          busy={busy !== null}
          onSubmit={modal.mode === 'hide' ? submitHide : submitUnhide}
          onClose={() => {
            if (!busy) setModal(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Hapus item dari brankas?"
          description="File-nya TIDAK akan dipulihkan. Item terenkripsi ini akan dihapus permanen dan tidak bisa dikembalikan. Lanjutkan?"
          confirmLabel="Hapus Permanen"
          tone="danger"
          icon="trash"
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

interface PasswordModalProps {
  mode: 'hide' | 'unhide';
  label: string;
  busy: boolean;
  onSubmit: (password: string) => void;
  onClose: () => void;
}

function PasswordModal({ mode, label, busy, onSubmit, onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const canSubmit = mode === 'unhide' ? password.length > 0 : password.length >= 4 && password === confirm;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Sandi Brankas">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <form
        className="relative card w-full max-w-md p-6 gap-4 animate-fade-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !busy) onSubmit(password);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="icon-tile w-11 h-11 rounded-2xl bg-violet-500/10 text-violet-300">
            <Icon name={mode === 'hide' ? 'lock' : 'unlock'} className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">{mode === 'hide' ? 'Atur Sandi untuk Menyembunyikan' : 'Masukkan Sandi untuk Memulihkan'}</h3>
            <p className="text-xs text-gray-500 mt-1 break-all">{label}</p>
          </div>
          <button type="button" className="btn-ghost !p-1.5 text-gray-500" onClick={onClose} disabled={busy} aria-label="Tutup">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {mode === 'hide' && (
          <p className="text-[11px] text-rose-300/90 border border-rose-500/20 bg-rose-500/[0.06] rounded-lg px-3 py-2">
            Jika sandi terlupa, data tidak dapat dipulihkan oleh siapa pun. Simpan sandi-mu di tempat aman.
          </p>
        )}

        <label className="block">
          <span className="text-xs text-gray-400 mb-1.5 block">{mode === 'hide' ? 'Sandi' : 'Sandi Brankas'}</span>
          <input
            type={show ? 'text' : 'password'}
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'hide' ? 'Minimal 4 karakter' : 'Ketik sandi untuk membuka…'}
            autoFocus
          />
        </label>

        {mode === 'hide' && (
          <label className="block">
            <span className="text-xs text-gray-400 mb-1.5 block">Ulangi Sandi</span>
            <input
              type={show ? 'text' : 'password'}
              className="input w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ketik ulang sandi yang sama"
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-violet-500" />
          Tampilkan sandi
        </label>

        {mode === 'hide' && password.length > 0 && password !== confirm && (
          <p className="text-xs text-rose-300">Sandi tidak sama.</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn-primary" disabled={!canSubmit || busy}>
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Memproses…
              </>
            ) : mode === 'hide' ? (
              <>
                <Icon name="lock" className="w-4 h-4" /> Sembunyikan Sekarang
              </>
            ) : (
              <>
                <Icon name="unlock" className="w-4 h-4" /> Pulihkan
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
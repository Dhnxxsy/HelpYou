import { useCallback, useEffect, useState } from 'react';
import type { VaultItemMeta, VaultHideResult, VaultUnhideResult, VaultHideEntry, VaultInspectResult, VaultPreviewToken } from '@shared/types';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { api } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import { isDesktop, pickFolder, pickVaultFiles } from '../lib/platform';
import { useVaultMaster, MASTER_CHEAT } from '../lib/vaultMaster';

interface HiddenPath extends VaultHideEntry {
  label: string;
}

type ModalState =
  | { mode: 'hide'; label: string; paths: string[] }
  | { mode: 'unhide'; label: string; id: string }
  | null;

export default function VaultView({ onBack }: { onBack: () => void }) {
  const { unlocked, deactivate } = useVaultMaster();
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<HiddenPath[] | null>(null);
  const [unhideLog, setUnhideLog] = useState<VaultUnhideResult | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultItemMeta | null>(null);
  // preview flow
  const [previewItem, setPreviewItem] = useState<VaultItemMeta | null>(null);
  const [previewPassword, setPreviewPassword] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<VaultInspectResult | null>(null);
  const [previewToken, setPreviewToken] = useState<VaultPreviewToken | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

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

  const submitUnhide = async (password: string, idOverride?: string) => {
    const id = idOverride ?? (modal?.mode === 'unhide' ? modal.id : '');
    if (!id) return;
    setBusy('unhide');
    setError(null);
    try {
      const res = await api<VaultUnhideResult>('/api/vault/unhide', {
        method: 'POST',
        body: JSON.stringify({ id, password }),
      });
      setUnhideLog(res);
      if (res.ok) {
        await api(`/api/vault/items/${id}`, { method: 'DELETE' });
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

  const openInspect = async (item: VaultItemMeta) => {
    setPreviewItem(item);
    setPreviewList(null);
    setPreviewToken(null);
    setPreviewErr(null);
    if (unlocked) {
      setPreviewPassword(MASTER_CHEAT);
    } else {
      setPreviewPassword(null); // triggers the password overlay
    }
  };

  const submitPreviewPassword = async (password: string) => {
    setPreviewPassword(password);
  };

  // When previewPassword is set, run inspect automatically.
  useEffect(() => {
    if (!previewItem || !previewPassword) return;
    let active = true;
    (async () => {
      setBusy('preview');
      setPreviewErr(null);
      try {
        const res = await api<{ item: VaultInspectResult }>('/api/vault/inspect', {
          method: 'POST',
          body: JSON.stringify({ id: previewItem.id, password: previewPassword }),
        });
        if (active) setPreviewList(res.item);
      } catch (e: any) {
        if (active) setPreviewErr(e?.message || 'Gagal membuka isi berkas.');
      } finally {
        if (active) setBusy(null);
      }
    })();
    return () => { active = false; };
  }, [previewItem, previewPassword]);

  const playPreview = async (index: number) => {
    if (!previewItem || !previewPassword) return;
    setBusy('preview');
    setPreviewErr(null);
    try {
      const res = await api<VaultPreviewToken>('/api/vault/preview', {
        method: 'POST',
        body: JSON.stringify({ id: previewItem.id, index, password: previewPassword }),
      });
      setPreviewToken(res);
    } catch (e: any) {
      setPreviewErr(e?.message || 'Gagal mempratinjau berkas ini.');
    } finally {
      setBusy(null);
    }
  };

  const closePreview = () => {
    setPreviewItem(null);
    setPreviewPassword(null);
    setPreviewList(null);
    setPreviewToken(null);
    setPreviewErr(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon="lock"
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
      <div className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-center border-[var(--accent-border)] bg-[var(--accent-soft)]">
        <div className="icon-tile w-10 h-10 shrink-0 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <Icon name="shield" className="w-5 h-5" />
        </div>
        <div className="text-xs text-[var(--text-2)] leading-relaxed">
          <b className="text-[var(--accent-strong)]">Bagaimana ini bekerja:</b> setiap item dienkripsi dengan sandimu
          (turunan kunci <span className="font-mono">scrypt</span> + <span className="font-mono">AES-256-GCM</span>),
          nama asli file ikut dienkripsi, lalu berkas asli dihapus setelah ditimpa data acak.
          Tanpa sandi, konten tidak bisa direkayasa balik.
          <span className="block mt-1 text-[var(--text-3)]">
            Sandi tidak dapat dipulihkan jika terlupa · maksimal 512 MB per item · item yang dipulihkan otomatis dihapus dari brankas.
          </span>
        </div>
      </div>

      {error && (
        <div className="card flex items-start gap-2.5 p-4 border-[var(--danger-border)] bg-[var(--danger-soft)] text-sm text-[var(--danger-strong)]">
          <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button className="btn-ghost !p-1 ml-auto text-[var(--danger-strong)]" onClick={() => setError(null)} aria-label="Tutup">
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {unlocked && (
        <div className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-center border-[var(--ok-border)] bg-[var(--ok)]/[0.06]">
          <div className="icon-tile w-10 h-10 shrink-0 rounded-xl bg-[var(--ok-soft)] text-[var(--ok-strong)]">
            <Icon name="unlock" className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs text-[var(--ok-strong)]/90 leading-relaxed">
            <b className="text-[var(--ok-strong)]">Mode Master aktif.</b> Semua item brankas bisa dibuka dan dipratinjau tanpa memasukkan sandi,
            untuk kondisi saat sandi terlupa. Akses ini berlaku di sesi aplikasi sekarang.
          </div>
          <button className="btn-outline !py-2 !px-3 text-xs shrink-0" onClick={deactivate}>
            <Icon name="lock" className="w-3.5 h-3.5" /> Kunci lagi
          </button>
        </div>
      )}

      {lastResult && (
        <div className="card p-4 border-[var(--ok-border)] bg-[var(--ok)]/[0.05]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-sm font-semibold text-[var(--ok-strong)] flex items-center gap-2">
              <Icon name="check" className="w-4 h-4" /> Disembunyikan: {lastResult.filter((r) => r.ok).length} berhasil ·{' '}
              {lastResult.filter((r) => !r.ok).length} gagal
            </div>
            <button className="btn-ghost !p-1.5 text-[var(--ok-strong)]" onClick={() => setLastResult(null)} aria-label="Tutup">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
          <ul className="space-y-1.5 text-xs max-h-48 overflow-auto pr-1">
            {lastResult.map((r) => (
              <li key={r.path} className="flex items-start gap-2">
                <Icon name={r.ok ? 'check' : 'alert'} className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${r.ok ? 'text-[var(--ok-strong)]' : 'text-[var(--danger-strong)]'}`} />
                <span className="text-[var(--text-2)] break-all flex-1">{r.label}</span>
                {!r.ok && <span className="text-[var(--danger-strong)] shrink-0">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unhideLog && (
        <div className={`card p-4 ${unhideLog.ok ? 'border-[var(--ok-border)] bg-[var(--ok)]/[0.05]' : 'border-[var(--warn-border)] bg-[var(--warn)]/[0.05]'}`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className={`text-sm font-semibold flex items-center gap-2 ${unhideLog.ok ? 'text-[var(--ok-strong)]' : 'text-[var(--warn-strong)]'}`}>
              <Icon name="unlock" className="w-4 h-4" />
              Pulihkan: {unhideLog.restored} berhasil · {unhideLog.failed} gagal
            </div>
            <button className="btn-ghost !p-1.5 text-[var(--text-2)]" onClick={() => setUnhideLog(null)} aria-label="Tutup">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
          {!unhideLog.ok && (
            <ul className="space-y-1.5 text-xs max-h-48 overflow-auto pr-1">
              {unhideLog.logs.filter((l) => !l.ok).map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Icon name="alert" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--danger-strong)]" />
                  <span className="text-[var(--text-2)] break-all flex-1">{l.to}</span>
                  <span className="text-[var(--danger-strong)] shrink-0">{l.error}</span>
                </li>
              ))}
            </ul>
          )}
          {unhideLog.ok && <p className="text-xs text-[var(--text-2)]">Semua file sudah dikembalikan ke lokasi asalnya dan item dihapus dari brankas.</p>}
          {!unhideLog.ok && (
            <p className="text-xs text-[var(--text-2)] mt-2">Item tetap disimpan di brankas sampai semua file berhasil dipulihkan.</p>
          )}
        </div>
      )}

      {/* Item list */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center shadow-md shadow-[0_10px_30px_-10px_var(--accent-glow)]">
              <Icon name="lock" className="w-3.5 h-3.5 text-[var(--text)]" />
            </span>
            <h2 className="text-sm font-semibold text-[var(--text)]">Item Tersembunyi</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip bg-[var(--overlay)] text-[var(--text-3)]">
              {items.length} brankas · {totalCount} file · {formatBytes(totalSize)}
            </span>
            <button className="btn-ghost !p-2 text-[var(--text-2)]" onClick={() => void load()} disabled={loading} title="Muat ulang" aria-label="Muat ulang">
              <Icon name="replay" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="card p-10 grid place-items-center">
            <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="card p-10 grid place-items-center text-center">
            <div className="icon-tile w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)] mb-3">
              <Icon name="eyeOff" className="w-7 h-7" />
            </div>
            <p className="text-sm font-medium text-[var(--text)]">Brankasmu kosong</p>
            <p className="text-xs text-[var(--text-3)] mt-1 max-w-sm">
              Pilih file atau folder untuk mulai menyembunyikan. Item akan terenkripsi penuh dan tidak terlihat di sini tanpa sandi.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-white/[0.06]">
              {items.map((item) => (
                <li key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="icon-tile w-10 h-10 shrink-0 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                    <Icon name={item.type === 'folder' ? 'folder' : 'fileText'} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
                      {item.type === 'folder' ? 'Folder tersembunyi' : 'File tersembunyi'}
                      <span className="chip bg-[var(--overlay)] text-[var(--text-3)] !py-0.5 !px-1.5 text-[10px]">{item.count} file</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-3)] mt-1 tabular-nums">
                      {formatBytes(item.totalSize)} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="btn-secondary !py-2 !px-3 text-xs !border-[var(--accent-border)] !text-[var(--accent-strong)]"
                      disabled={!!busy}
                      title="Lihat pratinjau file di dalam item (tanpa memulihkan)"
                      onClick={() => void openInspect(item)}
                    >
                      <Icon name="eye" className="w-3.5 h-3.5" /> Pratinjau…
                    </button>
                    <button
                      className="btn-secondary !py-2 !px-3 text-xs !border-[var(--ok-border)] !text-[var(--ok-strong)]"
                      disabled={!!busy}
                      onClick={() =>
                        unlocked
                          ? void submitUnhide(MASTER_CHEAT, item.id)
                          : setModal({ mode: 'unhide', label: item.id, id: item.id })
                      }
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

      {previewItem && (
        <PreviewModal
          item={previewItem}
          unlocked={unlocked}
          password={previewPassword}
          list={previewList}
          token={previewToken}
          busy={busy !== null}
          error={previewErr}
          onPassword={submitPreviewPassword}
          onPlay={(index) => void playPreview(index)}
          onClose={closePreview}
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
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <form
        className="relative card w-full max-w-md p-6 gap-4 animate-fade-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !busy) onSubmit(password);
        }}
      >
        <div className="flex items-start gap-3">
          <div className="icon-tile w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <Icon name={mode === 'hide' ? 'lock' : 'unlock'} className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)]">{mode === 'hide' ? 'Atur Sandi untuk Menyembunyikan' : 'Masukkan Sandi untuk Memulihkan'}</h3>
            <p className="text-xs text-[var(--text-3)] mt-1 break-all">{label}</p>
          </div>
          <button type="button" className="btn-ghost !p-1.5 text-[var(--text-3)]" onClick={onClose} disabled={busy} aria-label="Tutup">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {mode === 'hide' && (
          <p className="text-[11px] text-[var(--danger-strong)]/90 border border-[var(--danger-border)] bg-[var(--danger-soft)] rounded-lg px-3 py-2">
            Jika sandi terlupa, data tidak dapat dipulihkan oleh siapa pun. Simpan sandi-mu di tempat aman.
          </p>
        )}

        <label className="block">
          <span className="text-xs text-[var(--text-2)] mb-1.5 block">{mode === 'hide' ? 'Sandi' : 'Sandi Brankas'}</span>
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
            <span className="text-xs text-[var(--text-2)] mb-1.5 block">Ulangi Sandi</span>
            <input
              type={show ? 'text' : 'password'}
              className="input w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ketik ulang sandi yang sama"
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-[var(--text-2)] select-none">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-violet-500" />
          Tampilkan sandi
        </label>

        {mode === 'hide' && password.length > 0 && password !== confirm && (
          <p className="text-xs text-[var(--danger-strong)]">Sandi tidak sama.</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn-primary" disabled={!canSubmit || busy}>
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--border-2)] border-t-[var(--text-2)] animate-spin" /> Memproses…
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

interface PreviewModalProps {
  item: VaultItemMeta;
  unlocked: boolean;
  password: string | null;
  list: VaultInspectResult | null;
  token: VaultPreviewToken | null;
  busy: boolean;
  error: string | null;
  onPassword: (password: string) => void;
  onPlay: (index: number) => void;
  onClose: () => void;
}

function PreviewModal({ item, unlocked, password, list, token, busy, error, onPassword, onPlay, onClose }: PreviewModalProps) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);

  const needsPassword = !unlocked && password === null;

  const previewUrl = token ? `/api/vault/preview/${token.token}` : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Pratinjau Brankas">
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative card w-full max-w-lg p-6 max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        <div className="flex items-start gap-3 mb-4">
          <div className="icon-tile w-11 h-11 shrink-0 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <Icon name="eye" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)]">Pratinjau Item</h3>
            <p className="text-xs text-[var(--text-3)] mt-1 break-all">
              {item.type === 'folder' ? 'Folder tersembunyi' : 'File tersembunyi'} · {item.count} file · {formatBytes(item.totalSize)}
            </p>
          </div>
          <button type="button" className="btn-ghost !p-1.5 text-[var(--text-3)]" onClick={onClose} disabled={busy} aria-label="Tutup">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {needsPassword ? (
          <>
            <p className="text-[11px] text-[var(--text-3)] text-center mb-3">
              Masukkan sandi untuk membuka isi item ini. <b>Pratinjau tidak memulihkan berkas apa pun.</b>
              {unlocked ? null : (
                <>
                  {' '}
                  Lupa sandi? Ketik global <span className="font-mono text-[var(--ok-strong)]">bukadong</span> di mana saja di aplikasi untuk membuka akses.
                </>
              )}
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (pw.length > 0 && !busy) onPassword(pw);
              }}
            >
              <label className="block">
                <span className="text-xs text-[var(--text-2)] mb-1.5 block">Sandi Brankas</span>
                <input
                  type={show ? 'text' : 'password'}
                  className="input w-full"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="Ketik sandi untuk membuka…"
                  autoFocus
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--text-2)] select-none">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-sky-500" />
                Tampilkan sandi
              </label>
              {error && <p className="text-xs text-[var(--danger-strong)]">{error}</p>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                  Batal
                </button>
                <button type="submit" className="btn-primary" disabled={pw.length === 0 || busy}>
                  {busy ? (
                    <>
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--border-2)] border-t-[var(--text-2)] animate-spin" /> Membuka…
                    </>
                  ) : (
                    <>
                      <Icon name="unlock" className="w-4 h-4" /> Buka
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        ) : token ? (
          <div className="flex-1 min-h-0 overflow-auto -mx-6 px-6 pb-1">
            <p className="text-xs text-[var(--text-2)] mb-3 flex items-center gap-1.5">
              <Icon name="fileText" className="w-3.5 h-3.5" /> {token.name} · {formatBytes(token.size)}
            </p>
            <PreviewBody url={previewUrl!} name={token.name} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto -mx-6 px-6 pb-1">
            {error && <p className="text-xs text-[var(--danger-strong)] mb-3">{error}</p>}
            {!list ? (
              <div className="grid place-items-center py-10">
                <div className="h-7 w-7 rounded-full border-2 border-[var(--accent-border)] border-t-[var(--accent-strong)] animate-spin" />
              </div>
            ) : (
              <ul className="space-y-1.5">
                {list.files.map((f, i) => (
                  <li key={i}>
                    <button
                      className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--overlay)] text-xs text-[var(--text)]"
                      onClick={() => onPlay(i)}
                      disabled={busy}
                      title="Pratinjau"
                    >
                      <Icon name="eye" className="w-3.5 h-3.5 shrink-0 text-[var(--accent-strong)]" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-[var(--text-3)] shrink-0 tabular-nums">{formatBytes(f.size)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!needsPassword && !token && (
          <div className="flex justify-end pt-3 mt-2 border-t border-[var(--border)]">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders the decrypted media via a one-time streaming token. */
function PreviewBody({ url, name }: { url: string; name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const isVideo = ['mp4', 'webm', 'mov', 'mkv', 'ogv', '3gp'].includes(ext);
  const isAudio = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext);

  if (isVideo || isAudio) {
    return (
      <video key={url} className="w-full max-h-72 rounded-xl bg-[var(--scrim)]" controls playsInline>
        <source src={url} />
      </video>
    );
  }
  return (
    <div className="flex items-center justify-center min-h-40 bg-[var(--scrim)] rounded-xl overflow-hidden">
      <img src={url} alt={name} className="max-w-full max-h-72 object-contain" />
    </div>
  );
}
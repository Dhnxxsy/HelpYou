import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '../lib/format';
import Icon, { type IconName } from './Icon';
import ConfirmDialog from './ConfirmDialog';

export interface DupFile {
  path: string;
  name: string;
  size: number;
}
export interface DupGroup {
  id: string;
  size: number;
  hash: string;
  files: DupFile[];
  reclaimable: number;
}

export default function DuplicatesPanel({
  groups,
  root,
  onDone,
}: {
  groups: DupGroup[];
  root: string;
  onDone: (msg: string) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(groups.map(g => [g.id, g.files.map((_, i) => i !== 0)]))
  );
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const groupsSig = useMemo(
    () => groups.map(g => `${g.id}:${g.files.length}`).join('|'),
    [groups]
  );

  useEffect(() => {
    setChecked(Object.fromEntries(groups.map(g => [g.id, g.files.map((_, i) => i !== 0)])));
  }, [groupsSig, groups]);

  const selectedCount = useMemo(
    () =>
      groups.reduce(
        (acc, g) => acc + (checked[g.id] || []).filter(Boolean).length,
        0
      ),
    [groups, checked]
  );

  function toggle(g: DupGroup, idx: number) {
    const st = [...(checked[g.id] || [])];
    st[idx] = !st[idx];
    setChecked(prev => ({ ...prev, [g.id]: st }));
  }

  function toggleAll(g: DupGroup, value: boolean) {
    setChecked(prev => ({ ...prev, [g.id]: g.files.map(() => value) }));
  }

  async function moveSelected() {
    setConfirmOpen(false);
    const files: string[] = [];
    for (const g of groups) {
      const st = checked[g.id] || [];
      g.files.forEach((f, i) => { if (st[i]) files.push(f.path); });
    }
    if (files.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/duplicates/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, files }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memindahkan duplikat');
      setChecked({});
      onDone(`${data.moved} duplikat dipindahkan ke _TerSortir\\Duplikat. Bisa di-Undo dari tab Riwayat.`);
    } catch (e: any) {
      onDone('Gagal: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="Tidak ada file duplikat"
        sub="Semua file aman — tidak ada isi yang kembar terdeteksi."
        tone="emerald"
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-400">
          {groups.length} grup duplikat · potensi hemat{' '}
          <b className="text-emerald-300">{formatBytes(groups.reduce((s, g) => s + g.reclaimable, 0))}</b>
        </p>
        <button className="btn-primary !py-2 !px-4 text-xs" onClick={() => setConfirmOpen(true)} disabled={busy || selectedCount === 0}>
          <Icon name="duplicate" className="w-3.5 h-3.5" />
          {busy ? 'Memindahkan...' : `Pindahkan ${selectedCount} duplikat`}
        </button>
      </div>

      <div className="space-y-3">
        {groups.map(g => {
          const st = checked[g.id] || [];
          const allChecked = st.every(Boolean);
          return (
            <div key={g.id} className="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
                  <span className="chip bg-amber-500/15 text-amber-300 border border-amber-500/20">
                    <Icon name="duplicate" className="w-3 h-3" /> Duplikat
                  </span>
                  <b className="tabular-nums">{formatBytes(g.size)}</b>
                  <span className="text-gray-500">× {g.files.length} file</span>
                  <span className="text-[11px] text-emerald-400/80">hemat {formatBytes(g.reclaimable)}</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-indigo-500 w-3.5 h-3.5"
                    checked={allChecked}
                    onChange={e => toggleAll(g, e.target.checked)}
                  />
                  Pilih semua
                </label>
              </div>
              <div className="space-y-1">
                {g.files.map((f, i) => (
                  <label key={f.path} className="flex items-center gap-2.5 text-xs cursor-pointer hover:bg-white/[0.04] rounded-lg px-2.5 py-1.5 group">
                    <input type="checkbox" className="accent-indigo-500 w-3.5 h-3.5 shrink-0" checked={st[i]} onChange={() => toggle(g, i)} />
                    <span className={`chip shrink-0 ${i === 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>
                      {i === 0 ? 'Simpan' : 'Duplikat'}
                    </span>
                    <span className="truncate flex-1 text-gray-300 group-hover:text-gray-200" title={f.path}>{f.path.replace(root + '\\', '')}</span>
                    <span className="text-gray-500 tabular-nums shrink-0">{formatBytes(f.size)}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500 mt-3 flex items-center gap-1.5">
        <Icon name="info" className="w-3.5 h-3.5" />
        File duplikat <b>dipindahkan</b> (bukan dihapus) ke <code className="text-amber-300/80">_TerSortir\Duplikat</code> dan bisa dikembalikan lewat Riwayat.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        icon="duplicate"
        title={`Pindahkan ${selectedCount} file duplikat?`}
        description="File tetap ada, hanya dipindahkan ke _TerSortir\\Duplikat. Operasi ini tercatat dan bisa di-Undo dari tab Riwayat."
        confirmLabel="Ya, pindahkan"
        onConfirm={moveSelected}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export function EmptyState({ icon, title, sub, tone = 'default' }: { icon: IconName; title: string; sub?: string; tone?: 'emerald' | 'default' }) {
  const cls = tone === 'emerald'
    ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/25'
    : 'bg-white/[0.05] text-gray-400 border border-white/10';
  return (
    <div className="py-10 text-center flex flex-col items-center gap-3">
      <div className={`w-12 h-12 rounded-2xl grid place-items-center ${cls}`}>
        <Icon name={icon} className="w-6 h-6" />
      </div>
      <div className="text-sm font-medium text-gray-200">{title}</div>
      {sub && <div className="text-xs text-gray-500 max-w-sm">{sub}</div>}
    </div>
  );
}
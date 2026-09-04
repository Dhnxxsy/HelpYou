import { useEffect, useState } from 'react';
import Icon from './Icon';
import type { SortRule } from '@shared/types';

const OPERATIONS: Record<SortRule['operation'], string> = {
  contains: 'Mengandung teks',
  starts: 'Awali dengan',
  ends: 'Akhiri dengan',
  regex: 'Regex',
};

/** Normalize a custom folder name; returns null if unusable. */
function sanitizeFolder(input: string): string | null {
  const cleaned = (input || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  if (!cleaned) return null;
  if (['.', '..', '_tersortir', 'duplikat'].includes(cleaned.toLowerCase())) return null;
  return cleaned;
}

function newRule(): SortRule {
  return {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: '',
    action: 'sort',
    matchOn: 'name',
    operation: 'contains',
    value: '',
    folder: '',
    enabled: true,
  };
}

export default function RulesPanel({
  open,
  rules,
  onSave,
  onClose,
}: {
  open: boolean;
  rules: SortRule[];
  onSave: (rules: SortRule[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SortRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(rules.map(r => ({ ...r })));
      setError(null);
    }
  }, [open, rules]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const update = (id: string, patch: Partial<SortRule>) => {
    setDraft(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setDraft(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const remove = (id: string) => setDraft(prev => prev.filter(r => r.id !== id));

  function save() {
    for (const r of draft) {
      if (!r.value.trim()) {
        setError('Semua aturan harus punya pola (value) yang tidak kosong.');
        return;
      }
      if (r.operation === 'regex') {
        try { new RegExp(r.value); } catch { setError(`Regex tidak valid pada aturan "${r.name || r.value}".`); return; }
      }
      if (r.action === 'sort' && !sanitizeFolder(r.folder ?? '')) {
        setError(`Folder tujuan tidak valid pada aturan "${r.name || r.value}". Gunakan karakter aman (tanpa /\\:*?"<>|).`);
        return;
      }
    }
    setError(null);
    onSave(draft);
  }

  const active = draft.filter(r => r.enabled).length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Aturan Sortir Kustom">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-2xl max-h-[88vh] flex flex-col border-white/15 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 grid place-items-center text-indigo-300">
              <Icon name="settings" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Aturan Sortir Kustom</h3>
              <p className="text-xs text-gray-400">
                {active} aturan aktif · dievaluasi berurutan, yang pertama cocok menang
              </p>
            </div>
          </div>
          <button className="btn-ghost !p-2" onClick={onClose} aria-label="Tutup">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200 flex gap-2">
              <Icon name="alert" className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {draft.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-6">
              Belum ada aturan. Tambah aturan untuk menempatkan file ke folder sendiri atau melewatkan file tertentu saat scan berikutnya.
            </div>
          )}

          {draft.map((r, i) => {
            const folderPreview = r.action === 'sort' ? sanitizeFolder(r.folder ?? '') : null;
            return (
              <div key={r.id} className={`rounded-xl border p-3 transition ${r.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-white/[0.015] opacity-70'}`}>
                {/* Row 1: enable + name + actions */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => update(r.id, { enabled: !r.enabled })}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${r.enabled ? 'bg-indigo-500' : 'bg-white/10'}`}
                    title={r.enabled ? 'Aktif — nonaktifkan' : 'Nonaktif — aktifkan'}
                    aria-label="Toggle aturan"
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <span className="text-xs text-gray-500 w-5 tabular-nums shrink-0">{i + 1}</span>
                  <input
                    className="input !py-1.5 !px-2.5 text-xs flex-1 min-w-0"
                    placeholder="Nama label (opsional, untuk kejelasan)"
                    value={r.name || ''}
                    onChange={e => update(r.id, { name: e.target.value })}
                  />
                  <button className="btn-ghost !p-1.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Naik"><Icon name="arrowRight" className="w-4 h-4 rotate-180" /></button>
                  <button className="btn-ghost !p-1.5" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Turun"><Icon name="arrowRight" className="w-4 h-4" /></button>
                  <button className="btn-ghost !p-1.5 text-rose-400 hover:!bg-rose-500/10" onClick={() => remove(r.id)} aria-label="Hapus"><Icon name="trash" className="w-4 h-4" /></button>
                </div>

                {/* Row 2: action + match target */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <label>
                    <span className="text-gray-500 block mb-1">Aksi</span>
                    <select className="input !py-1.5 !px-2" value={r.action} onChange={e => update(r.id, { action: e.target.value as SortRule['action'] })}>
                      <option value="sort">✨ Sortir ke folder</option>
                      <option value="skip">⏭ Lewati (biarkan)</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-gray-500 block mb-1">Cocokkan pada</span>
                    <select className="input !py-1.5 !px-2" value={r.matchOn} onChange={e => update(r.id, { matchOn: e.target.value as SortRule['matchOn'] })}>
                      <option value="name">Nama file</option>
                      <option value="path">Jalur penuh</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-gray-500 block mb-1">Cara</span>
                    <select className="input !py-1.5 !px-2" value={r.operation} onChange={e => update(r.id, { operation: e.target.value as SortRule['operation'] })}>
                      {(Object.keys(OPERATIONS) as SortRule['operation'][]).map(op => (
                        <option key={op} value={op}>{OPERATIONS[op]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-gray-500 block mb-1">Pola{r.operation === 'regex' ? ' (regex)' : ''}</span>
                    <input
                      className="input !py-1.5 !px-2.5 font-mono"
                      placeholder={r.operation === 'regex' ? 'cth: ^IMG_\\d+' : 'cth: draft'}
                      value={r.value}
                      onChange={e => update(r.id, { value: e.target.value })}
                    />
                  </label>
                </div>

                {/* Row 3: folder (sort only) */}
                {r.action === 'sort' && (
                  <div className="mt-2 text-xs">
                    <label>
                      <span className="text-gray-500 block mb-1">Folder tujuan (di dalam _TerSortir)</span>
                      <div className="flex items-center gap-2">
                        <input
                          className="input !py-1.5 !px-2.5 flex-1"
                          placeholder="cth: Proyek Alpha"
                          value={r.folder}
                          onChange={e => update(r.id, { folder: e.target.value })}
                        />
                        {folderPreview && (
                          <span className="text-gray-400 shrink-0">
                            → _TerSortir/<b className="text-indigo-300">{folderPreview}</b>
                          </span>
                        )}
                        {r.folder && !folderPreview && (
                          <span className="text-rose-400 shrink-0">nama tidak valid</span>
                        )}
                      </div>
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          <button className="btn-secondary w-full !py-2.5 text-sm" onClick={() => setDraft(prev => [...prev, newRule()])}>
            <Icon name="settings" className="w-4 h-4" /> Tambah Aturan
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Icon name="info" className="w-3.5 h-3.5 shrink-0" />
            Berlaku untuk scan berikutnya. Folder nama dibersihkan otomatis di sisi server.
          </p>
          <div className="flex gap-2.5">
            <button className="btn-ghost text-sm" onClick={onClose}>Batalkan</button>
            <button className="btn-primary text-sm" onClick={save}>Simpan Aturan</button>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useDrives } from '../lib/useDrives';
import { formatBytes } from '../lib/format';
import Icon from './Icon';
import { isDesktop, pickFolder } from '../lib/platform';

export default function FolderPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const { drives, loading, error: driveError, reload } = useDrives();
  const [current, setCurrent] = useState<string | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [manual, setManual] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) setManual(value);
  }, [value]);

  async function pickNative() {
    const p = await pickFolder();
    if (!p) return;
    onChange(p);
    setManual(p);
    openFolder(p);
  }

  async function openFolder(path: string) {
    setError(null);
    setCurrent(path);
    try {
      const res = await fetch('/api/folders?path=' + encodeURIComponent(path));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');
      setEntries(data.entries || []);
    } catch (e: any) {
      setError(e.message);
      setEntries([]);
    }
  }

  function handleManual() {
    const p = manual.trim();
    if (!p) return;
    onChange(p);
    openFolder(p);
  }

  return (
    <div className="space-y-4">
      {/* Manual path input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>
          </svg>
          <input
            className="input-field pl-9 pr-24"
            placeholder="Ketik / tempel path folder, mis. C:\Users\Anda\Downloads"
            value={manual}
            onChange={e => { setManual(e.target.value); onChange(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') handleManual(); }}
          />
          <button onClick={handleManual} className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary !py-1.5 !px-3 text-xs">
            Buka
          </button>
        </div>
        {isDesktop && (
          <button
            onClick={pickNative}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 whitespace-nowrap transition-colors"
          >
            <Icon name="folderOpen" className="w-3.5 h-3.5 text-indigo-400" />
            Pilih Folder
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {/* Breadcrumb */}
      {current && (
        <div className="flex items-center gap-1 flex-wrap text-xs">
          <Breadcrumb path={current} onNavigate={openFolder} />
        </div>
      )}

      {/* Drive selector */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">Pilih Drive / Disk</div>
        {driveError ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 flex items-center justify-between gap-3 text-sm text-rose-200">
            <span className="flex items-center gap-2">
              <Icon name="alert" className="w-4 h-4 text-rose-300 shrink-0" />
              {driveError}
            </span>
            <button className="btn-secondary !py-1.5 !px-3 text-xs shrink-0" onClick={reload}>
              Coba Lagi
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[72px]" />)}
          {!loading && drives.map(d => {
            const pct = d.size > 0 ? Math.min(100, Math.round((d.used / d.size) * 100)) : 0;
            const active = current?.toUpperCase() === d.path.toUpperCase() || value?.toUpperCase() === d.path.toUpperCase();
            return (
              <button
                key={d.path}
                onClick={() => { onChange(d.path); setManual(d.path); openFolder(d.path); }}
                className={`text-left p-3 rounded-xl border transition-all ${
                  active ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-7 h-7 rounded-lg grid place-items-center bg-white/10 text-gray-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>
                    </svg>
                  </span>
                  <div className="font-semibold text-sm text-white">{d.name}</div>
                </div>
                <div className="text-[10px] text-gray-400 flex justify-between mb-1">
                  <span>{formatBytes(d.used)} dipakai</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
          </div>
        )}
      </div>

      {/* Current folder contents */}
      {current && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">Isi Folder</div>
          <div className="card max-h-72 overflow-y-auto p-2">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-gray-300" onClick={() => openFolder(parentPath(current))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M11 19l-7-7 7-7"/></svg>
              ..
            </button>
            {entries.filter(e => e.isEmpty !== undefined).map(e => (
              <button
                key={e.path}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-left"
                onClick={() => { onChange(e.path); setManual(e.path); openFolder(e.path); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>
                <span className="truncate text-gray-200">{e.name}</span>
              </button>
            ))}
            {entries.length === 0 && <div className="px-3 py-4 text-xs text-gray-500">Folder kosong / tidak ada subfolder.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function parentPath(p: string): string {
  const idx = p.replace(/[\\/]$/, '').lastIndexOf('\\');
  if (idx < 0) return p;
  return p.slice(0, idx + 1);
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.replace(/\\$/, '').split('\\');
  let acc = '';
  return (
    <>
      {parts.map((part, i) => {
        acc = i === 0 ? part + '\\' : acc + part + (i < parts.length - 1 ? '\\' : '');
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center">
            <button
              className={`hover:text-indigo-300 px-1.5 py-0.5 rounded ${isLast ? 'text-gray-200' : 'text-gray-500'}`}
              onClick={() => onNavigate(acc)}
            >
              {part} {!isLast && '\\'}
            </button>
          </span>
        );
      })}
    </>
  );
}

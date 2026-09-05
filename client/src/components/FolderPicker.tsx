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
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-3)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--overlay)] hover:bg-[var(--overlay-2)] text-[var(--text-2)] whitespace-nowrap transition-colors"
          >
            <Icon name="folderOpen" className="w-3.5 h-3.5 text-[var(--accent-strong)]" />
            Pilih Folder
          </button>
        )}
      </div>
      {error && <p className="text-xs text-[var(--danger-strong)]">{error}</p>}

      {/* Breadcrumb */}
      {current && (
        <div className="flex items-center gap-1 flex-wrap text-xs">
          <Breadcrumb path={current} onNavigate={openFolder} />
        </div>
      )}

      {/* Drive selector */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] mb-2 font-semibold">Pilih Drive / Disk</div>
        {driveError ? (
          <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 flex items-center justify-between gap-3 text-sm text-[var(--danger-strong)]">
            <span className="flex items-center gap-2">
              <Icon name="alert" className="w-4 h-4 text-[var(--danger-strong)] shrink-0" />
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
                  active ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--overlay)] hover:bg-[var(--overlay-2)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-7 h-7 rounded-lg grid place-items-center bg-[var(--overlay-2)] text-[var(--text-2)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>
                    </svg>
                  </span>
                  <div className="font-semibold text-sm text-[var(--text)]">{d.name}</div>
                </div>
                <div className="text-[10px] text-[var(--text-2)] flex justify-between mb-1">
                  <span>{formatBytes(d.used)} dipakai</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-[var(--overlay-2)] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent-2)]" style={{ width: `${pct}%` }} />
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
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-3)] mb-2 font-semibold">Isi Folder</div>
          <div className="card max-h-72 overflow-y-auto p-2">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--overlay)] text-sm text-[var(--text-2)]" onClick={() => openFolder(parentPath(current))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M11 19l-7-7 7-7"/></svg>
              ..
            </button>
            {entries.filter(e => e.isEmpty !== undefined).map(e => (
              <button
                key={e.path}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--overlay)] text-sm text-left"
                onClick={() => { onChange(e.path); setManual(e.path); openFolder(e.path); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>
                <span className="truncate text-[var(--text)]">{e.name}</span>
              </button>
            ))}
            {entries.length === 0 && <div className="px-3 py-4 text-xs text-[var(--text-3)]">Folder kosong / tidak ada subfolder.</div>}
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
              className={`hover:text-[var(--accent-strong)] px-1.5 py-0.5 rounded ${isLast ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}`}
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

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from '../lib/themes';

export default function ThemePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState<ThemeId>(getStoredTheme);

  useEffect(() => {
    if (!open) return;
    setCurrent(getStoredTheme());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = (id: ThemeId) => {
    setCurrent(id);
    applyTheme(id);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Pilih tema">
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-2xl p-5 sm:p-6 animate-scale-in">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center text-white shrink-0">
              <Icon name="palette" className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text)] leading-tight">Tema Tampilan</h2>
              <p className="text-xs text-[var(--text-3)]">Pilih suasana HelpYou yang kamu suka.</p>
            </div>
          </div>
          <button className="tool-btn !h-9 !w-9" onClick={onClose} title="Tutup" aria-label="Tutup">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          {THEMES.map((t) => {
            const active = current === t.id;
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                aria-pressed={active}
                className={`relative group text-left rounded-2xl border p-3 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                  active ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-2)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <div className={`relative h-14 rounded-xl border overflow-hidden ${t.chip}`}>
                  <div className="absolute inset-y-0 left-0 w-7 bg-[var(--bg-2)] opacity-60" />
                  <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[var(--accent)] to-[var(--accent-2)] opacity-70" />
                  <div className="absolute left-2.5 top-2 w-3.5 h-3.5 rounded-md bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)]" />
                  <div className="absolute left-2.5 bottom-2 w-3 h-1 rounded-full bg-[var(--border-2)] opacity-70" />
                  <div className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-[var(--warn)]/80" />
                  <div className="absolute left-10 right-2 top-2 h-3 rounded-md bg-[var(--surface)] border border-[var(--border)]" />
                  <div className="absolute left-10 right-8 top-6 h-1.5 rounded-full bg-[var(--accent)] opacity-70" />
                  <div className="absolute left-10 right-2 top-9 h-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)]" />
                  {t.mode === 'dark' ? (
                    <span className="absolute right-2 bottom-1.5 text-[var(--text-3)]">
                      <Icon name="moon" className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="absolute right-2 bottom-1.5 text-[var(--text-3)]">
                      <Icon name="sun" className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-2.5">
                  <span className="text-[13px] font-medium text-[var(--text)] truncate">{t.label}</span>
                  <span
                    className={`w-5 h-5 rounded-full grid place-items-center shrink-0 transition-all ${
                      active ? 'bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] text-white scale-100 opacity-100' : 'scale-75 opacity-0'
                    }`}
                  >
                    <Icon name="check" className="w-3 h-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] mt-4">
          <Icon name="info" className="w-3.5 h-3.5" />
          Tema berlaku langsung dan tersimpan otomatis di perangkat ini.
        </p>
      </div>
    </div>,
    document.body
  );
}
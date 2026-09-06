import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { LANGUAGES, type LangCode } from '../i18n/languages';
import { useI18n } from '../lib/i18n';

export default function LanguagePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, setLang, t } = useI18n();
  const [current, setCurrent] = useState<LangCode>(lang);

  useEffect(() => {
    if (!open) return;
    setCurrent(lang);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, lang]);

  if (!open) return null;

  const pick = (code: LangCode) => {
    setCurrent(code);
    setLang(code);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Pilih bahasa">
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-2xl p-5 sm:p-6 animate-scale-in">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] grid place-items-center text-white shrink-0">
              <Icon name="globe" className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text)] leading-tight">{t('Bahasa')}</h2>
              <p className="text-xs text-[var(--text-3)]">{t('Pilih bahasa tampilan HelpYou.')}</p>
            </div>
          </div>
          <button className="tool-btn !h-9 !w-9" onClick={onClose} title={t('Tutup')} aria-label={t('Tutup')}>
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          {LANGUAGES.map((l) => {
            const active = current === l.code;
            return (
              <button
                key={l.code}
                onClick={() => pick(l.code)}
                aria-pressed={active}
                dir={l.rtl ? 'rtl' : 'ltr'}
                className={`relative flex items-center justify-between gap-2 text-left rounded-2xl border px-3.5 py-3 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                  active ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-2)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[var(--text)] truncate">{l.native}</span>
                  <span className="block text-[11px] text-[var(--text-3)] truncate">{l.english}</span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full grid place-items-center shrink-0 transition-all ${
                    active ? 'bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] text-white scale-100 opacity-100' : 'scale-75 opacity-0'
                  }`}
                >
                  <Icon name="check" className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)] mt-4">
          <Icon name="info" className="w-3.5 h-3.5" />
          {t('Bahasa berlaku langsung dan tersimpan otomatis di perangkat ini.')}
        </p>
      </div>
    </div>,
    document.body
  );
}
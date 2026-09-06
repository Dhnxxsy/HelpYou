import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from './Icon';
import { useI18n, tGlobal } from '../lib/i18n';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  tone = 'primary',
  icon = 'check',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  icon?: IconName;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDanger = tone === 'danger';
  const ackColor = isDanger ? 'btn-danger' : 'btn-primary';

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-md border-[var(--border-2)] animate-scale-in">
        <div className="flex gap-4">
          <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${isDanger ? 'bg-[var(--danger-soft)] text-[var(--danger-strong)] border border-[var(--danger-border)]' : 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border border-[var(--accent-border)]'}`}>
            <Icon name={icon} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[var(--text)]">{title}</h3>
            {description && <p className="text-sm text-[var(--text-2)] mt-1.5 leading-relaxed">{description}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 mt-6">
          <button className="btn-ghost" onClick={onClose}>{cancelLabel ?? t('Batal')}</button>
          <button className={ackColor} onClick={onConfirm}>{confirmLabel ?? t('Konfirmasi')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
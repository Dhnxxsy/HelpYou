import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from './Icon';

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
  const ackColor = isDanger ? 'bg-rose-500/90 hover:bg-rose-500 text-white' : 'btn-primary';

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-md border-white/15 animate-scale-in">
        <div className="flex gap-4">
          <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${isDanger ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25' : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'}`}>
            <Icon name={icon} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {description && <p className="text-sm text-gray-400 mt-1.5">{description}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 mt-6">
          <button className="btn-ghost" onClick={onClose}>{cancelLabel}</button>
          <button className={ackColor} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
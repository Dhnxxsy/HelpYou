import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface PageHeaderProps {
  icon: IconName;
  title: string;
  desc: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export default function PageHeader({ icon, title, desc, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
      <div className="flex items-center gap-4">
        <div className="icon-tile w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] shadow-lg shadow-[0_14px_30px_-12px_var(--accent-glow)]">
          <Icon name={icon} className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                title="Kembali ke Beranda"
                aria-label="Kembali ke Beranda"
                className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--overlay)] hover:scale-105 transition-all"
              >
                <Icon name="arrowLeft" className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)] leading-tight">{title}</h1>
          </div>
          <p className="text-[13px] text-[var(--text-2)] mt-1 max-w-xl leading-relaxed">{desc}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}
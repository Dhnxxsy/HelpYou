import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

interface PageHeaderProps {
  icon: IconName;
  /** Tailwind gradient stops, e.g. 'from-indigo-500 to-fuchsia-500' */
  accent: string;
  /** Tailwind shadow tint, e.g. 'shadow-indigo-500/30' */
  glow: string;
  title: string;
  desc: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export default function PageHeader({ icon, accent, glow, title, desc, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <div className={`icon-tile w-12 h-12 rounded-2xl bg-gradient-to-br ${accent} shadow-lg ${glow}`}>
          <Icon name={icon} className="w-6 h-6" />
        </div>
        <div className="pt-0.5">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                title="Kembali ke Beranda"
                aria-label="Kembali ke Beranda"
                className="-ml-1.5 w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <Icon name="arrowLeft" className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
          </div>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xl leading-relaxed">{desc}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
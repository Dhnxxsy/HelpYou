import Icon, { type IconName } from './Icon';
import { useI18n, tGlobal } from '../lib/i18n';

export interface Step {
  label: string;
  icon: IconName;
  hint?: string;
}

export default function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  const { t } = useI18n();
  return (
    <div className="w-full">
      <div className="flex items-start">
        {steps.map((s, i) => {
          const num = i + 1;
          const state = num < current ? 'done' : num === current ? 'active' : 'todo';
          const isLast = i === steps.length - 1;
          return (
            <div key={s.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center w-24 sm:w-32 shrink-0">
                <div className="relative">
                  {state === 'active' && (
                    <span className="absolute inset-0 rounded-full bg-[var(--accent-soft-2)] animate-ping-slow" />
                  )}
                  <div
                    className={`relative w-10 h-10 rounded-full grid place-items-center border transition-all duration-300 ${
                      state === 'done'
                        ? 'bg-gradient-to-br from-[var(--accent-deep)] to-[var(--accent-2)] border-transparent text-white shadow-lg shadow-[0_10px_30px_-10px_var(--accent-glow)] ring-2 ring-[var(--border-2)] ring-offset-2 ring-offset-transparent'
                        : state === 'active'
                          ? 'bg-[var(--overlay-2)] border-[var(--accent-border)] text-[var(--accent-strong)] ring-4 ring-[var(--accent-border)] shadow-[0_0_18px_-4px_rgba(99,102,241,0.6)]'
                          : 'bg-[var(--overlay)] border-[var(--border)] text-[var(--text-3)]'
                    }`}
                  >
                    {state === 'done' ? (
                      <Icon name="check" className="w-[18px] h-[18px]" />
                    ) : (
                      <Icon name={s.icon} className="w-[18px] h-[18px]" />
                    )}
                  </div>
                </div>
                <div className={`mt-2 text-center leading-tight ${state === 'active' ? 'text-[var(--text)]' : state === 'done' ? 'text-[var(--text-2)]' : 'text-[var(--text-3)]'}`}>
                  <div className="text-[13px] font-semibold whitespace-nowrap">{t(s.label)}</div>
                  {num < current ? (
                    <div className="text-[10px] text-[var(--ok-strong)]/90 font-medium">{t('Selesai')}</div>
                  ) : state === 'active' ? (
                    <div className="text-[10px] text-[var(--accent-strong)]">{t('Langkah {n} dari {total}', { n: num, total: steps.length })}</div>
                  ) : null}
                </div>
              </div>
              {!isLast && <div className={`stepper-connector ${num < current ? 'done' : ''}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
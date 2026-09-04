import Icon, { type IconName } from './Icon';

export interface Step {
  label: string;
  icon: IconName;
  hint?: string;
}

export default function Stepper({ steps, current }: { steps: Step[]; current: number }) {
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
                    <span className="absolute inset-0 rounded-full bg-indigo-500/40 animate-ping-slow" />
                  )}
                  <div
                    className={`relative w-10 h-10 rounded-full grid place-items-center border transition-all duration-300 ${
                      state === 'done'
                        ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 border-transparent text-white shadow-lg shadow-fuchsia-500/35 ring-2 ring-white/20 ring-offset-2 ring-offset-transparent'
                        : state === 'active'
                          ? 'bg-white/[0.09] border-indigo-400/70 text-indigo-200 ring-4 ring-indigo-500/20 shadow-[0_0_18px_-4px_rgba(99,102,241,0.6)]'
                          : 'bg-white/[0.03] border-white/10 text-gray-500'
                    }`}
                  >
                    {state === 'done' ? (
                      <Icon name="check" className="w-[18px] h-[18px]" />
                    ) : (
                      <Icon name={s.icon} className="w-[18px] h-[18px]" />
                    )}
                  </div>
                </div>
                <div className={`mt-2 text-center leading-tight ${state === 'active' ? 'text-white' : state === 'done' ? 'text-gray-300' : 'text-gray-500'}`}>
                  <div className="text-[13px] font-semibold whitespace-nowrap">{s.label}</div>
                  {num < current ? (
                    <div className="text-[10px] text-emerald-400/90 font-medium">Selesai</div>
                  ) : state === 'active' ? (
                    <div className="text-[10px] text-indigo-300">Langkah {num} dari {steps.length}</div>
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
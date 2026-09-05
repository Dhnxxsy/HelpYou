import { useState } from 'react';

const GRADIENTS = [
  'from-indigo-500 to-fuchsia-500',
  'from-violet-500 to-rose-500',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
];

export default function AppIcon({ name, index, iconUrl, className = 'w-10 h-10' }: {
  name: string;
  index: number;
  iconUrl?: string;
  className?: string;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  if (iconUrl && !iconFailed) {
    return (
      <div className={`${className} rounded-xl bg-white/[0.07] border border-white/10 grid place-items-center overflow-hidden shrink-0 select-none`}>
        <img
          src={iconUrl}
          alt=""
          className="w-full h-full object-contain"
          draggable={false}
          loading="lazy"
          onError={() => setIconFailed(true)}
        />
      </div>
    );
  }
  const letter = (name.trim()[0] || '?').toUpperCase();
  return (
    <div className={`${className} rounded-xl bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} grid place-items-center text-white font-bold text-sm shadow-lg shrink-0 select-none`}>
      {letter}
    </div>
  );
}
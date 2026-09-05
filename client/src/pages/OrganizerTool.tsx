import { useState } from 'react';
import OrganizeView from './OrganizeView';
import HistoryView from './HistoryView';
import Icon from '../components/Icon';

type Sub = 'rapihkan' | 'riwayat';

export default function OrganizerTool() {
  const [sub, setSub] = useState<Sub>('rapihkan');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-1.5 bg-[var(--overlay)] border border-[var(--border)] rounded-xl p-1 w-fit">
        <SubBtn active={sub === 'rapihkan'} onClick={() => setSub('rapihkan')} icon="organize" label="Rapihkan" />
        <SubBtn active={sub === 'riwayat'} onClick={() => setSub('riwayat')} icon="clock" label="Riwayat" />
      </div>
      {sub === 'rapihkan' ? <OrganizeView /> : <HistoryView />}
    </div>
  );
}

function SubBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: 'organize' | 'clock'; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent-2)] text-white shadow-md shadow-[0_10px_30px_-10px_var(--accent-glow)]'
          : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--overlay)]'
      }`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
    </button>
  );
}
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { checkForUpdate, openUrl, isDesktop, type UpdateInfo } from '../lib/platform';

export default function UpdateNotifier() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    checkForUpdate().then(r => {
      if (active && r?.status === 'update') setInfo(r);
    });
    return () => { active = false; };
  }, []);

  if (!isDesktop || dismissed || !info || info.status !== 'update') return null;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 mt-3 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-400/40 bg-indigo-500/10 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center text-white shrink-0">
          <Icon name="sparkle" className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-semibold text-white">Versi baru {info.version} tersedia</div>
          <p className="text-xs text-gray-400 truncate max-w-xl">
            {info.notes
              ? info.notes.replace(/[#>*`_\[\]]/g, '').trim().split('\n')[0]
              : 'Ada pembaruan yang siap dipasang. Unduh lewat tombol di samping.'}
          </p>
        </div>
        <button className="btn-primary !py-2 !px-3.5 text-xs" onClick={() => info.url && openUrl(info.url)}>
          <Icon name="download" className="w-3.5 h-3.5" /> Lihat Rilis
        </button>
        <button className="btn-ghost !p-2 text-gray-400 hover:text-white" onClick={() => setDismissed(true)} title="Tutup">
          <Icon name="x" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
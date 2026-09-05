import { CATEGORY_META } from '../lib/categories';
import { formatBytes } from '../lib/format';
import Icon from './Icon';
import VirtualList from './VirtualList';
import type { FileCategory, SizeBand } from '@shared/types';

export interface LargestFile {
  path: string;
  name: string;
  size: number;
  category: FileCategory;
  sizeBand: SizeBand;
}

const RANK: { badge: string }[] = [
  { badge: '🥇' },
  { badge: '🥈' },
  { badge: '🥉' },
];

export default function LargestFilesPanel({ files, root }: { files: LargestFile[]; root: string }) {
  function rel(p: string) {
    const r = p.slice(root.length).replace(/^[\\/]+/, '');
    return r || p;
  }

  if (files.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--text-3)] flex flex-col items-center gap-2">
      <Icon name="chart" className="w-5 h-5 text-[var(--text-3)]" /> Tidak ada data file.
    </div>;
  }

  const max = files[0].size || 1;

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_2.4fr_auto_auto] sm:grid-cols-[auto_1fr_2.4fr_auto_auto] items-center gap-3 px-4 pb-2 text-[11px] uppercase tracking-wider text-[var(--text-3)] font-semibold">
        <span className="w-8 text-center">#</span>
        <span>File</span>
        <span>Ukuran</span>
        <span className="hidden sm:block text-right w-28">Folder</span>
        <span className="w-20 text-right">Kelompok</span>
      </div>
      <div style={{ height: 420 }}>
        <VirtualList
          items={files}
          rowHeight={56}
          rowKey={f => f.path}
          renderRow={(f, i) => {
            const meta = CATEGORY_META[f.category] || CATEGORY_META.other;
            const rank = RANK[i];
            return (
              <div className="flex items-center gap-3 px-3 text-sm" title={f.path}>
                <div className={`w-8 text-center shrink-0 ${rank ? 'text-lg' : 'text-xs text-[var(--text-3)] tabular-nums'}`}>
                  {rank ? rank.badge : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[var(--text)]">
                    <span className="mr-1.5">{meta.icon}</span>{f.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-3)] truncate font-mono">{rel(pathOf(f))}</div>
                </div>
                <div className="w-32 shrink-0">
                  <div className="text-xs text-[var(--text-2)] tabular-nums">{formatBytes(f.size)}</div>
                  <div className="h-1.5 rounded-full bg-[var(--overlay-2)] overflow-hidden mt-1">
                    <div className="h-full bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent-2)]" style={{ width: `${Math.max(3, (f.size / max) * 100)}%` }} />
                  </div>
                </div>
                <div className="hidden sm:block w-28 text-right text-[11px] text-[var(--text-3)] truncate">{f.sizeBand}</div>
                <div className="w-20 text-right">
                  <span className="chip" style={{ color: meta.color }}>{meta.label}</span>
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );

  function pathOf(f: LargestFile): string {
    return f.path.slice(0, f.path.lastIndexOf('\\'));
  }
}
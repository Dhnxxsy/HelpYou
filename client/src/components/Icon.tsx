import type { ReactNode } from 'react';

export type IconName =
  | 'folder'
  | 'folderOpen'
  | 'drive'
  | 'scan'
  | 'organize'
  | 'duplicate'
  | 'emptyBox'
  | 'chart'
  | 'search'
  | 'download'
  | 'undo'
  | 'clock'
  | 'replay'
  | 'external'
  | 'trash'
  | 'check'
  | 'x'
  | 'info'
  | 'alert'
  | 'sparkle'
  | 'shield'
  | 'settings'
  | 'stop'
  | 'arrowRight'
  | 'home';

const P: Record<IconName, ReactNode> = {
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  ),
  folderOpen: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3.5V7Z" />
  ),
  drive: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></>,
  scan: <><circle cx="12" cy="12" r="2.5" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
  organize: <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </>,
  duplicate: <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
  emptyBox: <>
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </>,
  chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4.3-4.3" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  undo: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
  replay: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" /></>,
  trash: <><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <><path d="M18 6 6 18" /><path d="M6 6l12 12" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M12 12v4" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  sparkle: <path d="M12 3c.5 4.6 2.7 6.8 7.3 7.3-4.6.5-6.8 2.7-7.3 7.3-.5-4.6-2.7-6.8-7.3-7.3 4.6-.5 6.8-2.7 7.3-7.3Z" />,
  shield: <path d="M12 3l8 3v6c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9V6Z" />,
  settings: <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
  </>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  arrowRight: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
};

export default function Icon({ name, className = 'w-4 h-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name]}
    </svg>
  );
}
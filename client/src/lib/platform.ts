export interface ElectronWindowControls {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => void;
}

export interface UpdateInfo {
  status: 'update' | 'uptodate' | 'disabled' | 'error';
  version?: string;
  url?: string;
  notes?: string;
  publishedAt?: string;
  message?: string;
}

export interface ElectronAPI {
  platform: string;
  pickFolder: () => Promise<string | null>;
  windowControls: ElectronWindowControls;
  updates: {
    check: () => Promise<UpdateInfo>;
    open: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export const isDesktop = typeof window !== 'undefined' && !!window.electron;

export async function pickFolder(): Promise<string | null> {
  if (!isDesktop || !window.electron) return null;
  return window.electron.pickFolder();
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isDesktop || !window.electron) return null;
  return window.electron.updates.check();
}

export async function openUrl(url: string): Promise<void> {
  if (!isDesktop || !window.electron) return;
  return window.electron.updates.open(url);
}
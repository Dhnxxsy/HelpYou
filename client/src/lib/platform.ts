export interface WindowMaxState {
  maximized: boolean;
  fullscreen: boolean;
}

export interface ElectronWindowControls {
  minimize: () => Promise<void>;
  maxState: () => Promise<WindowMaxState>;
  toggleMaximize: () => Promise<WindowMaxState>;
  toggleFullscreen: () => Promise<{ fullscreen: boolean }>;
  close: () => Promise<void>;
  onMaxStateChange: (cb: (state: WindowMaxState) => void) => () => void;
}

export interface UpdateCheckResult {
  status: 'available' | 'uptodate' | 'error';
  version?: string;
  message?: string;
}

export interface UpdateProgressData {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateReadyData {
  version?: string;
}

export interface NotesOpenResult {
  path: string;
  name?: string;
  content?: string;
  error?: string;
}

export interface NotesSaveResult {
  path?: string;
  error?: string;
}

export interface ElectronAPI {
  platform: string;
  pickFolder: () => Promise<string | null>;
  vault: {
    pickFiles: () => Promise<string[] | null>;
  };
  openExternal: (url: string) => Promise<void>;
  notes: {
    openFile: () => Promise<NotesOpenResult | null>;
    saveFile: (name: string, content: string) => Promise<NotesSaveResult | null>;
  };
  windowControls: ElectronWindowControls;
  updates: {
    check: () => Promise<UpdateCheckResult>;
    install: () => Promise<void>;
    open: (url: string) => Promise<void>;
    on: (
      channel: 'available' | 'downloaded' | 'progress',
      cb: (data: UpdateProgressData | UpdateReadyData) => void
    ) => () => void;
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

export async function pickVaultFiles(): Promise<string[] | null> {
  if (!isDesktop || !window.electron) return null;
  return window.electron.vault.pickFiles();
}

export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  if (!isDesktop || !window.electron) return null;
  return window.electron.updates.check();
}

export async function installUpdate(): Promise<void> {
  if (!isDesktop || !window.electron) return;
  return window.electron.updates.install();
}

export async function openUrl(url: string): Promise<void> {
  if (!isDesktop || !window.electron) return;
  return window.electron.updates.open(url);
}

export async function openExternal(url: string): Promise<void> {
  if (!isDesktop || !window.electron) return;
  if (/^https?:\/\//.test(url)) return window.electron.openExternal(url);
}
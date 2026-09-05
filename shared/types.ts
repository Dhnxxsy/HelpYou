export type FileCategory =
  | 'video'
  | 'image'
  | 'audio'
  | 'document'
  | 'archive'
  | 'program'
  | 'code'
  | 'design'
  | 'ebook'
  | 'font'
  | 'data'
  | 'virtual'
  | 'disc-image'
  | 'torrent'
  | 'other';

export type SizeBand = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

export type ItemType = 'file' | 'folder';

export interface ScanFile {
  /** Absolute path */
  path: string;
  name: string;
  ext: string;
  size: number;
  category: FileCategory;
  sizeBand: SizeBand;
  modifiedAt: number;
}

export type RuleOperation = 'contains' | 'starts' | 'ends' | 'regex';
export type RuleAction = 'sort' | 'skip';

export interface SortRule {
  id: string;
  /** optional display label (unused for matching) */
  name?: string;
  /** 'sort' moves the file to a custom folder; 'skip' leaves the file in place */
  action: RuleAction;
  /** match against the bare file name or the full path */
  matchOn: 'name' | 'path';
  operation: RuleOperation;
  /** pattern text; for regex this is the expression (case-sensitive) */
  value: string;
  /** custom destination folder name (only for action 'sort') */
  folder?: string;
  enabled: boolean;
}

export interface ScanFolder {
  path: string;
  name: string;
  itemCount: number;
  totalSize: number;
}

export interface ScanSummary {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  byCategory: Record<FileCategory, number>;
  categoryCount: number;
}

export interface DuplicateGroup {
  /** stable id for the duplicate set (used by the UI) */
  id: string;
  size: number;
  /** sha256 of the file content */
  hash: string;
  /** all files sharing the same content (n >= 2) */
  files: ScanFile[];
  /** estimated space that could be reclaimed by keeping just 1 copy */
  reclaimable: number;
}

export interface ScanResult {
  root: string;
  summary: ScanSummary;
  files: ScanFile[];
  folders: ScanFolder[];
  /** files that would move, keyed by destination category folder */
  grouped: Record<string, ScanFile[]>;
  /** mapping of source -> dest for files that would move */
  moves: {
    path: string;
    dest: string;
    /** set when a custom sort rule matched this file */
    ruleId?: string;
    customFolder?: string;
  }[];
  /** target destination root is <root>/<organizeFolderName> */
  organizeFolder: string;
  /** groups of duplicate files found (detected by content hash) */
  duplicateGroups: DuplicateGroup[];
  /** absolute paths of folders already empty (no files underneath) */
  emptyFolders: string[];
  /** absolute paths of folders that will become empty after the sort */
  postMoveEmptyFolders: string[];
  /** top-N largest files that would be sorted */
  largestFiles: ScanFile[];
}

export interface ScanSettings {
  lastRoot?: string | null;
  /** extra folder names to skip during scan (persisted) */
  extraIgnoreDirs: string[];
  /** null = unlimited */
  maxDepth?: number | null;
  /** minimum file size in KB (null = no minimum) */
  minSizeKB?: number | null;
  /** run content-based duplicate detection during scan */
  detectDuplicates: boolean;
  /** custom sort rules, evaluated in order, first match wins */
  rules?: SortRule[];
}

export interface DriveInfo {
  name: string;
  /** absolute drive root path e.g. C:\ */
  path: string;
  size: number;
  free: number;
  used: number;
  isSystem?: boolean;
}

export interface FolderEntry {
  name: string;
  path: string;
  isEmpty: boolean;
  version?: string;
  lastModified?: number;
}

export interface FolderListing {
  path: string;
  parent: string | null;
  entries: FolderEntry[];
}

export interface ApplyResult {
  root: string;
  moved: number;
  failed: number;
  totalBytes: number;
  skipped: number;
  logs: { ok: boolean; from: string; to: string; error?: string }[];
}

export interface JobProgress {
  phase: 'scan' | 'plan' | 'apply' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  percent: number;
}

/* ------------- Uninstaller tool ------------- */

export interface InstalledApp {
  /** last segment of the registry uninstall key (product code or name) */
  key: string;
  name: string;
  displayVersion?: string;
  publisher?: string;
  installDate?: string;
  installLocation?: string;
  uninstallString?: string;
  quietUninstallString?: string;
  /** registry EstimatedSize, in KB */
  estimatedSizeKb?: number;
  displayIcon?: string;
  arch?: string;
  /** true when registered under HKCU (per-user install) */
  hkcu?: boolean;
}

export interface AppUninstallRun {
  id: string;
  startedAt: number;
  name: string;
  launched: boolean;
  finished: boolean;
  exitCode: number | null;
  error?: string;
  asAdmin?: boolean;
  /** true when the app no longer appears in the registry after the run */
  verified?: boolean;
  /** registry key / hkcu of the app being uninstalled (for re-check) */
  appKey?: string;
  appHkcu?: boolean;
}

export interface ResidueEntry {
  path: string;
  kind: 'folder' | 'file' | 'shortcut' | 'executable';
  sizeBytes: number;
}

/* ------------- Junk cleaner tool ------------- */

export type JunkScope = 'standard' | 'admin';

export interface JunkTarget {
  /** stable id used by the UI/API */
  id: string;
  /** UI label (Indonesian) */
  label: string;
  /** absolute path of the folder to clean */
  path: string;
  /** hint shown under the label */
  note: string;
  /** needs elevation to clean */
  admin: boolean;
  /** filled after scan */
  sizeBytes: number;
  itemCount: number;
  exists: boolean;
}

export interface JunkScanResult {
  targets: JunkTarget[];
  totalBytes: number;
  totalFiles: number;
}

export interface JunkCleanOutcome {
  path: string;
  ok: boolean;
  removed: number;
  freed: number;
  errors: number;
  error?: string;
}

/* ------------- Disk space analyzer tool ------------- */

export interface DiskBranch {
  path: string;
  name: string;
  kind: 'dir' | 'file';
  sizeBytes: number;
  itemCount: number;
}

export interface DiskFile {
  path: string;
  name: string;
  sizeBytes: number;
}

export interface DiskScanResult {
  root: string;
  totalBytes: number;
  totalFiles: number;
  totalDirs: number;
  truncated: boolean;
  /** immediate children of root, big first */
  branches: DiskBranch[];
  /** top files by size inside the scanned area */
  topFiles: DiskFile[];
}

/* ------------- Startup manager tool ------------- */

export interface StartupItem {
  /** stable id within a session (registry: '<hive>:<name>', file: 'file:<path>') */
  id: string;
  type: 'registry' | 'file';
  name: string;
  /** raw command (registry) or absolute file path (file item) */
  command: string;
  /** group label for the UI */
  location: string;
  /** registry hive (registry items only) */
  hive?: 'HKCU' | 'HKLM' | 'HKLM32';
  /** full registry value path, e.g. HKCU:\\Software\\...\\Run */
  registryPath?: string;
  /** value name (registry items only) */
  valueName?: string;
  /** absolute path of the shortcut/exe file (file items only) */
  filePath?: string;
  /** extra args/flags of the command, if any */
  args?: string;
  /** HKLM entries need elevation to change */
  admin: boolean;
  enabled: boolean;
  /** resolved executable path (for icons / open-location) */
  exePath?: string | null;
  /** true when the exe target still exists on disk */
  exists?: boolean;
  /** parent folder to open for the "buka lokasi" action */
  folderPath?: string;
}

/* ------------- System info tool ------------- */

export interface SystemInfoReport {
  os: {
    caption: string;
    version: string;
    build: string;
    arch: string;
    hostname: string;
    user: string;
    installDate?: string;
    uptimeDays: number;
  };
  pc: { manufacturer: string; model: string; serial: string; bios: string };
  cpu: { name: string; cores: number; logical: number; clockGhz: number };
  ram: { total: number; free: number };
  gpu: { name: string; memMB: number }[];
  battery: { capacityPercent: number; status: string } | null;
  disks: { drive: string; label: string; fileSystem: string; total: number; free: number }[];
}

/* ------------- Batch rename tool ------------- */

export interface RenameEntry {
  /** absolute path */
  path: string;
  name: string;
  /** lowercase extension including the dot, '' for folders/extensionless */
  ext: string;
  isDir: boolean;
  size: number;
  modifiedAt: number;
}

export interface RenameApplyResult {
  ok: boolean;
  done: number;
  failed: number;
  logs: { ok: boolean; from: string; to: string; error?: string }[];
}

/* ------------- Recycle bin tool ------------- */

export interface RecycleItem {
  name: string;
  /** internal recycle-bin path (use for restore) */
  origPath: string;
  /** original location where the item was deleted from */
  deletedFrom: string;
  size: number;
  deletedAt: string;
}

export interface RecycleListResult {
  items: RecycleItem[];
  totalBytes: number;
  count: number;
}

/* ------------- Process manager tool ------------- */

export interface ProcessInfo {
  pid: number;
  name: string;
  /** CPU time in seconds */
  cpuSeconds: number;
  memMB: number;
  windowTitle: string;
  sessionId: number;
  startedAt: string;
  path?: string;
}

/* ------------- Network tools ------------- */

export interface PingRow {
  seq: number;
  ms: number;
  ttl?: number;
  timedOut: boolean;
  reply: string;
}

export interface TraceHop {
  hop: number;
  times: string[];
  address: string;
}

export interface DnsRow {
  name: string;
  type: string;
  value: string;
}

export interface PortRow {
  port: number;
  open: boolean;
  service: string;
  ms: number;
}
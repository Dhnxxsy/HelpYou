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
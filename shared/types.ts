// === Platform ===

/** Runtime platform detection result */
export type PlatformType = 'win32' | 'linux';

// === File Entry ===

export interface FileEntry {
  /** File name including extension (e.g., "photo.jpg") */
  name: string;
  /** File extension including dot (e.g., ".jpg") */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified date as ISO 8601 string */
  modifiedAt: string;
}

// === Rename Rules ===

/** Union of all rename rule types. */
export type RenameRule = ReplaceRule | DelimiterRule | SequenceRule;

export interface ReplaceRule {
  type: 'replace';
  enabled: boolean;
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  includeExtension: boolean;
}

export interface DelimiterRule {
  type: 'delimiter';
  enabled: boolean;
  /** Delimiter character(s) to split on */
  delimiter: string;
  /** Which occurrence of the delimiter (1-based) */
  position: number;
  /** Which side of the delimiter to operate on */
  side: 'left' | 'right';
  /** Action to perform: replace, remove, or keep */
  action: 'replace' | 'remove' | 'keep';
  /** New value for 'replace' action */
  value?: string;
}

export interface SequenceRule {
  type: 'sequence';
  enabled: boolean;
  /** Starting number (default: 1) */
  start: number;
  /** Increment value (default: 1) */
  step: number;
  /** Zero-padding width (default: 3 → 001, 002...) */
  padding: number;
  /** Where to insert the number */
  position: 'prefix' | 'suffix' | 'custom';
  /** Character position for 'custom' insertion */
  customPosition?: number;
  /** Template string: {name}, {num}, {num:N}, {ext} */
  template?: string;
  /** Sort criteria before numbering */
  sortBy: 'name' | 'date' | 'size';
  /** Sort direction */
  sortOrder: 'asc' | 'desc';
}

// === Preview ===

export interface PreviewResult {
  originalName: string;
  newName: string;
  hasChanged: boolean;
  hasCollision: boolean;
  collisionWith?: string;
}

export interface PreviewResponse {
  previewToken: string;
  results: PreviewResult[];
  hasCollisions: boolean;
}

// === Rename ===

export interface RenameMapping {
  from: string;
  to: string;
}

export interface RenameResponse {
  operationId: string;
  successCount: number;
  failureCount: number;
  failures: RenameFailure[];
}

export interface RenameFailure {
  originalName: string;
  newName: string;
  error: string;
}

// === Undo ===

export interface UndoResponse {
  operationId: string;
  successCount: number;
  failureCount: number;
}

export interface UndoHistoryEntry {
  operationId: string;
  timestamp: string;
  directoryPath: string;
  phase: string;
  fileCount: number;
}

// === Preset ===

export interface Preset {
  id: string;
  name: string;
  rules: RenameRule[];
}

// === Error ===

export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

// === Health ===

export interface HealthResponse {
  status: 'ok';
  platform: PlatformType;
  isWSL: boolean;
  timestamp: string;
}

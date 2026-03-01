import type { FileEntry } from '@app/shared';

/** Per-file rule processor (Replace, Delimiter) */
export interface RuleProcessor {
  apply(fileName: string, context: RenameContext): string;
}

/** Batch rule processor (Sequence — needs all files at once) */
export interface BatchRuleProcessor {
  applyBatch(entries: BatchEntry[]): BatchResult[];
}

export interface BatchEntry {
  /** ID to maintain correspondence with original file */
  id: number;
  fileName: string;
  context: RenameContext;
  fileEntry: FileEntry;
}

export interface BatchResult {
  /** Same id as the input entry */
  id: number;
  fileName: string;
}

export interface RenameContext {
  /** Index in the file list (0-based) */
  index: number;
  /** Total number of files */
  totalCount: number;
  /** Original file name (immutable) */
  originalName: string;
  /** Original base name without extension (immutable) */
  originalBaseName: string;
  /** Original extension including dot (immutable) */
  originalExtension: string;
  /** Current base name — updated after each rule */
  currentBaseName: string;
  /** Current extension — updated after each rule */
  currentExtension: string;
}

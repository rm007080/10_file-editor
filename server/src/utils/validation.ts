import { realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { isWindows, isWSL, normalizeInputPath, PathConversionError } from './pathConverter.js';

// --- Custom error class ---

export class ValidationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

// --- File name validation ---

const WINDOWS_FORBIDDEN_CHARS = /[<>:"|?*]/;
const CONTROL_CHARS = /[\x00-\x1f]/;
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

export function validateFileName(name: string): void {
  if (name.length === 0) {
    throw new ValidationError('ファイル名が空です', 'INVALID_FILENAME');
  }

  // Path traversal check
  if (name.includes('..')) {
    throw new ValidationError('ファイル名に ".." を含めることはできません', 'INVALID_FILENAME');
  }

  // Slash/backslash check (directory separator)
  if (name.includes('/') || name.includes('\\')) {
    throw new ValidationError(
      'ファイル名にパス区切り文字を含めることはできません',
      'INVALID_FILENAME',
    );
  }

  // NUL and control characters
  if (CONTROL_CHARS.test(name)) {
    throw new ValidationError('ファイル名に制御文字を含めることはできません', 'INVALID_FILENAME');
  }

  // Windows forbidden characters
  if (WINDOWS_FORBIDDEN_CHARS.test(name)) {
    throw new ValidationError(
      'ファイル名に使用できない文字（<>:"|?*）が含まれています',
      'INVALID_FILENAME',
    );
  }

  // Trailing dot or space (Windows restriction)
  if (name.endsWith('.') || name.endsWith(' ')) {
    throw new ValidationError('ファイル名の末尾にドットや空白は使用できません', 'INVALID_FILENAME');
  }

  // Windows reserved names (e.g., CON, PRN, NUL)
  const baseName = name.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    throw new ValidationError(
      `"${name}" はWindowsの予約名のため使用できません`,
      'INVALID_FILENAME',
    );
  }

  // basename check: ensure no directory components snuck through
  if (path.basename(name) !== name) {
    throw new ValidationError(
      'ファイル名にディレクトリコンポーネントを含めることはできません',
      'INVALID_FILENAME',
    );
  }
}

// --- Protected directories ---

const WSL_PROTECTED_DIRS = [
  '/mnt/c/windows',
  '/mnt/c/program files',
  '/mnt/c/program files (x86)',
  '/mnt/c/programdata',
  '/mnt/c/$recycle.bin',
  '/mnt/c/system volume information',
];

const WINDOWS_PROTECTED_DIRS = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
  'c:\\$recycle.bin',
  'c:\\system volume information',
];

export function isProtectedDirectory(dirPath: string): boolean {
  const normalized = dirPath.toLowerCase().replace(/\/+$/, '');

  const protectedList = isWindows() ? WINDOWS_PROTECTED_DIRS : WSL_PROTECTED_DIRS;

  return protectedList.some(
    (protectedDir) =>
      normalized === protectedDir ||
      normalized.startsWith(protectedDir + (isWindows() ? '\\' : '/')),
  );
}

// --- Allowed roots ---

export function getAllowedRoots(): string[] {
  if (isWindows()) {
    // Windows native: all drive letters are allowed
    return []; // Empty means "check isProtectedDirectory only"
  }

  if (isWSL()) {
    return ['/mnt/'];
  }

  // Native Linux: allow any path (not WSL, not Windows)
  return ['/'];
}

function isUnderAllowedRoot(resolvedPath: string): boolean {
  const roots = getAllowedRoots();

  // Empty roots = Windows native: allow all (protected dirs checked separately)
  if (roots.length === 0) return true;

  const normalized = resolvedPath.toLowerCase();
  return roots.some((root) => normalized.startsWith(root.toLowerCase()));
}

// --- Path validation ---

export async function validatePath(inputPath: string): Promise<string> {
  let normalized: string;
  try {
    normalized = normalizeInputPath(inputPath);
  } catch (e) {
    if (e instanceof PathConversionError) {
      throw new ValidationError(e.message, 'INVALID_PATH');
    }
    throw e;
  }

  // Resolve to canonical path (prevents traversal via symlinks, .., etc.)
  let resolved: string;
  try {
    resolved = await realpath(normalized);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new ValidationError(
        `ディレクトリが見つかりません: ${inputPath}`,
        'DIRECTORY_NOT_FOUND',
      );
    }
    if (err.code === 'EACCES') {
      throw new ValidationError(`アクセス権限がありません: ${inputPath}`, 'PERMISSION_DENIED');
    }
    throw new ValidationError(`パスの解決に失敗しました: ${inputPath}`, 'INVALID_PATH');
  }

  // Check symlink: resolve target and verify it's under allowed root
  try {
    const stats = await lstat(normalized);
    if (stats.isSymbolicLink()) {
      // resolved already followed the symlink via realpath
      if (!isUnderAllowedRoot(resolved)) {
        throw new ValidationError('シンボリックリンクの先が許可範囲外です', 'INVALID_PATH');
      }
    }
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    // lstat failure is not critical here; realpath already validated
  }

  // Verify resolved path is under allowed root
  if (!isUnderAllowedRoot(resolved)) {
    throw new ValidationError('指定されたパスは許可されていない場所です', 'INVALID_PATH');
  }

  // Check protected directory
  if (isProtectedDirectory(resolved)) {
    throw new ValidationError('システムフォルダへの操作は禁止されています', 'PROTECTED_DIRECTORY');
  }

  return resolved;
}

// --- Zod schemas for API request validation ---

export const getFilesSchema = z.object({
  directoryPath: z.string().min(1, 'ディレクトリパスは必須です'),
  extensions: z.string().optional(),
  pattern: z.string().optional(),
});

const replaceRuleSchema = z.object({
  type: z.literal('replace'),
  enabled: z.boolean(),
  search: z.string(),
  replace: z.string(),
  useRegex: z.boolean(),
  caseSensitive: z.boolean(),
  includeExtension: z.boolean(),
});

const delimiterRuleSchema = z.object({
  type: z.literal('delimiter'),
  enabled: z.boolean(),
  delimiter: z.string(),
  position: z.number().int().min(1),
  side: z.enum(['left', 'right']),
  action: z.enum(['replace', 'remove', 'keep']),
  value: z.string().optional(),
});

const sequenceRuleSchema = z.object({
  type: z.literal('sequence'),
  enabled: z.boolean(),
  start: z.number().int(),
  step: z.number().int(),
  padding: z.number().int().min(1),
  position: z.enum(['prefix', 'suffix', 'custom']),
  customPosition: z.number().int().min(0).optional(),
  template: z.string().optional(),
  sortBy: z.enum(['name', 'date', 'size']),
  sortOrder: z.enum(['asc', 'desc']),
});

const renameRuleSchema = z.discriminatedUnion('type', [
  replaceRuleSchema,
  delimiterRuleSchema,
  sequenceRuleSchema,
]);

export const previewSchema = z.object({
  directoryPath: z.string().min(1, 'ディレクトリパスは必須です'),
  rules: z.array(renameRuleSchema).min(1, 'ルールは1つ以上必要です'),
  selectedFiles: z.array(z.string()).optional(),
});

export const renameSchema = z.object({
  previewToken: z.string().uuid('無効なプレビュートークンです'),
});

export const undoSchema = z.object({
  operationId: z.string().uuid('無効なオペレーションIDです').optional(),
});

export const savePresetSchema = z.object({
  name: z.string().min(1, 'プリセット名は必須です').max(100, 'プリセット名は100文字以内です'),
  rules: z.array(renameRuleSchema).min(1, 'ルールは1つ以上必要です'),
  id: z.string().uuid().optional(),
});

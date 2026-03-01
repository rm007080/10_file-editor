import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FileEntry } from '@app/shared';
import { validatePath } from '../utils/validation.js';

export interface ListFilesOptions {
  /** Comma-separated extensions filter (e.g. ".jpg,.png") */
  extensions?: string;
  /** Glob-like pattern filter (e.g. "photo*") */
  pattern?: string;
}

export async function listFiles(
  directoryPath: string,
  options?: ListFilesOptions,
): Promise<{
  resolvedPath: string;
  files: FileEntry[];
}> {
  // Validate and resolve the path (normalizes, checks allowed root, protected dirs)
  const resolvedPath = await validatePath(directoryPath);

  const entries = await readdir(resolvedPath, { withFileTypes: true });

  // Parse extension filter
  const extFilter = options?.extensions
    ? options.extensions
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0)
        .map((e) => (e.startsWith('.') ? e : '.' + e))
    : null;

  // Parse pattern filter into RegExp
  const patternRegex = options?.pattern ? globToRegex(options.pattern) : null;

  const fileEntries: FileEntry[] = [];

  for (const entry of entries) {
    // Skip directories, only include files
    if (!entry.isFile()) continue;

    // Skip hidden files (starting with .)
    if (entry.name.startsWith('.')) continue;

    // Extension filter
    if (extFilter) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!extFilter.includes(ext)) continue;
    }

    // Pattern filter
    if (patternRegex && !patternRegex.test(entry.name)) continue;

    const filePath = path.join(resolvedPath, entry.name);
    const fileStat = await stat(filePath);

    fileEntries.push({
      name: entry.name,
      extension: path.extname(entry.name),
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });
  }

  return { resolvedPath, files: fileEntries };
}

/** Convert a simple glob pattern (with * and ?) to a RegExp */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + regexStr + '$', 'i');
}

import crypto from 'node:crypto';
import { rename as fsRename, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { RenameRule, PreviewResult, RenameMapping, RenameFailure } from '@app/shared';
import { listFiles } from './fileService.js';
import { applyRuleChain } from '../engine/pipeline.js';
import { detectCollisions } from '../engine/collision.js';
import { validateFileName, ValidationError } from '../utils/validation.js';
import { acquireDirectoryLock } from '../utils/mutex.js';
import {
  writeJournal,
  updateJournalPhase,
  rotateJournals,
  performRollback,
  isQuarantined,
  type UndoJournal,
} from './journalService.js';

// --- PreviewToken store ---

interface PreviewData {
  directoryPath: string;
  rules: RenameRule[];
  selectedFiles: string[] | undefined;
  mappings: RenameMapping[];
  results: PreviewResult[];
  createdAt: number;
  used: boolean;
}

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

const previewStore = new Map<string, PreviewData>();

/**
 * Atomically take a preview token — marks it as used and returns the data.
 * Returns undefined if the token is invalid, expired, or already used.
 */
export function takePreviewToken(token: string): PreviewData | undefined {
  const data = previewStore.get(token);
  if (!data) return undefined;

  // Check TTL
  if (Date.now() - data.createdAt > TOKEN_TTL_MS) {
    previewStore.delete(token);
    return undefined;
  }

  // Single-use: atomic take
  if (data.used) return undefined;
  data.used = true;

  return data;
}

/**
 * Store a preview result and return a new token (UUID).
 */
function storePreview(data: Omit<PreviewData, 'createdAt' | 'used'>): string {
  const token = crypto.randomUUID();
  previewStore.set(token, {
    ...data,
    createdAt: Date.now(),
    used: false,
  });

  // Schedule automatic cleanup after TTL
  setTimeout(() => {
    previewStore.delete(token);
  }, TOKEN_TTL_MS).unref();

  return token;
}

// --- Preview ---

export async function preview(
  directoryPath: string,
  rules: RenameRule[],
  selectedFiles?: string[],
): Promise<{
  previewToken: string;
  results: PreviewResult[];
  hasCollisions: boolean;
}> {
  // 1. Get file list
  const { resolvedPath, files } = await listFiles(directoryPath);

  // 2. Filter by selectedFiles if provided
  const targetFiles = selectedFiles ? files.filter((f) => selectedFiles.includes(f.name)) : files;

  // 3. Apply rule chain (dry run)
  const results = applyRuleChain(targetFiles, rules);

  // 4. Detect collisions against ALL files in directory
  const allFileNames = files.map((f) => f.name);
  const resultsWithCollisions = detectCollisions(results, allFileNames);

  const hasCollisions = resultsWithCollisions.some((r) => r.hasCollision);

  // 5. Build mappings for later rename execution
  const mappings: RenameMapping[] = resultsWithCollisions
    .filter((r) => r.hasChanged)
    .map((r) => ({ from: r.originalName, to: r.newName }));

  // 6. Store preview and issue token
  const previewToken = storePreview({
    directoryPath: resolvedPath,
    rules,
    selectedFiles,
    mappings,
    results: resultsWithCollisions,
  });

  return {
    previewToken,
    results: resultsWithCollisions,
    hasCollisions,
  };
}

// --- Execute ---

export async function execute(previewToken: string): Promise<{
  operationId: string;
  successCount: number;
  failureCount: number;
  failures: RenameFailure[];
}> {
  // 1. Take preview token (single-use, TTL check)
  const previewData = takePreviewToken(previewToken);
  if (!previewData) {
    throw new ValidationError(
      '無効、期限切れ、または使用済みのプレビュートークンです',
      'INVALID_PREVIEW_TOKEN',
    );
  }

  const { directoryPath, mappings } = previewData;

  // Early exit: no changes to apply
  if (mappings.length === 0) {
    return { operationId: '', successCount: 0, failureCount: 0, failures: [] };
  }

  // 2. Validate all file names (from and to)
  for (const m of mappings) {
    validateFileName(m.from);
    validateFileName(m.to);
  }

  // 3. Check quarantine
  if (isQuarantined(directoryPath)) {
    throw new ValidationError(
      'このディレクトリはリカバリ失敗により隔離されています。手動復旧が必要です。',
      'DIRECTORY_QUARANTINED',
    );
  }

  // 4. Acquire directory lock
  const unlock = await acquireDirectoryLock(directoryPath);
  try {
    // 5. Re-scan directory for collision re-check
    const currentEntries = await readdir(directoryPath, { withFileTypes: true });
    const currentFileNames = currentEntries.filter((d) => d.isFile()).map((d) => d.name);

    // Verify all "from" files still exist
    for (const m of mappings) {
      if (!currentFileNames.some((f) => f.toLowerCase() === m.from.toLowerCase())) {
        throw new ValidationError(`ファイルが見つかりません: ${m.from}`, 'RENAME_FAILED');
      }
    }

    // Re-check collisions with non-renamed existing files
    const renamedFromSet = new Set(mappings.map((m) => m.from.toLowerCase()));
    for (const m of mappings) {
      const toLower = m.to.toLowerCase();
      const collides = currentFileNames.some(
        (f) => f.toLowerCase() === toLower && !renamedFromSet.has(f.toLowerCase()),
      );
      if (collides) {
        throw new ValidationError(
          `衝突が検出されました: ${m.to} は既存ファイルと名前が重複します`,
          'COLLISION_DETECTED',
        );
      }
    }

    // Check internal collisions (multiple from → same to)
    const toNames = new Map<string, string>();
    for (const m of mappings) {
      const toLower = m.to.toLowerCase();
      if (toNames.has(toLower)) {
        throw new ValidationError(
          `衝突が検出されました: ${m.from} と ${toNames.get(toLower)} が同じ名前 ${m.to} になります`,
          'COLLISION_DETECTED',
        );
      }
      toNames.set(toLower, m.from);
    }

    // 6. Generate operation ID and temp mappings
    const operationId = crypto.randomUUID();
    const tempMappings = mappings.map((m, idx) => ({
      from: m.from,
      tempName: `.__tmp_${operationId}_${idx}`,
    }));

    // 7. Write journal (phase: pending)
    const journal: UndoJournal = {
      operationId,
      timestamp: new Date().toISOString(),
      directoryPath,
      phase: 'pending',
      mappings,
      tempMappings,
    };
    await writeJournal(journal);

    // 8. Step 1: Rename all files to temp names
    try {
      for (const tm of tempMappings) {
        await fsRename(path.join(directoryPath, tm.from), path.join(directoryPath, tm.tempName));
      }
      await updateJournalPhase(operationId, 'temp_done');
    } catch (err) {
      await performRollback(directoryPath, mappings, tempMappings, operationId, 'pending');
      throw new ValidationError(
        `リネーム中にエラーが発生しました（ロールバック済み）: ${(err as Error).message}`,
        'RENAME_FAILED',
      );
    }

    // 9. Step 2: Rename temp names to final names
    try {
      for (let i = 0; i < mappings.length; i++) {
        await fsRename(
          path.join(directoryPath, tempMappings[i].tempName),
          path.join(directoryPath, mappings[i].to),
        );
      }
      await updateJournalPhase(operationId, 'completed');
    } catch (err) {
      await performRollback(directoryPath, mappings, tempMappings, operationId, 'temp_done');
      throw new ValidationError(
        `リネーム中にエラーが発生しました（ロールバック済み）: ${(err as Error).message}`,
        'RENAME_FAILED',
      );
    }

    // 10. Rotate journals
    await rotateJournals();

    return {
      operationId,
      successCount: mappings.length,
      failureCount: 0,
      failures: [],
    };
  } finally {
    unlock();
  }
}

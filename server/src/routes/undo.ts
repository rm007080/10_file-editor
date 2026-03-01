import { Router } from 'express';
import crypto from 'node:crypto';
import { rename as fsRename, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ErrorResponse, UndoResponse, UndoHistoryEntry } from '@app/shared';
import { undoSchema, validateFileName, ValidationError } from '../utils/validation.js';
import { PathConversionError } from '../utils/pathConverter.js';
import { acquireDirectoryLock } from '../utils/mutex.js';
import {
  readJournal,
  readLatestCompletedJournal,
  listJournals,
  writeJournal,
  updateJournalPhase,
  performRollback,
  rotateJournals,
  isQuarantined,
  type UndoJournal,
} from '../services/journalService.js';

export const undoRouter = Router();

// POST /api/undo — Undo a rename operation
undoRouter.post('/api/undo', async (req, res) => {
  try {
    // 1. Validate request body
    const parsed = undoSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorResponse: ErrorResponse = {
        error: parsed.error.errors[0].message,
        code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      };
      res.status(400).json(errorResponse);
      return;
    }

    const { operationId } = parsed.data;

    // 2. Read journal (specific or latest completed)
    let journal: UndoJournal | undefined;
    if (operationId) {
      journal = await readJournal(operationId);
    } else {
      journal = await readLatestCompletedJournal();
    }

    if (!journal) {
      const errorResponse: ErrorResponse = {
        error: operationId ? `操作が見つかりません: ${operationId}` : '元に戻せる操作がありません',
        code: 'UNDO_NOT_FOUND',
      };
      res.status(404).json(errorResponse);
      return;
    }

    if (journal.phase !== 'completed') {
      const errorResponse: ErrorResponse = {
        error: `この操作は元に戻せません（phase: ${journal.phase}）`,
        code: 'UNDO_NOT_FOUND',
      };
      res.status(400).json(errorResponse);
      return;
    }

    const { directoryPath, mappings } = journal;

    // 3. Validate all file names in journal (from, to, tempName)
    for (const m of mappings) {
      validateFileName(m.from);
      validateFileName(m.to);
    }
    for (const tm of journal.tempMappings) {
      validateFileName(tm.from);
      // tempName starts with dot-underscore, skip validateFileName for temp names
    }

    // 4. Check quarantine
    if (isQuarantined(directoryPath)) {
      throw new ValidationError(
        'このディレクトリはリカバリ失敗により隔離されています。手動復旧が必要です。',
        'DIRECTORY_QUARANTINED',
      );
    }

    // 5. Build reverse mappings (to → from)
    const reverseMappings = mappings.map((m) => ({
      from: m.to,
      to: m.from,
    }));

    // 6. Acquire directory lock
    const unlock = await acquireDirectoryLock(directoryPath);
    try {
      // 7. Re-scan directory for collision check
      const currentEntries = await readdir(directoryPath, { withFileTypes: true });
      const currentFileNames = currentEntries.filter((d) => d.isFile()).map((d) => d.name);

      // Verify all "from" files (i.e. the renamed files) still exist
      for (const rm of reverseMappings) {
        if (!currentFileNames.some((f) => f.toLowerCase() === rm.from.toLowerCase())) {
          throw new ValidationError(`ファイルが見つかりません: ${rm.from}`, 'RENAME_FAILED');
        }
      }

      // Check collisions with non-target existing files
      const renamedFromSet = new Set(reverseMappings.map((m) => m.from.toLowerCase()));
      for (const rm of reverseMappings) {
        const toLower = rm.to.toLowerCase();
        const collides = currentFileNames.some(
          (f) => f.toLowerCase() === toLower && !renamedFromSet.has(f.toLowerCase()),
        );
        if (collides) {
          throw new ValidationError(
            `衝突が検出されました: ${rm.to} は既存ファイルと名前が重複します`,
            'COLLISION_DETECTED',
          );
        }
      }

      // Check internal collisions
      const toNames = new Map<string, string>();
      for (const rm of reverseMappings) {
        const toLower = rm.to.toLowerCase();
        if (toNames.has(toLower)) {
          throw new ValidationError(
            `衝突が検出されました: ${rm.from} と ${toNames.get(toLower)} が同じ名前 ${rm.to} になります`,
            'COLLISION_DETECTED',
          );
        }
        toNames.set(toLower, rm.from);
      }

      // 8. Generate operation ID and temp mappings for undo operation
      const undoOperationId = crypto.randomUUID();
      const tempMappings = reverseMappings.map((m, idx) => ({
        from: m.from,
        tempName: `.__tmp_${undoOperationId}_${idx}`,
      }));

      // 9. Write undo journal (phase: pending) — Undo itself is journaled
      const undoJournal: UndoJournal = {
        operationId: undoOperationId,
        timestamp: new Date().toISOString(),
        directoryPath,
        phase: 'pending',
        mappings: reverseMappings,
        tempMappings,
      };
      await writeJournal(undoJournal);

      // 10. Step 1: Rename all files to temp names
      try {
        for (const tm of tempMappings) {
          await fsRename(path.join(directoryPath, tm.from), path.join(directoryPath, tm.tempName));
        }
        await updateJournalPhase(undoOperationId, 'temp_done');
      } catch (err) {
        await performRollback(
          directoryPath,
          reverseMappings,
          tempMappings,
          undoOperationId,
          'pending',
        );
        throw new ValidationError(
          `Undo中にエラーが発生しました（ロールバック済み）: ${(err as Error).message}`,
          'RENAME_FAILED',
        );
      }

      // 11. Step 2: Rename temp names to final (original) names
      try {
        for (let i = 0; i < reverseMappings.length; i++) {
          await fsRename(
            path.join(directoryPath, tempMappings[i].tempName),
            path.join(directoryPath, reverseMappings[i].to),
          );
        }
        await updateJournalPhase(undoOperationId, 'completed');
      } catch (err) {
        await performRollback(
          directoryPath,
          reverseMappings,
          tempMappings,
          undoOperationId,
          'temp_done',
        );
        throw new ValidationError(
          `Undo中にエラーが発生しました（ロールバック済み）: ${(err as Error).message}`,
          'RENAME_FAILED',
        );
      }

      // 12. Rotate journals
      await rotateJournals();

      const response: UndoResponse = {
        operationId: undoOperationId,
        successCount: reverseMappings.length,
        failureCount: 0,
      };

      res.json(response);
    } finally {
      unlock();
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      const statusMap: Record<string, number> = {
        UNDO_NOT_FOUND: 404,
        COLLISION_DETECTED: 409,
        RENAME_FAILED: 500,
        DIRECTORY_QUARANTINED: 403,
        INVALID_FILENAME: 400,
      };
      const status = statusMap[e.code] ?? 400;
      const errorResponse: ErrorResponse = {
        error: e.message,
        code: e.code,
      };
      res.status(status).json(errorResponse);
      return;
    }

    if (e instanceof PathConversionError) {
      const errorResponse: ErrorResponse = {
        error: e.message,
        code: 'INVALID_PATH',
      };
      res.status(400).json(errorResponse);
      return;
    }

    throw e;
  }
});

// GET /api/undo/history — List undo journal history
undoRouter.get('/api/undo/history', async (_req, res) => {
  try {
    const summaries = await listJournals();

    const response: UndoHistoryEntry[] = summaries.map((s) => ({
      operationId: s.operationId,
      timestamp: s.timestamp,
      directoryPath: s.directoryPath,
      phase: s.phase,
      fileCount: s.fileCount,
    }));

    res.json(response);
  } catch {
    throw new Error('Undo履歴の取得に失敗しました');
  }
});

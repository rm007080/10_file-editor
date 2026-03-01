import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { FileEntry, ReplaceRule } from '@app/shared';

// Mock fileService before importing
vi.mock('../../services/fileService.js', () => ({
  listFiles: vi.fn(),
}));

import { preview, execute } from '../../services/renameService.js';
import { listFiles } from '../../services/fileService.js';
import {
  _setUndoDirectoryForTest,
  _resetQuarantineForTest,
  quarantineDirectory,
  readJournal,
} from '../../services/journalService.js';

// Import the undo route handler internals indirectly by testing via service-level logic
// We'll test the undo flow by calling the same core logic used by the route

import crypto from 'node:crypto';
import { rename as fsRename } from 'node:fs/promises';
import {
  readLatestCompletedJournal,
  writeJournal,
  updateJournalPhase,
  rotateJournals,
  isQuarantined,
  type UndoJournal,
} from '../../services/journalService.js';
import { validateFileName, ValidationError } from '../../utils/validation.js';
import { acquireDirectoryLock } from '../../utils/mutex.js';

const mockListFiles = vi.mocked(listFiles);

function makeFiles(...names: string[]): FileEntry[] {
  return names.map((name) => ({
    name,
    extension: name.includes('.') ? '.' + name.split('.').pop()! : '',
    size: 1024,
    modifiedAt: '2024-01-01T00:00:00.000Z',
  }));
}

function makeReplaceRule(search: string, replace: string): ReplaceRule {
  return {
    type: 'replace',
    enabled: true,
    search,
    replace,
    useRegex: false,
    caseSensitive: true,
    includeExtension: false,
  };
}

/**
 * Undo core logic (mirrors routes/undo.ts POST /api/undo handler)
 */
async function undoOperation(operationId?: string): Promise<{
  operationId: string;
  successCount: number;
  failureCount: number;
}> {
  let journal: UndoJournal | undefined;
  if (operationId) {
    journal = await readJournal(operationId);
  } else {
    journal = await readLatestCompletedJournal();
  }

  if (!journal || journal.phase !== 'completed') {
    throw new ValidationError(
      operationId ? `操作が見つかりません: ${operationId}` : '元に戻せる操作がありません',
      'UNDO_NOT_FOUND',
    );
  }

  const { directoryPath, mappings } = journal;

  for (const m of mappings) {
    validateFileName(m.from);
    validateFileName(m.to);
  }

  if (isQuarantined(directoryPath)) {
    throw new ValidationError(
      'このディレクトリはリカバリ失敗により隔離されています。',
      'DIRECTORY_QUARANTINED',
    );
  }

  const reverseMappings = mappings.map((m) => ({ from: m.to, to: m.from }));

  const unlock = await acquireDirectoryLock(directoryPath);
  try {
    const currentEntries = await readdir(directoryPath, { withFileTypes: true });
    const currentFileNames = currentEntries.filter((d) => d.isFile()).map((d) => d.name);

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

    const undoOperationId = crypto.randomUUID();
    const tempMappings = reverseMappings.map((m, idx) => ({
      from: m.from,
      tempName: `.__tmp_${undoOperationId}_${idx}`,
    }));

    const undoJournal: UndoJournal = {
      operationId: undoOperationId,
      timestamp: new Date().toISOString(),
      directoryPath,
      phase: 'pending',
      mappings: reverseMappings,
      tempMappings,
    };
    await writeJournal(undoJournal);

    for (const tm of tempMappings) {
      await fsRename(path.join(directoryPath, tm.from), path.join(directoryPath, tm.tempName));
    }
    await updateJournalPhase(undoOperationId, 'temp_done');

    for (let i = 0; i < reverseMappings.length; i++) {
      await fsRename(
        path.join(directoryPath, tempMappings[i].tempName),
        path.join(directoryPath, reverseMappings[i].to),
      );
    }
    await updateJournalPhase(undoOperationId, 'completed');

    await rotateJournals();

    return {
      operationId: undoOperationId,
      successCount: reverseMappings.length,
      failureCount: 0,
    };
  } finally {
    unlock();
  }
}

let tempDir: string;
let undoDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'undo-test-'));
  undoDir = await mkdtemp(path.join(os.tmpdir(), 'undo-journal-'));
  _setUndoDirectoryForTest(undoDir);
  _resetQuarantineForTest();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(undoDir, { recursive: true, force: true });
});

async function setupAndExecuteRename(
  files: string[],
  search: string,
  replace: string,
): Promise<{ operationId: string }> {
  for (const name of files) {
    await writeFile(path.join(tempDir, name), `content of ${name}`);
  }

  mockListFiles.mockResolvedValue({
    resolvedPath: tempDir,
    files: makeFiles(...files),
  });

  const { previewToken } = await preview(tempDir, [makeReplaceRule(search, replace)]);
  return execute(previewToken);
}

describe('undo', () => {
  it('直前のリネーム操作を元に戻す', async () => {
    await setupAndExecuteRename(['old_file.txt'], 'old', 'new');

    // Verify rename was done
    let files = await readdir(tempDir);
    expect(files).toContain('new_file.txt');
    expect(files).not.toContain('old_file.txt');

    // Undo (no operationId → latest)
    const result = await undoOperation();

    expect(result.successCount).toBe(1);
    expect(result.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Verify files restored
    files = await readdir(tempDir);
    expect(files).toContain('old_file.txt');
    expect(files).not.toContain('new_file.txt');
    // No temp files should remain
    expect(files.every((f) => !f.startsWith('.__tmp_'))).toBe(true);
  });

  it('operationId を指定して特定の操作を元に戻す', async () => {
    const { operationId } = await setupAndExecuteRename(['alpha.txt'], 'alpha', 'beta');

    const result = await undoOperation(operationId);

    expect(result.successCount).toBe(1);

    const files = await readdir(tempDir);
    expect(files).toContain('alpha.txt');
    expect(files).not.toContain('beta.txt');
  });

  it('複数ファイルのUndoが正しく動作する', async () => {
    await setupAndExecuteRename(['old_a.txt', 'old_b.txt', 'old_c.txt'], 'old', 'new');

    const result = await undoOperation();

    expect(result.successCount).toBe(3);

    const files = await readdir(tempDir);
    expect(files).toContain('old_a.txt');
    expect(files).toContain('old_b.txt');
    expect(files).toContain('old_c.txt');
    expect(files).not.toContain('new_a.txt');
    expect(files).not.toContain('new_b.txt');
    expect(files).not.toContain('new_c.txt');
  });

  it('Undo操作自体がジャーナルに記録される', async () => {
    await setupAndExecuteRename(['file.txt'], 'file', 'renamed');

    const undoResult = await undoOperation();

    // Verify undo journal was written
    const undoJournal = await readJournal(undoResult.operationId);
    expect(undoJournal).toBeDefined();
    expect(undoJournal!.phase).toBe('completed');
    expect(undoJournal!.mappings[0].from).toBe('renamed.txt');
    expect(undoJournal!.mappings[0].to).toBe('file.txt');
  });

  it('元に戻せる操作がない場合は UNDO_NOT_FOUND エラー', async () => {
    await expect(undoOperation()).rejects.toThrow('元に戻せる操作がありません');
  });

  it('存在しない operationId は UNDO_NOT_FOUND エラー', async () => {
    await expect(undoOperation('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      '操作が見つかりません',
    );
  });

  it('隔離されたディレクトリのUndoは DIRECTORY_QUARANTINED エラー', async () => {
    const { operationId } = await setupAndExecuteRename(['file.txt'], 'file', 'renamed');

    quarantineDirectory(tempDir);

    await expect(undoOperation(operationId)).rejects.toThrow(
      'このディレクトリはリカバリ失敗により隔離されています',
    );
  });

  it('Undoで復元先ファイルが既に存在する場合はエラー', async () => {
    // Create files and execute rename
    await writeFile(path.join(tempDir, 'src.txt'), 'source');
    mockListFiles.mockResolvedValue({
      resolvedPath: tempDir,
      files: makeFiles('src.txt'),
    });
    const { previewToken } = await preview(tempDir, [makeReplaceRule('src', 'dst')]);
    await execute(previewToken);

    // Manually create 'src.txt' again (conflict for undo)
    await writeFile(path.join(tempDir, 'src.txt'), 'new content');

    // Now undo should detect collision
    await expect(undoOperation()).rejects.toThrow('衝突が検出されました');
  });
});

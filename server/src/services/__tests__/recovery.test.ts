import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

vi.mock('../fileService.js', () => ({
  listFiles: vi.fn(),
}));

import {
  _setUndoDirectoryForTest,
  _resetQuarantineForTest,
  writeJournal,
  readJournal,
  recoverIncompleteJournals,
  isQuarantined,
  type UndoJournal,
} from '../journalService.js';

let tempDir: string;
let undoDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'recovery-test-'));
  undoDir = await mkdtemp(path.join(os.tmpdir(), 'recovery-undo-'));
  _setUndoDirectoryForTest(undoDir);
  _resetQuarantineForTest();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(undoDir, { recursive: true, force: true });
});

function makeJournal(
  overrides: Partial<UndoJournal> & { phase: UndoJournal['phase'] },
): UndoJournal {
  const operationId = overrides.operationId ?? crypto.randomUUID();
  return {
    operationId,
    timestamp: new Date().toISOString(),
    directoryPath: overrides.directoryPath ?? tempDir,
    phase: overrides.phase,
    mappings: overrides.mappings ?? [{ from: 'old.txt', to: 'new.txt' }],
    tempMappings: overrides.tempMappings ?? [
      { from: 'old.txt', tempName: `.__tmp_${operationId}_0` },
    ],
  };
}

describe('起動時リカバリ: phase=pending', () => {
  it('pending ジャーナルのファイルが一時名にリネーム途中の場合、元に戻す', async () => {
    const operationId = crypto.randomUUID();

    // Simulate: Step 1 was partially done.
    // old.txt was renamed to temp, but journal phase is still 'pending'.
    const tempName = `.__tmp_${operationId}_0`;
    await writeFile(path.join(tempDir, tempName), 'content of old.txt');

    const journal = makeJournal({
      operationId,
      phase: 'pending',
      mappings: [{ from: 'old.txt', to: 'new.txt' }],
      tempMappings: [{ from: 'old.txt', tempName }],
    });
    await writeJournal(journal);

    await recoverIncompleteJournals();

    // File should be restored to original name
    const files = await readdir(tempDir);
    expect(files).toContain('old.txt');
    expect(files).not.toContain(tempName);

    // Journal should be updated to rollback_done
    const updated = await readJournal(operationId);
    expect(updated?.phase).toBe('rollback_done');
  });

  it('pending ジャーナルでファイルがまだ元の名前の場合、何もせずロールバック完了', async () => {
    const operationId = crypto.randomUUID();

    // File hasn't been renamed yet (Step 1 hadn't started for this file)
    await writeFile(path.join(tempDir, 'old.txt'), 'content');

    const journal = makeJournal({
      operationId,
      phase: 'pending',
      mappings: [{ from: 'old.txt', to: 'new.txt' }],
      tempMappings: [{ from: 'old.txt', tempName: `.__tmp_${operationId}_0` }],
    });
    await writeJournal(journal);

    await recoverIncompleteJournals();

    const files = await readdir(tempDir);
    expect(files).toContain('old.txt');

    const updated = await readJournal(operationId);
    expect(updated?.phase).toBe('rollback_done');
  });
});

describe('起動時リカバリ: phase=temp_done', () => {
  it('temp_done ジャーナルのファイルを元の名前に復帰する', async () => {
    const operationId = crypto.randomUUID();

    // Simulate: Step 1 completed, Step 2 partially done.
    // File 0: already renamed to final name
    // File 1: still at temp name
    const tempName0 = `.__tmp_${operationId}_0`;
    const tempName1 = `.__tmp_${operationId}_1`;

    await writeFile(path.join(tempDir, 'new_a.txt'), 'content of a.txt');
    await writeFile(path.join(tempDir, tempName1), 'content of b.txt');

    const journal = makeJournal({
      operationId,
      phase: 'temp_done',
      mappings: [
        { from: 'a.txt', to: 'new_a.txt' },
        { from: 'b.txt', to: 'new_b.txt' },
      ],
      tempMappings: [
        { from: 'a.txt', tempName: tempName0 },
        { from: 'b.txt', tempName: tempName1 },
      ],
    });
    await writeJournal(journal);

    await recoverIncompleteJournals();

    const files = await readdir(tempDir);
    expect(files).toContain('a.txt');
    expect(files).toContain('b.txt');
    expect(files).not.toContain('new_a.txt');
    expect(files).not.toContain(tempName1);

    const updated = await readJournal(operationId);
    expect(updated?.phase).toBe('rollback_done');
  });
});

describe('起動時リカバリ: 不正ジャーナル隔離', () => {
  it('ファイル名にパストラバーサルを含むジャーナルはディレクトリを隔離する', async () => {
    const operationId = crypto.randomUUID();

    const journal = makeJournal({
      operationId,
      phase: 'pending',
      mappings: [{ from: '../escape.txt', to: 'safe.txt' }],
      tempMappings: [{ from: '../escape.txt', tempName: `.__tmp_${operationId}_0` }],
    });
    await writeJournal(journal);

    await recoverIncompleteJournals();

    // Directory should be quarantined
    expect(isQuarantined(tempDir)).toBe(true);

    // Journal should be marked rollback_failed
    const updated = await readJournal(operationId);
    expect(updated?.phase).toBe('rollback_failed');
  });

  it('completed フェーズのジャーナルはリカバリ対象外', async () => {
    const operationId = crypto.randomUUID();

    await writeFile(path.join(tempDir, 'new.txt'), 'content');

    const journal = makeJournal({
      operationId,
      phase: 'completed',
      mappings: [{ from: 'old.txt', to: 'new.txt' }],
      tempMappings: [{ from: 'old.txt', tempName: `.__tmp_${operationId}_0` }],
    });
    await writeJournal(journal);

    await recoverIncompleteJournals();

    // No quarantine, no changes
    expect(isQuarantined(tempDir)).toBe(false);

    const files = await readdir(tempDir);
    expect(files).toContain('new.txt');

    // Journal phase unchanged
    const updated = await readJournal(operationId);
    expect(updated?.phase).toBe('completed');
  });
});

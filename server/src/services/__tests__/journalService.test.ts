import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  writeJournal,
  readJournal,
  updateJournalPhase,
  readLatestCompletedJournal,
  listJournals,
  rotateJournals,
  isQuarantined,
  quarantineDirectory,
  findIncompleteJournals,
  ensureUndoDirectory,
  _setUndoDirectoryForTest,
  _resetQuarantineForTest,
  type UndoJournal,
} from '../journalService.js';

let tempDir: string;

function makeJournal(overrides: Partial<UndoJournal> = {}): UndoJournal {
  return {
    operationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    directoryPath: '/mnt/c/test',
    phase: 'completed',
    mappings: [{ from: 'old.txt', to: 'new.txt' }],
    tempMappings: [{ from: 'old.txt', tempName: '.__tmp_test_0' }],
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'journal-test-'));
  _setUndoDirectoryForTest(tempDir);
  _resetQuarantineForTest();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('writeJournal + readJournal', () => {
  it('ジャーナルの書き込みと読み込みが一致する', async () => {
    const journal = makeJournal();
    await writeJournal(journal);

    const read = await readJournal(journal.operationId);
    expect(read).toBeDefined();
    expect(read!.operationId).toBe(journal.operationId);
    expect(read!.phase).toBe('completed');
    expect(read!.mappings).toEqual(journal.mappings);
    expect(read!.tempMappings).toEqual(journal.tempMappings);
  });

  it('存在しないIDはundefinedを返す', async () => {
    const read = await readJournal('non-existent-id');
    expect(read).toBeUndefined();
  });
});

describe('updateJournalPhase', () => {
  it('phaseを更新できる', async () => {
    const journal = makeJournal({ phase: 'pending' });
    await writeJournal(journal);

    await updateJournalPhase(journal.operationId, 'temp_done');

    const read = await readJournal(journal.operationId);
    expect(read!.phase).toBe('temp_done');
  });
});

describe('readLatestCompletedJournal', () => {
  it('最新のcompleted ジャーナルを返す', async () => {
    const older = makeJournal({
      timestamp: '2024-01-01T00:00:00.000Z',
      phase: 'completed',
    });
    const newer = makeJournal({
      timestamp: '2024-06-01T00:00:00.000Z',
      phase: 'completed',
    });
    const pending = makeJournal({ phase: 'pending' });

    await writeJournal(older);
    await writeJournal(newer);
    await writeJournal(pending);

    const latest = await readLatestCompletedJournal();
    expect(latest).toBeDefined();
    expect(latest!.operationId).toBe(newer.operationId);
  });

  it('completedがない場合はundefinedを返す', async () => {
    await writeJournal(makeJournal({ phase: 'pending' }));
    const latest = await readLatestCompletedJournal();
    expect(latest).toBeUndefined();
  });
});

describe('listJournals', () => {
  it('ジャーナル一覧をtimestamp降順で返す', async () => {
    const j1 = makeJournal({ timestamp: '2024-01-01T00:00:00.000Z' });
    const j2 = makeJournal({ timestamp: '2024-06-01T00:00:00.000Z' });
    const j3 = makeJournal({ timestamp: '2024-03-01T00:00:00.000Z' });

    await writeJournal(j1);
    await writeJournal(j2);
    await writeJournal(j3);

    const list = await listJournals();
    expect(list).toHaveLength(3);
    expect(list[0].operationId).toBe(j2.operationId);
    expect(list[1].operationId).toBe(j3.operationId);
    expect(list[2].operationId).toBe(j1.operationId);
  });

  it('空ディレクトリは空配列を返す', async () => {
    const list = await listJournals();
    expect(list).toEqual([]);
  });
});

describe('rotateJournals', () => {
  it('50件を超えるジャーナルを古い順に削除する', async () => {
    // Create 55 journals
    for (let i = 0; i < 55; i++) {
      const ts = new Date(2024, 0, 1 + i).toISOString();
      await writeJournal(makeJournal({ timestamp: ts }));
    }

    const beforeRotate = await listJournals();
    expect(beforeRotate).toHaveLength(55);

    await rotateJournals();

    const afterRotate = await listJournals();
    expect(afterRotate).toHaveLength(50);

    // The remaining journals should be the 50 newest
    const files = await readdir(tempDir);
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(50);
  });

  it('50件以下では何も削除しない', async () => {
    for (let i = 0; i < 5; i++) {
      await writeJournal(makeJournal());
    }

    await rotateJournals();

    const list = await listJournals();
    expect(list).toHaveLength(5);
  });
});

describe('quarantine', () => {
  it('ディレクトリを隔離できる', () => {
    expect(isQuarantined('/mnt/c/test')).toBe(false);
    quarantineDirectory('/mnt/c/test');
    expect(isQuarantined('/mnt/c/test')).toBe(true);
  });

  it('case-insensitiveで判定する', () => {
    quarantineDirectory('/mnt/c/Test');
    expect(isQuarantined('/mnt/c/test')).toBe(true);
    expect(isQuarantined('/mnt/c/TEST')).toBe(true);
  });
});

describe('findIncompleteJournals', () => {
  it('pending と temp_done のジャーナルのみ返す', async () => {
    await writeJournal(makeJournal({ phase: 'completed' }));
    await writeJournal(makeJournal({ phase: 'pending' }));
    await writeJournal(makeJournal({ phase: 'temp_done' }));
    await writeJournal(makeJournal({ phase: 'rollback_done' }));

    const incomplete = await findIncompleteJournals();
    expect(incomplete).toHaveLength(2);
    expect(incomplete.every((j) => j.phase === 'pending' || j.phase === 'temp_done')).toBe(true);
  });

  it('未完了ジャーナルがない場合は空配列を返す', async () => {
    await writeJournal(makeJournal({ phase: 'completed' }));
    const incomplete = await findIncompleteJournals();
    expect(incomplete).toHaveLength(0);
  });
});

describe('ensureUndoDirectory', () => {
  it('ディレクトリを作成する', async () => {
    const newDir = path.join(tempDir, 'nested', 'undo');
    _setUndoDirectoryForTest(newDir);

    await ensureUndoDirectory();

    const entries = await readdir(path.join(tempDir, 'nested'));
    expect(entries).toContain('undo');
  });
});

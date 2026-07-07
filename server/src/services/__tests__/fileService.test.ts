import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listFiles } from '../fileService.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'file-service-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('listFiles', () => {
  it('通常ファイルを一覧に含める', async () => {
    await writeFile(path.join(tempDir, 'report.docx'), 'content');

    const { files } = await listFiles(tempDir);

    expect(files.map((f) => f.name)).toEqual(['report.docx']);
  });

  it('~$ で始まる Office 所有者ファイルを除外する', async () => {
    await writeFile(path.join(tempDir, 'report.docx'), 'content');
    await writeFile(path.join(tempDir, '~$report.docx'), 'lock');

    const { files } = await listFiles(tempDir);

    expect(files.map((f) => f.name)).toEqual(['report.docx']);
  });

  it('. で始まる隠しファイルを除外する', async () => {
    await writeFile(path.join(tempDir, 'visible.txt'), 'content');
    await writeFile(path.join(tempDir, '.hidden.txt'), 'hidden');

    const { files } = await listFiles(tempDir);

    expect(files.map((f) => f.name)).toEqual(['visible.txt']);
  });
});

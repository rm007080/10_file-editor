import { describe, it, expect } from 'vitest';
import { detectCollisions } from '../collision.js';
import type { PreviewResult } from '@app/shared';

function makeResult(originalName: string, newName: string): PreviewResult {
  return {
    originalName,
    newName,
    hasChanged: originalName !== newName,
    hasCollision: false,
  };
}

describe('detectCollisions', () => {
  it('衝突がない場合は hasCollision が false のまま', () => {
    const results = [makeResult('a.txt', 'x.txt'), makeResult('b.txt', 'y.txt')];
    const allFiles = ['a.txt', 'b.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(false);
    expect(results[1].hasCollision).toBe(false);
  });

  it('リネーム対象内の重複を検出する', () => {
    const results = [makeResult('a.txt', 'same.txt'), makeResult('b.txt', 'same.txt')];
    const allFiles = ['a.txt', 'b.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(true);
    expect(results[1].hasCollision).toBe(true);
    expect(results[0].collisionWith).toBe('b.txt');
    expect(results[1].collisionWith).toBe('a.txt');
  });

  it('大文字小文字を無視して衝突を検出する（NTFS）', () => {
    const results = [makeResult('a.txt', 'File.TXT'), makeResult('b.txt', 'file.txt')];
    const allFiles = ['a.txt', 'b.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(true);
    expect(results[1].hasCollision).toBe(true);
  });

  it('リネーム対象外の既存ファイルとの衝突を検出する', () => {
    const results = [makeResult('a.txt', 'existing.txt')];
    // "existing.txt" is in the directory but NOT being renamed
    const allFiles = ['a.txt', 'existing.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(true);
    expect(results[0].collisionWith).toBe('existing.txt');
  });

  it('変更なしファイルは既存ファイルと衝突しない', () => {
    const results = [
      makeResult('a.txt', 'a.txt'), // unchanged
    ];
    const allFiles = ['a.txt', 'b.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(false);
  });

  it('リネーム対象同士の swap パターンは衝突しない', () => {
    // A→B, B→A — these are NOT collisions (handled by 2-phase rename)
    const results = [makeResult('a.txt', 'b.txt'), makeResult('b.txt', 'a.txt')];
    const allFiles = ['a.txt', 'b.txt'];

    detectCollisions(results, allFiles);

    // Both source files are in renamedOriginals, so no collision with existing
    expect(results[0].hasCollision).toBe(false);
    expect(results[1].hasCollision).toBe(false);
  });

  it('リネーム対象同士の case-insensitive 重複を検出する', () => {
    const results = [makeResult('a.txt', 'Name.txt'), makeResult('b.txt', 'NAME.TXT')];
    const allFiles = ['a.txt', 'b.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(true);
    expect(results[1].hasCollision).toBe(true);
  });

  it('既存ファイルとの case-insensitive 衝突を検出する', () => {
    const results = [makeResult('a.txt', 'EXISTING.TXT')];
    const allFiles = ['a.txt', 'existing.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(true);
  });

  it('3ファイル cycle パターン（A→B, B→C, C→A）は衝突しない', () => {
    const results = [
      makeResult('a.txt', 'b.txt'),
      makeResult('b.txt', 'c.txt'),
      makeResult('c.txt', 'a.txt'),
    ];
    const allFiles = ['a.txt', 'b.txt', 'c.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(false);
    expect(results[1].hasCollision).toBe(false);
    expect(results[2].hasCollision).toBe(false);
  });

  it('多数ファイル中の1ペアだけ衝突', () => {
    const results = [
      makeResult('a.txt', 'x.txt'),
      makeResult('b.txt', 'y.txt'),
      makeResult('c.txt', 'z.txt'),
      makeResult('d.txt', 'z.txt'), // collision with c.txt→z.txt
    ];
    const allFiles = ['a.txt', 'b.txt', 'c.txt', 'd.txt'];

    detectCollisions(results, allFiles);

    expect(results[0].hasCollision).toBe(false);
    expect(results[1].hasCollision).toBe(false);
    expect(results[2].hasCollision).toBe(true);
    expect(results[3].hasCollision).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { SequenceProcessor } from '../rules/sequenceRule.js';
import type { SequenceRule, FileEntry } from '@app/shared';
import type { BatchEntry, RenameContext } from '../types.js';

function makeFileEntry(name: string, overrides: Partial<FileEntry> = {}): FileEntry {
  const ext = name.includes('.') ? '.' + name.split('.').pop()! : '';
  return {
    name,
    extension: ext,
    size: 100,
    modifiedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeContext(name: string, index: number, total: number): RenameContext {
  const ext = name.includes('.') ? '.' + name.split('.').pop()! : '';
  const base = ext ? name.slice(0, -ext.length) : name;
  return {
    index,
    totalCount: total,
    originalName: name,
    originalBaseName: base,
    originalExtension: ext,
    currentBaseName: base,
    currentExtension: ext,
  };
}

function makeBatchEntries(
  files: { name: string; size?: number; modifiedAt?: string }[],
): BatchEntry[] {
  return files.map((f, i) => ({
    id: i,
    fileName: f.name,
    context: makeContext(f.name, i, files.length),
    fileEntry: makeFileEntry(f.name, {
      size: f.size ?? 100,
      modifiedAt: f.modifiedAt ?? '2024-01-01T00:00:00.000Z',
    }),
  }));
}

function makeRule(overrides: Partial<SequenceRule> = {}): SequenceRule {
  return {
    type: 'sequence',
    enabled: true,
    start: 1,
    step: 1,
    padding: 3,
    position: 'prefix',
    sortBy: 'name',
    sortOrder: 'asc',
    ...overrides,
  };
}

describe('SequenceProcessor', () => {
  describe('basic numbering', () => {
    it('adds prefix numbers with default settings', () => {
      const rule = makeRule();
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([
        { name: 'banana.txt' },
        { name: 'apple.txt' },
        { name: 'cherry.txt' },
      ]);
      const results = proc.applyBatch(entries);
      // Sorted by name asc: apple(001), banana(002), cherry(003)
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      expect(byId.get(0)).toBe('002_banana.txt'); // banana is 2nd
      expect(byId.get(1)).toBe('001_apple.txt'); // apple is 1st
      expect(byId.get(2)).toBe('003_cherry.txt'); // cherry is 3rd
    });

    it('respects start number and step', () => {
      const rule = makeRule({ start: 10, step: 5, padding: 2 });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'a.txt' }, { name: 'b.txt' }, { name: 'c.txt' }]);
      const results = proc.applyBatch(entries);
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      expect(byId.get(0)).toBe('10_a.txt');
      expect(byId.get(1)).toBe('15_b.txt');
      expect(byId.get(2)).toBe('20_c.txt');
    });

    it('applies zero-padding correctly', () => {
      const rule = makeRule({ padding: 5 });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'file.txt' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('00001_file.txt');
    });
  });

  describe('position modes', () => {
    it('adds suffix numbers', () => {
      const rule = makeRule({ position: 'suffix' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'file.txt' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('file_001.txt');
    });

    it('inserts at custom position', () => {
      const rule = makeRule({ position: 'custom', customPosition: 4 });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'photo.jpg' }]);
      const results = proc.applyBatch(entries);
      // Insert "001" at position 4 in "photo" → "phot001o.jpg"
      expect(results[0].fileName).toBe('phot001o.jpg');
    });
  });

  describe('sort options', () => {
    it('sorts by name descending', () => {
      const rule = makeRule({ sortOrder: 'desc' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([
        { name: 'apple.txt' },
        { name: 'cherry.txt' },
        { name: 'banana.txt' },
      ]);
      const results = proc.applyBatch(entries);
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      // desc: cherry(001), banana(002), apple(003)
      expect(byId.get(0)).toBe('003_apple.txt');
      expect(byId.get(1)).toBe('001_cherry.txt');
      expect(byId.get(2)).toBe('002_banana.txt');
    });

    it('sorts by date ascending', () => {
      const rule = makeRule({ sortBy: 'date' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([
        { name: 'new.txt', modifiedAt: '2024-03-01T00:00:00.000Z' },
        { name: 'old.txt', modifiedAt: '2024-01-01T00:00:00.000Z' },
        { name: 'mid.txt', modifiedAt: '2024-02-01T00:00:00.000Z' },
      ]);
      const results = proc.applyBatch(entries);
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      // date asc: old(001), mid(002), new(003)
      expect(byId.get(0)).toBe('003_new.txt');
      expect(byId.get(1)).toBe('001_old.txt');
      expect(byId.get(2)).toBe('002_mid.txt');
    });

    it('sorts by size ascending', () => {
      const rule = makeRule({ sortBy: 'size' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([
        { name: 'big.txt', size: 3000 },
        { name: 'small.txt', size: 100 },
        { name: 'medium.txt', size: 1500 },
      ]);
      const results = proc.applyBatch(entries);
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      // size asc: small(001), medium(002), big(003)
      expect(byId.get(0)).toBe('003_big.txt');
      expect(byId.get(1)).toBe('001_small.txt');
      expect(byId.get(2)).toBe('002_medium.txt');
    });
  });

  describe('template syntax', () => {
    it('applies {name}_{num:3}.{ext} template', () => {
      const rule = makeRule({ template: '{name}_{num:3}.{ext}' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'photo.jpg' }, { name: 'image.jpg' }]);
      const results = proc.applyBatch(entries);
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      // name asc: image(1), photo(2)
      expect(byId.get(0)).toBe('photo_002.jpg');
      expect(byId.get(1)).toBe('image_001.jpg');
    });

    it('applies template with custom num width', () => {
      const rule = makeRule({ template: '{num:5}_{name}.{ext}' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'file.txt' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('00001_file.txt');
    });

    it('applies template with {num} using default padding', () => {
      const rule = makeRule({ padding: 4, template: '{name}_{num}.{ext}' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'doc.pdf' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('doc_0001.pdf');
    });

    it('handles template without extension placeholder', () => {
      const rule = makeRule({ template: 'img_{num:3}' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'photo.jpg' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('img_001');
    });
  });

  describe('id correspondence', () => {
    it('preserves id mapping after sort', () => {
      const rule = makeRule();
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'z.txt' }, { name: 'a.txt' }, { name: 'm.txt' }]);
      const results = proc.applyBatch(entries);
      // All original ids should be present
      const ids = results.map((r) => r.id).sort();
      expect(ids).toEqual([0, 1, 2]);
      // id=1 (a.txt) should get 001
      const aResult = results.find((r) => r.id === 1);
      expect(aResult?.fileName).toBe('001_a.txt');
    });
  });

  describe('テンプレート — 追加パターン', () => {
    it('{num} のみのテンプレート', () => {
      const rule = makeRule({ template: '{num:3}' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'file.txt' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('001');
    });

    it('プレースホルダーなしの固定テンプレート', () => {
      const rule = makeRule({ template: 'fixed_name.txt' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'file.txt' }]);
      const results = proc.applyBatch(entries);
      expect(results[0].fileName).toBe('fixed_name.txt');
    });
  });

  describe('大量ファイルバッチ', () => {
    it('100ファイルでソート＋連番が正しい', () => {
      const files = Array.from({ length: 100 }, (_, i) => ({
        name: `file_${String(i).padStart(3, '0')}.txt`,
      }));
      const rule = makeRule({ padding: 3 });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries(files);
      const results = proc.applyBatch(entries);

      expect(results).toHaveLength(100);
      // All ids should be preserved
      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(100);
      // id=0 is file_000.txt → sorted first → gets 001
      const first = results.find((r) => r.id === 0);
      expect(first?.fileName).toBe('001_file_000.txt');
    });
  });

  describe('desc + suffix 組み合わせ', () => {
    it('降順ソートで suffix 連番を付与する', () => {
      const rule = makeRule({ sortOrder: 'desc', position: 'suffix' });
      const proc = new SequenceProcessor(rule);
      const entries = makeBatchEntries([{ name: 'a.txt' }, { name: 'c.txt' }, { name: 'b.txt' }]);
      const results = proc.applyBatch(entries);
      const byId = new Map(results.map((r) => [r.id, r.fileName]));
      // desc: c(001), b(002), a(003)
      expect(byId.get(0)).toBe('a_003.txt');
      expect(byId.get(1)).toBe('c_001.txt');
      expect(byId.get(2)).toBe('b_002.txt');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { DelimiterProcessor } from '../rules/delimiterRule.js';
import type { DelimiterRule } from '@app/shared';
import type { RenameContext } from '../types.js';

function makeContext(baseName: string, ext: string): RenameContext {
  return {
    index: 0,
    totalCount: 1,
    originalName: baseName + ext,
    originalBaseName: baseName,
    originalExtension: ext,
    currentBaseName: baseName,
    currentExtension: ext,
  };
}

function makeRule(overrides: Partial<DelimiterRule> = {}): DelimiterRule {
  return {
    type: 'delimiter',
    enabled: true,
    delimiter: '_',
    position: 1,
    side: 'right',
    action: 'replace',
    value: '',
    ...overrides,
  };
}

describe('DelimiterProcessor', () => {
  describe('right side operations', () => {
    it('replaces right side of 1st delimiter', () => {
      const rule = makeRule({ action: 'replace', value: 'vacation' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('photo_2024_summer', '.jpg');
      expect(proc.apply('', ctx)).toBe('photo_vacation.jpg');
    });

    it('removes right side of 1st delimiter', () => {
      const rule = makeRule({ action: 'remove' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('report_draft_v2', '.pdf');
      expect(proc.apply('', ctx)).toBe('report.pdf');
    });

    it('keeps only right side of 1st delimiter', () => {
      const rule = makeRule({ action: 'keep' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('prefix_content_suffix', '.txt');
      expect(proc.apply('', ctx)).toBe('content_suffix.txt');
    });
  });

  describe('left side operations', () => {
    it('replaces left side of 1st delimiter', () => {
      const rule = makeRule({ side: 'left', action: 'replace', value: 'new' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('old_content', '.txt');
      expect(proc.apply('', ctx)).toBe('new_content.txt');
    });

    it('removes left side of 1st delimiter', () => {
      const rule = makeRule({ side: 'left', action: 'remove' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('prefix_content', '.txt');
      expect(proc.apply('', ctx)).toBe('content.txt');
    });

    it('keeps only left side of 1st delimiter', () => {
      const rule = makeRule({ side: 'left', action: 'keep' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('keep_this_part', '.txt');
      expect(proc.apply('', ctx)).toBe('keep.txt');
    });
  });

  describe('N-th delimiter position', () => {
    it('operates on 2nd delimiter (right side replace)', () => {
      const rule = makeRule({ position: 2, action: 'replace', value: 'final' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('project_draft_v1', '.txt');
      expect(proc.apply('', ctx)).toBe('project_draft_final.txt');
    });

    it('operates on 2nd delimiter with hyphen (right side remove)', () => {
      const rule = makeRule({ delimiter: '-', position: 2, action: 'remove' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('report-draft-v2', '.pdf');
      expect(proc.apply('', ctx)).toBe('report-draft.pdf');
    });

    it('operates on 2nd delimiter (left side keep)', () => {
      const rule = makeRule({ position: 2, side: 'left', action: 'keep' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('a_b_c_d', '.txt');
      expect(proc.apply('', ctx)).toBe('a_b.txt');
    });
  });

  describe('delimiter not found / edge cases', () => {
    it('returns unchanged when delimiter not found', () => {
      const rule = makeRule({ delimiter: '-' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('no_delimiter_here', '.txt');
      // '-' is not found; file has underscores but rule looks for '-'
      expect(proc.apply('', ctx)).toBe('no_delimiter_here.txt');
    });

    it('returns unchanged when position exceeds delimiter count', () => {
      const rule = makeRule({ position: 5 });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('a_b_c', '.txt');
      // Only 2 delimiters, position=5 exceeds
      expect(proc.apply('', ctx)).toBe('a_b_c.txt');
    });

    it('returns unchanged when delimiter is empty', () => {
      const rule = makeRule({ delimiter: '' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('filename', '.txt');
      expect(proc.apply('', ctx)).toBe('filename.txt');
    });

    it('handles single-part filename (no delimiter)', () => {
      const rule = makeRule();
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('filename', '.txt');
      expect(proc.apply('', ctx)).toBe('filename.txt');
    });
  });

  describe('various delimiters', () => {
    it('works with space delimiter', () => {
      const rule = makeRule({ delimiter: ' ', action: 'replace', value: 'world' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('hello everyone today', '.txt');
      expect(proc.apply('', ctx)).toBe('hello world.txt');
    });

    it('works with dot delimiter on base name', () => {
      const rule = makeRule({ delimiter: '.', action: 'remove' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('file.v2.final', '.txt');
      expect(proc.apply('', ctx)).toBe('file.txt');
    });
  });

  describe('追加エッジケース', () => {
    it('区切り文字のみのファイル名', () => {
      const rule = makeRule({ action: 'remove' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('___', '.txt');
      // parts = ['', '', '', ''], position=1: left='', right='__'
      expect(proc.apply('', ctx)).toBe('.txt');
    });

    it('連続する区切り文字で2番目を指定', () => {
      const rule = makeRule({ position: 2, action: 'keep', side: 'left' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('a__b__c', '.txt');
      // split by '_': ['a', '', 'b', '', 'c'] → position=2 left: 'a_'
      expect(proc.apply('', ctx)).toBe('a_.txt');
    });

    it('マルチバイト区切り文字', () => {
      const rule = makeRule({ delimiter: '→', action: 'replace', value: '最終' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('ファイル→テスト→完了', '.txt');
      expect(proc.apply('', ctx)).toBe('ファイル→最終.txt');
    });

    it('replace で value が空文字の場合', () => {
      const rule = makeRule({ action: 'replace', value: '' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('keep_remove', '.txt');
      expect(proc.apply('', ctx)).toBe('keep_.txt');
    });

    it('left side remove で区切り文字が結果先頭に来ない', () => {
      const rule = makeRule({ side: 'left', action: 'remove' });
      const proc = new DelimiterProcessor(rule);
      const ctx = makeContext('a_b_c', '.txt');
      expect(proc.apply('', ctx)).toBe('b_c.txt');
    });
  });
});

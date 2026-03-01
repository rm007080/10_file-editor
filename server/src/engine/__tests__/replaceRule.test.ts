import { describe, it, expect } from 'vitest';
import { ReplaceProcessor } from '../rules/replaceRule.js';
import type { RenameContext } from '../types.js';
import type { ReplaceRule } from '@app/shared';

function makeContext(baseName: string, extension: string): RenameContext {
  return {
    index: 0,
    totalCount: 1,
    originalName: baseName + extension,
    originalBaseName: baseName,
    originalExtension: extension,
    currentBaseName: baseName,
    currentExtension: extension,
  };
}

function makeRule(overrides: Partial<ReplaceRule> = {}): ReplaceRule {
  return {
    type: 'replace',
    enabled: true,
    search: '',
    replace: '',
    useRegex: false,
    caseSensitive: true,
    includeExtension: false,
    ...overrides,
  };
}

describe('ReplaceProcessor', () => {
  it('単純な文字列置換を行う', () => {
    const rule = makeRule({ search: 'old', replace: 'new' });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('file_old_name', '.txt');
    expect(processor.apply('file_old_name.txt', ctx)).toBe('file_new_name.txt');
  });

  it('空文字への置換（文字列削除）', () => {
    const rule = makeRule({ search: '[draft]', replace: '' });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('[draft]report', '.pdf');
    expect(processor.apply('[draft]report.pdf', ctx)).toBe('report.pdf');
  });

  it('拡張子を除いて置換する（デフォルト）', () => {
    const rule = makeRule({
      search: 'txt',
      replace: 'doc',
      includeExtension: false,
    });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('file_txt_backup', '.txt');
    // Should replace "txt" in base name only, not in extension
    expect(processor.apply('file_txt_backup.txt', ctx)).toBe('file_doc_backup.txt');
  });

  it('拡張子を含めて置換する', () => {
    const rule = makeRule({
      search: '.txt',
      replace: '.md',
      includeExtension: true,
    });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('readme', '.txt');
    expect(processor.apply('readme.txt', ctx)).toBe('readme.md');
  });

  it('検索文字列が空の場合は変更しない', () => {
    const rule = makeRule({ search: '', replace: 'anything' });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('file', '.txt');
    expect(processor.apply('file.txt', ctx)).toBe('file.txt');
  });

  it('複数箇所を全て置換する（replaceAll）', () => {
    const rule = makeRule({ search: '_', replace: '-' });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('a_b_c_d', '.txt');
    expect(processor.apply('a_b_c_d.txt', ctx)).toBe('a-b-c-d.txt');
  });

  it('マッチしない場合は変更しない', () => {
    const rule = makeRule({ search: 'xyz', replace: 'abc' });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('hello', '.txt');
    expect(processor.apply('hello.txt', ctx)).toBe('hello.txt');
  });

  it('日本語文字列の置換', () => {
    const rule = makeRule({ search: '下書き', replace: '最終版' });
    const processor = new ReplaceProcessor(rule);
    const ctx = makeContext('レポート_下書き', '.docx');
    expect(processor.apply('レポート_下書き.docx', ctx)).toBe('レポート_最終版.docx');
  });

  describe('正規表現モード', () => {
    it('正規表現で置換する', () => {
      const rule = makeRule({ search: '\\d+', replace: 'NUM', useRegex: true });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('file_123_456', '.txt');
      expect(processor.apply('', ctx)).toBe('file_NUM_NUM.txt');
    });

    it('正規表現キャプチャグループを参照できる', () => {
      const rule = makeRule({
        search: '(\\w+)-(\\w+)',
        replace: '$2_$1',
        useRegex: true,
      });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('hello-world', '.txt');
      expect(processor.apply('', ctx)).toBe('world_hello.txt');
    });

    it('正規表現 + 大文字小文字無視', () => {
      const rule = makeRule({
        search: 'DRAFT',
        replace: '',
        useRegex: true,
        caseSensitive: false,
      });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('Draft_report_draft', '.txt');
      expect(processor.apply('', ctx)).toBe('_report_.txt');
    });

    it('正規表現 + 拡張子含む', () => {
      const rule = makeRule({
        search: '\\.jpeg$',
        replace: '.jpg',
        useRegex: true,
        includeExtension: true,
      });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('photo', '.jpeg');
      expect(processor.apply('', ctx)).toBe('photo.jpg');
    });
  });

  describe('大文字小文字無視（リテラル）', () => {
    it('case-insensitiveで全箇所を置換する', () => {
      const rule = makeRule({
        search: 'abc',
        replace: 'XYZ',
        caseSensitive: false,
      });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('ABC_abc_Abc', '.txt');
      expect(processor.apply('', ctx)).toBe('XYZ_XYZ_XYZ.txt');
    });
  });

  describe('正規表現 — 追加パターン', () => {
    it('先頭マッチで prefix を挿入する', () => {
      const rule = makeRule({ search: '^', replace: 'PREFIX_', useRegex: true });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('file', '.txt');
      expect(processor.apply('', ctx)).toBe('PREFIX_file.txt');
    });

    it('特殊置換文字列 $& を使用する', () => {
      const rule = makeRule({ search: '\\d+', replace: '[$&]', useRegex: true });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('file_123_456', '.txt');
      expect(processor.apply('', ctx)).toBe('file_[123]_[456].txt');
    });

    it('lookahead パターンで置換する', () => {
      const rule = makeRule({
        search: '\\d+(?=_final)',
        replace: '999',
        useRegex: true,
      });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('v1_draft_v2_final', '.txt');
      expect(processor.apply('', ctx)).toBe('v1_draft_v999_final.txt');
    });

    it('無効な正規表現がエラーをスローする', () => {
      const rule = makeRule({ search: '[invalid', replace: '', useRegex: true });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('file', '.txt');
      expect(() => processor.apply('', ctx)).toThrow();
    });
  });

  describe('特殊文字を含む検索/置換', () => {
    it('正規表現メタ文字を含むリテラル置換', () => {
      const rule = makeRule({ search: '(1)', replace: '_v1' });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('file(1)', '.txt');
      expect(processor.apply('file(1).txt', ctx)).toBe('file_v1.txt');
    });

    it('ドットを含むリテラル置換', () => {
      const rule = makeRule({ search: 'v1.0', replace: 'v2.0' });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('app.v1.0.final', '.zip');
      expect(processor.apply('app.v1.0.final.zip', ctx)).toBe('app.v2.0.final.zip');
    });

    it('全角スペースを含む置換', () => {
      const rule = makeRule({ search: '\u3000', replace: '_' });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('ファイル\u3000名前', '.txt');
      expect(processor.apply('ファイル\u3000名前.txt', ctx)).toBe('ファイル_名前.txt');
    });

    it('case-insensitiveリテラルでメタ文字を含む検索', () => {
      const rule = makeRule({
        search: 'file(1)',
        replace: 'doc',
        caseSensitive: false,
      });
      const processor = new ReplaceProcessor(rule);
      const ctx = makeContext('FILE(1)_backup', '.txt');
      expect(processor.apply('', ctx)).toBe('doc_backup.txt');
    });
  });
});

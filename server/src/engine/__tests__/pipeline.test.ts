import { describe, it, expect } from 'vitest';
import { applyRuleChain } from '../pipeline.js';
import type { FileEntry, ReplaceRule, DelimiterRule, SequenceRule, RenameRule } from '@app/shared';

function makeFiles(...names: string[]): FileEntry[] {
  return names.map((name) => ({
    name,
    extension: name.includes('.') ? '.' + name.split('.').pop()! : '',
    size: 1024,
    modifiedAt: '2024-01-01T00:00:00.000Z',
  }));
}

function makeReplaceRule(
  search: string,
  replace: string,
  overrides: Partial<ReplaceRule> = {},
): ReplaceRule {
  return {
    type: 'replace',
    enabled: true,
    search,
    replace,
    useRegex: false,
    caseSensitive: true,
    includeExtension: false,
    ...overrides,
  };
}

describe('applyRuleChain', () => {
  it('単一ルールを適用する', () => {
    const files = makeFiles('photo_old.jpg', 'photo_new.jpg');
    const rules = [makeReplaceRule('old', 'new')];
    const results = applyRuleChain(files, rules);

    expect(results).toHaveLength(2);
    expect(results[0].originalName).toBe('photo_old.jpg');
    expect(results[0].newName).toBe('photo_new.jpg');
    expect(results[0].hasChanged).toBe(true);
    // Second file has no "old" to replace
    expect(results[1].originalName).toBe('photo_new.jpg');
    expect(results[1].newName).toBe('photo_new.jpg');
    expect(results[1].hasChanged).toBe(false);
  });

  it('無効なルールはスキップする', () => {
    const files = makeFiles('hello.txt');
    const rules = [makeReplaceRule('hello', 'bye', { enabled: false })];
    const results = applyRuleChain(files, rules);

    expect(results[0].newName).toBe('hello.txt');
    expect(results[0].hasChanged).toBe(false);
  });

  it('複数ルールを順次適用する', () => {
    const files = makeFiles('a_b_c.txt');
    const rules = [makeReplaceRule('a', 'x'), makeReplaceRule('b', 'y')];
    const results = applyRuleChain(files, rules);

    expect(results[0].newName).toBe('x_y_c.txt');
    expect(results[0].hasChanged).toBe(true);
  });

  it('context の currentBaseName がルール間で更新される', () => {
    const files = makeFiles('file.txt');
    // Rule 1: "file" → "document"
    // Rule 2: "document" → "report"  (depends on Rule 1 result)
    const rules = [makeReplaceRule('file', 'document'), makeReplaceRule('document', 'report')];
    const results = applyRuleChain(files, rules);

    expect(results[0].newName).toBe('report.txt');
  });

  it('空のルールリストは変更なし', () => {
    const files = makeFiles('test.txt');
    const results = applyRuleChain(files, []);

    expect(results[0].newName).toBe('test.txt');
    expect(results[0].hasChanged).toBe(false);
  });

  it('空のファイルリストは空結果を返す', () => {
    const results = applyRuleChain([], [makeReplaceRule('a', 'b')]);
    expect(results).toHaveLength(0);
  });

  it('DelimiterRule を適用する', () => {
    const files = makeFiles('project_draft_v1.txt');
    const rule: DelimiterRule = {
      type: 'delimiter',
      enabled: true,
      delimiter: '_',
      position: 2,
      side: 'right',
      action: 'replace',
      value: 'final',
    };
    const results = applyRuleChain(files, [rule]);
    expect(results[0].newName).toBe('project_draft_final.txt');
  });

  it('SequenceRule をバッチ処理で適用する', () => {
    const files = makeFiles('banana.txt', 'apple.txt', 'cherry.txt');
    const rule: SequenceRule = {
      type: 'sequence',
      enabled: true,
      start: 1,
      step: 1,
      padding: 3,
      position: 'prefix',
      sortBy: 'name',
      sortOrder: 'asc',
    };
    const results = applyRuleChain(files, [rule]);
    // sorted: apple(001), banana(002), cherry(003)
    expect(results[0].newName).toBe('002_banana.txt'); // banana=id0
    expect(results[1].newName).toBe('001_apple.txt'); // apple=id1
    expect(results[2].newName).toBe('003_cherry.txt'); // cherry=id2
  });

  it('Replace → Delimiter の複数ルール種別を順次適用する', () => {
    const files = makeFiles('old_draft_v1.txt');
    const rules: RenameRule[] = [
      makeReplaceRule('old', 'new'),
      {
        type: 'delimiter',
        enabled: true,
        delimiter: '_',
        position: 2,
        side: 'right',
        action: 'remove',
      },
    ];
    const results = applyRuleChain(files, rules);
    // Step 1: old_draft_v1 → new_draft_v1
    // Step 2: remove right of 2nd '_' → new_draft
    expect(results[0].newName).toBe('new_draft.txt');
  });

  it('Replace → Sequence のチェーンで context が正しく更新される', () => {
    const files = makeFiles('IMG_001.jpg', 'IMG_002.jpg');
    const rules: RenameRule[] = [
      makeReplaceRule('IMG_', 'photo_'),
      {
        type: 'sequence',
        enabled: true,
        start: 1,
        step: 1,
        padding: 3,
        position: 'prefix',
        sortBy: 'name',
        sortOrder: 'asc',
      },
    ];
    const results = applyRuleChain(files, rules);
    // After replace: photo_001.jpg, photo_002.jpg
    // After sequence (name asc): 001_photo_001.jpg, 002_photo_002.jpg
    expect(results[0].newName).toBe('001_photo_001.jpg');
    expect(results[1].newName).toBe('002_photo_002.jpg');
  });

  it('BatchRuleProcessor の id 対応がソート後も壊れない', () => {
    const files = makeFiles('z.txt', 'a.txt', 'm.txt');
    const rule: SequenceRule = {
      type: 'sequence',
      enabled: true,
      start: 1,
      step: 1,
      padding: 3,
      position: 'prefix',
      sortBy: 'name',
      sortOrder: 'asc',
    };
    const results = applyRuleChain(files, [rule]);
    // results[0] = z.txt (original index 0) → should get 003
    // results[1] = a.txt (original index 1) → should get 001
    // results[2] = m.txt (original index 2) → should get 002
    expect(results[0].originalName).toBe('z.txt');
    expect(results[0].newName).toBe('003_z.txt');
    expect(results[1].originalName).toBe('a.txt');
    expect(results[1].newName).toBe('001_a.txt');
    expect(results[2].originalName).toBe('m.txt');
    expect(results[2].newName).toBe('002_m.txt');
  });

  it('3ルールチェーン: Replace → Delimiter → Sequence', () => {
    const files = makeFiles('old_draft_v1.txt', 'old_draft_v2.txt');
    const rules: RenameRule[] = [
      makeReplaceRule('old', 'new'),
      {
        type: 'delimiter',
        enabled: true,
        delimiter: '_',
        position: 2,
        side: 'right',
        action: 'remove',
      } satisfies DelimiterRule,
      {
        type: 'sequence',
        enabled: true,
        start: 1,
        step: 1,
        padding: 3,
        position: 'suffix',
        sortBy: 'name',
        sortOrder: 'asc',
      } satisfies SequenceRule,
    ];
    const results = applyRuleChain(files, rules);
    // Step 1: old_draft_v1 → new_draft_v1, old_draft_v2 → new_draft_v2
    // Step 2: remove right of 2nd '_' → new_draft, new_draft
    // Step 3: suffix sequence (both are "new_draft.txt"): new_draft_001.txt, new_draft_002.txt
    expect(results[0].newName).toBe('new_draft_001.txt');
    expect(results[1].newName).toBe('new_draft_002.txt');
  });

  it('3つの Replace ルールの順次適用', () => {
    const files = makeFiles('hello_world_today.txt');
    const rules: RenameRule[] = [
      makeReplaceRule('hello', 'hi'),
      makeReplaceRule('world', 'earth'),
      makeReplaceRule('today', 'now'),
    ];
    const results = applyRuleChain(files, rules);
    expect(results[0].newName).toBe('hi_earth_now.txt');
  });

  it('途中に disabled ルールが混在するチェーン', () => {
    const files = makeFiles('abc.txt');
    const rules: RenameRule[] = [
      makeReplaceRule('a', 'x'),
      makeReplaceRule('b', 'y', { enabled: false }),
      makeReplaceRule('c', 'z'),
    ];
    const results = applyRuleChain(files, rules);
    expect(results[0].newName).toBe('xbz.txt');
  });

  it('全ルールが disabled の場合は変更なし', () => {
    const files = makeFiles('file.txt');
    const rules: RenameRule[] = [
      makeReplaceRule('file', 'doc', { enabled: false }),
      {
        type: 'delimiter',
        enabled: false,
        delimiter: '_',
        position: 1,
        side: 'right',
        action: 'remove',
      } satisfies DelimiterRule,
    ];
    const results = applyRuleChain(files, rules);
    expect(results[0].newName).toBe('file.txt');
    expect(results[0].hasChanged).toBe(false);
  });

  it('Delimiter で拡張子が変わると次のルールの context に反映される', () => {
    const files = makeFiles('file.backup.txt');
    const rules: RenameRule[] = [
      // Delimiter on dot: remove right of 1st dot → "file"
      {
        type: 'delimiter',
        enabled: true,
        delimiter: '.',
        position: 1,
        side: 'right',
        action: 'remove',
      } satisfies DelimiterRule,
      // Then replace "file" with "document"
      makeReplaceRule('file', 'document'),
    ];
    const results = applyRuleChain(files, rules);
    expect(results[0].newName).toBe('document.txt');
  });
});

import type { ReplaceRule } from '@app/shared';
import styles from './RulePanel.module.css';

interface ReplaceRuleEditorProps {
  rule: ReplaceRule;
  onChange: (rule: ReplaceRule) => void;
}

export function ReplaceRuleEditor({ rule, onChange }: ReplaceRuleEditorProps) {
  const update = (partial: Partial<ReplaceRule>) => {
    onChange({ ...rule, ...partial });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>検索:</label>
        <input
          className={styles.fieldInput}
          type="text"
          value={rule.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder={rule.useRegex ? '正規表現パターン' : '検索文字列'}
        />
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>置換:</label>
        <input
          className={styles.fieldInput}
          type="text"
          value={rule.replace}
          onChange={(e) => update({ replace: e.target.value })}
          placeholder="置換文字列（空で削除）"
        />
      </div>
      <div className={styles.optionRow}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={rule.useRegex}
            onChange={(e) => update({ useRegex: e.target.checked })}
          />
          正規表現
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={rule.caseSensitive}
            onChange={(e) => update({ caseSensitive: e.target.checked })}
          />
          大文字小文字を区別
        </label>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={rule.includeExtension}
            onChange={(e) => update({ includeExtension: e.target.checked })}
          />
          拡張子を含む
        </label>
      </div>
    </div>
  );
}

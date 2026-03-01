import type { DelimiterRule } from '@app/shared';
import styles from './RulePanel.module.css';

interface DelimiterRuleEditorProps {
  rule: DelimiterRule;
  onChange: (rule: DelimiterRule) => void;
}

const DELIMITER_PRESETS = [
  { label: '_ (アンダースコア)', value: '_' },
  { label: '- (ハイフン)', value: '-' },
  { label: '. (ドット)', value: '.' },
  { label: '(スペース)', value: ' ' },
];

export function DelimiterRuleEditor({ rule, onChange }: DelimiterRuleEditorProps) {
  const update = (partial: Partial<DelimiterRule>) => {
    onChange({ ...rule, ...partial });
  };

  const isCustomDelimiter = !DELIMITER_PRESETS.some((p) => p.value === rule.delimiter);

  return (
    <div className={styles.editor}>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>区切り:</label>
        <select
          className={styles.fieldInput}
          value={isCustomDelimiter ? '__custom__' : rule.delimiter}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              update({ delimiter: '' });
            } else {
              update({ delimiter: e.target.value });
            }
          }}
        >
          {DELIMITER_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">カスタム</option>
        </select>
      </div>
      {isCustomDelimiter && (
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}></label>
          <input
            className={styles.fieldInput}
            type="text"
            value={rule.delimiter}
            onChange={(e) => update({ delimiter: e.target.value })}
            placeholder="区切り文字を入力"
          />
        </div>
      )}
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>位置:</label>
        <input
          className={styles.fieldInput}
          type="number"
          min={1}
          value={rule.position}
          onChange={(e) => update({ position: Math.max(1, parseInt(e.target.value) || 1) })}
          style={{ maxWidth: '4rem' }}
        />
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
          番目の区切りより
        </span>
        <select
          className={styles.fieldInput}
          value={rule.side}
          onChange={(e) => update({ side: e.target.value as 'left' | 'right' })}
          style={{ maxWidth: '5rem' }}
        >
          <option value="left">左側</option>
          <option value="right">右側</option>
        </select>
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>操作:</label>
        <select
          className={styles.fieldInput}
          value={rule.action}
          onChange={(e) => update({ action: e.target.value as 'replace' | 'remove' | 'keep' })}
          style={{ maxWidth: '6rem' }}
        >
          <option value="replace">置換</option>
          <option value="remove">削除</option>
          <option value="keep">保持</option>
        </select>
        {rule.action === 'replace' && (
          <input
            className={styles.fieldInput}
            type="text"
            value={rule.value ?? ''}
            onChange={(e) => update({ value: e.target.value })}
            placeholder="新しい値"
          />
        )}
      </div>
    </div>
  );
}

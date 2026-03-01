import type { SequenceRule } from '@app/shared';
import styles from './RulePanel.module.css';

interface SequenceRuleEditorProps {
  rule: SequenceRule;
  onChange: (rule: SequenceRule) => void;
}

export function SequenceRuleEditor({ rule, onChange }: SequenceRuleEditorProps) {
  const update = (partial: Partial<SequenceRule>) => {
    onChange({ ...rule, ...partial });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>開始:</label>
        <input
          className={styles.fieldInput}
          type="number"
          value={rule.start}
          onChange={(e) => update({ start: parseInt(e.target.value) || 1 })}
          style={{ maxWidth: '5rem' }}
        />
        <label className={styles.fieldLabel}>桁数:</label>
        <input
          className={styles.fieldInput}
          type="number"
          min={1}
          value={rule.padding}
          onChange={(e) => update({ padding: Math.max(1, parseInt(e.target.value) || 1) })}
          style={{ maxWidth: '4rem' }}
        />
        <label className={styles.fieldLabel}>増分:</label>
        <input
          className={styles.fieldInput}
          type="number"
          value={rule.step}
          onChange={(e) => update({ step: parseInt(e.target.value) || 1 })}
          style={{ maxWidth: '4rem' }}
        />
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>挿入:</label>
        <select
          className={styles.fieldInput}
          value={rule.position}
          onChange={(e) => update({ position: e.target.value as 'prefix' | 'suffix' | 'custom' })}
          style={{ maxWidth: '8rem' }}
        >
          <option value="prefix">先頭</option>
          <option value="suffix">末尾</option>
          <option value="custom">カスタム</option>
        </select>
        {rule.position === 'custom' && (
          <>
            <label className={styles.fieldLabel}>位置:</label>
            <input
              className={styles.fieldInput}
              type="number"
              min={0}
              value={rule.customPosition ?? 0}
              onChange={(e) =>
                update({ customPosition: Math.max(0, parseInt(e.target.value) || 0) })
              }
              style={{ maxWidth: '4rem' }}
            />
          </>
        )}
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>並替:</label>
        <select
          className={styles.fieldInput}
          value={rule.sortBy}
          onChange={(e) => update({ sortBy: e.target.value as 'name' | 'date' | 'size' })}
          style={{ maxWidth: '6rem' }}
        >
          <option value="name">名前順</option>
          <option value="date">日付順</option>
          <option value="size">サイズ順</option>
        </select>
        <select
          className={styles.fieldInput}
          value={rule.sortOrder}
          onChange={(e) => update({ sortOrder: e.target.value as 'asc' | 'desc' })}
          style={{ maxWidth: '5rem' }}
        >
          <option value="asc">昇順</option>
          <option value="desc">降順</option>
        </select>
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.fieldLabel}>書式:</label>
        <input
          className={styles.fieldInput}
          type="text"
          value={rule.template ?? ''}
          onChange={(e) => update({ template: e.target.value || undefined })}
          placeholder="{name}_{num:3}.{ext}（空で位置指定を使用）"
        />
      </div>
    </div>
  );
}

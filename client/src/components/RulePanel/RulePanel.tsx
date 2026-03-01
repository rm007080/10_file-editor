import { useState } from 'react';
import type { RenameRule } from '@app/shared';
import type { RuleType } from '../../hooks/useRenameRules.js';
import { ReplaceRuleEditor } from './ReplaceRuleEditor.js';
import { DelimiterRuleEditor } from './DelimiterRuleEditor.js';
import { SequenceRuleEditor } from './SequenceRuleEditor.js';
import styles from './RulePanel.module.css';

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  replace: '文字列置換',
  delimiter: '区切り記号',
  sequence: '連番付与',
};

interface RulePanelProps {
  rules: RenameRule[];
  onAddRule: (type: RuleType) => void;
  onRemoveRule: (index: number) => void;
  onUpdateRule: (index: number, rule: RenameRule) => void;
  onMoveRule: (index: number, direction: 'up' | 'down') => void;
}

export function RulePanel({
  rules,
  onAddRule,
  onRemoveRule,
  onUpdateRule,
  onMoveRule,
}: RulePanelProps) {
  const [addType, setAddType] = useState<RuleType>('replace');

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.heading}>ルール設定</h2>
        <div className={styles.addGroup}>
          <select
            className={styles.typeSelect}
            value={addType}
            onChange={(e) => setAddType(e.target.value as RuleType)}
          >
            <option value="replace">文字列置換</option>
            <option value="delimiter">区切り記号</option>
            <option value="sequence">連番付与</option>
          </select>
          <button className={styles.addButton} onClick={() => onAddRule(addType)}>
            + 追加
          </button>
        </div>
      </div>
      <div className={styles.ruleList}>
        {rules.map((rule, index) => (
          <div key={index} className={styles.ruleCard}>
            <div className={styles.ruleHeader}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => onUpdateRule(index, { ...rule, enabled: e.target.checked })}
                />
                <span className={styles.ruleTitle}>
                  {index + 1}. {RULE_TYPE_LABELS[rule.type]}
                </span>
              </label>
              <div className={styles.ruleActions}>
                <button
                  className={styles.moveButton}
                  onClick={() => onMoveRule(index, 'up')}
                  disabled={index === 0}
                  title="上へ"
                >
                  ↑
                </button>
                <button
                  className={styles.moveButton}
                  onClick={() => onMoveRule(index, 'down')}
                  disabled={index === rules.length - 1}
                  title="下へ"
                >
                  ↓
                </button>
                <button
                  className={styles.removeButton}
                  onClick={() => onRemoveRule(index)}
                  title="削除"
                >
                  ✕
                </button>
              </div>
            </div>
            {rule.type === 'replace' && (
              <ReplaceRuleEditor rule={rule} onChange={(updated) => onUpdateRule(index, updated)} />
            )}
            {rule.type === 'delimiter' && (
              <DelimiterRuleEditor
                rule={rule}
                onChange={(updated) => onUpdateRule(index, updated)}
              />
            )}
            {rule.type === 'sequence' && (
              <SequenceRuleEditor
                rule={rule}
                onChange={(updated) => onUpdateRule(index, updated)}
              />
            )}
          </div>
        ))}
        {rules.length === 0 && (
          <p className={styles.empty}>
            ルールがありません。ルール種別を選んで「+ 追加」してください。
          </p>
        )}
      </div>
    </div>
  );
}

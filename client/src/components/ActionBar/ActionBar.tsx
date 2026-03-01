import styles from './ActionBar.module.css';

interface ActionBarProps {
  changedCount: number;
  hasCollisions: boolean;
  canExecute: boolean;
  canUndo: boolean;
  isExecuting: boolean;
  onExecute: () => void;
  onUndo: () => void;
  onShowHistory: () => void;
  onShowPresets: () => void;
}

export function ActionBar({
  changedCount,
  hasCollisions,
  canExecute,
  canUndo,
  isExecuting,
  onExecute,
  onUndo,
  onShowHistory,
  onShowPresets,
}: ActionBarProps) {
  return (
    <div className={styles.container}>
      <div className={styles.info}>
        {changedCount > 0 && <span className={styles.count}>{changedCount} 件の変更</span>}
        {hasCollisions && <span className={styles.warning}>衝突あり — 実行できません</span>}
      </div>
      <div className={styles.actions}>
        <button className={styles.secondaryButton} onClick={onShowPresets}>
          プリセット
        </button>
        <button className={styles.secondaryButton} onClick={onShowHistory}>
          履歴
        </button>
        <button
          className={styles.undoButton}
          onClick={onUndo}
          disabled={!canUndo || isExecuting}
          title="元に戻す (Ctrl+Z)"
        >
          元に戻す
        </button>
        <button
          className={styles.executeButton}
          onClick={onExecute}
          disabled={!canExecute || isExecuting}
          title="リネーム実行 (Ctrl+Enter)"
        >
          {isExecuting ? '実行中...' : '実行'}
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal.js';
import { getUndoHistory, undo as executeUndo, ApiError } from '../../services/api.js';
import type { UndoHistoryEntry } from '@app/shared';
import styles from './UndoHistoryModal.module.css';

interface UndoHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUndoComplete: (message: string) => void;
  onUndoError: (message: string) => void;
}

export function UndoHistoryModal({
  isOpen,
  onClose,
  onUndoComplete,
  onUndoError,
}: UndoHistoryModalProps) {
  const [entries, setEntries] = useState<UndoHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUndoHistory();
      setEntries(data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '履歴の取得に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  const handleUndo = async (operationId: string) => {
    setExecutingId(operationId);
    try {
      const result = await executeUndo(operationId);
      onUndoComplete(`${result.successCount} 件を元に戻しました`);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '元に戻す操作に失敗しました';
      onUndoError(message);
    } finally {
      setExecutingId(null);
    }
  };

  const formatDate = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDir = (dirPath: string) => {
    const parts = dirPath.split('/');
    return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : dirPath;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Undo 履歴">
      {isLoading && <p className={styles.loading}>読み込み中...</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!isLoading && !error && entries.length === 0 && (
        <p className={styles.empty}>履歴がありません</p>
      )}
      {!isLoading && entries.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>日時</th>
              <th>ディレクトリ</th>
              <th>件数</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.operationId}>
                <td>{formatDate(entry.timestamp)}</td>
                <td className={styles.dirPath} title={entry.directoryPath}>
                  {formatDir(entry.directoryPath)}
                </td>
                <td>{entry.fileCount}</td>
                <td>{entry.phase}</td>
                <td>
                  {entry.phase === 'completed' && (
                    <button
                      className={styles.undoBtn}
                      onClick={() => handleUndo(entry.operationId)}
                      disabled={executingId !== null}
                    >
                      {executingId === entry.operationId ? '実行中...' : '元に戻す'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

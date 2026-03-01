import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { DirectoryInput } from './components/DirectoryInput/DirectoryInput.js';
import { RulePanel } from './components/RulePanel/RulePanel.js';
import { FilePreviewTable } from './components/FilePreviewTable/FilePreviewTable.js';
import { ActionBar } from './components/ActionBar/ActionBar.js';
import { Modal } from './components/common/Modal.js';
import { Toast } from './components/common/Toast.js';
import type { ToastMessage } from './components/common/Toast.js';
import { UndoHistoryModal } from './components/UndoHistoryModal/UndoHistoryModal.js';
import { PresetModal } from './components/PresetModal/PresetModal.js';
import { useFiles } from './hooks/useFiles.js';
import { useRenameRules } from './hooks/useRenameRules.js';
import { usePreview } from './hooks/usePreview.js';
import { rename as executeRename, undo as executeUndo, ApiError } from './services/api.js';
import styles from './App.module.css';

function App() {
  const {
    files,
    directoryPath,
    isLoading: filesLoading,
    error: filesError,
    loadFiles,
  } = useFiles();
  const { rules, addRule, removeRule, updateRule, moveRule, loadRules } = useRenameRules();

  const [selectedFiles, setSelectedFiles] = useState<string[] | null>(null);
  const activeFiles = useMemo(
    () => selectedFiles ?? files.map((f) => f.name),
    [selectedFiles, files],
  );

  const {
    results,
    previewToken,
    hasCollisions,
    isLoading: previewLoading,
    error: previewError,
    changedCount,
  } = usePreview(directoryPath, rules, selectedFiles);

  const [lastOperationId, setLastOperationId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showConfirm = pendingToken !== null;
  const canExecute = previewToken !== null && changedCount > 0 && !hasCollisions;

  const handleToggleFile = useCallback(
    (fileName: string) => {
      setSelectedFiles((prev) => {
        const current = prev ?? files.map((f) => f.name);
        if (current.includes(fileName)) {
          return current.filter((n) => n !== fileName);
        }
        return [...current, fileName];
      });
    },
    [files],
  );

  const handleSelectAll = useCallback(() => {
    setSelectedFiles(null);
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const handleConfirmOpen = useCallback(() => {
    if (previewToken) {
      setPendingToken(previewToken);
    }
  }, [previewToken]);

  const handleConfirmClose = useCallback(() => {
    setPendingToken(null);
  }, []);

  const handleExecute = async () => {
    const token = pendingToken;
    if (!token) return;
    setPendingToken(null);
    setIsExecuting(true);
    try {
      const result = await executeRename(token);
      setLastOperationId(result.operationId);
      addToast('success', `${result.successCount} 件のリネームが完了しました`);
      if (directoryPath) {
        loadFiles(directoryPath);
        setSelectedFiles(null);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'リネーム実行に失敗しました';
      addToast('error', message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUndo = async () => {
    setIsExecuting(true);
    try {
      const result = await executeUndo(lastOperationId ?? undefined);
      addToast('success', `${result.successCount} 件を元に戻しました`);
      setLastOperationId(null);
      if (directoryPath) {
        loadFiles(directoryPath);
        setSelectedFiles(null);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '元に戻す操作に失敗しました';
      addToast('error', message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUndoFromHistory = useCallback(
    (message: string) => {
      addToast('success', message);
      setLastOperationId(null);
      if (directoryPath) {
        loadFiles(directoryPath);
        setSelectedFiles(null);
      }
    },
    [addToast, directoryPath, loadFiles],
  );

  // Keyboard shortcuts
  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleConfirmOpenRef = useRef(handleConfirmOpen);
  handleConfirmOpenRef.current = handleConfirmOpen;

  // Electron menu actions
  useEffect(() => {
    const cleanup = window.electronAPI?.onMenuAction((action) => {
      if (action === 'undo') {
        handleUndoRef.current();
      }
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when focus is on input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Escape: close modals
      if (e.key === 'Escape') {
        if (pendingToken) {
          setPendingToken(null);
          e.preventDefault();
        } else if (showHistory) {
          setShowHistory(false);
          e.preventDefault();
        } else if (showPresets) {
          setShowPresets(false);
          e.preventDefault();
        }
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (lastOperationId && !isExecuting) {
          e.preventDefault();
          handleUndoRef.current();
        }
        return;
      }

      // Ctrl+Enter: Execute rename
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (canExecute && !isExecuting) {
          e.preventDefault();
          handleConfirmOpenRef.current();
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingToken, showHistory, showPresets, lastOperationId, isExecuting, canExecute]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>File Renamer</h1>
      </header>

      <DirectoryInput onLoad={loadFiles} isLoading={filesLoading} />

      {filesError && <p className={styles.error}>{filesError}</p>}
      {previewError && <p className={styles.error}>{previewError}</p>}

      {files.length > 0 && (
        <>
          <div className={styles.main}>
            <div className={styles.rulePane}>
              <RulePanel
                rules={rules}
                onAddRule={addRule}
                onRemoveRule={removeRule}
                onUpdateRule={updateRule}
                onMoveRule={moveRule}
              />
            </div>
            <div className={styles.previewPane}>
              <FilePreviewTable
                files={files}
                previewResults={results}
                isLoading={previewLoading}
                selectedFiles={activeFiles}
                onToggleFile={handleToggleFile}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
              />
            </div>
          </div>

          <ActionBar
            changedCount={changedCount}
            hasCollisions={hasCollisions}
            canExecute={canExecute}
            canUndo={lastOperationId !== null}
            isExecuting={isExecuting}
            onExecute={handleConfirmOpen}
            onUndo={handleUndo}
            onShowHistory={() => setShowHistory(true)}
            onShowPresets={() => setShowPresets(true)}
          />
        </>
      )}

      <Modal isOpen={showConfirm} onClose={handleConfirmClose} title="リネーム実行の確認">
        <p className={styles.confirmText}>
          {changedCount} 件のファイル名を変更します。よろしいですか？
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.cancelButton} onClick={handleConfirmClose}>
            キャンセル
          </button>
          <button className={styles.confirmButton} onClick={handleExecute}>
            実行する
          </button>
        </div>
      </Modal>

      <UndoHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onUndoComplete={handleUndoFromHistory}
        onUndoError={(msg) => addToast('error', msg)}
      />

      <PresetModal
        isOpen={showPresets}
        onClose={() => setShowPresets(false)}
        currentRules={rules}
        onLoadPreset={loadRules}
        onSuccess={(msg) => addToast('success', msg)}
        onError={(msg) => addToast('error', msg)}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;

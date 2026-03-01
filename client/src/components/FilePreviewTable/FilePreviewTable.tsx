import type { PreviewResult, FileEntry } from '@app/shared';
import styles from './FilePreviewTable.module.css';

interface FilePreviewTableProps {
  files: FileEntry[];
  previewResults: PreviewResult[];
  isLoading: boolean;
  selectedFiles: string[];
  onToggleFile: (fileName: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function FilePreviewTable({
  files,
  previewResults,
  isLoading,
  selectedFiles,
  onToggleFile,
  onSelectAll,
  onDeselectAll,
}: FilePreviewTableProps) {
  const hasPreview = previewResults.length > 0;
  const changedCount = previewResults.filter((r) => r.hasChanged).length;
  const selectedSet = new Set(selectedFiles);
  const allSelected = files.length > 0 && files.every((f) => selectedSet.has(f.name));
  const noneSelected = selectedFiles.length === 0;

  if (files.length === 0) {
    return <div className={styles.empty}>ディレクトリを読み込むとファイル一覧が表示されます。</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.heading}>プレビュー</h2>
        <span className={styles.count}>
          {selectedFiles.length}/{files.length} ファイル選択
          {hasPreview && changedCount > 0 && ` / ${changedCount} 件変更`}
        </span>
        {isLoading && <span className={styles.loading}>更新中...</span>}
      </div>
      <div className={styles.selectionBar}>
        <button className={styles.selectionButton} onClick={onSelectAll} disabled={allSelected}>
          全選択
        </button>
        <button className={styles.selectionButton} onClick={onDeselectAll} disabled={noneSelected}>
          全解除
        </button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}></th>
              <th className={styles.th}>変更前</th>
              <th className={styles.thArrow}></th>
              <th className={styles.th}>変更後</th>
            </tr>
          </thead>
          <tbody>
            {hasPreview
              ? previewResults.map((result) => (
                  <tr
                    key={result.originalName}
                    className={
                      result.hasCollision
                        ? styles.rowCollision
                        : result.hasChanged
                          ? styles.rowChanged
                          : styles.rowUnchanged
                    }
                  >
                    <td className={styles.tdCheck}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(result.originalName)}
                        onChange={() => onToggleFile(result.originalName)}
                      />
                    </td>
                    <td className={styles.td}>{result.originalName}</td>
                    <td className={styles.tdArrow}>{result.hasChanged ? '→' : ''}</td>
                    <td className={styles.td}>
                      {result.hasChanged ? result.newName : ''}
                      {result.hasCollision && (
                        <span
                          className={styles.collision}
                          title={`衝突: ${result.collisionWith ?? ''}`}
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              : files.map((file) => (
                  <tr
                    key={file.name}
                    className={
                      selectedSet.has(file.name) ? styles.rowUnchanged : styles.rowDeselected
                    }
                  >
                    <td className={styles.tdCheck}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(file.name)}
                        onChange={() => onToggleFile(file.name)}
                      />
                    </td>
                    <td className={styles.td}>{file.name}</td>
                    <td className={styles.tdArrow}></td>
                    <td className={styles.td}></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from 'react';
import styles from './DirectoryInput.module.css';

interface DirectoryInputProps {
  onLoad: (directoryPath: string, extensions?: string) => void;
  isLoading: boolean;
}

export function DirectoryInput({ onLoad, isLoading }: DirectoryInputProps) {
  const [path, setPath] = useState('');
  const [extensions, setExtensions] = useState('');

  const isElectron = !!window.electronAPI?.isElectron;

  const handleSubmit = () => {
    const trimmed = path.trim();
    if (trimmed) {
      const ext = extensions.trim() || undefined;
      onLoad(trimmed, ext);
    }
  };

  const handleSelectDirectory = async () => {
    const result = await window.electronAPI!.selectDirectory();
    if (!result.canceled && result.filePaths.length > 0) {
      const selected = result.filePaths[0];
      setPath(selected);
      const ext = extensions.trim() || undefined;
      onLoad(selected, ext);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="directory-path">
          ディレクトリ:
        </label>
        <input
          id="directory-path"
          className={styles.input}
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="C:\Users\...\Photos"
          disabled={isLoading}
        />
        {isElectron && (
          <button
            className={styles.browseButton}
            onClick={handleSelectDirectory}
            disabled={isLoading}
          >
            参照...
          </button>
        )}
        <button
          className={styles.button}
          onClick={handleSubmit}
          disabled={isLoading || !path.trim()}
        >
          {isLoading ? '読込中...' : '読込'}
        </button>
      </div>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="extensions-filter">
          フィルタ:
        </label>
        <input
          id="extensions-filter"
          className={styles.input}
          type="text"
          value={extensions}
          onChange={(e) => setExtensions(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder=".jpg, .png（空で全ファイル）"
          disabled={isLoading}
          style={{ maxWidth: '20rem' }}
        />
      </div>
    </div>
  );
}

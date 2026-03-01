import { useState, useCallback } from 'react';
import type { FileEntry } from '@app/shared';
import { getFiles, ApiError } from '../services/api.js';

interface UseFilesReturn {
  files: FileEntry[];
  directoryPath: string | null;
  isLoading: boolean;
  error: string | null;
  loadFiles: (directoryPath: string, extensions?: string) => Promise<void>;
}

export function useFiles(): UseFilesReturn {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [directoryPath, setDirectoryPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async (path: string, extensions?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getFiles(path, extensions);
      setFiles(result);
      setDirectoryPath(path);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'ファイル一覧の取得に失敗しました';
      setError(message);
      setFiles([]);
      setDirectoryPath(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { files, directoryPath, isLoading, error, loadFiles };
}

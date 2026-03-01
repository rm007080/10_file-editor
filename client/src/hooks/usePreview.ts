import { useState, useEffect, useRef, useMemo } from 'react';
import type { RenameRule, PreviewResult } from '@app/shared';
import { preview as fetchPreview, ApiError } from '../services/api.js';

interface UsePreviewReturn {
  results: PreviewResult[];
  previewToken: string | null;
  hasCollisions: boolean;
  isLoading: boolean;
  error: string | null;
  changedCount: number;
}

export function usePreview(
  directoryPath: string | null,
  rules: RenameRule[],
  selectedFiles: string[] | null,
): UsePreviewReturn {
  const [results, setResults] = useState<PreviewResult[]>([]);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [hasCollisions, setHasCollisions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  const rulesKey = useMemo(() => JSON.stringify(rules), [rules]);
  const selectedFilesKey = useMemo(() => JSON.stringify(selectedFiles ?? null), [selectedFiles]);

  useEffect(() => {
    const reset = () => {
      setResults([]);
      setPreviewToken(null);
      setHasCollisions(false);
      setError(null);
      setIsLoading(false);
    };

    const enabled = rules.filter((r) => r.enabled);
    const hasValidRule = enabled.some((r) => r.type !== 'replace' || r.search !== '');

    if (!directoryPath || enabled.length === 0 || !hasValidRule) {
      reqIdRef.current += 1;
      reset();
      return;
    }

    const reqId = ++reqIdRef.current;
    const controller = new AbortController();

    const timerId = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchPreview(directoryPath, rules, selectedFiles ?? undefined, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || reqId !== reqIdRef.current) return;

        setResults(data.results);
        setPreviewToken(data.previewToken);
        setHasCollisions(data.hasCollisions);
      } catch (err) {
        if (controller.signal.aborted || reqId !== reqIdRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof ApiError ? err.message : 'プレビューの取得に失敗しました';
        setError(message);
      } finally {
        if (reqId === reqIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [directoryPath, rulesKey, selectedFilesKey]);

  const changedCount = results.filter((r) => r.hasChanged).length;
  return { results, previewToken, hasCollisions, isLoading, error, changedCount };
}

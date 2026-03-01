import type {
  FileEntry,
  RenameRule,
  PreviewResponse,
  RenameResponse,
  UndoResponse,
  UndoHistoryEntry,
  Preset,
  ErrorResponse,
} from '@app/shared';

// --- API Base URL ---

let apiBaseUrl = '';

export async function initApiBaseUrl(): Promise<void> {
  if (window.electronAPI?.isElectron) {
    const port = await window.electronAPI.getServerPort();
    apiBaseUrl = `http://127.0.0.1:${port}`;
  }
}

// --- Error handling ---

class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ErrorResponse | undefined;
    try {
      body = (await res.json()) as ErrorResponse;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(
      body?.error ?? `HTTP ${res.status}`,
      body?.code ?? 'UNKNOWN',
      res.status,
      body?.details,
    );
  }
  return res.json() as Promise<T>;
}

export async function getFiles(directoryPath: string, extensions?: string): Promise<FileEntry[]> {
  const params = new URLSearchParams({ directoryPath });
  if (extensions) params.set('extensions', extensions);
  const res = await fetch(`${apiBaseUrl}/api/files?${params}`);
  const data = await handleResponse<{ directoryPath: string; files: FileEntry[] }>(res);
  return data.files;
}

export async function preview(
  directoryPath: string,
  rules: RenameRule[],
  selectedFiles?: string[],
  options?: { signal?: AbortSignal },
): Promise<PreviewResponse> {
  const res = await fetch(`${apiBaseUrl}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directoryPath, rules, selectedFiles }),
    signal: options?.signal,
  });
  return handleResponse<PreviewResponse>(res);
}

export async function rename(previewToken: string): Promise<RenameResponse> {
  const res = await fetch(`${apiBaseUrl}/api/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ previewToken }),
  });
  return handleResponse<RenameResponse>(res);
}

export async function undo(operationId?: string): Promise<UndoResponse> {
  const res = await fetch(`${apiBaseUrl}/api/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operationId ? { operationId } : {}),
  });
  return handleResponse<UndoResponse>(res);
}

export async function getUndoHistory(): Promise<UndoHistoryEntry[]> {
  const res = await fetch(`${apiBaseUrl}/api/undo/history`);
  return handleResponse<UndoHistoryEntry[]>(res);
}

export async function getPresets(): Promise<Preset[]> {
  const res = await fetch(`${apiBaseUrl}/api/presets`);
  return handleResponse<Preset[]>(res);
}

export async function savePreset(name: string, rules: RenameRule[], id?: string): Promise<Preset> {
  const res = await fetch(`${apiBaseUrl}/api/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, rules, id }),
  });
  return handleResponse<Preset>(res);
}

export async function deletePreset(presetId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/presets/${presetId}`, {
    method: 'DELETE',
  });
  await handleResponse<{ success: boolean }>(res);
}

export { ApiError };

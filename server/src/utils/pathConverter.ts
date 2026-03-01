import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PlatformType } from '@app/shared';

// --- Platform detection (singleton) ---

export interface PlatformInfo {
  platform: PlatformType;
  isWSL: boolean;
}

let cachedPlatformInfo: PlatformInfo | null = null;

export function detectPlatform(): PlatformInfo {
  if (cachedPlatformInfo) return cachedPlatformInfo;

  const platform = process.platform as PlatformType;

  if (platform === 'linux') {
    try {
      if (existsSync('/proc/version')) {
        const version = readFileSync('/proc/version', 'utf-8');
        const isWSL = /microsoft|wsl/i.test(version);
        cachedPlatformInfo = { platform, isWSL };
        return cachedPlatformInfo;
      }
    } catch {
      // If /proc/version is unreadable, assume not WSL
    }
    cachedPlatformInfo = { platform, isWSL: false };
    return cachedPlatformInfo;
  }

  cachedPlatformInfo = { platform, isWSL: false };
  return cachedPlatformInfo;
}

export function isWindows(): boolean {
  return detectPlatform().platform === 'win32';
}

export function isWSL(): boolean {
  const info = detectPlatform();
  return info.platform === 'linux' && info.isWSL;
}

// --- Path patterns ---

const WINDOWS_DRIVE_BACKSLASH = /^([A-Za-z]):\\(.*)$/;
const WINDOWS_DRIVE_SLASH = /^([A-Za-z]):\/(.*)$/;
const UNC_PATH = /^\\\\[^\\]+\\[^\\]+/;
const EXTENDED_LENGTH_PATH = /^\\\\\?\\/;
const WSL_MNT_PATH = /^\/mnt\/([a-z])\/(.*)/;

// --- WSL path conversion ---

export function windowsToWsl(windowsPath: string): string {
  // Backslash: C:\Users\... → /mnt/c/Users/...
  const backslashMatch = windowsPath.match(WINDOWS_DRIVE_BACKSLASH);
  if (backslashMatch) {
    const drive = backslashMatch[1].toLowerCase();
    const rest = backslashMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }

  // Forward slash: C:/Users/... → /mnt/c/Users/...
  const slashMatch = windowsPath.match(WINDOWS_DRIVE_SLASH);
  if (slashMatch) {
    const drive = slashMatch[1].toLowerCase();
    const rest = slashMatch[2];
    return `/mnt/${drive}/${rest}`;
  }

  return windowsPath;
}

export function wslToWindows(wslPath: string): string {
  const match = wslPath.match(WSL_MNT_PATH);
  if (!match) return wslPath;
  const drive = match[1].toUpperCase();
  const rest = match[2].replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
}

// --- Input path normalization ---

function isWindowsDrivePath(inputPath: string): boolean {
  return WINDOWS_DRIVE_BACKSLASH.test(inputPath) || WINDOWS_DRIVE_SLASH.test(inputPath);
}

function isUNCPath(inputPath: string): boolean {
  return UNC_PATH.test(inputPath);
}

function isExtendedLengthPath(inputPath: string): boolean {
  return EXTENDED_LENGTH_PATH.test(inputPath);
}

function isWSLMntPath(inputPath: string): boolean {
  return WSL_MNT_PATH.test(inputPath);
}

function normalizeForWSL(inputPath: string): string {
  if (isExtendedLengthPath(inputPath)) {
    throw new PathConversionError('拡張パス形式（\\\\?\\）はサポートされていません');
  }

  if (isUNCPath(inputPath)) {
    throw new PathConversionError(
      'UNCパス（\\\\server\\share）はWSL環境ではサポートされていません',
    );
  }

  if (isWindowsDrivePath(inputPath)) {
    return windowsToWsl(inputPath);
  }

  if (isWSLMntPath(inputPath)) {
    return inputPath;
  }

  // Linux native path (non-WSL Linux or WSL accessing Linux-native fs)
  if (inputPath.startsWith('/')) {
    return inputPath;
  }

  throw new PathConversionError(`無効なパス形式です: ${inputPath}`);
}

function normalizeForWindows(inputPath: string): string {
  if (isExtendedLengthPath(inputPath)) {
    throw new PathConversionError('拡張パス形式（\\\\?\\）はサポートされていません');
  }

  if (isWSLMntPath(inputPath)) {
    throw new PathConversionError('WSLパス（/mnt/...）はWindows環境ではサポートされていません');
  }

  if (isUNCPath(inputPath)) {
    return inputPath;
  }

  if (isWindowsDrivePath(inputPath)) {
    // Normalize forward slashes to backslashes
    return path.win32.normalize(inputPath);
  }

  throw new PathConversionError(`無効なパス形式です: ${inputPath}`);
}

export function normalizeInputPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    throw new PathConversionError('パスが空です');
  }

  // Remove trailing slash/backslash (except root paths like C:\ or /)
  const cleaned = trimmed.replace(/[/\\]+$/, '') || trimmed;

  if (isWindows()) {
    return normalizeForWindows(cleaned);
  } else {
    return normalizeForWSL(cleaned);
  }
}

// --- Error class ---

export class PathConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathConversionError';
  }
}

// --- Test helper ---

export function _resetPlatformCache(): void {
  cachedPlatformInfo = null;
}

export function _setPlatformInfoForTest(info: PlatformInfo): void {
  cachedPlatformInfo = info;
}

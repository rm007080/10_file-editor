import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  windowsToWsl,
  wslToWindows,
  normalizeInputPath,
  PathConversionError,
  _resetPlatformCache,
  _setPlatformInfoForTest,
} from '../pathConverter.js';

// --- Helper: force platform for tests ---

function setWSL() {
  _setPlatformInfoForTest({ platform: 'linux', isWSL: true });
}

function setWindows() {
  _setPlatformInfoForTest({ platform: 'win32', isWSL: false });
}

beforeEach(() => {
  _resetPlatformCache();
});

afterEach(() => {
  _resetPlatformCache();
});

// ============================================================
// windowsToWsl() — pure conversion (platform-independent)
// ============================================================

describe('windowsToWsl', () => {
  it('C:\\ backslash path を /mnt/c/ に変換する', () => {
    expect(windowsToWsl('C:\\Users\\test')).toBe('/mnt/c/Users/test');
  });

  it('C:/ forward-slash path を /mnt/c/ に変換する', () => {
    expect(windowsToWsl('C:/Users/test')).toBe('/mnt/c/Users/test');
  });

  it('D:\\ ドライブの変換', () => {
    expect(windowsToWsl('D:\\Data\\files')).toBe('/mnt/d/Data/files');
  });

  it('小文字ドライブの変換', () => {
    expect(windowsToWsl('c:\\Users\\test')).toBe('/mnt/c/Users/test');
  });

  it('日本語パスの変換', () => {
    expect(windowsToWsl('C:\\Users\\ユーザー\\ドキュメント')).toBe(
      '/mnt/c/Users/ユーザー/ドキュメント',
    );
  });

  it('WSLパスはそのまま返す', () => {
    expect(windowsToWsl('/mnt/c/Users/test')).toBe('/mnt/c/Users/test');
  });
});

// ============================================================
// wslToWindows()
// ============================================================

describe('wslToWindows', () => {
  it('/mnt/c/ を C:\\ に変換する', () => {
    expect(wslToWindows('/mnt/c/Users/test')).toBe('C:\\Users\\test');
  });

  it('/mnt/d/ を D:\\ に変換する', () => {
    expect(wslToWindows('/mnt/d/Data/files')).toBe('D:\\Data\\files');
  });

  it('非WSLパスはそのまま返す', () => {
    expect(wslToWindows('/home/user/files')).toBe('/home/user/files');
  });
});

// ============================================================
// normalizeInputPath() — WSL環境
// ============================================================

describe('normalizeInputPath (WSL)', () => {
  beforeEach(() => setWSL());

  it('Windowsバックスラッシュパスを WSL パスに変換する', () => {
    expect(normalizeInputPath('C:\\Users\\test\\folder')).toBe('/mnt/c/Users/test/folder');
  });

  it('Windowsフォワードスラッシュパスを WSL パスに変換する', () => {
    expect(normalizeInputPath('C:/Users/test/folder')).toBe('/mnt/c/Users/test/folder');
  });

  it('WSLパスはそのまま通す', () => {
    expect(normalizeInputPath('/mnt/c/Users/test')).toBe('/mnt/c/Users/test');
  });

  it('各種ドライブ文字（D:, E: 等）を変換する', () => {
    expect(normalizeInputPath('D:\\Data')).toBe('/mnt/d/Data');
    expect(normalizeInputPath('E:\\Media\\Photos')).toBe('/mnt/e/Media/Photos');
  });

  it('日本語パスを変換する', () => {
    expect(normalizeInputPath('C:\\Users\\ユーザー\\画像')).toBe('/mnt/c/Users/ユーザー/画像');
  });

  it('UNCパスはエラーを返す', () => {
    expect(() => normalizeInputPath('\\\\server\\share\\folder')).toThrow(PathConversionError);
    expect(() => normalizeInputPath('\\\\server\\share\\folder')).toThrow(/UNCパス/);
  });

  it('拡張パス形式（\\\\?\\）はエラーを返す', () => {
    expect(() => normalizeInputPath('\\\\?\\C:\\Users')).toThrow(PathConversionError);
  });

  it('空文字列はエラーを返す', () => {
    expect(() => normalizeInputPath('')).toThrow(PathConversionError);
    expect(() => normalizeInputPath('  ')).toThrow(PathConversionError);
  });

  it('末尾のスラッシュを除去する', () => {
    expect(normalizeInputPath('C:\\Users\\test\\')).toBe('/mnt/c/Users/test');
  });

  it('Linuxネイティブパスを通す', () => {
    expect(normalizeInputPath('/home/user/files')).toBe('/home/user/files');
  });
});

// ============================================================
// normalizeInputPath() — Windows環境
// ============================================================

describe('normalizeInputPath (Windows)', () => {
  beforeEach(() => setWindows());

  it('Windowsバックスラッシュパスをそのまま使用する', () => {
    const result = normalizeInputPath('C:\\Users\\test\\folder');
    expect(result).toBe('C:\\Users\\test\\folder');
  });

  it('Windowsフォワードスラッシュパスを正規化する', () => {
    const result = normalizeInputPath('C:/Users/test/folder');
    expect(result).toBe('C:\\Users\\test\\folder');
  });

  it('UNCパスをサポートする', () => {
    const result = normalizeInputPath('\\\\server\\share\\folder');
    expect(result).toBe('\\\\server\\share\\folder');
  });

  it('WSLパスはエラーを返す', () => {
    expect(() => normalizeInputPath('/mnt/c/Users/test')).toThrow(PathConversionError);
  });

  it('拡張パス形式（\\\\?\\）はエラーを返す', () => {
    expect(() => normalizeInputPath('\\\\?\\C:\\Users')).toThrow(PathConversionError);
  });

  it('空文字列はエラーを返す', () => {
    expect(() => normalizeInputPath('')).toThrow(PathConversionError);
  });
});

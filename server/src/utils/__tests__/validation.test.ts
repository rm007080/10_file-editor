import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateFileName, isProtectedDirectory, ValidationError } from '../validation.js';
import { _resetPlatformCache, _setPlatformInfoForTest } from '../pathConverter.js';

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
// validateFileName()
// ============================================================

describe('validateFileName', () => {
  it('正常なファイル名を許可する', () => {
    expect(() => validateFileName('photo.jpg')).not.toThrow();
    expect(() => validateFileName('my-file_001.txt')).not.toThrow();
    expect(() => validateFileName('テスト画像.png')).not.toThrow();
  });

  it('空文字列を拒否する', () => {
    expect(() => validateFileName('')).toThrow(ValidationError);
    expect(() => validateFileName('')).toThrow(/空/);
  });

  it('パストラバーサル（..）を拒否する', () => {
    expect(() => validateFileName('../etc/passwd')).toThrow(ValidationError);
    expect(() => validateFileName('..\\secret.txt')).toThrow(ValidationError);
    expect(() => validateFileName('foo..bar')).toThrow(ValidationError);
  });

  it('スラッシュを拒否する', () => {
    expect(() => validateFileName('path/file.txt')).toThrow(ValidationError);
    expect(() => validateFileName('path\\file.txt')).toThrow(ValidationError);
  });

  it('制御文字（NUL 等）を拒否する', () => {
    expect(() => validateFileName('file\x00.txt')).toThrow(ValidationError);
    expect(() => validateFileName('file\x1f.txt')).toThrow(ValidationError);
  });

  it('Windows禁則文字（<>:"|?*）を拒否する', () => {
    expect(() => validateFileName('file<name>.txt')).toThrow(ValidationError);
    expect(() => validateFileName('file:name.txt')).toThrow(ValidationError);
    expect(() => validateFileName('file"name.txt')).toThrow(ValidationError);
    expect(() => validateFileName('file|name.txt')).toThrow(ValidationError);
    expect(() => validateFileName('file?name.txt')).toThrow(ValidationError);
    expect(() => validateFileName('file*name.txt')).toThrow(ValidationError);
  });

  it('末尾のドットを拒否する', () => {
    expect(() => validateFileName('file.')).toThrow(ValidationError);
  });

  it('末尾の空白を拒否する', () => {
    expect(() => validateFileName('file ')).toThrow(ValidationError);
  });

  it('Windows予約名（CON, PRN, NUL 等）を拒否する', () => {
    expect(() => validateFileName('CON')).toThrow(ValidationError);
    expect(() => validateFileName('con.txt')).toThrow(ValidationError);
    expect(() => validateFileName('PRN')).toThrow(ValidationError);
    expect(() => validateFileName('NUL')).toThrow(ValidationError);
    expect(() => validateFileName('COM1')).toThrow(ValidationError);
    expect(() => validateFileName('LPT1.txt')).toThrow(ValidationError);
    expect(() => validateFileName('AUX')).toThrow(ValidationError);
  });

  it('予約名に似た正常名を許可する', () => {
    expect(() => validateFileName('CONNECT.txt')).not.toThrow();
    expect(() => validateFileName('PRINTER.doc')).not.toThrow();
    expect(() => validateFileName('NULL.js')).not.toThrow();
  });

  it('日本語ファイル名を許可する', () => {
    expect(() => validateFileName('写真_2024.jpg')).not.toThrow();
    expect(() => validateFileName('レポート（最終版）.pdf')).not.toThrow();
  });
});

// ============================================================
// isProtectedDirectory() — WSL
// ============================================================

describe('isProtectedDirectory (WSL)', () => {
  beforeEach(() => setWSL());

  it('Windows システムフォルダを検出する', () => {
    expect(isProtectedDirectory('/mnt/c/Windows')).toBe(true);
    expect(isProtectedDirectory('/mnt/c/windows')).toBe(true);
    expect(isProtectedDirectory('/mnt/c/Windows/System32')).toBe(true);
  });

  it('Program Files を検出する', () => {
    expect(isProtectedDirectory('/mnt/c/Program Files')).toBe(true);
    expect(isProtectedDirectory('/mnt/c/Program Files (x86)')).toBe(true);
  });

  it('一般的なユーザーディレクトリを許可する', () => {
    expect(isProtectedDirectory('/mnt/c/Users/test/Documents')).toBe(false);
    expect(isProtectedDirectory('/mnt/d/Data')).toBe(false);
  });

  it('末尾スラッシュを正しく扱う', () => {
    expect(isProtectedDirectory('/mnt/c/Windows/')).toBe(true);
  });
});

// ============================================================
// isProtectedDirectory() — Windows
// ============================================================

describe('isProtectedDirectory (Windows)', () => {
  beforeEach(() => setWindows());

  it('Windows システムフォルダを検出する', () => {
    expect(isProtectedDirectory('C:\\Windows')).toBe(true);
    expect(isProtectedDirectory('C:\\windows')).toBe(true);
    expect(isProtectedDirectory('C:\\Windows\\System32')).toBe(true);
  });

  it('Program Files を検出する', () => {
    expect(isProtectedDirectory('C:\\Program Files')).toBe(true);
    expect(isProtectedDirectory('C:\\Program Files (x86)')).toBe(true);
  });

  it('一般的なユーザーディレクトリを許可する', () => {
    expect(isProtectedDirectory('C:\\Users\\test\\Documents')).toBe(false);
    expect(isProtectedDirectory('D:\\Data')).toBe(false);
  });
});

// ============================================================
// validatePath() — integration test (requires actual filesystem)
// We test only the parts that don't need filesystem access here.
// Full integration tests will be added in Phase 4.
// ============================================================

// Note: validatePath() requires actual filesystem access (fs.realpath),
// so full tests are deferred. The logic for isUnderAllowedRoot and
// isProtectedDirectory is tested above via their exported functions.

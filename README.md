# File Renamer

Windowsフォルダ内のファイル名を一括で変更できるローカルWebアプリケーション。
WSL2環境およびWindowsネイティブ環境の両方で動作します。

**完全ローカル完結** — 外部サーバーへの通信は一切ありません。ファイル名・パス情報を含むすべてのデータは localhost 内で処理されます。

## 機能

- **文字列置換**: 検索・置換によるファイル名変更（正規表現対応、大文字小文字区別ON/OFF）
- **区切り記号操作**: 指定区切り文字のN番目で分割し、左/右側を置換・削除・保持
- **連番付与**: ソート順に基づく連番のprefix/suffix付与（テンプレート構文 `{name}_{num:3}.{ext}` 対応）
- **ルールチェーン**: 複数ルールを順次適用。有効/無効切替・並び替え対応
- **リアルタイムプレビュー**: ルール変更時に変更前/変更後をリアルタイム表示（300msデバウンス）
- **衝突検出**: リネーム対象内の重複・既存ファイルとの衝突をNTFS case-insensitiveで検出
- **安全なリネーム**: 2段階リネーム（一時名退避方式）でswap/cycleパターン対応
- **Undo**: ジャーナルベースの元に戻す機能。過去の操作履歴から任意選択可能
- **プリセット**: よく使うルール設定の保存・読み込み・削除
- **キーボードショートカット**: `Ctrl+Enter`（実行）、`Ctrl+Z`（Undo）、`Escape`（モーダル閉じ）
- **レスポンシブ**: 800px以下で1カラムレイアウトに自動切替

## Electron デスクトップアプリ版

Web版に加えて、Electronによるスタンドアロンのデスクトップアプリとしても利用できます。

### デスクトップ版の追加機能

- **ネイティブフォルダ選択**: 「参照...」ボタンでOSのフォルダ選択ダイアログを使用可能
- **アプリケーションメニュー**: ファイル/編集/表示/ヘルプのネイティブメニュー
- **シングルインスタンス**: 多重起動を防止

### Electron 版の起動

```bash
# 開発モード
npm run electron:dev

# ビルド（main/preload/renderer）
npm run electron:build

# Windows用 .exe インストーラー生成
npm run electron:package
```

### インストーラー生成の前提条件

`npm run electron:package` は以下の環境で動作します：

- **Windows（PowerShell）**: そのまま実行可能。Windows の開発者モードを有効にする必要があります（設定 → プライバシーとセキュリティ → 開発者向け → 開発者モード）
- **WSL2**: `electron-vite build` は WSL で実行可能ですが、`electron-builder --win` は Wine + wine32 が必要です。推奨は WSL で `npm run electron:build` 後、PowerShell で `npm run electron:installer` を実行する2段階方式です

生成されたインストーラーは `release/File Renamer Setup X.X.X.exe` に出力されます。

### メニューショートカット

| メニュー | 項目 | ショートカット |
|---------|------|--------------|
| ファイル | 終了 | Ctrl+Q |
| 編集 | 元に戻す | Ctrl+Z |
| 表示 | 開発者ツール | F12（開発版のみ） |
| ヘルプ | バージョン情報 | — |

## 技術スタック

| レイヤー   | 技術                             |
| ---------- | -------------------------------- |
| Frontend   | React 19 + TypeScript 5 + Vite 6 |
| Backend    | Express 4 + TypeScript 5 + tsx   |
| Shared     | `@app/shared` workspace package  |
| Validation | zod                              |
| Style      | CSS Modules                      |
| Test       | Vitest (186テスト)               |
| Lint       | ESLint 10 + Prettier 3           |

## 前提条件

- Node.js 22.x LTS
- 対応OS: Windows（ネイティブ）/ WSL2

## セットアップ

```bash
# リポジトリをクローン
git clone <repository-url>
cd 10_file-editor

# 依存関係のインストール
npm install

# 開発サーバー起動（フロントエンド + バックエンド同時）
npm run dev
```

ブラウザで http://localhost:5173 にアクセスしてください。

## 別のPCで使用する

### 方法1: インストーラー（一般ユーザー向け）

Node.js のインストールは不要です。

1. `release/File Renamer Setup 0.1.0.exe` を配布先のPCにコピー
2. ダブルクリックしてインストーラーを実行
3. **SmartScreen 警告が表示された場合**: 「詳細情報」→「実行」をクリック（コード署名なしのため表示されます）
4. インストール先を選択して「インストール」
5. スタートメニューまたはデスクトップから **File Renamer** を起動

> **Note**: アンインストールは Windows の「アプリと機能」から行えます。

### 方法2: 開発者向けセットアップ

#### 必要なもの

- **Node.js 22.x LTS** のインストール（https://nodejs.org/）
- **Git**（リポジトリのクローン用）

#### Windows ネイティブ環境

```powershell
# PowerShell / コマンドプロンプトで実行
git clone <repository-url>
cd 10_file-editor
npm install
npm run dev
```

- パスは `C:\Users\...` 形式でそのまま入力できます
- UNCパス（`\\server\share\folder`）にも対応しています

#### WSL2 環境

```bash
git clone <repository-url>
cd 10_file-editor
npm install
npm run dev
```

- Windowsパス（`C:\Users\...`）を入力すると自動的に `/mnt/c/Users/...` に変換されます
- UNCパスはWSL環境では非対応です

### 注意事項

- 開発者セットアップは `npm install` 時のみインターネット接続が必要です
- インストーラー版・開発者版ともにインストール完了後はオフラインで動作します
- Undoジャーナル・プリセットはPC固有のため、移行不要です

## 使い方

1. **ディレクトリ指定**: Windowsパス（`C:\Users\...`）またはWSLパス（`/mnt/c/...`）を入力して「読込」
2. **ルール設定**: 「ルール追加」から文字列置換・区切り記号・連番のルールを追加
3. **プレビュー確認**: 右側のテーブルでリアルタイムに変更結果を確認
4. **実行**: 衝突がなければ「実行」ボタンでリネーム（確認ダイアログあり）
5. **Undo**: 「元に戻す」ボタンで即座に復元可能

### キーボードショートカット

| キー         | 機能               |
| ------------ | ------------------ |
| `Ctrl+Enter` | リネーム実行       |
| `Ctrl+Z`     | Undo（元に戻す）   |
| `Escape`     | モーダルを閉じる   |

## プロジェクト構成

```
client/          # React フロントエンド (Vite, port 5173)
server/          # Express バックエンド (port 3001)
  src/engine/    #   リネームエンジン（ルール処理・衝突検出）
  src/services/  #   ビジネスロジック（preview/execute/undo/journal）
  src/routes/    #   APIルーティング
  src/utils/     #   パス変換・バリデーション
  data/          #   Undoジャーナル・プリセット保存（自動作成）
shared/          # @app/shared — 共有型定義
electron/        # Electron メインプロセス + preload
docs/            # 設計ドキュメント
```

## コマンド一覧

| コマンド          | 説明                                 |
| ----------------- | ------------------------------------ |
| `npm run dev`     | client(5173) + server(3001) 同時起動 |
| `npm run build`   | TypeScript 型チェック (`tsc -b`)     |
| `npm test`        | Vitest テスト実行 (186テスト)        |
| `npm run lint`    | ESLint 実行                          |
| `npm run format`  | Prettier フォーマット                |
| `npm run electron:dev` | Electron 開発モード起動         |
| `npm run electron:build` | Electron ビルド               |
| `npm run electron:package` | .exe インストーラー生成     |
| `npm run electron:installer` | electron-builder のみ実行（ビルド済みの場合） |

## API エンドポイント

| メソッド | パス                | 概要                             |
| -------- | ------------------- | -------------------------------- |
| GET      | `/api/health`       | ヘルスチェック                   |
| GET      | `/api/files`        | ファイル一覧取得                 |
| POST     | `/api/preview`      | プレビュー（previewToken発行）   |
| POST     | `/api/rename`       | リネーム実行（previewToken必須） |
| POST     | `/api/undo`         | Undo実行                         |
| GET      | `/api/undo/history` | Undo履歴一覧                     |
| GET      | `/api/presets`      | プリセット一覧                   |
| POST     | `/api/presets`      | プリセット保存                   |
| DELETE   | `/api/presets/:id`  | プリセット削除                   |

## 安全機構

- **previewToken方式**: プレビューを経由しないリネーム実行は不可（single-use, TTL 5分）
- **2段階リネーム + ジャーナル**: crash-safe な実行とロールバック
- **排他制御**: ディレクトリ単位のメモリmutex
- **パス検証**: 許可ディレクトリ配下のみ操作可能、システムフォルダdenylist、パストラバーサル防止
- **ファイル名検証**: 禁則文字・予約名・パストラバーサル試行を拒否
- **起動時リカバリ**: 未完了ジャーナル検出時に自動ロールバック

## ライセンス

Private

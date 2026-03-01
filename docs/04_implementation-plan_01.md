# 実装計画書（Implementation Plan）

> 関連ドキュメント: [要件定義書](./requirements.md) | [アーキテクチャ設計書](./architecture.md) | [技術スタック](./tech-stack.md)

## 概要

本ドキュメントは、ファイル名一括変更Webアプリ（File Renamer）の実装計画を定義する。
実装は5つのフェーズに分割し、各フェーズのタスクにチェックボックスを設けて進捗を管理する。

### フェーズ構成

| フェーズ | 名称                      | 概要                                                                 |
| -------- | ------------------------- | -------------------------------------------------------------------- |
| Phase 0  | プロジェクト基盤構築      | 開発環境・ディレクトリ構成・設定ファイルのセットアップ               |
| Phase 1  | MVP（最小実用プロダクト） | ファイル一覧表示 + 文字列置換 + プレビュー + リネーム実行 + 安全基盤 |
| Phase 2  | リネーム機能拡張          | 区切り記号操作 + 連番付与 + ルールチェーン + フィルタリング          |
| Phase 3  | 利便性向上                | Undo履歴UI + プリセット管理                                          |
| Phase 4  | 品質向上・仕上げ          | テスト拡充 + UI改善 + ドキュメント整備                               |

---

## Phase 0: プロジェクト基盤構築

> **目標**: 開発を開始できる環境を整え、`npm run dev` でフロント・バックエンドが同時起動する状態にする。

### 0.1 ルートプロジェクト初期化

- [x] `package.json` を作成（ワークスペース定義: `client`, `server`, `shared`、ESM: `"type": "module"`）
  - [x] **依存バージョン明示固定**: `react` / `react-dom` は `^19`, `express` は `^4`, 対応 `@types/*` も major 固定
- [x] `tsconfig.base.json` を作成（strict: true, target: ES2022, module: ESNext, composite: true, emitDeclarationOnly: true）
- [x] **ルート `tsconfig.json`** を作成（`references` で client, server, shared を集約。ビルド時に `tsc -b` で増分ビルド検証）
- [ ] `.gitignore` を作成（node_modules, dist, server/data 等）
- [x] `.prettierrc` を作成（singleQuote, semi, tabWidth: 2）
- [x] `.nvmrc` を作成（Node.js 22）
- [x] `README.md` を作成（プロジェクト概要、セットアップ手順）

### 0.2 バックエンド初期化

- [x] `server/package.json` を作成（ESM: `"type": "module"`）
- [x] `server/tsconfig.json` を作成（extends base, Node.js向け設定, **composite: true**, `references` で shared を参照）
- [x] 依存関係をインストール: `express`, `cors`, `zod`, `@types/express@^4.17.25`, `@types/cors`, `@types/node`
- [x] `server/src/index.ts` を作成（Express起動、ポート3001、CORSミドルウェア、**プラットフォーム検出**）
- [x] 統一エラーレスポンスミドルウェアを実装（`{ error, code, details }` 形式）
- [x] ヘルスチェックエンドポイント `GET /api/health` を実装（`{ status, platform, isWSL, timestamp }` を返却）
- [x] `tsx watch` でホットリロードが動作することを確認

### 0.3 フロントエンド初期化

- [x] `npm create vite@6 client -- --template react-ts` でプロジェクト生成（**Vite 6系を明示固定**）
- [x] `client/tsconfig.json` を調整（extends base 経由で **composite: true**、`references` で shared を参照、bundler解決戦略）
- [x] `client/vite.config.ts` にAPIプロキシ設定を追加（`/api` → `localhost:3001`）
- [x] 不要な初期ファイルを削除（App.css, index.css, react.svg, vite.svg, eslint.config.js）
- [x] 仮のApp.tsxを作成（「File Renamer」タイトル表示 + APIヘルスチェック呼び出し + プラットフォーム情報表示）

### 0.4 共有型定義（workspace package化）

- [x] `shared/package.json` を作成（name: `@app/shared`, `exports` で `.ts` ソース直接参照）
- [x] `shared/tsconfig.json` を作成（extends base 経由で **composite: true**, declaration: true）
- [x] `shared/types.ts` を作成
- [x] `PlatformType` 型を定義（`'win32' | 'linux'`）
- [x] `HealthResponse` 型を定義（`{ status, platform, isWSL, timestamp }`）
- [x] `FileEntry` 型を定義
- [x] `RenameRule` 型（union型: `ReplaceRule`）を定義（Phase 1では ReplaceRule のみ）
- [x] `PreviewResult`, `PreviewResponse` 型を定義
- [x] `RenameMapping`, `RenameResponse`, `RenameFailure` 型を定義
- [x] `UndoResponse`, `ErrorResponse` 型を定義
- [x] client/server 両方から `@app/shared` として import できることを確認

### 0.5 開発スクリプト統合

- [x] ルート `package.json` に `concurrently` をインストール
- [x] `npm run dev` スクリプトを定義（client + server 同時起動）
- [x] `npm run build` スクリプトを定義（`tsc -b` でプロジェクト全体の型チェック + ビルド）
- [x] `npm run dev` を実行し、ブラウザで `localhost:5173` が表示されることを確認
- [x] ブラウザから `/api/health` へのプロキシが動作することを確認

### Phase 0 完了条件

- [x] **`npm run dev` でフロントエンド（5173）とバックエンド（3001）が同時起動する**
- [x] **ブラウザに「File Renamer」タイトルが表示される**
- [x] **フロントエンドから `/api/health` を呼び出してプラットフォーム情報付きレスポンスが返る**
- [x] **`npm run build`（`tsc -b`）がエラーなく成功する**
- [x] **client/server 両方から `@app/shared` の型を import できる**
- [x] **`npm test` が起動する（Vitest 自体が動作）**

---

## Phase 1: MVP（最小実用プロダクト）

> **目標**: ディレクトリを指定 → ファイル一覧表示 → 文字列置換ルール設定 → プレビュー → リネーム実行が一通りできる状態。安全基盤（パス検証・Undoジャーナル・エラー統一）もこのフェーズで導入する。

### 1.1 バックエンド — パス安全基盤（クロスプラットフォーム対応）

- [x] `server/src/utils/pathConverter.ts` を作成
  - [x] **プラットフォーム検出**: `process.platform` による実行時判定（`HealthResponse` の `platform` / `isWSL` を再利用）
  - [x] **WSL/Linux 環境**:
    - [x] `windowsToWsl()` 関数を実装（**`[A-Za-z]:\...` 全ドライブ文字対応**: `C:\Users\...` → `/mnt/c/Users/...`、`D:\Data\...` → `/mnt/d/Data/...`）
    - [x] `C:/...` 形式（スラッシュ区切り）のWindowsパスにも対応（`[A-Za-z]:/...` 全般）
    - [x] UNCパス（`\\server\share`）は WSL 環境ではエラーを返す
  - [x] **Windows ネイティブ環境**:
    - [x] Windowsパス（`C:\...`、`C:/...`）はそのまま使用（変換不要）
    - [x] UNCパス（`\\server\share`）をネイティブサポート（Node.js fs が直接対応）
    - [x] マップドドライブ（`Z:\`）をネイティブサポート
  - [x] `normalizeInputPath()` 関数を実装（プラットフォームに応じてパスを正規化）
  - [x] 非対応形式（`\\?\` 等）は明確なエラーを返す
- [x] `server/src/utils/validation.ts` を作成
  - [x] `zod` スキーマで全エンドポイントのリクエストバリデーションを定義
  - [x] `validateFileName()` — **ファイル名の厳格バリデーション**（`/`、`\`、`..`、NUL禁止、`path.basename(name) === name` チェック、Windows禁則文字 `<>:"|?*` 禁止、末尾ドット/空白禁止）
  - [x] `validatePath()` — `fs.realpath` でパストラバーサルを防止、**resolve 後に許可ディレクトリ配下であることを再検証**
  - [x] `isProtectedDirectory()` — プラットフォームに応じたシステムフォルダ denylist
    - [x] **WSL/Linux**: `/mnt/c/Windows`, `/mnt/c/Program Files`, `/mnt/c/Program Files (x86)` 等
    - [x] **Windows ネイティブ**: `C:\Windows`, `C:\Program Files`, `C:\Program Files (x86)` 等
  - [x] `getAllowedRoots()` — プラットフォームに応じた許可ルート
    - [x] **WSL/Linux**: `/mnt/` 配下のみ
    - [x] **Windows ネイティブ**: 全ドライブ + UNCパス（システムフォルダ除外）
  - [x] シンボリックリンク方針: `fs.lstat` でリンクを検出し、リンク先を解決して許可範囲内か検証
- [x] pathConverter + validation のユニットテスト（最小セット）
  - [x] Windows → WSL パス変換（WSL 環境向け）
  - [x] WSLパスの通過（変換不要なケース）
  - [x] Windowsネイティブパスの通過（Windows 環境向け）
  - [x] 各種ドライブ文字（C:, D: 等）
  - [x] 日本語パスの処理
  - [x] 保護ディレクトリの検出（プラットフォーム別）
  - [x] パストラバーサル攻撃パターンの防止
  - [x] ファイル名バリデーション（禁則文字、`..`、Windows禁則名）
  - [x] UNCパスの扱い（WSL: エラー、Windows: 許可）

### 1.2 バックエンド — ファイル一覧API

- [x] `server/src/services/fileService.ts` を作成
  - [x] `listFiles(directoryPath)` を実装（`fs.readdir` + `withFileTypes: true`）
  - [x] ディレクトリ存在チェック（`validatePath` 経由）
  - [x] ファイルのみ取得（ディレクトリを除外）
  - [x] `FileEntry` 形式で返却（name, extension, size, modifiedAt）
- [x] `server/src/routes/files.ts` を作成
  - [x] `GET /api/files?directoryPath=...&extensions=...&pattern=...` エンドポイント実装
  - [x] directoryPath パラメータの zod バリデーション
  - [x] `extensions` / `pattern` パラメータは受け付けるが、Phase 1 では未指定時デフォルト動作（全ファイル返却）
  - [x] エラーハンドリング（ディレクトリ不存在、権限エラー、保護ディレクトリ）

### 1.3 バックエンド — リネームエンジン（文字列置換）

- [x] `server/src/engine/types.ts` を作成
  - [x] `RuleProcessor` インターフェースを定義（`apply(fileName, context): string`）
  - [x] `RenameContext` インターフェースを定義
    - [x] `originalName`, `originalBaseName`, `originalExtension` — 初期値（不変）
    - [x] `currentBaseName`, `currentExtension` — ルール適用ごとに更新される可変値
    - [x] `index`, `totalCount`
- [x] `server/src/engine/rules/replaceRule.ts` を作成
  - [x] `ReplaceProcessor` クラスを実装
  - [x] 単純文字列置換（String.replace / replaceAll）
  - [x] 拡張子を除く/含むオプション対応
- [x] `server/src/engine/pipeline.ts` を作成
  - [x] `applyRuleChain(files, rules)` 関数を実装
  - [x] RenameContext の生成
  - [x] ルールの順次適用ロジック（**各ルール適用後に `currentBaseName` / `currentExtension` を再計算**）
  - [x] **バッチ処理ルール対応**: SequenceRule 等の全件入力が必要なルールは `BatchRuleProcessor` インターフェースで分離し、パイプライン内で per-file/batch を切り替える
    - [x] `BatchRuleProcessor.applyBatch(entries: {id: number, fileName: string, context: RenameContext, fileEntry: FileEntry}[]): {id: number, fileName: string}[]`（**fileEntry に size/modifiedAt を含め、sortBy=date/size に対応**）
    - [x] **戻り値は必ず入力と同じ `id` を含めて返す**（ソート後も元ファイルとの対応関係を保証）
    - [x] パイプライン側で `id` を使って元順に再マッピングする
- [x] `server/src/engine/collision.ts` を作成
  - [x] `detectCollisions(results, allFilesInDir)` 関数を実装
  - [x] 変換後ファイル名のリネーム対象内の重複検出
  - [x] **リネーム対象外の既存ファイルとの衝突検出**（ディレクトリ全体スナップショット）
  - [x] 大文字小文字を無視した衝突チェック（NTFS は case-insensitive）
- [x] リネームエンジンのユニットテスト（最小セット）
  - [x] ReplaceProcessor: 単純置換、空文字置換、拡張子含む/除く
  - [x] applyRuleChain: 単一ルール適用、無効ルールスキップ
  - [x] detectCollisions: 重複検出、既存ファイルとの衝突

### 1.4 バックエンド — プレビューAPI

- [x] `server/src/services/renameService.ts` を作成
  - [x] `preview(directoryPath, rules, selectedFiles?)` を実装
    - [x] ファイル一覧取得 → エンジンでドライラン → 衝突検出 → 結果返却
    - [x] **サーバ側にプレビュー結果を保存**（`previewToken` → `{directoryPath, rules, selectedFiles, resultMappings}` のマッピング）
    - [x] `previewToken`（UUID）を発行しレスポンスに含める
    - [x] **TTL 設定**（5分で自動失効）、**single-use**（原子的 `take(token)` で `unused → used` に遷移、同時リクエストの二重実行を防止）
    - [x] **再試行ポリシー**: token 消費後にリネーム失敗した場合は新たにプレビューを実行して新 token を取得する（使用済み token は再利用不可）
- [x] `server/src/routes/rename.ts` を作成
  - [x] `POST /api/preview` エンドポイント実装
  - [x] リクエストボディの zod バリデーション（directoryPath, rules, **selectedFiles?: string[]**）（Phase 1 では省略可、省略時は全ファイル対象）

### 1.5 バックエンド — リネーム実行API + Undoジャーナル

- [x] `server/data/undo/` ディレクトリの自動作成処理を追加
- [x] `renameService.ts` に `execute(previewToken)` を追加
  - [x] **`previewToken` からサーバ保存済みマッピングを取得**（token のみ受付、クライアントから mappings を受け取らない → 改竄防止）
  - [x] token の TTL・single-use・directoryPath 一致を検証
  - [x] **取得した mappings の全 from/to に `validateFileName()` を適用**（パストラバーサル防止、resolve 後に directory 配下を再検証）
  - [x] **ディレクトリ単位の排他制御**: lock 取得 → 以下を1トランザクションとして実行 → unlock
    - [x] **lock キーは canonical path**（`normalizeInputPath` → `fs.realpath` → プラットフォームに応じた正規化）で同一実体に対する同時操作を確実に排他
    - [x] 実行前にディレクトリ全体を再スキャンし衝突再チェック
    - [x] **Undo ジャーナルを書き出し**（`{operationId}.json`）
      - [x] ログ内容: `{ operationId, timestamp, directoryPath, phase: 'pending', mappings: [{from, to}], tempMappings: [{from, tempName}] }`
      - [x] operationId は `crypto.randomUUID()` で生成
      - [x] **原子的書き込み**: temp file に書き込み → `fsync` → `rename` で本ファイルに置換（クラッシュ時の JSON 部分書き込み/破損を防止）
      - [x] phase 更新時も同じ原子的書き込みパターンを使用
      - [x] **パース不能ジャーナル検出時**: 対象ディレクトリを隔離フローへ遷移
    - [x] **2段階リネーム**で swap/cycle 対応:
      - [x] Step 1: 全ファイルを**固定長の一時名**（`.__tmp_{operationId}_{index}`）にリネーム → ジャーナルの phase を `'temp_done'` に更新（元名との対応はジャーナルの `tempMappings` で管理。長いファイル名でもコンポーネント長制限を超えない）
      - [x] Step 2: 一時名から最終名にリネーム → ジャーナルの phase を `'completed'` に更新
    - [x] **失敗時自動ロールバック**: いずれかの Step で失敗した場合、ジャーナルの `tempMappings` を使って実行済み分を元名に復帰（可能な範囲で補償）。ジャーナルの phase を `'rollback_done'` or `'rollback_failed'` に更新
  - [x] 成功/失敗件数のカウント
  - [x] レスポンスに `operationId` を含める
  - [x] previewToken を消費・無効化
- [x] **サーバ起動時リカバリ**: 未完了ジャーナル（phase が `'pending'` / `'temp_done'`）を検出
  - [x] **ジャーナルの全ファイル名に `validateFileName()` を再検証**（破損/改変対策。検証失敗時は隔離へ）
  - [x] **自動ロールバックを必須実行**（`tempMappings` を使って元名に復帰）
  - [x] ロールバック成功 → ジャーナルの phase を `'rollback_done'` に更新
  - [x] **ロールバック失敗 → 対象ディレクトリを隔離**（当該ディレクトリへの rename/undo リクエストを拒否し、手動復旧を促すエラーを返す）
- [x] `routes/rename.ts` に `POST /api/rename` エンドポイントを追加
  - [x] リクエストボディの zod バリデーション（**`previewToken` のみ**）

### 1.6 バックエンド — 最小 Undo 実行

- [x] `server/src/routes/undo.ts` を作成
  - [x] `POST /api/undo` エンドポイント実装（**operationId 任意: 指定時はその操作を、省略時は直前の操作を元に戻す**）
    - [x] Undoログ読み込み
    - [x] 逆変換マップ生成（to → from）
    - [x] **ジャーナルの from/to/tempName 全件に `validateFileName()` を再検証**（ジャーナル破損/改変対策）
    - [x] **ディレクトリ単位の排他制御**: lock 取得 → 以下を1トランザクション → unlock
      - [x] 現在のファイル状態との衝突チェック
      - [x] `fs.rename` で逆変換実行（2段階リネーム方式）
      - [x] ジャーナルの phase 更新
  - [x] `GET /api/undo/history` エンドポイント実装（一覧返却のみ）
- [x] Undoログのローテーション（最大50件保持、古いものから自動削除）

### 1.7 フロントエンド — ディレクトリ入力コンポーネント

- [x] `client/src/components/DirectoryInput/DirectoryInput.tsx` を作成
  - [x] テキスト入力フィールド（パス入力）
  - [x] 「読込」ボタン
  - [x] Windowsパス入力にも対応（表示用はそのまま、API送信時に変換）
- [x] `client/src/components/DirectoryInput/DirectoryInput.module.css` を作成

### 1.8 フロントエンド — API通信レイヤー

- [x] `client/src/services/api.ts` を作成
  - [x] `getFiles(directoryPath)` 関数を実装
  - [x] `preview(directoryPath, rules, selectedFiles?)` 関数を実装（レスポンスから `previewToken` を取得・保持）
  - [x] `rename(previewToken)` 関数を実装（**previewToken のみ送信、mappings はサーバ保存済みを使用**）
  - [x] `undo(operationId?)` 関数を実装（**省略時は直前の操作を元に戻す**）
  - [x] `getUndoHistory()` 関数を実装
  - [x] 共通のエラーハンドリング（レスポンスステータスチェック、`ErrorResponse` 型パース）

### 1.9 フロントエンド — ファイル一覧 & プレビューテーブル

- [x] `client/src/hooks/useFiles.ts` を作成
  - [x] ファイル一覧の取得・状態管理
  - [x] ローディング状態、エラー状態の管理
- [x] `client/src/hooks/usePreview.ts` を作成
  - [x] プレビュー結果の取得・状態管理
  - [x] ルール変更時のデバウンス付きプレビュー更新
  - [x] `previewToken` の保持
- [x] `client/src/components/FilePreviewTable/FilePreviewTable.tsx` を作成
  - [x] 2カラムテーブル（変更前 / 変更後）
  - [x] 変更があるファイルのハイライト表示
  - [x] 衝突ファイルの警告表示
  - [x] ファイル件数の表示
- [x] `client/src/components/FilePreviewTable/FilePreviewTable.module.css` を作成

### 1.10 フロントエンド — 文字列置換ルール設定

- [x] `client/src/hooks/useRenameRules.ts` を作成
  - [x] ルールリストの状態管理（追加・削除・更新）
- [x] `client/src/components/RulePanel/RulePanel.tsx` を作成
  - [x] ルールカードの一覧表示
  - [x] 「ルール追加」ボタン
- [x] `client/src/components/RulePanel/ReplaceRuleEditor.tsx` を作成
  - [x] 検索文字列入力フィールド
  - [x] 置換文字列入力フィールド
  - [x] 拡張子含む/除くオプション
- [x] `client/src/components/RulePanel/RulePanel.module.css` を作成

### 1.11 フロントエンド — リネーム実行 & 確認ダイアログ

- [x] `client/src/components/ActionBar/ActionBar.tsx` を作成
  - [x] 「実行」ボタン（衝突がある場合は無効化）
  - [x] 「元に戻す」ボタン（直前の `operationId` を保持し即座に Undo 可能）
  - [x] 変更件数の表示
- [x] `client/src/components/common/Modal.tsx` を作成
  - [x] 汎用モーダルダイアログコンポーネント
- [x] `client/src/components/common/Toast.tsx` を作成
  - [x] 成功/エラー通知コンポーネント（自動消去3秒）
- [x] 実行確認ダイアログを実装
  - [x] 変更件数の表示
  - [x] 「実行する」/「キャンセル」ボタン
- [x] リネーム実行後のファイル一覧再取得

### 1.12 フロントエンド — 全体レイアウト統合

- [x] `App.tsx` にすべてのコンポーネントを統合
  - [x] ヘッダー
  - [x] DirectoryInput
  - [x] RulePanel + FilePreviewTable の2カラムレイアウト
  - [x] ActionBar
- [x] `App.module.css` でレイアウトCSS作成
- [x] 基本的なカラーテーマとフォント設定（global CSS）

### Phase 1 完了条件

- [x] **ディレクトリパスを入力してファイル一覧が表示される**
- [x] **文字列置換ルールを設定するとプレビューがリアルタイム更新される**
- [x] **衝突がある場合に警告が表示され、実行ボタンが無効化される（対象外の既存ファイルとの衝突も検出）**
- [x] **確認ダイアログを経てリネームが実行され、結果が反映される**
- [x] **swap/cycle パターン（A→B, B→A）が正しく動作する**
- [x] **Windowsパス入力がプラットフォームに応じて正規化される（WSL: WSLパスに変換、Windows: そのまま使用）**
- [x] **UNCパスが Windows ネイティブ環境で動作する（WSL 環境ではエラーを返す）**
- [x] **システムフォルダへのアクセスがプラットフォームに応じてブロックされる**
- [x] **リネーム実行後に「元に戻す」ボタンで即座に復元できる**
- [x] **プレビューを経由せずにリネーム実行はできない（previewToken 必須）**
- [x] **pathConverter + validation + エンジンの最小テストがパスする**

---

## Phase 2: リネーム機能拡張

> **目標**: 区切り記号操作・連番付与・ルールチェーン・フィルタリングを追加し、多様なリネーム要件に対応する。

### 2.1 バックエンド — 区切り記号ルール

- [x] `shared/types.ts` に `DelimiterRule` 型を追加
  - [x] `action: 'replace' | 'remove' | 'keep'`（**要件の「保持」を含む3種**）
- [x] `server/src/engine/rules/delimiterRule.ts` を作成
  - [x] `DelimiterProcessor` クラスを実装
  - [x] 指定区切り文字でファイル名を分割
  - [x] N番目の区切りより左/右の操作（置換、削除、**保持**）
  - [x] 区切り文字が見つからない場合のフォールバック処理（ファイル名を変更せず返す）
- [x] DelimiterProcessor のユニットテスト
  - [x] 区切り文字の分割と左/右操作
  - [x] 置換・削除・保持の各 action
  - [x] 区切り文字が見つからない場合
  - [x] 複数の区切り文字がある場合のN番目指定

### 2.2 バックエンド — 連番ルール

- [x] `shared/types.ts` に `SequenceRule` 型を追加
  - [x] `sortBy: 'name' | 'date' | 'size'`（**ソート基準の明示**）
  - [x] `sortOrder: 'asc' | 'desc'`（**昇順/降順の明示**）
  - [x] `position: 'prefix' | 'suffix' | 'custom'` + `customPosition?: number`（**カスタム挿入位置の明示**）
  - [x] `template?: string`（**テンプレート構文**: `{name}_{num:3}.{ext}` 形式。未指定時は position に従うフォールバック）
- [x] `server/src/engine/rules/sequenceRule.ts` を作成
  - [x] `SequenceProcessor` クラスを実装（**`BatchRuleProcessor` インターフェースを実装** — 全件入力→整列→採番→結果返却）
  - [x] 開始番号、増分値、ゼロ埋め桁数の適用
  - [x] 挿入位置（prefix / suffix / custom）の処理
  - [x] **Sequence 適用前にファイルリストを `sortBy + sortOrder` でソートし、そのソート順で index を振る**（安定ソートキーを使用）
  - [x] **テンプレート構文パーサ**: `{name}`, `{num}`, `{num:N}`（N桁ゼロ埋め）, `{ext}` を解釈し、ファイル名を生成
  - [x] テンプレート未指定時は `position`（prefix/suffix/custom）に従ってフォールバック
- [x] SequenceProcessor のユニットテスト
  - [x] 連番の開始番号・桁数・増分
  - [x] prefix / suffix / custom の挿入位置
  - [x] sortBy + sortOrder によるソート順確認
  - [x] テンプレート構文（`{name}_{num:3}.{ext}` 等）の解釈

### 2.3 バックエンド — ルールチェーン強化

- [x] `engine/pipeline.ts` の `createProcessor` ファクトリ関数を拡張
  - [x] DelimiterRule → DelimiterProcessor のマッピング追加
  - [x] SequenceRule → SequenceProcessor のマッピング追加
- [x] 複数ルールの順次適用が正しく動作することを確認
- [x] applyRuleChain のユニットテスト追加
  - [x] 複数ルール種別の順次適用
  - [x] context の currentBaseName/currentExtension が各ルール間で正しく更新されること
  - [x] **BatchRuleProcessor の id 対応保証**: ソート後も元ファイルとの対応が壊れないことを確認

### 2.4 バックエンド — ファイルフィルタリング

- [x] `fileService.ts` の `listFiles` にフィルタ機能を実装
  - [x] 拡張子フィルタ（extensions パラメータ）
  - [x] 名前パターンフィルタ（pattern パラメータ、glob形式）
- [x] `GET /api/files` のフィルタパラメータが実際に動作することを確認

### 2.5 バックエンド — 正規表現対応

- [x] `ReplaceProcessor` に正規表現モードを追加
  - [x] `useRegex: true` の場合、`new RegExp(search, flags)` を使用
  - [x] 大文字小文字区別オプション（`caseSensitive`）対応
  - [x] 無効な正規表現のエラーハンドリング（zod でパース時に検証）
- [x] 正規表現モードのユニットテスト

### 2.6 フロントエンド — 区切り記号ルールUI

- [x] `client/src/components/RulePanel/DelimiterRuleEditor.tsx` を作成
  - [x] 区切り文字選択（プリセット: `_`, `-`, `.`, スペース + カスタム入力）
  - [x] 位置指定（N番目のドロップダウン）
  - [x] 方向選択（左側 / 右側）
  - [x] 操作種別（置換 / 削除 / **保持**）と値入力
- [x] プレビューとの連動を確認

### 2.7 フロントエンド — 連番ルールUI

- [x] `client/src/components/RulePanel/SequenceRuleEditor.tsx` を作成
  - [x] 開始番号入力（number input）
  - [x] 桁数入力（number input、デフォルト3）
  - [x] 増分値入力（number input、デフォルト1）
  - [x] 挿入位置選択（先頭 / 末尾 / **カスタム位置**）
  - [x] ソート順選択（名前順 / 日付順 / サイズ順）
  - [x] **ソート方向選択（昇順 / 降順）**
  - [x] **テンプレート入力**（`{name}_{num:3}.{ext}` 形式、任意入力）
- [x] プレビューとの連動を確認

### 2.8 フロントエンド — ルールチェーンUI強化

- [x] `RulePanel.tsx` を拡張
  - [x] ルール種別選択ドロップダウン（文字列置換 / 区切り記号 / 連番）
  - [x] 複数ルールの追加・削除
  - [x] 各ルールの有効/無効トグル
  - [x] ルールの並び替え（上下ボタン）
- [x] ルール種別に応じたエディタの動的表示（RulePanel.tsx 内にインライン実装）
  - [x] 有効/無効トグルスイッチ
  - [x] 削除ボタン
  - [x] 上下移動ボタン

### 2.9 フロントエンド — ファイルフィルタリングUI

- [x] `DirectoryInput.tsx` にフィルタ入力を追加
  - [x] 拡張子フィルタ入力フィールド（例: `.jpg, .png`）
- [x] `FilePreviewTable.tsx` に個別選択機能を追加
  - [x] 各ファイル行にチェックボックス
  - [x] 全選択/全解除ボタン
  - [x] 選択されたファイルのみをプレビュー/リネーム対象にする

### 2.10 フロントエンド — 正規表現モードUI

- [x] `ReplaceRuleEditor.tsx` にオプションを追加
  - [x] 正規表現ON/OFFトグル
  - [x] 大文字小文字区別ON/OFFトグル
  - [ ] 正規表現エラー時のインラインエラー表示

### Phase 2 完了条件

- [x] **区切り記号ルールで「N番目の区切りより左/右を変更」がプレビュー・実行できる（保持含む）**
- [x] **連番ルールで開始番号・桁数・増分・ソート方向を指定して連番が付与できる**
- [x] **複数ルールをチェーンとして追加・並び替え・有効/無効切替ができる**
- [x] **ルールチェーン内で context が正しく更新され、先行ルールの結果が後続ルールに反映される**
- [x] **拡張子フィルタとファイル個別選択で対象を絞り込める**
- [x] **正規表現モードで高度な置換パターンが使える**
- [x] **各 Processor のユニットテストがパスする**

---

## Phase 3: 利便性向上

> **目標**: Undo履歴UI・プリセット管理を追加し、安心して繰り返し使えるツールにする。
> ※ Undoジャーナル基盤・最小Undo実行は Phase 1 で実装済み。

### 3.1 フロントエンド — Undo履歴UI

- [x] Undo履歴一覧モーダルを作成
  - [x] 過去の操作一覧表示（operationId, timestamp, directory, 件数）
  - [x] 任意の過去操作を選んでUndoする機能
  - [x] Undo確認ダイアログ（操作概要を表示）

### 3.2 バックエンド — プリセット管理API

- [x] `server/data/presets/` ディレクトリの自動作成処理を追加
- [x] `server/src/routes/presets.ts` を作成
  - [x] `GET /api/presets` — プリセット一覧取得
  - [x] `POST /api/presets` — プリセット保存（JSON: `{ id, name, rules }` ）
  - [x] `DELETE /api/presets/:id` — プリセット削除
  - [x] 各エンドポイントの zod バリデーション

### 3.3 フロントエンド — プリセット管理UI

- [x] `client/src/services/api.ts` にプリセット関連API関数を追加
  - [x] `getPresets()` 関数
  - [x] `savePreset(preset)` 関数
  - [x] `deletePreset(presetId)` 関数
- [x] `ActionBar.tsx` に「プリセット」「履歴」ボタンを追加
- [x] プリセット保存ダイアログを作成
  - [x] プリセット名の入力
  - [x] 現在のルールチェーンを保存
- [x] プリセット読込ダイアログを作成
  - [x] 保存済みプリセット一覧の表示
  - [x] 選択してルールチェーンに適用
  - [x] プリセットの削除

### Phase 3 完了条件

- [x] **Undo履歴から過去の操作を選択してUndoできる**
- [x] **ルール設定をプリセットとして保存・読み込み・削除できる**
- [x] **Undoログが50件を超えると古いものが自動削除される**（Phase 1 で実装済み）

---

## Phase 4: 品質向上・仕上げ

> **目標**: テスト拡充・UI改善を行い、安定したプロダクトに仕上げる。
> ※ 各 Processor の基本テスト・pathConverter テスト・安全基盤テストは Phase 1-2 で実装済み。

### 4.1 テスト拡充 — リネームエンジン

- [x] `ReplaceProcessor` のテスト拡充
  - [x] 正規表現置換の各種パターン
  - [x] 大文字小文字区別あり/なし
  - [x] 特殊文字を含む検索/置換文字列
- [x] `DelimiterProcessor` のテスト拡充
  - [x] 複雑な区切りパターン
  - [x] エッジケース（空文字列、区切り文字のみ等）
- [x] `SequenceProcessor` のテスト拡充
  - [x] テンプレート構文のパース
  - [x] 大量ファイルでのソート＋連番
- [x] `applyRuleChain` のテスト拡充
  - [x] 3ルール以上のチェーン
  - [x] context 更新の連鎖確認
- [x] `detectCollisions` のテスト拡充
  - [x] 大文字小文字の衝突パターン
  - [x] 変更なしファイルとの衝突

### 4.2 テスト拡充 — 統合テスト

- [x] API 統合テスト（preview → rename → undo のフロー）
- [x] 2段階リネームの swap/cycle テスト
- [x] previewToken 検証テスト
- [x] 排他制御テスト（同時リクエスト）
- [x] 起動時リカバリテスト（未完了ジャーナル検出→ロールバック）
- [x] ファイル名バリデーションテスト（禁則文字、パストラバーサル試行）

### 4.3 UI改善

- [x] レスポンシブレイアウトの調整（最小幅対応）
- [x] キーボードショートカットの追加
  - [x] `Ctrl+Z` : Undo
  - [x] `Ctrl+Enter` : リネーム実行
  - [x] `Escape` : モーダルを閉じる
- [ ] プレビューテーブルの変更箇所をdiff風にハイライト（スコープ外）
- [ ] ダークモード対応（スコープ外）

### 4.4 ドキュメント・コード品質

- [x] ESLint の設定・実行・警告修正
- [x] Prettier の設定・実行・フォーマット統一
- [x] README.md の完成
  - [x] プロジェクト概要
  - [x] セットアップ手順
  - [x] 使い方ガイド
  - [x] 技術スタック一覧

### Phase 4 完了条件

- [x] **リネームエンジンの全ルールのユニットテストがパスする**（186テスト全パス）
- [x] **API統合テストがパスする**
- [x] **エラー発生時にユーザーフレンドリーな通知が表示される**
- [x] **README.md にセットアップ手順と使い方が記載されている**

---

## 進捗サマリー

| フェーズ                      | 状態      | 進捗 |
| ----------------------------- | --------- | ---- |
| Phase 0: プロジェクト基盤構築 | ✅ 完了   | 100% |
| Phase 1: MVP + 安全基盤       | ✅ 完了   | 100% |
| Phase 2: リネーム機能拡張     | ✅ 完了   | 100% |
| Phase 3: 利便性向上           | ✅ 完了   | 100% |
| Phase 4: 品質向上・仕上げ     | ✅ 完了   | 100% |

---

## 依存関係

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
 基盤構築     MVP+安全     機能拡張     利便性       品質向上

※ Phase 1 に安全基盤（パス検証・Undoジャーナル・エラー統一・最小テスト）を統合
※ Phase 2 と Phase 3 は部分的に並行可能
  （Phase 3 のプリセットは Phase 2 のルールチェーンに依存）
```

---

## レビュー履歴

### 第1回 Codex MCP レビュー（2026-02-22）

**P0（重大）3件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | `npm create vite@latest` が Vite 7 をインストールする可能性 | `vite@6` で明示固定 |
| 2 | パス安全ガードが Phase 4 まで後ろ倒し | Phase 1.1 に昇格 |
| 3 | API入力のランタイム検証（zod）が欠落 | Phase 0.2 で依存追加、Phase 1 全エンドポイントで適用 |

**P1（高）11件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | npm workspaces に shared が未含 | Phase 0.1 で `shared` を workspace に追加 |
| 2 | TypeScript project references 未設計 | Phase 0.2-0.4 で `references` と解決戦略を明示 |
| 3 | DelimiterRule.action に「保持」がない | `'keep'` を型・Processor・UI に追加 |
| 4 | SequenceRule のカスタム位置・ソート順が不十分 | `customPosition`, `sortOrder` を追加 |
| 5 | RenameContext がルール適用ごとに更新されない | `currentBaseName/currentExtension` を分離し毎回再計算 |
| 6 | 連番の並び順データフローが未定義 | Sequence 適用前にソートし index 振る仕様を明記 |
| 7 | 衝突検出がプレビュー対象内のみ | ディレクトリ全体スナップショットで既存ファイルとも衝突検出 |
| 8 | fs.rename 順次実行で swap/cycle が壊れる | 一時名退避の2段階リネームに変更 |
| 9 | Dry-run 必須をAPIで強制していない | previewToken 発行→rename で必須化 |
| 10 | Undo が Phase 3 で部分失敗要件と順序矛盾 | Undo ジャーナル + 最小 Undo 実行を Phase 1 に前倒し |
| 11 | 同時アクセス制御が未計画 | ディレクトリ単位 mutex を Phase 1 に追加 |

**P2（中）5件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | /api/files のフィルタ引数が Phase 間で不一致 | Phase 1 でクエリ引数を受け付け、未指定時デフォルト動作 |
| 2 | WSLパス変換が単純すぎる | C:/ 形式対応、非対応形式の明確なエラー返却 |
| 3 | 衝突判定の常時 lowercase が環境依存 | NTFS (case-insensitive) を明記、WSL/mnt 前提 |
| 4 | エラーハンドリング基盤が Phase 4 と遅い | Phase 0.2 で統一エラーミドルウェア、Phase 1 で Toast |
| 5 | テスト開始が Phase 4 に集中 | Phase 1-2 で各 Processor の最小テストを追加 |

### 第5回 Codex MCP レビュー（2026-02-22）

**P0（重大）0件**

**P1（高）1件 → 修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | client/server の tsconfig に composite: true が未記載 | 両方に composite: true を明記 |

**P2（中）2件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | クライアント undo(operationId) が必須に読める | undo(operationId?) に修正 |
| 2 | 正規表現対応がフェーズ概要で Phase 3、実装は Phase 2 | Phase 3 概要から削除、Phase 2 に統一 |

### 第4回 Codex MCP レビュー（2026-02-22）

**P0（重大）0件**

**P1（高）4件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | tsc -b ビルドモードの実行計画がない | Phase 0 にルート tsconfig.json（references集約）+ `tsc -b` ビルドスクリプト追加 |
| 2 | BatchRuleProcessor 入力に modifiedAt/size がなく sortBy=date/size 不能 | batch 入力に fileEntry（FileEntry型）を追加 |
| 3 | Undo/リカバリ時に validateFileName が未適用 | Undo/Recovery でも全ファイル名検証を必須化 |
| 4 | ジャーナルの原子的書き込み手順が未定義 | temp file + fsync + rename パターン、破損時隔離フロー |

**P2（中）1件 → 修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | Undo API の operationId 契約が不一致 | Phase 1 で operationId 任意（省略時 latest）として明文化 |

### 第3回 Codex MCP レビュー（2026-02-22）

**P0（重大）1件 → 修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | BatchRuleProcessor の戻り値が入力ファイル対応関係を保証しない | id 付き入出力契約を明文化、パイプラインで元順に再マッピング |

**P1（高）3件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | previewToken の single-use が原子的に保証されない | `take(token)` で原子的遷移、再試行は新 token 取得 |
| 2 | ディレクトリ mutex のキー正規化要件不足 | canonical path（normalizeInputPath→fs.realpath→正規化）をキーに |
| 3 | 起動時リカバリの分岐が曖昧 | 自動ロールバック必須、失敗時は対象ディレクトリ隔離 |

**P2（中）4件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | TypeScript references に composite: true が未記載 | shared tsconfig に composite: true を明記 |
| 2 | SequenceRule のテンプレート機能が実装タスクにない | Phase 2 に template 型/パーサ/テスト/UI を追加 |
| 3 | 一時ファイル名が長いファイル名で破綻 | 固定長一時名 `.__tmp_<opId>_<idx>` に変更 |
| 4 | selectedFiles が API 契約で不一致 | Phase 1 で preview の zod/client に selectedFiles? を含める |

### 第2回 Codex MCP レビュー（2026-02-22）

**P0（重大）2件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | previewToken が実行内容に厳密バインドされていない | サーバ側にプレビュー結果を保存、rename は previewToken のみ受付（TTL・single-use） |
| 2 | mappings の from/to にパストラバーサル余地 | `validateFileName()` で単一ファイル名のみ許可（禁則文字・`..`・Windows禁則名禁止）、resolve 後に再検証 |

**P1（高）4件 → 全件修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | 2段階リネーム失敗時の復旧が未定義 | ジャーナルに phase/tempMappings 保存、失敗時自動ロールバック、起動時リカバリ |
| 2 | SequenceRule が per-file パイプラインと整合しない | BatchRuleProcessor インターフェースで分離、型に sortBy を明示 |
| 3 | 排他制御の臨界区間が不明確 | rename/undo ともに lock→検証→実行→unlock を1トランザクション化 |
| 4 | React 19 / Express 4 のバージョン明示固定が不足 | package.json で major バージョン固定を Phase 0.1 に明記 |

**P2（中）1件 → 修正済み**
| # | 問題 | 対応 |
|---|------|------|
| 1 | WSLパス変換が C ドライブ偏重の記述 | `[A-Za-z]:\` 全ドライブ文字対応を明記 |

---

## 備考

- 各フェーズ完了時に動作確認を行い、チェックボックスを更新すること
- 実装中に設計変更が必要な場合は、対応するドキュメント（requirements.md, architecture.md, tech-stack.md）も合わせて更新すること
- Phase 2 以降のタスクは、実装過程で詳細化・分割する可能性がある

---

## Phase 0 実装時の設計変更記録（2026-02-22）

| 項目                      | 元の設計            | 変更後                                 | 理由                                                                     |
| ------------------------- | ------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| Node.js                   | 20.x LTS            | **22.x LTS**                           | インストール済み v22.19.0、現行 LTS                                      |
| モジュール方式            | CommonJS（server）  | **ESM 全パッケージ**                   | tsx/Vite は ESM ネイティブ、Node.js 22 の ESM サポート成熟               |
| `noEmit`                  | `noEmit: true`      | **`emitDeclarationOnly: true`**        | `composite: true` と `noEmit: true` は TypeScript で非互換               |
| shared exports            | `exports` + `types` | **`.ts` ソース直接参照**               | tsx / Vite が TS を直接 import 可能、ビルドステップ不要                  |
| `@types/express`          | 未指定              | **`^4.17.25`**                         | Express 4.x 用。v5 は Express 5 専用で非互換                             |
| プラットフォーム          | WSL2 専用           | **クロスプラットフォーム**             | Windows ネイティブ + UNC パス（Win のみ）対応を追加                      |
| .nvmrc                    | `20`                | **`22`**                               | Node.js 22 LTS に合わせて変更                                            |
| `.gitignore`              | Phase 0 で作成      | **未作成（Phase 0 完了後に作成予定）** | git init 前のため後回し                                                  |
| client tsconfig.node.json | references に含む   | **references から除外**                | Vite 型の hoisting 衝突を回避（vite.config.ts は Vite ランタイムで処理） |

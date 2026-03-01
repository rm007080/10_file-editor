# 引き継ぎプロンプト（Handoff Prompt）

> このドキュメントは、新しい Claude Code セッションがプロジェクトの現状を即座に把握し、実装を継続できるようにするための詳細な引き継ぎ資料です。
> **最終更新: 2026-03-01（全 Phase 0〜4 完了、186テスト全パス、Electron化を次に実施予定）**

---

## 1. プロジェクト概要

**File Renamer** — Windowsフォルダ内のファイル名を一括変更するローカルWebアプリケーション。完全ローカル完結（外部通信なし）。

| 項目             | 内容                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| プロジェクトパス | `/mnt/c/Users/littl/app-dev/10_file-editor`                                |
| 実行環境         | **クロスプラットフォーム**（WSL2 / Windows ネイティブ / UNCパス(Win限定)） |
| ランタイム       | Node.js **22.x LTS**（v22.19.0 インストール済み）                          |
| モジュール方式   | **ESM 全パッケージ**（`"type": "module"`）                                 |
| フロントエンド   | React 19 + TypeScript 5 + Vite 6 (port 5173)                               |
| バックエンド     | Express 4 + TypeScript 5 + tsx (port 3001)                                 |
| 共有型定義       | `shared/types.ts`（`@app/shared` workspace package、`.ts` ソース直接参照） |
| バリデーション   | zod（全エンドポイントのリクエスト検証）                                    |
| 状態管理         | React useState/useReducer のみ（外部ライブラリなし）                       |
| スタイリング     | CSS Modules + CSS custom properties（`:root` 変数）                        |
| テスト           | Vitest（**186テスト全パス、13テストファイル**）                            |
| リンター         | ESLint 10（flat config）+ Prettier 3                                       |

---

## 2. 現在の進捗状況

### Webアプリ版: 全フェーズ完了

| フェーズ                          | 状態    |
| --------------------------------- | ------- |
| Phase 0: プロジェクト基盤構築     | ✅ 完了 |
| Phase 1: MVP + 安全基盤           | ✅ 完了 |
| Phase 2: リネーム機能拡張         | ✅ 完了 |
| Phase 3: 利便性向上               | ✅ 完了 |
| Phase 4: 品質向上・仕上げ         | ✅ 完了 |

### テスト・ビルド状況

```
npm run build  → 型チェックOK（エラーなし）
npm test       → 186テスト全パス（13ファイル）
npx eslint .   → 0 エラー
```

| テストファイル           | テスト数 | 内容                                                       |
| ------------------------ | -------- | ---------------------------------------------------------- |
| `pathConverter.test.ts`  | 25       | WSL/Windows パス変換、normalizeInputPath                   |
| `validation.test.ts`     | 18       | validateFileName、isProtectedDirectory                     |
| `replaceRule.test.ts`    | 21       | ReplaceProcessor（正規表現・大小区別・特殊文字含む）       |
| `delimiterRule.test.ts`  | 20       | DelimiterProcessor（左右操作、replace/remove/keep + edge） |
| `sequenceRule.test.ts`   | 17       | SequenceProcessor（sortBy/sortOrder、テンプレート、大量）  |
| `pipeline.test.ts`       | 16       | applyRuleChain（3ルールチェーン、batch id保証、context連鎖）|
| `collision.test.ts`      | 10       | detectCollisions（case-insensitive、変更なし衝突、cycle）  |
| `renameService.test.ts`  | 16       | preview + takePreviewToken + execute                       |
| `journalService.test.ts` | 14       | write/read, phase更新, rotation, quarantine                |
| `mutex.test.ts`          | 5        | 直列化、並行、case-insensitive                             |
| `undo.test.ts`           | 8        | Undo実行、operationId指定、衝突検出                        |
| `integration.test.ts`    | 11       | preview→rename→undo完全フロー、swap、排他制御、token検証   |
| `recovery.test.ts`       | 5        | 起動時リカバリ（pending/temp_done復旧、隔離、スキップ）    |

---

## 3. 次のアクション: Electron デスクトップアプリ化

### ユーザーの意思決定

- ユーザーは Electron によるデスクトップアプリ化を **決定済み**
- 方式: **Express同梱パターン**（メインプロセスでExpressを起動、BrowserWindowでReact UIを表示）
- server/, client/, shared/ のコードはほぼ無変更のまま Electron ラッパーを追加する

### 推奨アーキテクチャ

```
Electronメインプロセス (electron/main.ts)
  ├─ Express server (port 3001) ← 既存 server/src/index.ts をそのまま利用
  └─ BrowserWindow → React UI (client/ の Vite ビルド済み静的ファイル)
```

### 調査済みの技術情報

| 項目 | 内容 |
|------|------|
| Electron最新安定版 | v40.6.1（2026-02-25リリース） |
| 内蔵Node.js | v24.13.1 |
| ESM対応 | Electron 28+ でネイティブESMサポート済み。`"type": "module"` 対応 |
| fs/promises | メインプロセスで完全利用可能（問題なし） |
| プリロードスクリプト | ESMの場合 `.mjs` 拡張子が必須 |
| パッケージング | electron-forge（公式推奨）+ `@electron-forge/plugin-vite` で既存Vite設定流用可能 |
| インストーラー | NSIS (.exe) / Squirrel.Windows (自動更新対応) / WiX (.msi) |
| 自動更新 | electron-updater（GitHub Releases等） |
| バイナリサイズ | ~200MB（Chromium内蔵のため） |

### 実装時の主な作業

| カテゴリ | 変更量 | 内容 |
|---------|--------|------|
| 新規作成 | 小 | `electron/main.ts` — Expressサーバー起動 + BrowserWindow作成 |
| 新規作成 | 小 | `electron/preload.ts` — 最小限（IPC不使用なら空に近い） |
| 設定変更 | 小 | `package.json` に electron, electron-forge 依存追加 + ビルドスクリプト |
| 設定変更 | 小 | `client/vite.config.ts` の `base: './'` 調整（相対パスで静的ファイル読み込み） |
| server/ | なし | 既存コードそのまま流用 |
| client/ | なし〜極小 | API通信は localhost:3001 のまま変更不要 |
| shared/ | なし | 変更不要 |

### 開発体験への影響

- **Webアプリとしても引き続き動作する**（`npm run dev` でブラウザでも確認可能）
- コード修正は今と同じファイルを同じように編集する
- テストも `npm test` でそのまま実行
- Electron固有コードは `electron/main.ts` のみ（数十行）

### 別PCでの使い方

- **開発者**: `git clone` → `npm install` → `npm run dev`（今と同じ）
- **エンドユーザー**: `.exe` インストーラーを渡すだけ（Node.js不要、Git不要）

### 参考リンク

- [Electron ESM対応ドキュメント](https://www.electronjs.org/docs/latest/tutorial/esm)
- [electron-forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [electron-vite（Vite+Electron統合ツール）](https://electron-vite.org/)
- [electron-vite-react ボイラープレート](https://github.com/electron-vite/electron-vite-react)

### 他の選択肢（検討済み、不採用）

| 選択肢 | 不採用理由 |
|--------|-----------|
| Tauri v2 (sidecar) | 軽量だがRust toolchainが必要、pkg ESM変換リスク |
| Tauri v2 (Rust再実装) | server/全面書き直しで変更量大 |
| Neutralinojs | エコシステムが小さい、WSL2対応未検証 |
| PWA | fs操作の制約で不向き |
| pkg/Node.js SEA | ESM未対応/部分対応で不確実 |

---

## 4. 現在のファイル構成

```
/mnt/c/Users/littl/app-dev/10_file-editor/
├── package.json               # ルート workspaces (shared, server, client), ESM, scripts
├── package-lock.json
├── tsconfig.json              # solution-style (references: shared, server, client)
├── tsconfig.base.json         # 共通設定 (strict, ES2022, composite, emitDeclarationOnly)
├── eslint.config.mjs          # ESLint 10 flat config (@eslint/js + typescript-eslint)
├── .prettierrc                # singleQuote, semi, tabWidth: 2
├── .nvmrc                     # 22
├── .gitignore
├── CLAUDE.md
├── README.md                  # 完成版（概要/セットアップ/別PC使用法/使い方/構成/API/安全機構）
│
├── shared/                    # @app/shared workspace package
│   ├── package.json           # exports: ./types.ts (TS ソース直接参照)
│   ├── tsconfig.json
│   └── types.ts               # ReplaceRule, DelimiterRule, SequenceRule, RenameRule (union),
│                              # FileEntry, PreviewResult, PreviewResponse, RenameResponse,
│                              # UndoResponse, UndoHistoryEntry, ErrorResponse, Preset
│
├── server/
│   ├── package.json           # express^4, cors, zod, @types/express^4.17.25
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           # Express起動, /api/health, ルーター統合, エラーミドルウェア, 起動時リカバリ
│       ├── routes/
│       │   ├── files.ts       # GET /api/files（extensions/pattern フィルタ対応）
│       │   ├── rename.ts      # POST /api/preview + POST /api/rename
│       │   ├── undo.ts        # POST /api/undo + GET /api/undo/history
│       │   ├── presets.ts     # GET/POST/DELETE /api/presets
│       │   └── __tests__/undo.test.ts
│       ├── services/
│       │   ├── fileService.ts    # listFiles（extensions/pattern フィルタ対応）
│       │   ├── renameService.ts  # preview + takePreviewToken + execute
│       │   ├── journalService.ts # Undoジャーナル I/O — 原子的書き込み、ローテーション、隔離
│       │   ├── presetService.ts  # listPresets, savePreset, deletePreset（原子的書き込み）
│       │   └── __tests__/
│       │       ├── renameService.test.ts   # 16テスト
│       │       ├── journalService.test.ts  # 14テスト
│       │       ├── integration.test.ts     # 11テスト
│       │       └── recovery.test.ts        # 5テスト
│       ├── engine/
│       │   ├── types.ts       # RuleProcessor, BatchRuleProcessor, BatchEntry/BatchResult, RenameContext
│       │   ├── pipeline.ts    # applyRuleChain（per-file/batch自動切替）
│       │   ├── collision.ts   # detectCollisions（NTFS case-insensitive対応）
│       │   ├── rules/
│       │   │   ├── replaceRule.ts    # ReplaceProcessor（useRegex, caseSensitive対応）
│       │   │   ├── delimiterRule.ts  # DelimiterProcessor（replace/remove/keep、N番目左右）
│       │   │   └── sequenceRule.ts   # SequenceProcessor (BatchRuleProcessor、sortBy/sortOrder/template)
│       │   └── __tests__/
│       │       ├── replaceRule.test.ts   # 21テスト
│       │       ├── delimiterRule.test.ts # 20テスト
│       │       ├── sequenceRule.test.ts  # 17テスト
│       │       ├── pipeline.test.ts     # 16テスト
│       │       └── collision.test.ts    # 10テスト
│       └── utils/
│           ├── pathConverter.ts  # detectPlatform, windowsToWsl, normalizeInputPath
│           ├── validation.ts    # validateFileName, validatePath, isProtectedDirectory, zodスキーマ
│           ├── mutex.ts         # acquireDirectoryLock()
│           └── __tests__/
│               ├── pathConverter.test.ts  # 25テスト
│               ├── validation.test.ts    # 18テスト
│               └── mutex.test.ts         # 5テスト
│
├── client/
│   ├── package.json           # react^19, @app/shared, vite^6
│   ├── tsconfig.json          # references: tsconfig.app.json のみ
│   ├── tsconfig.app.json
│   ├── vite.config.ts         # /api → localhost:3001 プロキシ
│   ├── index.html             # lang="ja"
│   └── src/
│       ├── main.tsx           # StrictMode 有効
│       ├── index.css          # CSS custom properties (:root 変数定義)
│       ├── App.tsx            # 全コンポーネント統合、pendingToken方式、キーボードショートカット
│       ├── App.module.css     # 2カラムレイアウト + @media (max-width: 800px) レスポンシブ
│       ├── vite-env.d.ts
│       ├── services/
│       │   └── api.ts         # getFiles, preview(+AbortSignal), rename, undo, getUndoHistory,
│       │                      # getPresets, savePreset, deletePreset
│       ├── hooks/
│       │   ├── useFiles.ts    # loadFiles(path, extensions?)
│       │   ├── usePreview.ts  # reqIdRef + AbortController + 300msデバウンス + JSON.stringify安定キー
│       │   └── useRenameRules.ts  # addRule, removeRule, updateRule, moveRule, loadRules
│       └── components/
│           ├── DirectoryInput/
│           │   ├── DirectoryInput.tsx     # パス入力 + 拡張子フィルタ入力 + 読込ボタン
│           │   └── DirectoryInput.module.css
│           ├── FilePreviewTable/
│           │   ├── FilePreviewTable.tsx   # 2カラムテーブル + チェックボックス（全選択/全解除）
│           │   └── FilePreviewTable.module.css
│           ├── RulePanel/
│           │   ├── RulePanel.tsx          # ルール種別ドロップダウン + 追加ボタン + ↑↓移動
│           │   ├── ReplaceRuleEditor.tsx  # 検索/置換 + 正規表現ON/OFF + 大小区別 + 拡張子含む
│           │   ├── DelimiterRuleEditor.tsx # 区切り文字プリセット/カスタム + N番目 + 左右
│           │   ├── SequenceRuleEditor.tsx # 開始/桁数/増分 + prefix/suffix/custom + sortBy/sortOrder + template
│           │   └── RulePanel.module.css
│           ├── ActionBar/
│           │   ├── ActionBar.tsx          # 「プリセット」「履歴」ボタン + ショートカットヒント
│           │   └── ActionBar.module.css   # レスポンシブ対応
│           ├── UndoHistoryModal/
│           │   ├── UndoHistoryModal.tsx   # 過去操作一覧テーブル、phase=completed のみUndoボタン有効
│           │   └── UndoHistoryModal.module.css
│           ├── PresetModal/
│           │   ├── PresetModal.tsx        # 「読込」「保存」タブ切替、プリセット一覧/保存/削除
│           │   └── PresetModal.module.css
│           └── common/
│               ├── Modal.tsx
│               ├── Modal.module.css
│               ├── Toast.tsx
│               └── Toast.module.css
│
└── docs/
    ├── 01_requirements_01.md
    ├── 02_architecture_01.md
    ├── 03_tech-stack_01.md
    ├── 04_implementation-plan_01.md  # タスク一覧・進捗管理（全チェックボックス [x]）
    └── 05_handoff-prompt.md          # 本ファイル
```

---

## 5. バックエンド API 一覧（全て実装済み）

| メソッド | パス                                                      | 概要                                 |
| -------- | --------------------------------------------------------- | ------------------------------------ |
| GET      | `/api/health`                                             | ヘルスチェック（platform, isWSL）    |
| GET      | `/api/files?directoryPath=...&extensions=...&pattern=...` | ファイル一覧取得（フィルタ対応）     |
| POST     | `/api/preview`                                            | ドライラン → previewToken発行        |
| POST     | `/api/rename`                                             | リネーム実行（previewTokenのみ）     |
| POST     | `/api/undo`                                               | Undo実行（operationId任意）          |
| GET      | `/api/undo/history`                                       | Undo履歴一覧                         |
| GET      | `/api/presets`                                            | プリセット一覧取得                   |
| POST     | `/api/presets`                                            | プリセット保存（name, rules, id?）   |
| DELETE   | `/api/presets/:id`                                        | プリセット削除                       |

---

## 6. 設計決定サマリー（全て実装済み）

| 設計                   | 内容                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **previewToken方式**   | `POST /api/preview` → サーバ保存 → UUID発行 → `POST /api/rename` は token のみ受付。TTL 5分、single-use |
| **2段階リネーム**      | original → `.__tmp_{opId}_{idx}` → final。phase: pending → temp_done → completed                        |
| **ジャーナル**         | 原子的書き込み（temp → fsync → rename）。最大50件ローテーション                                         |
| **排他制御**           | ディレクトリ単位 Promise-chain mutex。lock キー: `canonicalPath.toLowerCase()`                          |
| **Undo**               | ジャーナル逆変換（to→from）。Undo自体もジャーナル記録。2段階リネーム使用                                |
| **起動時リカバリ**     | 未完了ジャーナル → 自動ロールバック → 失敗時ディレクトリ隔離                                            |
| **パス検証**           | `validatePath()` = normalizeInputPath → fs.realpath → 許可ルート・保護ディレクトリ検証                  |
| **ファイル名検証**     | `validateFileName()` = 禁則文字・traversal・予約名・末尾ドット/空白チェック                             |
| **衝突検出**           | 対象内重複 + 対象外既存ファイル。全て toLowerCase() 比較（NTFS対応）                                    |
| **エンジン2系統**      | per-file `RuleProcessor` (Replace, Delimiter) + batch `BatchRuleProcessor` (Sequence)                   |
| **パイプライン**       | `isBatchRule()` で自動判定、各ルール適用後に currentBaseName/currentExtension を再計算                  |
| **CSS テーマ**         | `index.css` の `:root` CSS custom properties。全CSS Moduleファイルで `var(--color-*)` 参照              |
| **zod バリデーション** | `z.discriminatedUnion('type', [replaceRuleSchema, delimiterRuleSchema, sequenceRuleSchema])`            |
| **プリセット保存**     | `server/data/presets/` に `{id}.json` 形式。原子的書き込み（journalServiceと同パターン）                |
| **pendingToken方式**   | 確認ダイアログ表示時にトークンをstateにキャプチャ。StrictMode/再レンダーの影響を受けない                |

---

## 7. 解決済みバグ

### INVALID_PREVIEW_TOKEN ✅

`previewTokenRef` (useRef) → `pendingToken` (useState) 方式に変更。確認ダイアログ表示時にキャプチャし、StrictMode/再レンダーの影響を受けないようにした。

### usePreview 無限ループ ✅

`reqIdRef` パターン + AbortController + JSON.stringify安定キーで解決。

---

## 8. フロントエンド設計ポイント

- **ApiError クラス**: `erasableSyntaxOnly` 制約のため、パラメータプロパティ不使用
- **useRef の初期値**: React 19 の型変更により `useRef<T>(undefined)` で対応
- **プレビューのデバウンス**: `useEffect` + `setTimeout(300ms)` + cleanup
- **空ルールのスキップ**: enabled ルールなし・全 replace の search が空の場合はAPI呼び出しスキップ
- **selectedFiles**: `null` = 全選択（初期状態）、`string[]` = 明示選択
- **キーボードショートカット**: `useRef` で最新ハンドラを参照し stale closure を回避
- **レスポンシブ**: `@media (max-width: 800px)` で1カラムに切り替え

---

## 9. 必読ドキュメント

実装継続前に以下を必ず読み込むこと:

```
@CLAUDE.md
@docs/04_implementation-plan_01.md
```

必要に応じて参照:

```
@docs/01_requirements_01.md    # 要件定義（機能仕様の詳細）
@docs/02_architecture_01.md    # API設計・データフロー
@docs/03_tech-stack_01.md      # 技術スタック（ディレクトリ構成の詳細）
```

---

## 10. 確認コマンド

```bash
npm run build      # 型チェック（tsc -b）
npm test           # テスト（186件全パス）
npx eslint .       # リント（0エラー）
npm run dev        # ブラウザ localhost:5173 で動作確認
```

# アーキテクチャ設計書（Architecture）

> 関連ドキュメント: [要件定義書](./requirements.md) | [技術スタック](./tech-stack.md)

## 1. 全体構成

### 1.1 システム構成図

```
┌──────────────────┐     HTTP (REST)     ┌──────────────────┐     Node.js fs     ┌──────────────────┐
│                  │ ◄────────────────► │                  │ ◄──────────────► │                  │
│   ブラウザ        │                    │   Express Server  │                   │ ファイルシステム   │
│   React SPA      │   JSON API         │   REST API       │   fs/promises     │ C:\Users\...     │
│                  │                    │                  │                   │ /mnt/c/... (WSL) │
│   localhost:5173  │                    │   localhost:3001  │                   │ \\server\share   │
└──────────────────┘                    └──────────────────┘                   └──────────────────┘
     フロントエンド                           バックエンド                          ファイルシステム
```

**プラットフォーム対応**: サーバは `process.platform` で実行環境を検出し、パス処理を自動分岐する。

- **Windowsネイティブ** (`win32`): `C:\Users\...` を直接操作。UNCパス (`\\server\share`) もサポート。
- **WSL** (`linux` + WSL検出): Windowsパスを `/mnt/c/...` に変換して操作。

### 1.2 技術概要

| レイヤー         | 技術                      | 役割                                                 |
| ---------------- | ------------------------- | ---------------------------------------------------- |
| フロントエンド   | React + TypeScript + Vite | UI表示、ユーザー操作、API通信                        |
| バックエンド     | Express + TypeScript      | REST API提供、リネームエンジン、ファイル操作         |
| ファイルシステム | Node.js fs/promises       | Windowsネイティブ or WSLマウント経由でファイルを操作 |
| 通信             | REST JSON API             | フロント↔バック間のデータ交換                        |

---

## 2. ディレクトリ構成

```
10_file-editor/
├── client/                  # フロントエンド（Vite + React）
│   ├── public/
│   ├── src/
│   │   ├── components/      # UIコンポーネント
│   │   ├── hooks/           # カスタムフック
│   │   ├── services/        # API通信
│   │   ├── types/           # フロントエンド固有の型定義
│   │   ├── utils/           # ユーティリティ関数
│   │   ├── App.tsx          # ルートコンポーネント
│   │   ├── App.module.css
│   │   └── main.tsx         # エントリーポイント
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                  # バックエンド（Express）
│   ├── src/
│   │   ├── routes/          # APIルーティング
│   │   ├── services/        # ビジネスロジック（previewToken管理、ジャーナル、排他制御）
│   │   ├── engine/          # リネームエンジン（RuleProcessor / BatchRuleProcessor）
│   │   ├── utils/           # ユーティリティ（パス変換、バリデーション）
│   │   ├── types/           # バックエンド固有の型定義
│   │   └── index.ts         # エントリーポイント（統一エラーミドルウェア、起動時リカバリ）
│   ├── data/
│   │   ├── undo/            # Undoジャーナル保存ディレクトリ
│   │   └── presets/         # プリセット保存ディレクトリ
│   ├── package.json
│   └── tsconfig.json        # composite: true
│
├── shared/                  # フロント/バック共有型定義（@app/shared workspace package）
│   ├── package.json         # name: @app/shared, exports, types
│   ├── tsconfig.json        # composite: true
│   └── types.ts
│
├── electron/                # Electron メインプロセス + preload
│   ├── main.ts              # アプリ起動 + Express 起動 + BrowserWindow
│   ├── preload.ts           # contextBridge（ポート伝達、フォルダ選択）
│   └── tsconfig.json        # TypeScript 設定
│
├── docs/                    # ドキュメント
│   ├── 01_requirements_01.md
│   ├── 02_architecture_01.md
│   ├── 03_tech-stack_01.md
│   ├── 04_implementation-plan_01.md
│   ├── 05_handoff-prompt.md
│   └── 06_electron-plan.md
│
├── resources/               # アプリリソース（アイコン等）
│   ├── icon.ico
│   └── icon.png
│
├── electron.vite.config.ts  # electron-vite 設定（main/preload/renderer）
├── package.json             # ルートワークスペース + Electron ビルド設定
├── tsconfig.json            # TypeScript references 集約（tsc -b 用）
├── tsconfig.base.json       # TypeScript共通設定（strict: true, target: ES2022）
├── .prettierrc              # Prettier設定
├── .nvmrc                   # Node.js バージョン固定（22）
├── .gitignore
├── CLAUDE.md
└── README.md
```

### ディレクトリ設計方針

| ディレクトリ | 責務                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| `client/`    | UI表示に関するすべてのコード。バックエンドへの依存なし                                 |
| `server/`    | API提供、ファイル操作に関するすべてのコード。フロントエンドへの依存なし                |
| `shared/`    | フロント/バックで共有する型定義（`@app/shared` workspace package）。ロジックは含めない |
| `electron/`  | Electron メインプロセス。Express 起動、BrowserWindow 管理、IPC。server/ を `@app/server/app` 経由で import |
| `docs/`      | プロジェクトドキュメント                                                               |

---

## 3. フロントエンド設計

### 3.1 コンポーネント構成

```
App
├── Header                    # アプリタイトル
├── DirectoryInput            # ディレクトリパス入力 + フィルタ
├── MainContent
│   ├── RulePanel             # ルール設定パネル（左側）
│   │   ├── RuleSelector      # ルール種別選択ドロップダウン
│   │   ├── RuleChainList     # ルールチェーン一覧
│   │   │   └── RuleCard      # 各ルールの設定カード
│   │   │       ├── ReplaceRuleEditor     # 文字列置換設定
│   │   │       ├── DelimiterRuleEditor   # 区切り記号設定
│   │   │       └── SequenceRuleEditor    # 連番設定
│   │   └── AddRuleButton     # ルール追加ボタン
│   └── FilePreviewTable      # プレビューテーブル（右側）
│       └── FileRow           # 各ファイルの行（変更前/後 + 状態アイコン）
├── ActionBar                 # アクションボタン群
│   ├── PresetButtons         # プリセット保存/読込
│   ├── ExecuteButton         # 実行ボタン
│   └── UndoButton            # 元に戻すボタン
└── Modals
    ├── ConfirmDialog         # 実行確認ダイアログ
    ├── PresetDialog          # プリセット管理ダイアログ
    └── Toast                 # 通知メッセージ
```

### 3.2 状態管理

React組み込みの `useState` / `useReducer` を使用する。外部状態管理ライブラリは導入しない。

| 状態            | 型                | 管理場所              |
| --------------- | ----------------- | --------------------- |
| directoryPath   | `string`          | App                   |
| fileFilter      | `FileFilter`      | App                   |
| files           | `FileEntry[]`     | useFiles フック       |
| rules           | `RenameRule[]`    | useRenameRules フック |
| previewResult   | `PreviewResult[]` | usePreview フック     |
| previewToken    | `string \| null`  | usePreview フック     |
| lastOperationId | `string \| null`  | App                   |
| isLoading       | `boolean`         | 各フック内            |
| error           | `string \| null`  | 各フック内            |

### 3.3 API通信レイヤー

`client/src/services/api.ts` に全API呼び出し関数を集約する。

```typescript
// API通信関数の設計イメージ
const api = {
  getFiles(directoryPath: string, filter?: FileFilter): Promise<FileEntry[]>;
  preview(directoryPath: string, rules: RenameRule[], selectedFiles?: string[]): Promise<PreviewResponse>;
  rename(previewToken: string): Promise<RenameResult>;  // previewToken のみ送信
  undo(operationId?: string): Promise<UndoResult>;      // 省略時は直前の操作
  getUndoHistory(): Promise<UndoHistoryEntry[]>;
  getPresets(): Promise<Preset[]>;
  savePreset(preset: Preset): Promise<void>;
  deletePreset(presetId: string): Promise<void>;
};
```

---

## 4. バックエンド設計

### 4.1 レイヤー構成

```
リクエスト受信
    │
    ▼
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│  Routes   │ ─► │   Services    │ ─► │    Engine     │ ─► │  fs API     │
│ (受付)    │    │ (ビジネス     │    │ (リネーム     │    │ (ファイル   │
│           │    │  ロジック)    │    │  処理)        │    │  操作)      │
└──────────┘    └──────────────┘    └──────────────┘    └────────────┘
```

| レイヤー | 責務                                                               | 主要ファイル                                                     |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Routes   | HTTPリクエスト受付、zod バリデーション、レスポンス返却             | `routes/files.ts`, `routes/rename.ts` 等                         |
| Services | ビジネスロジックの調整、previewToken管理、排他制御、ジャーナル管理 | `services/fileService.ts`, `services/renameService.ts`           |
| Engine   | リネームルールの適用（per-file/batch）、衝突検出                   | `engine/pipeline.ts`, `engine/rules/*.ts`, `engine/collision.ts` |
| Utils    | パス変換、パス検証、ファイル名検証                                 | `utils/pathConverter.ts`, `utils/validation.ts`                  |
| fs API   | Node.js標準のファイルシステム操作                                  | Node.js `fs/promises`                                            |

### 4.2 ルーティング

```typescript
// server/src/routes/ 構成
router.get('/api/health', healthController.check); // Phase 0
router.get('/api/files', filesController.list); // Phase 1
router.post('/api/preview', renameController.preview); // Phase 1 — previewToken 発行
router.post('/api/rename', renameController.execute); // Phase 1 — previewToken のみ受付
router.post('/api/undo', undoController.execute); // Phase 1 — operationId 任意
router.get('/api/undo/history', undoController.list); // Phase 1
router.get('/api/presets', presetsController.list); // Phase 3
router.post('/api/presets', presetsController.save); // Phase 3
router.delete('/api/presets/:id', presetsController.delete); // Phase 3
// 全エンドポイントで zod によるリクエストバリデーションを適用
```

### 4.3 サービス層

**FileService**:

- ディレクトリ内のファイル一覧取得（`fs.readdir` + `fs.stat`）
- Windowsパス → WSLパス変換
- フィルタリング（拡張子、名前パターン）

**RenameService**:

- ドライラン（エンジンでファイル名変換のみ実行、fs操作なし → previewToken 発行 + サーバ保存）
- リネーム実行（previewToken → サーバ保存済みマッピング取得 → validateFileName → mutex lock → ジャーナル書き出し → 2段階リネーム → unlock）
- Undo実行（ジャーナル読み込み → validateFileName 再検証 → mutex lock → 逆変換 → 2段階リネーム → unlock）
- 起動時リカバリ（未完了ジャーナル検出 → 自動ロールバック → 失敗時ディレクトリ隔離）

---

## 5. API設計

### 5.1 エンドポイント一覧

| メソッド | パス                | 概要                                                     | Phase |
| -------- | ------------------- | -------------------------------------------------------- | ----- |
| GET      | `/api/health`       | ヘルスチェック                                           | 0     |
| GET      | `/api/files`        | ファイル一覧取得                                         | 1     |
| POST     | `/api/preview`      | ドライラン（プレビュー結果取得 + previewToken 発行）     | 1     |
| POST     | `/api/rename`       | リネーム実行（previewToken のみ受付）                    | 1     |
| POST     | `/api/undo`         | リネーム操作を元に戻す（operationId 任意、省略時は直前） | 1     |
| GET      | `/api/undo/history` | Undo履歴一覧取得                                         | 1     |
| GET      | `/api/presets`      | プリセット一覧取得                                       | 3     |
| POST     | `/api/presets`      | プリセット保存                                           | 3     |
| DELETE   | `/api/presets/:id`  | プリセット削除                                           | 3     |

### 5.2 リクエスト/レスポンス定義

#### GET /api/health

```typescript
// Response
interface HealthResponse {
  status: 'ok';
  platform: PlatformType; // 'win32' | 'linux'
  isWSL: boolean; // WSL環境かどうか
  timestamp: string; // ISO 8601
}
```

**プラットフォーム検出**: サーバ起動時に `process.platform` と `/proc/version` の内容から判定。フロントエンドはこの情報をもとにパス入力のガイダンスを切り替える。

#### GET /api/files

```typescript
// Request (Query Parameters)
interface GetFilesRequest {
  directoryPath: string; // ディレクトリパス
  extensions?: string; // カンマ区切り拡張子フィルタ (例: ".jpg,.png")
  pattern?: string; // ファイル名パターン (glob)
}

// Response
interface GetFilesResponse {
  directoryPath: string; // 正規化されたWSLパス
  files: FileEntry[];
}

interface FileEntry {
  name: string; // ファイル名（拡張子含む）
  extension: string; // 拡張子
  size: number; // バイト数
  modifiedAt: string; // 更新日時 (ISO 8601)
}
```

#### POST /api/preview

```typescript
// Request
interface PreviewRequest {
  directoryPath: string;
  rules: RenameRule[];
  selectedFiles?: string[]; // 対象ファイル名（省略時は全ファイル）
}

// Response
interface PreviewResponse {
  previewToken: string; // サーバ保存済みプレビュー結果のトークン（UUID）
  results: PreviewResult[];
  hasCollisions: boolean;
}

interface PreviewResult {
  originalName: string; // 変更前ファイル名
  newName: string; // 変更後ファイル名
  hasChanged: boolean; // 変更があるか
  hasCollision: boolean; // 衝突があるか
  collisionWith?: string; // 衝突相手のファイル名
}
```

**previewToken の仕様**:

- サーバ側にプレビュー結果（directoryPath, rules, selectedFiles, resultMappings）を保存し、UUID トークンを発行
- TTL 5分で自動失効
- single-use: 原子的 `take(token)` で `unused → used` に遷移（同時リクエストの二重実行防止）
- 再試行時は新たにプレビューを実行して新 token を取得

#### POST /api/rename

```typescript
// Request — previewToken のみ受付（クライアントから mappings を受け取らない → 改竄防止）
interface RenameRequest {
  previewToken: string; // POST /api/preview で発行されたトークン
}

// Response
interface RenameResponse {
  operationId: string; // Undo用の操作ID
  successCount: number;
  failureCount: number;
  failures: RenameFailure[];
}

interface RenameFailure {
  originalName: string;
  newName: string;
  error: string;
}
```

**リネーム実行の処理フロー**:

1. previewToken からサーバ保存済みマッピングを取得（token の TTL・single-use・directoryPath 一致を検証）
2. 取得した mappings の全 from/to に `validateFileName()` を適用
3. ディレクトリ単位の排他制御（mutex lock）
4. ディレクトリ全体を再スキャンし衝突再チェック
5. Undo ジャーナルを原子的に書き出し（phase: `pending`）
6. **2段階リネーム**: Step 1: 全ファイルを一時名 `.__tmp_{operationId}_{index}` にリネーム（phase: `temp_done`）→ Step 2: 一時名から最終名にリネーム（phase: `completed`）
7. 失敗時は自動ロールバック（phase: `rollback_done` / `rollback_failed`）

#### POST /api/undo

```typescript
// Request — operationId は任意（省略時は直前の操作を元に戻す）
interface UndoRequest {
  operationId?: string;
}

// Response
interface UndoResponse {
  successCount: number;
  failureCount: number;
}
```

### 5.3 共有型定義（RenameRule）

```typescript
// shared/types.ts

type RenameRule = ReplaceRule | DelimiterRule | SequenceRule;

interface ReplaceRule {
  type: 'replace';
  enabled: boolean;
  search: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  includeExtension: boolean;
}

interface DelimiterRule {
  type: 'delimiter';
  enabled: boolean;
  delimiter: string;
  position: number; // N番目の区切り（1始まり）
  side: 'left' | 'right'; // 左側 or 右側
  action: 'replace' | 'remove' | 'keep'; // 保持を含む3操作
  value?: string; // 置換時の新しい値
}

interface SequenceRule {
  type: 'sequence';
  enabled: boolean;
  start: number;
  step: number;
  padding: number;
  position: 'prefix' | 'suffix' | 'custom';
  customPosition?: number; // カスタム挿入位置
  template?: string; // カスタムテンプレート（{name}_{num:3}.{ext} 形式）
  sortBy: 'name' | 'date' | 'size';
  sortOrder: 'asc' | 'desc'; // ソート方向
}
```

### 5.4 エラーレスポンス

```typescript
// 統一エラーフォーマット
interface ErrorResponse {
  error: string; // ユーザー向けメッセージ
  code: string; // エラーコード
  details?: unknown; // 追加情報（開発用）
}

// エラーコード一覧
// DIRECTORY_NOT_FOUND    - ディレクトリが存在しない
// PERMISSION_DENIED      - アクセス権限がない
// COLLISION_DETECTED     - ファイル名の衝突を検出
// RENAME_FAILED          - リネーム実行中のエラー
// INVALID_PATH           - 無効なパス形式
// INVALID_FILENAME       - 無効なファイル名（禁則文字、パストラバーサル等）
// PROTECTED_DIRECTORY    - 保護されたシステムディレクトリ
// UNDO_NOT_FOUND         - Undoログが見つからない
// VALIDATION_ERROR       - リクエストのバリデーションエラー
// INVALID_PREVIEW_TOKEN  - 無効/期限切れ/使用済みの previewToken
// DIRECTORY_QUARANTINED  - リカバリ失敗により隔離されたディレクトリ
// DIRECTORY_LOCKED       - 別の操作が進行中のディレクトリ
```

---

## 6. リネームエンジン設計

### 6.1 ルールインターフェース

```typescript
// server/src/engine/types.ts

// per-file ルール（Replace, Delimiter）
interface RuleProcessor {
  apply(fileName: string, context: RenameContext): string;
}

// バッチ処理ルール（Sequence — 全件入力→整列→採番→結果返却）
interface BatchRuleProcessor {
  applyBatch(entries: BatchEntry[]): BatchResult[];
}

interface BatchEntry {
  id: number; // 元ファイルとの対応関係を保証する ID
  fileName: string;
  context: RenameContext;
  fileEntry: FileEntry; // size/modifiedAt を含む（sortBy=date/size 対応）
}

interface BatchResult {
  id: number; // 入力と同じ id を返す
  fileName: string;
}

interface RenameContext {
  index: number; // ファイルリスト内の順序（0始まり）
  totalCount: number; // ファイル総数
  originalName: string; // 元のファイル名（不変）
  originalBaseName: string; // 元のベース名（不変）
  originalExtension: string; // 元の拡張子（不変）
  currentBaseName: string; // ルール適用ごとに更新されるベース名
  currentExtension: string; // ルール適用ごとに更新される拡張子
}
```

### 6.2 組み込みルール

| ルールクラス         | 対応するRenameRule型 | インターフェース               | 責務                                             |
| -------------------- | -------------------- | ------------------------------ | ------------------------------------------------ |
| `ReplaceProcessor`   | `ReplaceRule`        | `RuleProcessor`（per-file）    | 文字列/正規表現の検索・置換                      |
| `DelimiterProcessor` | `DelimiterRule`      | `RuleProcessor`（per-file）    | 区切り記号による分割と部分変更（置換/削除/保持） |
| `SequenceProcessor`  | `SequenceRule`       | `BatchRuleProcessor`（バッチ） | 全件ソート→採番→テンプレート適用                 |

### 6.3 ルールチェーンパイプライン

```typescript
// server/src/engine/pipeline.ts

function applyRuleChain(files: FileEntry[], rules: RenameRule[]): PreviewResult[] {
  // 初期 context 生成
  let entries = files.map((file, index) => {
    const ext = path.extname(file.name);
    const base = path.basename(file.name, ext);
    return {
      id: index,
      fileName: file.name,
      fileEntry: file,
      context: {
        index,
        totalCount: files.length,
        originalName: file.name,
        originalBaseName: base,
        originalExtension: ext,
        currentBaseName: base,
        currentExtension: ext,
      } as RenameContext,
    };
  });

  // 有効なルールのみを順次適用
  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (isBatchRule(rule)) {
      // BatchRuleProcessor（Sequence 等）: 全件を一括処理
      const processor = createBatchProcessor(rule);
      const results = processor.applyBatch(entries);
      // id を使って元順に再マッピング
      entries = remapByIds(entries, results);
    } else {
      // RuleProcessor（Replace, Delimiter 等）: per-file 処理
      const processor = createProcessor(rule);
      for (const entry of entries) {
        entry.fileName = processor.apply(entry.fileName, entry.context);
      }
    }

    // 各ルール適用後に currentBaseName / currentExtension を再計算
    for (const entry of entries) {
      const ext = path.extname(entry.fileName);
      entry.context.currentBaseName = path.basename(entry.fileName, ext);
      entry.context.currentExtension = ext;
    }
  }

  return entries.map((entry) => ({
    originalName: files[entry.id].name,
    newName: entry.fileName,
    hasChanged: files[entry.id].name !== entry.fileName,
  }));
}
```

### 6.4 拡張ポイント

新しいルール型を追加する手順:

1. `shared/types.ts` に新しいルール型を追加（union型に追加）
2. `server/src/engine/rules/` に新しい `*Processor` クラスを作成（per-file なら `RuleProcessor`、全件処理が必要なら `BatchRuleProcessor` を実装）
3. `createProcessor` / `createBatchProcessor` ファクトリ関数に分岐を追加
4. `client/src/components/RulePanel/` に新しい `*RuleEditor` コンポーネントを作成

---

## 7. データフロー

### 7.1 プレビューフロー

```
ユーザー: ルール設定を変更
    │
    ▼
[React] ルール状態を更新 → debounce(300ms)
    │
    ▼
[React] POST /api/preview { directoryPath, rules, selectedFiles? }
    │
    ▼
[Express] リクエストバリデーション (zod)
    │
    ▼
[FileService] ファイル一覧取得 (fs.readdir) + validatePath()
    │
    ▼
[Engine] applyRuleChain(files, rules)
    │
    ▼
[Engine] detectCollisions(results, allFilesInDir)
    │
    ▼
[RenameService] プレビュー結果をサーバ保存 → previewToken (UUID) 発行
    │
    ▼
[Express] PreviewResponse { previewToken, results, hasCollisions } を返却
    │
    ▼
[React] FilePreviewTable を更新 + previewToken を保持
```

### 7.2 リネーム実行フロー

```
ユーザー: [実行] ボタン押下
    │
    ▼
[React] 確認ダイアログ表示
    │
    ▼
ユーザー: [実行する] 確認
    │
    ▼
[React] POST /api/rename { previewToken }
    │
    ▼
[Express] リクエストバリデーション (zod)
    │
    ▼
[RenameService] previewToken → サーバ保存済みマッピング取得
    │             （TTL・single-use・directoryPath 一致を検証）
    │
    ▼
[RenameService] 全 from/to に validateFileName() 適用
    │
    ▼
[RenameService] ディレクトリ mutex lock 取得
    │
    ▼
[RenameService] ディレクトリ全体を再スキャンし衝突再チェック
    │
    ▼
[RenameService] Undo ジャーナル原子的書き出し (phase: pending)
    │
    ▼
[RenameService] 2段階リネーム
    │  Step 1: 全ファイル → 一時名 (.__tmp_{opId}_{idx}) → phase: temp_done
    │  Step 2: 一時名 → 最終名 → phase: completed
    │  失敗時: 自動ロールバック → phase: rollback_done / rollback_failed
    │
    ▼
[RenameService] mutex unlock
    │
    ▼
[Express] RenameResponse { operationId, successCount, ... } を返却
    │
    ▼
[React] 結果通知 + ファイル一覧を再取得 + operationId を保持
```

### 7.3 Undoフロー

```
ユーザー: [元に戻す] ボタン押下
    │
    ▼
[React] Undo確認ダイアログ表示
    │
    ▼
[React] POST /api/undo { operationId? }  ← 省略時は直前の操作
    │
    ▼
[RenameService] Undoジャーナル読み込み
    │
    ▼
[RenameService] 逆変換マップ生成 (to → from)
    │
    ▼
[RenameService] 全ファイル名に validateFileName() を再検証
    │
    ▼
[RenameService] ディレクトリ mutex lock 取得
    │
    ▼
[RenameService] 現在のファイル状態との衝突チェック
    │
    ▼
[RenameService] 2段階リネームで逆変換実行
    │
    ▼
[RenameService] ジャーナル phase 更新 → mutex unlock
    │
    ▼
[Express] UndoResponse を返却
```

---

## 8. 安全機構

### 8.1 ドライラン（プレビュー）の強制

- リネーム実行API (`POST /api/rename`) は **previewToken のみ受付**。プレビューを経由せずにリネーム実行は API レベルで不可能
- previewToken はサーバ側でプレビュー結果（directoryPath, mappings）と紐付けて保存。クライアントから mappings を直接受け取らないことで改竄を防止
- リネーム実行時にディレクトリ全体を再スキャンし、プレビュー時からの変更（衝突の新規発生等）を検出

### 8.2 衝突検出アルゴリズム

```typescript
function detectCollisions(
  results: PreviewResult[],
  allFilesInDir: string[], // ディレクトリ全体のファイル名スナップショット
): PreviewResult[] {
  const newNameMap = new Map<string, string[]>();

  // 1. 変換後ファイル名のリネーム対象内の重複を検出
  for (const result of results) {
    const lower = result.newName.toLowerCase(); // NTFS は case-insensitive
    if (!newNameMap.has(lower)) {
      newNameMap.set(lower, []);
    }
    newNameMap.get(lower)!.push(result.originalName);
  }

  // 2. 2つ以上の元ファイルが同じ新名前になる場合を衝突とする
  for (const result of results) {
    const lower = result.newName.toLowerCase();
    const sources = newNameMap.get(lower)!;
    if (sources.length > 1) {
      result.hasCollision = true;
      result.collisionWith = sources.find((s) => s !== result.originalName);
    }
  }

  // 3. リネーム対象外の既存ファイルとの衝突を検出
  const renamedOriginals = new Set(results.map((r) => r.originalName.toLowerCase()));
  for (const result of results) {
    if (result.hasCollision) continue;
    const lower = result.newName.toLowerCase();
    // 変更後名が既存ファイルと一致し、その既存ファイルがリネーム対象外の場合
    if (
      allFilesInDir.some((f) => f.toLowerCase() === lower && !renamedOriginals.has(f.toLowerCase()))
    ) {
      result.hasCollision = true;
      result.collisionWith = allFilesInDir.find((f) => f.toLowerCase() === lower);
    }
  }

  return results;
}
```

### 8.3 Undoジャーナル設計

```typescript
// server/data/undo/ に保存されるJSONファイル

interface UndoJournal {
  operationId: string; // UUID (crypto.randomUUID())
  timestamp: string; // ISO 8601
  directoryPath: string; // 対象ディレクトリ
  phase: 'pending' | 'temp_done' | 'completed' | 'rollback_done' | 'rollback_failed';
  mappings: {
    from: string; // 変更前ファイル名
    to: string; // 変更後ファイル名
  }[];
  tempMappings: {
    from: string; // 変更前ファイル名
    tempName: string; // 一時ファイル名 (.__tmp_{operationId}_{index})
  }[];
}

// ファイル名: {operationId}.json
// 保存場所: server/data/undo/
// ローテーション: 最大50件保持、古いものから自動削除
```

**原子的書き込みパターン**:

1. temp file に JSON を書き込み
2. `fsync` でディスクフラッシュ
3. `fs.rename` で本ファイルに置換（クラッシュ時の部分書き込み/破損を防止）
4. phase 更新時も同じパターンを使用

**起動時リカバリ**:

- 未完了ジャーナル（phase が `pending` / `temp_done`）を検出
- ジャーナルの全ファイル名に `validateFileName()` を再検証
- 自動ロールバック実行（`tempMappings` を使って元名に復帰）
- ロールバック成功 → phase を `rollback_done` に更新
- ロールバック失敗 → 対象ディレクトリを隔離（rename/undo リクエストを拒否）

### 8.4 ファイルシステム保護

| 保護対象             | 方法                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| パストラバーサル     | `fs.realpath` でパスを正規化後、許可ディレクトリであることを検証（WSL: `/mnt/` 配下、Windows: 有効なドライブ文字 or UNCパス）          |
| ファイル名検証       | `validateFileName()` で禁則文字（`/`, `\`, `..`, NUL, `<>:"\|?*`）を拒否、`path.basename(name) === name` チェック、末尾ドット/空白禁止 |
| システムフォルダ     | denylist で拒否（WSL: `/mnt/c/Windows` 等、Windows: `C:\Windows`, `C:\Program Files` 等）。プラットフォームに応じたリストを使用        |
| シンボリックリンク   | `fs.lstat` でリンクを検出し、リンク先を解決して許可範囲内か検証                                                                        |
| 読み取り専用ファイル | リネーム前に `fs.access` でWritable権限を確認                                                                                          |
| 隠しファイル         | `.` で始まるファイルはデフォルトで対象外（オプションで含める）                                                                         |

### 8.5 排他制御

| 項目      | 詳細                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| 方式      | ディレクトリ単位のメモリ mutex                                                                                            |
| lock キー | canonical path（`normalizeInputPath` → `fs.realpath` で正規化。WSL: ドライブ文字小文字統一、Windows: ネイティブパス解決） |
| 臨界区間  | lock 取得 → 検証 → 実行 → unlock を1トランザクション                                                                      |
| 対象操作  | rename、undo ともに排他制御の対象                                                                                         |

---

## 9. プラットフォーム対応設計

### 9.1 プラットフォーム検出

```typescript
// server/src/index.ts（起動時に一度だけ実行）

type PlatformType = 'win32' | 'linux';

function detectPlatform(): { platform: PlatformType; isWSL: boolean } {
  const platform = process.platform as PlatformType;
  if (platform === 'linux') {
    // /proc/version に "microsoft" or "WSL" を含む場合はWSL
    const version = readFileSync('/proc/version', 'utf-8');
    return { platform, isWSL: /microsoft|wsl/i.test(version) };
  }
  return { platform, isWSL: false };
}
```

### 9.2 パス変換ユーティリティ

```typescript
// server/src/utils/pathConverter.ts
// プラットフォームに応じたパス処理を提供

/**
 * normalizeInputPath(): 入力パスをサーバ実行環境のネイティブパスに変換
 *
 * [Windowsネイティブ (win32)]
 *   - C:\Users\... → そのまま使用
 *   - C:/Users/... → バックスラッシュに正規化
 *   - \\server\share → そのまま使用（UNCパスサポート）
 *   - /mnt/c/... → エラー（WSLパスは非サポート）
 *
 * [WSL (linux + isWSL)]
 *   - C:\Users\... → /mnt/c/Users/...
 *   - C:/Users/... → /mnt/c/Users/...
 *   - /mnt/c/... → そのまま使用
 *   - \\server\share → エラー（WSLではUNC非サポート）
 *   - \\?\ 形式 → エラー
 */
function normalizeInputPath(inputPath: string): string {
  if (isWindows()) {
    return normalizeForWindows(inputPath);
  } else {
    return normalizeForWSL(inputPath);
  }
}

// WSL環境用: Windowsパス → /mnt/ パスに変換
function windowsToWsl(windowsPath: string): string {
  const match = windowsPath.match(/^([A-Za-z]):[:\\/](.*)/);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }
  return windowsPath;
}

// WSL→Windows表示用変換
function wslToWindows(wslPath: string): string {
  const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)/);
  if (!match) return wslPath;
  const drive = match[1].toUpperCase();
  const rest = match[2].replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
}
```

### 9.3 パス検証のプラットフォーム分岐

| 検証項目         | Windowsネイティブ                   | WSL                                         |
| ---------------- | ----------------------------------- | ------------------------------------------- |
| 許可ルート       | 有効なドライブ文字 or UNCパス       | `/mnt/` 配下のみ                            |
| 保護ディレクトリ | `C:\Windows`, `C:\Program Files` 等 | `/mnt/c/Windows`, `/mnt/c/Program Files` 等 |
| パス正規化       | `path.win32.resolve()`              | `path.posix.resolve()` + `fs.realpath`      |
| UNCパス          | サポート（`\\server\share`）        | 非サポート（エラー）                        |

### 9.4 パフォーマンス考慮

- WSL環境: `/mnt/` 配下のI/OはネイティブLinuxファイルシステムより遅い
- Windowsネイティブ: ネットワークドライブはローカルディスクより遅い可能性
- 共通: ファイル一覧取得時は `fs.readdir` に `withFileTypes: true` オプションを使用し、不要な `fs.stat` 呼び出しを削減
- 共通: プレビューAPIのレスポンスをクライアント側でキャッシュし、不要な再リクエストを回避

---

## 10. エラーハンドリング戦略

### フロントエンド

| エラー種別           | 表示方法                                 |
| -------------------- | ---------------------------------------- |
| APIエラー（4xx）     | トースト通知で警告メッセージ表示         |
| APIエラー（5xx）     | トースト通知でエラーメッセージ表示       |
| ネットワークエラー   | 「サーバーに接続できません」トースト表示 |
| バリデーションエラー | 該当入力フィールドにインラインエラー表示 |

### バックエンド

| Node.jsエラー | エラーコード        | HTTP Status | 対処                     |
| ------------- | ------------------- | ----------- | ------------------------ |
| ENOENT        | DIRECTORY_NOT_FOUND | 404         | ディレクトリが存在しない |
| EACCES        | PERMISSION_DENIED   | 403         | アクセス権限がない       |
| EEXIST        | COLLISION_DETECTED  | 409         | ファイル名が既に存在     |
| ENOTEMPTY     | RENAME_FAILED       | 500         | リネーム処理エラー       |

### 統一エラーミドルウェア

Express の統一エラーレスポンスミドルウェアで、すべてのエラーを `{ error, code, details }` 形式で返却する。

### 部分失敗時の挙動

1. リネーム処理は2段階（一時名退避 → 最終名）で実行される
2. いずれかの Step でエラーが発生した場合、ジャーナルの `tempMappings` を使って自動ロールバック
3. ロールバック成功 → ジャーナルの phase を `rollback_done` に更新
4. ロールバック失敗 → 対象ディレクトリを隔離（手動復旧を促す）
5. レスポンスに成功件数・失敗件数・失敗詳細を含める
6. サーバ再起動時に未完了ジャーナルを検出して自動リカバリ

---

## 11. Electron デスクトップアプリ構成

### 11.1 アーキテクチャ概要

```
Electron メインプロセス (electron/main.ts)
  ├─ Express server (動的ポート, 127.0.0.1) ← server/src/app.ts を @app/server/app 経由で import
  ├─ Preload script (electron/preload.ts) ← contextBridge でポート・フォルダ選択を公開
  └─ BrowserWindow → React UI (electron-vite でビルド)
```

- **Express 同梱方式**: メインプロセスで Express を起動し、レンダラからの API 通信は Web 版と同一
- **サーバー分離**: `server/src/app.ts`（副作用なし）と `server/src/index.ts`（CLI エントリー）に分離
- **データパス外部注入**: Electron は `app.getPath('userData')/data`、Web 版は `server/data/` をデフォルト使用

### 11.2 パッケージング・配布

| 項目 | 詳細 |
|------|------|
| ビルドツール | electron-vite (^5.x) — main/preload/renderer の統合ビルド |
| パッケージツール | electron-builder (^26.x) — NSIS インストーラー生成 |
| 出力 | `release/File Renamer Setup 0.1.0.exe` (93MB NSIS), `release/win-unpacked/` (ポータブル版) |
| asar 内容 | `out/main/index.js`, `out/preload/index.cjs`, `out/renderer/*`, `package.json` のみ |
| ネイティブモジュール | なし（`npmRebuild: false`） |
| コード署名 | なし（SmartScreen 警告あり） |

### 11.3 npm scripts（Electron 関連）

| スクリプト | コマンド | 説明 |
|-----------|---------|------|
| `electron:dev` | `electron-vite dev` | Electron 開発モード起動 |
| `electron:build` | `electron-vite build` | main/preload/renderer ビルド |
| `electron:package` | `electron-vite build && electron-builder --win` | .exe インストーラー生成 |
| `electron:installer` | `electron-builder --win` | electron-builder のみ実行（ビルド済みの場合） |

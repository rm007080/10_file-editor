# 技術スタック（Tech Stack）

> 関連ドキュメント: [要件定義書](./requirements.md) | [アーキテクチャ設計書](./architecture.md)

## 1. 技術選定方針

| 方針                   | 詳細                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| シンプルさ優先         | 個人プロジェクトのため、過度な抽象化やオーバーエンジニアリングを避ける                |
| TypeScript統一         | フロントエンド/バックエンド両方でTypeScriptを使用し、型定義を共有する                 |
| 依存関係の最小化       | 必要最小限のライブラリのみ導入。標準APIで実現できるものは標準APIを使用                |
| クロスプラットフォーム | Windowsネイティブ・WSL両環境で動作する技術を選定。`process.platform` による実行時分岐 |

---

## 2. フロントエンド

### 2.1 コア技術

| 技術       | バージョン | 用途                        | 選定理由                                                     |
| ---------- | ---------- | --------------------------- | ------------------------------------------------------------ |
| React      | 19.x       | UIフレームワーク            | コンポーネントベースで再利用性が高い。エコシステムが最も充実 |
| TypeScript | 5.x        | 型安全な開発言語            | バックエンドと型定義を共有。開発時のエラー検出               |
| Vite       | 6.x        | ビルドツール / 開発サーバー | HMRが高速、設定がシンプル、ESMネイティブ                     |

### 2.2 スタイリング

| 技術        | 用途                        | 選定理由                                           |
| ----------- | --------------------------- | -------------------------------------------------- |
| CSS Modules | コンポーネントスコープのCSS | 追加依存なし、Vite標準対応、スコープが自動で閉じる |

CSS Modulesを選定した理由:

- Tailwind CSSは強力だが、このプロジェクトの規模では設定のオーバーヘッドが大きい
- CSS Modulesは追加インストール不要で、Viteが標準でサポートしている
- コンポーネントごとにCSSがスコープされるため、スタイルの衝突を防止できる

### 2.3 ユーティリティライブラリ

| ライブラリ      | 用途         | 必須/任意 |
| --------------- | ------------ | --------- |
| lucide-react    | アイコン     | 任意      |
| react-hot-toast | トースト通知 | 任意      |

最小構成ではこれらのライブラリは導入せず、必要になった時点で追加する。

---

## 3. バックエンド

### 3.1 コア技術

| 技術       | バージョン | 用途                     | 選定理由                                                  |
| ---------- | ---------- | ------------------------ | --------------------------------------------------------- |
| Node.js    | 22.x LTS   | ランタイム               | 現行LTS版で安定。fs/promises APIが充実。ESMサポート成熟   |
| Express    | 4.x        | Webフレームワーク        | 最も広く使われるNode.js Webフレームワーク。シンプルで軽量 |
| TypeScript | 5.x        | 型安全な開発言語         | フロントエンドと型を共有                                  |
| tsx        | latest     | TypeScript実行（開発時） | ts-nodeより高速。設定不要でTypeScriptを直接実行           |

### 3.2 ミドルウェア・バリデーション

| ライブラリ     | 用途                     | 選定理由                                                                         |
| -------------- | ------------------------ | -------------------------------------------------------------------------------- |
| cors           | CORS対応                 | 開発時にVite dev server (5173) → Express (3001) のクロスオリジンリクエストを許可 |
| express.json() | JSONボディパース         | Express組み込み。追加インストール不要                                            |
| zod            | ランタイムバリデーション | 全エンドポイントのリクエストバリデーションに使用。TypeScript 型との親和性が高い  |

### 3.3 ファイル操作

| モジュール    | 用途               | 備考                                             |
| ------------- | ------------------ | ------------------------------------------------ |
| `fs/promises` | 非同期ファイル操作 | Node.js標準。readdir, rename, stat, access 等    |
| `path`        | パス操作           | Node.js標準。extname, basename, join, resolve 等 |
| `crypto`      | UUID生成           | Node.js標準。Undo操作IDの生成に使用              |

追加のファイル操作ライブラリは導入しない。Node.js標準APIで要件を十分に満たせる。

---

## 4. 共通 / ツールチェーン

### 4.1 言語・ビルド

| 項目                   | 設定                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| TypeScript strict mode | 有効                                                                                                        |
| target                 | ES2022                                                                                                      |
| module                 | ESNext（全パッケージ統一。`"type": "module"` を使用）                                                       |
| composite              | client/server/shared 全てに `composite: true`                                                               |
| emitDeclarationOnly    | `true`（`noEmit` は `composite` と非互換のため代替使用。JS出力なし、`.d.ts` のみ）                          |
| tsconfig構成           | ルートに `tsconfig.base.json`、ルート `tsconfig.json` で `references` 集約、client/server/shared で extends |
| ビルド                 | `tsc -b` で増分ビルド                                                                                       |

### 4.2 コード品質

| ツール   | バージョン | 用途         | 設定方針                                              |
| -------- | ---------- | ------------ | ----------------------------------------------------- |
| ESLint   | 9.x        | リンター     | flat config形式。TypeScript推奨ルールセットを使用     |
| Prettier | 3.x        | フォーマッタ | シングルクォート、セミコロンあり、2スペースインデント |

### 4.3 テスト

| ツール | バージョン | 用途           | 選定理由                                          |
| ------ | ---------- | -------------- | ------------------------------------------------- |
| Vitest | latest     | ユニットテスト | Viteとの親和性が高い。Jest互換API。設定がシンプル |

テスト方針:

- リネームエンジン（`server/src/engine/`）のユニットテストを重点的にカバー
- パス変換ユーティリティのテスト
- API統合テストは必要に応じて追加

### 4.4 開発補助

| ツール       | 用途                         | 設定                           |
| ------------ | ---------------------------- | ------------------------------ |
| concurrently | フロント/バックの同時起動    | `npm run dev` で両方を同時起動 |
| tsx --watch  | バックエンドのホットリロード | ファイル変更時に自動再起動     |

---

## 5. ディレクトリ構成詳細

### 5.1 ルートレベル

```
10_file-editor/
├── client/                    # フロントエンド
├── server/                    # バックエンド
├── shared/                    # 共有型定義（@app/shared workspace package）
│   ├── package.json           # name: @app/shared
│   ├── tsconfig.json          # composite: true
│   └── types.ts               # RenameRule, FileEntry 等の型定義
├── docs/                      # ドキュメント
│   ├── 01_requirements_01.md  # 要件定義書
│   ├── 02_architecture_01.md  # アーキテクチャ設計書
│   ├── 03_tech-stack_01.md    # 技術スタック（本ファイル）
│   ├── 04_implementation-plan_01.md  # 実装計画書
│   └── 05_handoff-prompt.md   # 引き継ぎプロンプト
├── package.json               # ルートワークスペース定義（workspaces: client, server, shared）
├── tsconfig.json              # TypeScript references 集約（tsc -b 用）
├── tsconfig.base.json         # TypeScript共通設定（strict: true, target: ES2022）
├── .prettierrc                # Prettier設定
├── .nvmrc                     # Node.js バージョン固定（20）
├── .gitignore                 # Git除外設定
├── CLAUDE.md                  # Claude Code設定
└── README.md                  # プロジェクト説明
```

### 5.2 client/ 詳細

```
client/
├── public/                    # 静的ファイル
├── src/
│   ├── components/            # UIコンポーネント
│   │   ├── DirectoryInput/    # ディレクトリパス入力
│   │   │   ├── DirectoryInput.tsx
│   │   │   └── DirectoryInput.module.css
│   │   ├── FilePreviewTable/  # プレビューテーブル
│   │   │   ├── FilePreviewTable.tsx
│   │   │   ├── FilePreviewTable.module.css
│   │   │   └── FileRow.tsx
│   │   ├── RulePanel/         # ルール設定パネル
│   │   │   ├── RulePanel.tsx
│   │   │   ├── RulePanel.module.css
│   │   │   ├── RuleCard.tsx
│   │   │   ├── ReplaceRuleEditor.tsx
│   │   │   ├── DelimiterRuleEditor.tsx
│   │   │   └── SequenceRuleEditor.tsx
│   │   ├── ActionBar/         # アクションボタン群
│   │   │   ├── ActionBar.tsx
│   │   │   └── ActionBar.module.css
│   │   └── common/            # 共通UIコンポーネント
│   │       ├── Modal.tsx
│   │       ├── Modal.module.css
│   │       ├── Toast.tsx
│   │       └── Button.tsx
│   ├── hooks/                 # カスタムフック
│   │   ├── useFiles.ts        # ファイル一覧取得・管理
│   │   ├── useRenameRules.ts  # ルールチェーン管理
│   │   └── usePreview.ts      # プレビュー取得・管理
│   ├── services/              # API通信
│   │   └── api.ts             # 全API呼び出し関数
│   ├── types/                 # フロントエンド固有の型
│   │   └── index.ts
│   ├── utils/                 # ユーティリティ
│   │   └── index.ts
│   ├── App.tsx                # ルートコンポーネント
│   ├── App.module.css         # ルートスタイル
│   └── main.tsx               # エントリーポイント
├── index.html                 # HTMLテンプレート
├── package.json               # フロントエンド依存関係
├── tsconfig.json              # TypeScript設定（extends base）
└── vite.config.ts             # Vite設定（プロキシ等）
```

### 5.3 server/ 詳細

```
server/
├── src/
│   ├── routes/                # APIルーティング
│   │   ├── files.ts           # GET /api/files
│   │   ├── rename.ts          # POST /api/preview, POST /api/rename
│   │   ├── undo.ts            # POST /api/undo, GET /api/undo/history
│   │   └── presets.ts         # GET/POST/DELETE /api/presets
│   ├── services/              # ビジネスロジック
│   │   ├── fileService.ts     # ファイル一覧取得、パス変換
│   │   └── renameService.ts   # ドライラン、実行、Undo、previewToken管理、ジャーナル
│   ├── engine/                # リネームエンジン
│   │   ├── types.ts           # RuleProcessor, BatchRuleProcessor, RenameContext
│   │   ├── pipeline.ts        # ルールチェーンパイプライン（per-file/batch 切り替え）
│   │   ├── collision.ts       # 衝突検出（ディレクトリ全体スナップショット）
│   │   └── rules/             # 各ルールの実装
│   │       ├── replaceRule.ts
│   │       ├── delimiterRule.ts
│   │       └── sequenceRule.ts  # BatchRuleProcessor 実装
│   ├── utils/                 # ユーティリティ
│   │   ├── pathConverter.ts   # Windows ↔ WSLパス変換、normalizeInputPath
│   │   └── validation.ts      # zod スキーマ、validateFileName、validatePath、isProtectedDirectory
│   ├── types/                 # バックエンド固有の型
│   │   └── index.ts
│   └── index.ts               # Expressアプリのエントリーポイント（統一エラーミドルウェア、起動時リカバリ）
├── data/                      # データ保存ディレクトリ（自動作成）
│   ├── undo/                  # Undoジャーナル（JSON）
│   └── presets/               # プリセット（JSON）
├── package.json               # バックエンド依存関係（express, cors, zod, tsx 等）
└── tsconfig.json              # TypeScript設定（extends base, composite: true）
```

### 5.4 shared/ 詳細

```
shared/
├── package.json               # name: @app/shared, exports と types を定義
├── tsconfig.json              # extends base, composite: true, declaration: true
└── types.ts                   # フロント/バック共有型定義
                               #   - RenameRule (union type)
                               #   - ReplaceRule, DelimiterRule, SequenceRule
                               #   - FileEntry
                               #   - PreviewResult
                               #   - RenameMapping
                               #   - Preset
                               #   - ErrorResponse
```

共有型定義のルール:

- ロジック（関数、クラス）は含めない。型定義のみ
- `@app/shared` として npm workspace package 化
- フロントエンド/バックエンド両方から `import { ... } from '@app/shared'` で参照
- APIのリクエスト/レスポンス型もここに定義

---

## 6. 主要設定ファイル一覧

| ファイル                 | 役割                               | 主要設定                                                                                     |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `package.json` (ルート)  | ワークスペース定義、共通スクリプト | `workspaces: [client, server, shared]`, `scripts.dev`, `scripts.build`                       |
| `tsconfig.json` (ルート) | TypeScript references 集約         | `references` で client/server/shared を集約（`tsc -b` 用）                                   |
| `tsconfig.base.json`     | TypeScript共通設定                 | `strict: true`, `target: ES2022`                                                             |
| `client/tsconfig.json`   | フロントエンドTypeScript設定       | `extends ../tsconfig.base.json`, `composite: true`, JSX設定, `references` で shared 参照     |
| `server/tsconfig.json`   | バックエンドTypeScript設定         | `extends ../tsconfig.base.json`, `composite: true`, Node.js向け, `references` で shared 参照 |
| `shared/tsconfig.json`   | 共有パッケージTypeScript設定       | `extends ../tsconfig.base.json`, `composite: true`, `declaration: true`                      |
| `shared/package.json`    | 共有パッケージ定義                 | `name: @app/shared`, `exports`, `types`                                                      |
| `client/vite.config.ts`  | Vite設定                           | dev serverポート(5173)、APIプロキシ(`/api` → `localhost:3001`)                               |
| `electron.vite.config.ts` | electron-vite 設定               | main/preload/renderer の統合ビルド。`@app/shared`, `@app/server` はバンドルに含める          |
| `electron/tsconfig.json` | Electron TypeScript設定            | `composite: true`, `references` で shared/server を参照                                       |
| `.prettierrc`            | Prettier設定                       | `singleQuote: true`, `semi: true`, `tabWidth: 2`                                             |
| `.nvmrc`                 | Node.jsバージョン固定              | `22`                                                                                         |
| `.gitignore`             | Git除外設定                        | `node_modules/`, `dist/`, `server/data/`, `out/`, `release/`                                 |

---

## 7. バージョン管理方針

| 項目                   | 方針                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| Node.jsバージョン固定  | `.nvmrc` ファイルに `22` を記載                                   |
| パッケージマネージャー | npm（Node.js標準同梱）                                            |
| lockファイル           | `package-lock.json` をコミットする                                |
| `node_modules/`        | `.gitignore` で除外                                               |
| `server/data/`         | `.gitignore` で除外（Undoジャーナル・プリセットはローカルデータ） |
| `out/`                 | `.gitignore` で除外（electron-vite ビルド出力）                    |
| `release/`             | `.gitignore` で除外（electron-builder 出力）                       |
| Vite                   | `npm create vite@6`（`@latest` 禁止、6系に固定）                  |
| React/ReactDOM         | `^19`（major バージョン固定）                                     |
| Express                | `^4`（major バージョン固定）                                      |
| Electron               | `^40`（現行安定版、EOL: 2026-06-30）                               |
| electron-vite          | `^5`（現行メジャー）                                               |
| electron-builder       | `^26`（NSIS インストーラー生成）                                   |
| 対応 `@types/*`        | major バージョンに合わせて固定                                    |

---

## 8. セットアップ手順

### 初回セットアップ

```bash
# リポジトリのクローン後
cd /mnt/c/Users/littl/app-dev/10_file-editor

# 依存関係のインストール（ルート + client + server）
npm install

# 開発サーバー起動（フロントエンド + バックエンド同時）
npm run dev
```

### 開発サーバーの構成

| サーバー        | ポート | 用途                      |
| --------------- | ------ | ------------------------- |
| Vite dev server | 5173   | フロントエンド（HMR対応） |
| Express server  | 3001   | バックエンドAPI           |

Viteの設定でAPIリクエスト (`/api/*`) をExpressサーバーにプロキシする。
これにより、ブラウザからは `localhost:5173` のみにアクセスすればよい。

### ビルド

```bash
# プロダクションビルド
npm run build

# ビルド後の起動
npm start
```

### npm scripts 一覧（ルート package.json）

| スクリプト     | コマンド                                                 | 説明                                                 |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `dev`          | `concurrently "npm run dev:client" "npm run dev:server"` | 開発サーバー同時起動（Web版）                        |
| `dev:client`   | `npm run dev -w client`                                  | フロントエンドのみ起動                               |
| `dev:server`   | `tsx watch server/src/index.ts`                          | バックエンドのみ起動                                 |
| `build`        | `tsc -b`                                                 | TypeScript プロジェクト全体の型チェック + 増分ビルド |
| `build:client` | `cd client && npm run build`                             | フロントエンドビルド（Vite）                         |
| `test`         | `vitest`                                                 | テスト実行                                           |
| `lint`         | `eslint .`                                               | リント実行                                           |
| `format`       | `prettier --write .`                                     | フォーマット実行                                     |
| `electron:dev` | `electron-vite dev`                                      | Electron 開発モード起動                              |
| `electron:build` | `electron-vite build`                                  | Electron ビルド（main/preload/renderer）             |
| `electron:package` | `electron-vite build && electron-builder --win`      | .exe インストーラー生成                              |
| `electron:installer` | `electron-builder --win`                           | electron-builder のみ実行（ビルド済みの場合）        |

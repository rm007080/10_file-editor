# File Renamer

Windowsフォルダ内のファイル名を一括変更するデスクトップアプリ（Electron版 + ローカルWeb版）。全フェーズ完了・v0.1.0 配布済みで、現在は保守・拡張フェーズ。

## Tech Stack

| レイヤー   | 技術                                                   |
| ---------- | ------------------------------------------------------ |
| Frontend   | React 19 + TypeScript 5 + Vite 6 (port 5173)           |
| Backend    | Express 4 + TypeScript 5 + tsx (port 3001)             |
| Desktop    | Electron ^40 + electron-vite ^5 + electron-builder ^26 |
| Shared     | `@app/shared` workspace package (`shared/types.ts`)    |
| Validation | zod                                                    |
| State      | React useState/useReducer のみ                         |
| Style      | CSS Modules                                            |
| Test       | Vitest（186テスト）                                    |

## Project Structure

```
client/          # React frontend (Vite)
server/          # Express backend
shared/          # @app/shared — 共有型定義
electron/        # Electron メインプロセス + preload
docs/            # 設計ドキュメント一覧
out/, release/   # ビルド出力（編集禁止・gitignore済み）
```

## Commands

```bash
npm run dev                # client(5173) + server(3001) 同時起動（Web版）
npm run build              # tsc -b 増分ビルド（全workspace）
npm test                   # Vitest 一括実行
npx vitest run <path>      # 単一テストファイル実行
npm run lint               # ESLint
npm run format             # Prettier
npm run electron:dev       # Electron 開発モード起動
npm run electron:package   # electron-vite build + .exe インストーラー生成
npm run electron:installer # electron-builder のみ実行（ビルド済みの場合）
```

## Architecture Decisions

- **previewToken方式**: `POST /api/preview` でサーバ保存 → UUID発行 → `POST /api/rename` は token のみ受付（single-use, TTL 5分）→ 改竄防止
- **2段階リネーム + ジャーナル**: original → `.__tmp_{opId}_{idx}` → final。phase遷移: pending → temp_done → completed（swap/cycle 対応）
- **排他制御**: ディレクトリ単位メモリmutex（canonical pathをキーに）
- **クロスプラットフォーム**: `process.platform` で実行時検出。パス変換は `server/src/utils/pathConverter.ts` に集約（Windows: そのまま、WSL: `/mnt/` 変換）
- **セキュリティ**: `validatePath()`（WSL: `/mnt/` 配下、Windows: ドライブ+UNC）、`validateFileName()`（禁則文字・traversal防止）、`isProtectedDirectory()`
- **エンジン2系統**: per-file `RuleProcessor` (Replace, Delimiter) + batch `BatchRuleProcessor` (Sequence)
- **起動時リカバリ**: 未完了ジャーナル → 自動ロールバック → 失敗時ディレクトリ隔離
- **Electron は Express 同梱方式**: main プロセスが `server/src/app.ts` を動的ポートで起動。データパスは `app.getPath('userData')/data` を外部注入

## Key References

詳細仕様は必要になった時点で読むこと（自動読み込みしない）:

- docs/01_requirements_01.md — 機能仕様・配布方式
- docs/02_architecture_01.md — API設計・データフロー・Electron構成
- docs/03_tech-stack_01.md — 技術選定・バージョン方針
- docs/04_implementation-plan_01.md — 実装タスク履歴（全フェーズ完了）
- docs/06_electron-plan.md — Electron化計画

## Workflow

1. 既存パターンに合わせてコードを書く
2. `npm run build` で型チェックを通す
3. `npm test` で確認する
4. 設計変更を伴う場合は docs/ の該当ドキュメントも更新する

## Rules

- **開発環境は Windows ネイティブ（PowerShell）**: パスは `C:\...` のまま使う。`/mnt/` 形式への手動変換はしない（変換はアプリが実行時に分岐）
- **Context7 自動利用**: コード生成・ライブラリドキュメントが必要な場合は `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` を使用
- **バージョン固定**: Vite@6, React^19, Express^4, Electron^40（@latest 禁止）
- **npm workspaces**: shared は `@app/shared` として import
- **TypeScript**: composite + references + `tsc -b` 増分ビルド

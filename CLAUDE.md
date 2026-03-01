# File Renamer

Windowsフォルダ内のファイル名を一括変更するローカルWebアプリ（WSL2環境）。

## Tech Stack

| レイヤー   | 技術                                                |
| ---------- | --------------------------------------------------- |
| Frontend   | React 19 + TypeScript 5 + Vite 6 (port 5173)        |
| Backend    | Express 4 + TypeScript 5 + tsx (port 3001)          |
| Shared     | `@app/shared` workspace package (`shared/types.ts`) |
| Validation | zod                                                 |
| State      | React useState/useReducer のみ                      |
| Style      | CSS Modules                                         |
| Test       | Vitest                                              |

## Project Structure

```
client/          # React frontend (Vite)
server/          # Express backend
shared/          # @app/shared — 共有型定義
electron/        # Electron メインプロセス + preload
docs/            # 設計ドキュメント一覧
```

## Commands

```bash
npm run dev              # client(5173) + server(3001) 同時起動（Web版）
npm run build            # tsc -b 増分ビルド（全workspace）
npm test                 # Vitest 実行
npm run electron:dev     # Electron 開発モード起動
npm run electron:build   # Electron ビルド（main/preload/renderer）
npm run electron:package # .exe インストーラー生成
npm run electron:installer # electron-builder のみ実行（ビルド済みの場合）
```

## Architecture Decisions

- **previewToken方式**: `POST /api/preview` でサーバ保存 → UUID発行 → `POST /api/rename` は token のみ受付（single-use, TTL 5分）
- **2段階リネーム + ジャーナル**: original → `.__tmp_{opId}_{idx}` → final。phase遷移: pending → temp_done → completed
- **排他制御**: ディレクトリ単位メモリmutex（canonical pathをキーに）
- **セキュリティ**: `validatePath()`（`/mnt/` 配下のみ）、`validateFileName()`（禁則文字・traversal防止）、`isProtectedDirectory()`
- **エンジン2系統**: per-file `RuleProcessor` (Replace, Delimiter) + batch `BatchRuleProcessor` (Sequence)
- **起動時リカバリ**: 未完了ジャーナル → 自動ロールバック → 失敗時ディレクトリ隔離

## Key References

詳細な仕様・設計は以下を参照:

- @docs/04_implementation-plan_01.md — タスク一覧・実装順序
- @docs/01_requirements_01.md — 機能仕様
- @docs/02_architecture_01.md — API設計・データフロー
- @docs/03_tech-stack_01.md — 技術選定詳細

## Workflow

1. 実装前に対象フェーズのタスクを実装計画書で確認する
2. 既存パターンに合わせてコードを書く
3. `npm run build` で型チェックを通す
4. テストがあれば `npm test` で確認する

## Rules

- **Windowsパス変換**: `C:\Users\...` → `/mnt/c/Users/...`（ドライブ文字小文字、`\` → `/`）
- **Context7 自動利用**: コード生成・ライブラリドキュメントが必要な場合は `mcp__context7__resolve-library-id` → `mcp__context7__query-docs` を使用
- **バージョン固定**: Vite@6, React^19, Express^4（@latest 禁止）
- **npm workspaces**: shared は `@app/shared` として import
- **TypeScript**: composite + references + `tsc -b` 増分ビルド

# Electron デスクトップアプリ化 引き継ぎプロンプト

> このドキュメントは、新しい Claude Code セッションが Electron 化の実装を即座に開始できるようにするための詳細な引き継ぎ資料です。
> **作成日: 2026-03-01**

---

## 1. 現在の状況

### Webアプリ版: 全Phase完了（実装済み・テスト済み）

| 項目 | 状態 |
|------|------|
| Phase 0〜4 | **全て完了** |
| テスト | **186件全パス**（13ファイル） |
| 型チェック | `npm run build`（`tsc -b`）エラーなし |
| リント | `npx eslint .` エラーなし |

### Electron化: 未着手

実装計画は **Codex MCP による4回のレビューを経て P0/P1 = 0 に到達済み**。計画に従って実装を開始する段階。

---

## 2. 必読ドキュメント

実装開始前に以下を**必ず読み込む**こと:

```
@CLAUDE.md                           # プロジェクトルール・コマンド・構成
@docs/06_electron-plan.md            # 【最重要】Electron化実装計画（コードサンプル付き）
```

必要に応じて参照:

```
@docs/05_handoff-prompt.md           # Webアプリ版の全体引き継ぎ（設計決定・テスト一覧等）
@docs/04_implementation-plan_01.md   # Webアプリ版の実装計画（全チェックボックス完了済み）
@docs/02_architecture_01.md          # API設計・データフロー
```

---

## 3. 実装計画の概要

### フェーズ構成（4段階）

| フェーズ | 名称 | 概要 | 状態 |
|---------|------|------|------|
| Phase E1 | Electron 基盤構築 | electron-vite セットアップ、メインプロセス、BrowserWindow | 未着手 |
| Phase E2 | Express 統合 | メインプロセスで Express を起動、レンダラから API 通信 | 未着手 |
| Phase E3 | パッケージング | electron-builder で .exe インストーラー生成 | 未着手 |
| Phase E4 | 仕上げ（任意） | アプリメニュー、ネイティブダイアログ、自動更新基盤 | 未着手 |

依存関係: `E1 → E2 → E3 → E4`（E4 は個別タスク単位で独立実施可能）

### 技術選定（確定済み）

| 項目 | 選定 | バージョン |
|------|------|-----------|
| Electron | `electron` | ^40.x（現行安定版、EOL: 2026-06-30） |
| ビルドツール | `electron-vite` | ^5.x |
| パッケージング | `electron-builder` | ^26.x |
| ヘルパー | `@electron-toolkit/utils` | ^4.x |

---

## 4. アーキテクチャの核心（レビューで確定した設計判断）

以下は Codex MCP レビューで指摘・修正を経て確定した重要な設計判断。**変更しないこと**。

### 4.1 Express 同梱パターン

```
Electron メインプロセス (electron/main.ts)
  ├─ Express server (動的ポート) ← server/src/app.ts を @app/server/app 経由で import
  ├─ Preload script (electron/preload.ts) ← contextBridge でポート伝達
  └─ BrowserWindow → React UI (electron-vite でビルド)
```

### 4.2 サーバーブートストラップの分離（P0修正）

**現状**: `server/src/index.ts` は import するだけで `startup()` が実行される（副作用あり）。

**対策**: 新規に `server/src/app.ts` を作成し、純粋なサーバー構築ロジックを分離する。

- `server/src/app.ts` — `createExpressApp(options)` + `startServer(app, options)` をエクスポート（副作用なし）
- `server/src/index.ts` — CLI エントリーポイントに縮小（`app.ts` を import して呼ぶだけ）
- Electron からは `@app/server/app` 経由で import（プロジェクト境界問題を回避）

### 4.3 データディレクトリの外部注入（P0修正）

- **server コードは `electron` パッケージに一切依存しない**（`import { app } from 'electron'` 禁止）
- `ServerOptions.dataDir` として外部から注入
- `configureDataDirs(dataDir?)` 関数を起動時に一度呼び、`journalService` と `presetService` に伝搬
- Electron: `app.getPath('userData')` → `dataDir` に注入
- Web 版: `dataDir` 省略でデフォルト `server/data/` を使用

### 4.4 動的ポートと IPC（P0修正）

- ポート `0` で OS 自動割り当て → `server.address().port` で実ポート取得
- `ipcMain.handle('get-server-port')` → preload → `window.electronAPI.getServerPort()`
- API ベースURL 初期化は React マウント前（`main.tsx`）で実行（レース条件回避）

### 4.5 ネットワークセキュリティ（P0修正）

- 全ホストを `127.0.0.1` に統一（`localhost` は `::1` 解決リスクあり）
- Electron 開発時: `enableCors: true` + `corsOrigin: process.env['ELECTRON_RENDERER_URL']`
- Electron 本番時: `enableCors: false`（file:// プロトコル）
- Web 版: `enableCors: true`（Vite プロキシ経由）

### 4.6 TypeScript プロジェクト境界（P1修正）

- `server/package.json` の `exports` に `"./app": "./src/app.ts"` を追加
- `electron/main.ts` では `import { createExpressApp, startServer } from '@app/server/app'` とする
- `electron/tsconfig.json` の `references` に `shared` と `server` を含める

### 4.7 ワークスペースの externalize（P1修正）

- `externalizeDepsPlugin({ exclude: ['@app/shared', '@app/server'] })` で内部ワークスペースをバンドル対象に含める
- デフォルトだと npm workspaces の symlink が external 扱いされてパッケージ版で解決失敗する

### 4.8 シングルインスタンスロック（P2修正）

- `app.requestSingleInstanceLock()` で多重起動を防止
- 2つ目のインスタンスは既存ウィンドウをフォーカスして終了

### 4.9 起動エラーハンドリング（P1修正）

- `app.whenReady()` 内を `try/catch` で囲む
- 失敗時: `dialog.showErrorBox()` でユーザーにエラー表示 → `app.quit()`

### 4.10 グレースフルシャットダウン（P1修正）

- `app.on('before-quit', () => { httpServer?.close(); })`

---

## 5. 変更が必要なファイル一覧

### 新規作成

| ファイル | 概要 |
|---------|------|
| `electron/main.ts` | Electron メインプロセス（Express 起動 + BrowserWindow） |
| `electron/preload.ts` | contextBridge（ポート伝達） |
| `electron/tsconfig.json` | TypeScript 設定 |
| `electron.vite.config.ts` | electron-vite 設定（main/preload/renderer） |
| `server/src/app.ts` | Express 構築 + startServer（副作用なし） |
| `client/src/types/electron.d.ts` | `window.electronAPI` 型定義 |
| `resources/icon.ico` | アプリアイコン（仮でOK） |
| `resources/icon.png` | アプリアイコン PNG 版 |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `server/src/index.ts` | CLI エントリーポイントに縮小（`app.ts` を呼ぶだけ） |
| `server/package.json` | `exports` に `"./app": "./src/app.ts"` 追加 |
| `client/src/services/api.ts` | `apiBaseUrl` 環境分岐追加、全 `fetch` にプレフィックス追加 |
| `client/src/main.tsx` | `initApiBaseUrl()` を React マウント前に呼ぶ |
| ルート `package.json` | devDependencies + scripts + main + build 設定追加 |
| ルート `tsconfig.json` | references に `./electron` 追加 |
| `.gitignore` | `out/`, `release/` 追加 |

### 変更なし

- `shared/` — 変更不要
- `client/src/components/` — 変更不要
- `client/src/hooks/` — 変更不要
- `server/src/engine/` — 変更不要
- `server/src/routes/` — 変更不要
- `server/src/utils/` — 変更不要
- テストファイル — 変更不要（186テスト維持）

---

## 6. 実装順序ガイド

### Phase E1 から始める

1. **E1.1**: `electron`, `electron-vite`, `@electron-toolkit/utils` を devDependencies に追加して `npm install`
2. **E1.2**: `electron.vite.config.ts` を作成（計画書のコードサンプルに従う）
3. **E1.3**: `electron/main.ts` を作成（Phase E1 段階では Express 統合なし、BrowserWindow のみ）
4. **E1.4**: `electron/preload.ts` を作成（最小限）
5. **E1.5**: TypeScript 設定調整（`electron/tsconfig.json` 作成、ルート `tsconfig.json` に references 追加、`server/package.json` に exports 追加）
6. **E1.6**: `package.json` に `electron:dev`, `electron:build` スクリプト + `"main"` 追加
7. **E1.7**: 動作確認（`npm run electron:dev`, `npm run dev`, `npm run build`, `npm test`）

### Phase E2 へ進む

1. **E2.1**: `server/src/app.ts` を新規作成、`server/src/index.ts` を縮小（**最も重要な変更**）
2. **E2.2**: `electron/main.ts` に Express 起動を統合
3. **E2.3**: `electron/preload.ts` に IPC ポート伝達を追加
4. **E2.4**: `client/src/services/api.ts` に `apiBaseUrl` 分岐を追加
5. **E2.5**: `client/src/main.tsx` で `initApiBaseUrl()` を呼ぶ
6. **E2.6**: CORS 設定の確認
7. **E2.7**: 全機能の動作確認

### 各Phase完了時の確認事項

- `npm run electron:dev` で Electron が起動する
- `npm run dev` で Web 版が引き続き動作する
- `npm run build` でエラーなし
- `npm test` で 186 テスト全パス

---

## 7. 注意事項・よくある落とし穴

### server/src/app.ts の分離

`server/src/index.ts` の現在のコードをよく読み、以下を分離すること:

- Express app の構築（ミドルウェア、ルーター登録、エラーハンドリング）→ `app.ts`
- データディレクトリの初期化 → `app.ts` の `startServer()` 内
- 起動時リカバリ（`recoverIncompleteJournals`）→ `app.ts` の `startServer()` 内
- `app.listen()` の呼び出し → `app.ts` の `startServer()` 内

`index.ts` に残すもの:

- `app.ts` の import
- `createExpressApp()` + `startServer()` の呼び出し
- `process.exit(1)` のエラーハンドリング

### journalService / presetService のデータパス

現在これらのサービスはファイルパスがハードコードされている可能性がある。`configureDataDirs(dataDir?)` 関数を作成し、起動時に一度呼ぶことで全サービスのベースパスを設定する仕組みにする。

### client/src/services/api.ts の変更

現在の `fetch('/api/...')` を `fetch(`${apiBaseUrl}/api/...`)` に変更する。`apiBaseUrl` は:
- Web 版: `''`（空文字 = 相対URL、Vite プロキシ経由）
- Electron: `http://127.0.0.1:${port}`

### Vite proxy の target

`client/vite.config.ts` の proxy target を `http://127.0.0.1:3001` に統一する（`localhost` は使わない）。

---

## 8. 確認コマンド

```bash
# 型チェック
npm run build

# テスト（186件全パス を維持すること）
npm test

# Web版動作確認
npm run dev

# Electron版動作確認（E1完了後から使用可能）
npm run electron:dev

# パッケージング（E3完了後から使用可能）
npm run electron:package
```

---

## 9. 計画書のコードサンプル

`docs/06_electron-plan.md` には以下の完全なコードサンプルが含まれている:

- `electron.vite.config.ts` — electron-vite 設定
- `electron/main.ts` — メインプロセス（Phase E1 版 + Phase E2 拡張版）
- `electron/preload.ts` — プリロードスクリプト
- `server/src/app.ts` — Express 構築モジュール（新規）
- `server/src/index.ts` — CLI エントリーポイント（縮小版）
- `client/src/services/api.ts` — API ベースURL 分岐
- `client/src/main.tsx` — ブートストラップ変更
- `client/src/types/electron.d.ts` — 型定義
- `package.json` の `build` 設定（electron-builder）

**これらのコードサンプルは Codex MCP レビュー4回を経て修正済み**。基本的にこのサンプルに従って実装すること。

---

## 10. レビュー履歴サマリー

計画書は4回のレビューを経て以下の問題を全て解決済み:

| レビュー | P0 | P1 | P2 |
|---------|----|----|-----|
| 第1回 | 5 | 3 | 5 |
| 第2回 | 0 | 2 | 2 |
| 第3回 | 0 | 2 | 1 |
| 第4回 | 0 | 0 | 0 |

主な修正カテゴリ:
- **副作用分離**: import で Express 二重起動する問題 → app.ts 分離
- **ポート管理**: OS 割り当てポートの正確な取得
- **セキュリティ**: 127.0.0.1 バインド、CORS 制御、sandbox: true
- **Electron 非依存**: server コードに electron import を入れない
- **TypeScript 境界**: パッケージ exports 経由の import
- **ワークスペース**: 内部パッケージの externalize 除外
- **エラーハンドリング**: 起動失敗時の dialog + quit
- **多重起動防止**: シングルインスタンスロック

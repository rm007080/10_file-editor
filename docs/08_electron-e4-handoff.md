# Electron Phase E4（仕上げ）引き継ぎプロンプト

> このドキュメントは、新しい Claude Code セッションが Phase E4 の実装を即座に開始できるようにするための引き継ぎ資料です。
> **作成日: 2026-03-01**

---

## 1. 現在の状況

### Electron化: Phase E1〜E3 完了

| フェーズ | 名称 | 状態 |
|---------|------|------|
| Phase E1 | Electron 基盤構築 | **完了** |
| Phase E2 | Express 統合 | **完了** |
| Phase E3 | パッケージング | **完了**（NSIS インストーラー生成済み: `release/File Renamer Setup 0.1.0.exe` 93MB） |
| Phase E4 | 仕上げ | **完了**（メニュー、ネイティブダイアログ、README/CLAUDE.md 更新済み） |
| 配布整備 | README 配布手順 | **完了**（SmartScreen 回避手順、2段階ビルドワークフロー記載済み） |

### 確認済み事項

| 項目 | 状態 |
|------|------|
| `npm run build`（tsc -b） | エラーなし |
| `npm test` | **186件全パス**（13ファイル） |
| `npm run electron:build` | main/preload/renderer 正常出力 |
| `npm run electron:package` | `release/File Renamer Setup 0.1.0.exe` 生成成功 |
| Web版 `npm run dev` | 引き続き動作（デュアルモード維持） |

### パッケージング前提条件（判明事項）

| 条件 | 詳細 |
|------|------|
| Windows 開発者モード | winCodeSign の 7z 展開時にシンボリックリンク作成が必要 |
| `npmRebuild: false` | ネイティブモジュール不使用、npm workspaces シンボリンク EACCES 回避 |
| PowerShell 実行推奨 | WSL Wine は不安定。WSL `electron:build` → PowerShell `electron:installer` の2段階方式 |

---

## 2. 必読ドキュメント

```
@CLAUDE.md                           # プロジェクトルール・コマンド・構成
@docs/06_electron-plan.md            # Electron化実装計画（Phase E4 タスク詳細）
```

必要に応じて参照:
```
@docs/07_electron-handoff.md         # 初期引き継ぎ（設計判断の背景）
@docs/05_handoff-prompt.md           # Webアプリ版の全体引き継ぎ
```

---

## 3. Phase E1〜E3 で実施した全変更

### 新規作成ファイル

| ファイル | 概要 |
|---------|------|
| `electron/main.ts` | Electron メインプロセス（Express起動 + BrowserWindow + IPC + シングルインスタンスロック + グレースフルシャットダウン） |
| `electron/preload.ts` | contextBridge（isElectron + getServerPort IPC伝達） |
| `electron/tsconfig.json` | TypeScript設定（composite, references: shared + server） |
| `electron.vite.config.ts` | electron-vite設定（main/preload/renderer統合ビルド） |
| `server/src/app.ts` | Express構築モジュール（createExpressApp + startServer + configureDataDirs、副作用なし） |
| `client/src/types/electron.d.ts` | `window.electronAPI` 型定義 |
| `resources/icon.ico` | 仮アイコン（256x256、後で差し替え可能） |
| `resources/icon.png` | 仮アイコン PNG版 |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `server/src/index.ts` | CLI エントリーポイントに縮小（app.ts を import して呼ぶだけ） |
| `server/src/services/presetService.ts` | `PRESETS_DIR` を `let` に変更、`setPresetsDirectory()` エクスポート追加 |
| `server/package.json` | `exports` に `"./app": "./src/app.ts"` 追加 |
| `client/src/services/api.ts` | `initApiBaseUrl()` 追加、全 fetch に `${apiBaseUrl}` プレフィックス追加 |
| `client/src/main.tsx` | `bootstrap()` 関数で `initApiBaseUrl()` を await してから React マウント |
| `client/vite.config.ts` | proxy target を `http://127.0.0.1:3001` に変更 |
| `package.json` | `main`, `description`, `author`, `devDependencies`(electron,electron-vite,electron-builder,@electron-toolkit/utils), `scripts`(electron:*,electron:installer), `build`(electron-builder設定,npmRebuild:false) 追加 |
| `tsconfig.json` | `references` に `{ "path": "./electron" }` 追加 |
| `.gitignore` | `out/`, `release/` 追加 |

### 変更なし

- `shared/` — 完全に無変更
- `client/src/components/` — 完全に無変更
- `client/src/hooks/` — 完全に無変更
- `server/src/engine/` — 完全に無変更
- `server/src/routes/` — 完全に無変更
- `server/src/utils/` — 完全に無変更
- テストファイル — 完全に無変更（186テスト維持）

---

## 4. 実装済みアーキテクチャの要点

### Express 同梱パターン

```
Electron メインプロセス (electron/main.ts)
  ├─ Express server (動的ポート0 → OS自動割り当て)
  │   └─ createExpressApp() + startServer() from @app/server/app
  ├─ Preload script (electron/preload.ts)
  │   └─ contextBridge: isElectron + getServerPort (IPC)
  └─ BrowserWindow → React UI (electron-vite ビルド)
```

### データパスの外部注入

- **Electron**: `app.getPath('userData') + '/data'` → `configureDataDirs(dataDir)` で journalService / presetService に伝搬
- **Web版**: `dataDir` 省略 → デフォルト `server/data/` を使用
- server コードは Electron に一切依存しない

### ポート伝達フロー

1. `electron/main.ts`: `startServer(app, { port: 0 })` → OS割り当てポート取得
2. `ipcMain.handle('get-server-port', () => serverPort)`
3. `electron/preload.ts`: `contextBridge` で `getServerPort()` を公開
4. `client/src/main.tsx`: `initApiBaseUrl()` を React マウント前に await
5. `client/src/services/api.ts`: `apiBaseUrl = http://127.0.0.1:${port}`

### CORS 制御

- **Electron 開発時**: `enableCors: true`, `corsOrigin: process.env['ELECTRON_RENDERER_URL']`
- **Electron 本番時**: `enableCors: false`（file:// プロトコル）
- **Web版**: `enableCors: true`（Vite プロキシ経由）

### electron-vite ビルド出力

```
out/
├── main/index.js         ← ESM、@app/shared と @app/server をバンドル
├── preload/index.mjs     ← ESM
└── renderer/
    ├── index.html
    └── assets/            ← CSS + JS
```

**重要**: main の出力拡張子は `.js`（`.mjs` ではない）。`package.json` の `"main": "./out/main/index.js"` に合わせている。

---

## 5. 実装時の注意点（過去セッションで判明）

### electron-vite v5 のエントリーポイント

`electron.vite.config.ts` の main/preload で `rollupOptions.input` にエントリーポイントを明示指定する必要がある。省略すると `An entry point is required` エラーが発生する。

```ts
main: {
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'electron/main.ts'),
      },
    },
  },
},
```

### renderer の outDir

`root: './client'` 設定時、`outDir` を省略すると electron-vite のデフォルト（`out/renderer`）が使われる。`outDir: '../out/renderer'` を明示するとパス解決で意図しない位置に出力される場合がある。

### presetService のデータパス

`presetService.ts` の `PRESETS_DIR` は元々 `const` だったが、外部注入のために `let` に変更し `setPresetsDirectory()` をエクスポートした。`journalService.ts` は既に `_setUndoDirectoryForTest()` があったのでそれを `configureDataDirs()` 経由で呼んでいる。

---

## 6. 残タスク

### 動作確認（Windows 環境で手動テスト要）
- [ ] 生成された `release/File Renamer Setup 0.1.0.exe` をインストール → アプリ起動
- [ ] パッケージ版で全機能が動作（ファイル一覧/リネーム/Undo/プリセット）
- [ ] ユーザーデータ（`%APPDATA%/File Renamer/data/`）が正しく作成される

### 将来対応（任意）
- [ ] アプリアイコンの正式版（現在は仮アイコン）
- [ ] `electron-updater` による自動更新基盤

---

## 7. 確認コマンド

```bash
# 型チェック
npm run build

# テスト（186件全パスを維持）
npm test

# Web版動作確認
npm run dev

# Electron版動作確認
npm run electron:dev

# Electron ビルド（バンドル生成）
npm run electron:build

# パッケージング（Windows インストーラー生成）
npm run electron:package

# 2段階ビルド（WSL推奨）
npm run electron:build        # WSL で実行
# PowerShell で:
npm run electron:installer    # electron-builder のみ

# 展開形式（デバッグ用）
npm run electron:package:dir
```

---

## 8. ファイル構成（Phase E3 完了時点）

```
10_file-editor/
├── electron/                  # Electron メインプロセス
│   ├── main.ts                # アプリ起動 + Express 起動 + BrowserWindow + IPC
│   ├── preload.ts             # contextBridge（isElectron + getServerPort）
│   └── tsconfig.json          # TypeScript 設定
├── client/                    # React フロントエンド
│   ├── src/
│   │   ├── services/api.ts    # apiBaseUrl 環境分岐済み
│   │   ├── main.tsx           # bootstrap() で initApiBaseUrl() を await
│   │   └── types/electron.d.ts # window.electronAPI 型定義
│   ├── vite.config.ts         # proxy target: 127.0.0.1:3001
│   └── ...
├── server/                    # Express バックエンド
│   ├── src/
│   │   ├── app.ts             # createExpressApp + startServer + configureDataDirs
│   │   ├── index.ts           # CLI エントリーポイント（app.ts を呼ぶだけ）
│   │   └── services/
│   │       ├── journalService.ts  # _setUndoDirectoryForTest (データパス注入)
│   │       └── presetService.ts   # setPresetsDirectory (データパス注入)
│   └── package.json           # exports: { "./app": "./src/app.ts" }
├── shared/                    # 変更なし
├── resources/                 # アプリリソース
│   ├── icon.ico               # 仮アイコン
│   └── icon.png               # 仮アイコン PNG
├── electron.vite.config.ts    # electron-vite 設定
├── package.json               # Electron scripts/deps/build 設定済み
├── tsconfig.json              # references に electron 追加済み
├── .gitignore                 # out/, release/ 追加済み
└── ...
```

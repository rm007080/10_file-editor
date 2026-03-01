# Electron デスクトップアプリ化 実装計画書

> 関連ドキュメント: [引き継ぎプロンプト](./05_handoff-prompt.md) | [アーキテクチャ設計書](./02_architecture_01.md) | [技術スタック](./03_tech-stack_01.md)
> **作成日: 2026-03-01**

---

## 1. 概要

Webアプリ版 File Renamer（全Phase 0〜4 完了、186テスト全パス）を Electron でデスクトップアプリ化する。
既存の server/, client/, shared/ のコードは**原則無変更**で、Electron ラッパーを追加する方針。

### 方式: Express 同梱 + electron-vite

```
Electron メインプロセス (electron/main.ts)
  ├─ Express server (動的ポート) ← 既存 server/ コードを import
  ├─ Preload script (electron/preload.ts) ← 最小限
  └─ BrowserWindow → React UI (electron-vite でビルド)
```

### 技術選定

| 項目 | 選定 | 理由 |
|------|------|------|
| ビルドツール | **electron-vite** (^5.x) | 既存 Vite 設定を流用可能、main/preload/renderer の統合ビルド |
| パッケージング | **electron-builder** (^26.x) | NSIS (.exe) インストーラー生成、実績豊富 |
| Electron | **^40.x** (現行安定版) | ESM ネイティブ対応、Node.js 24.x 内蔵、サポート期間内（EOL: 2026-06-30） |

### 変更量サマリー

| カテゴリ | 変更量 | 内容 |
|---------|--------|------|
| 新規作成 | 小 | `electron/main.ts`, `electron/preload.ts`, `electron.vite.config.ts` |
| 設定変更 | 小 | ルート `package.json`, ルート `tsconfig.json` |
| server/ | 小 | `server/src/app.ts` にサーバー構築を分離、`index.ts` は CLI エントリーのみ。データパスの外部注入対応 |
| client/ | 極小 | API ベース URL の環境分岐（1箇所）、React マウント前の初期化 |
| shared/ | なし | 変更不要 |
| テスト | なし | 既存186テストは全て維持 |

---

## 2. フェーズ構成

| フェーズ | 名称 | 概要 |
|---------|------|------|
| Phase E1 | Electron 基盤構築 | electron-vite セットアップ、メインプロセス、BrowserWindow |
| Phase E2 | Express 統合 | メインプロセスで Express を起動、レンダラから API 通信 |
| Phase E3 | パッケージング | electron-builder で .exe インストーラー生成 |
| Phase E4 | 仕上げ | アプリアイコン、メニュー、自動更新基盤（任意） |

---

## Phase E1: Electron 基盤構築

> **目標**: `npm run electron:dev` で Electron ウィンドウが起動し、React UI が表示される状態にする。

### E1.1 依存関係のインストール

- [x] ルート `package.json` に devDependencies を追加:
  - `electron` (^40.x) — 現行安定版（EOL: 2026-06-30）
  - `electron-vite` (^5.x) — 現行メジャー
  - `@electron-toolkit/utils` (^4.x) — Electron ヘルパーユーティリティ
- [x] `npm install` で依存関係を解決

### E1.2 electron-vite 設定ファイル作成

- [x] ルートに `electron.vite.config.ts` を作成
  - `main`: エントリー `electron/main.ts`、出力先 `out/main`、ESM 形式
  - `preload`: エントリー `electron/preload.ts`、出力先 `out/preload`、ESM 形式
  - `renderer`: 既存 `client/` を指定、React プラグイン、出力先 `out/renderer`
  - `resolve.alias`: `@app/shared` のパス解決

```ts
// electron.vite.config.ts のイメージ
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [
      // 内部ワークスペース（@app/shared, @app/server）はバンドルに含める
      // node_modules の外部依存（express, cors, zod 等）のみ external 化
      externalizeDepsPlugin({ exclude: ['@app/shared', '@app/server'] }),
    ],
    build: {
      rollupOptions: {
        output: { format: 'es' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: 'es' },
      },
    },
  },
  renderer: {
    root: './client',
    plugins: [react()],
    build: {
      outDir: '../out/renderer',
      rollupOptions: {
        input: './client/index.html',
      },
    },
  },
});
```

> **P1修正**: `externalizeDepsPlugin` はデフォルトで全 `node_modules` を external 化するが、npm workspaces の内部パッケージ（`@app/shared`, `@app/server`）も `node_modules` に symlink されるため、除外指定しないとパッケージ版でモジュール解決に失敗する。`exclude` で内部ワークスペースをバンドル対象に含める。

### E1.3 メインプロセス作成

- [x] `electron/main.ts` を作成
  - **シングルインスタンスロック**: `app.requestSingleInstanceLock()` で多重起動を防止。2つ目のインスタンスは既存ウィンドウをフォーカスして終了
  - `app.whenReady()` で `BrowserWindow` を作成（`try/catch` で起動エラーをハンドリング）
  - 起動失敗時: `dialog.showErrorBox()` でエラー表示後に `app.quit()`
  - 開発時: `process.env['ELECTRON_RENDERER_URL']` をロード
  - 本番時: `out/renderer/index.html` をロード
  - ウィンドウサイズ: `1200 x 800`（最小 `800 x 600`）
  - `webPreferences.preload` でプリロードスクリプトを指定
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`（セキュリティ）
  - macOS の `activate` イベント対応
  - `window-all-closed` で `app.quit()`

```ts
// electron/main.ts のイメージ
import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';

// シングルインスタンスロック（多重起動防止）
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 既存ウィンドウをフォーカス
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // レンダラの完全サンドボックス化（Express はメインプロセスで動作するため不要）
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // electron-vite が設定する環境変数でパスを解決
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  try {
    // Express サーバー起動は Phase E2 で追加
    createWindow();
  } catch (err) {
    // 起動失敗時はユーザーにエラーを表示して終了
    dialog.showErrorBox(
      'File Renamer - 起動エラー',
      `アプリケーションの起動に失敗しました。\n\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

// macOS: ウィンドウが全て閉じてもアプリは終了しない（Dock クリックで再作成）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

> **注意**: `__dirname` は electron-vite がビルド時に解決する。出力パスは `out/main/`, `out/preload/`, `out/renderer/` に統一され、相対パスは electron-vite の規約に従う。

### E1.4 プリロードスクリプト作成

- [x] `electron/preload.ts` を作成（最小限）
  - `contextBridge.exposeInMainWorld` で API サーバーポートを公開（Phase E2 で使用）
  - Phase E1 時点では空に近い内容

```ts
// electron/preload.ts のイメージ
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
});
```

### E1.5 TypeScript 設定調整（P1修正: プロジェクト境界問題の回避）

**問題**: `electron/tsconfig.json` を `composite` にして `../server/src/app.ts` を直接 import すると、`tsc -b` でプロジェクト境界違反エラーが発生する。

**対策**: `server/package.json` の `exports` に `app.ts` を追加し、パッケージ経由で import する。

- [x] `server/package.json` の `exports` に追加:
  ```json
  {
    "exports": {
      ".": "./src/index.ts",
      "./app": "./src/app.ts"
    }
  }
  ```
- [x] `electron/main.ts` の import を変更:
  ```ts
  import { createExpressApp, startServer } from '@app/server/app';
  ```
- [x] `electron/tsconfig.json` を作成
  - `extends: ../tsconfig.base.json`
  - `composite: true`
  - `include: ["."]`
  - `references: [{ "path": "../shared" }, { "path": "../server" }]`
- [x] ルート `tsconfig.json` の `references` に `{ "path": "./electron" }` を追加

### E1.6 npm scripts 追加

- [x] ルート `package.json` に scripts を追加:
  - `"electron:dev": "electron-vite dev"` — Electron 開発モード起動
  - `"electron:build": "electron-vite build"` — Electron ビルド
  - `"electron:preview": "electron-vite preview"` — ビルド後プレビュー
- [x] `package.json` に `"main": "./out/main/index.js"` を追加（Electron エントリーポイント。electron-vite v5 の出力拡張子は `.js`）
- [x] 既存 `npm run dev`（Web版）は**そのまま維持**

### E1.7 動作確認

- [x] `npm run electron:dev` で Electron ウィンドウが起動する
- [x] React UI が BrowserWindow 内に表示される
- [x] 既存 `npm run dev`（Web版）が引き続き動作する
- [x] `npm run build`（tsc -b）がエラーなく成功する
- [x] `npm test` で既存186テストが全パスする

### Phase E1 完了条件

- [x] Electron ウィンドウが起動し React UI が表示される
- [x] 開発時 HMR が動作する
- [x] Web 版の `npm run dev` が引き続き動作する
- [x] TypeScript ビルド（`tsc -b`）がエラーなし
- [x] 既存テスト（186件）が全パス

---

## Phase E2: Express 統合

> **目標**: Electron メインプロセスで Express サーバーを起動し、レンダラの React UI から API 通信が動作する。

### E2.1 サーバーブートストラップの分離（P0修正: import時副作用の排除）

**問題**: 現在の `server/src/index.ts` は import するだけで `startup()` が実行される。Electron から import すると Express が二重起動してしまう。

**対策**: サーバー構築ロジックを `server/src/app.ts` に分離し、`index.ts` は CLI エントリーポイントのみとする。

- [x] `server/src/app.ts` を新規作成（純粋な Express app 構築 + startServer）
  - Express app の構築（ミドルウェア、ルーター登録、エラーハンドリング）
  - `createExpressApp(options?)` — Express app を構築して返す（副作用なし）
  - `startServer(app, options)` — listen + 初期化を実行して `{ port, server }` を返す
  - **データディレクトリパスを外部注入可能にする**（`options.dataDir?`）
- [x] `server/src/index.ts` を CLI エントリーポイントに縮小
  - `app.ts` を import して `startServer()` を呼ぶだけ
  - Web 版（`tsx watch server/src/index.ts`）は従来通り動作

```ts
// server/src/app.ts（新規）— 純粋なサーバー構築モジュール
import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
// ... 既存 import

export interface ServerOptions {
  dataDir?: string;         // データディレクトリ（Electron: userData, Web: server/data）
  host?: string;            // バインドホスト（デフォルト: '127.0.0.1'）
  port?: number;            // ポート（デフォルト: 3001、0 = OS自動割り当て）
  enableCors?: boolean;     // CORS有効化（デフォルト: true）
  corsOrigin?: string;      // CORS許可オリジン（指定時はそのオリジンのみ許可）
}

export function createExpressApp(options: ServerOptions = {}): express.Express {
  const app = express();
  if (options.enableCors !== false) {
    app.use(cors(options.corsOrigin ? { origin: options.corsOrigin } : undefined));
  }
  app.use(express.json());
  // ルーター登録...
  // エラーミドルウェア...
  return app;
}

export async function startServer(
  app: express.Express,
  options: ServerOptions = {},
): Promise<{ port: number; server: Server }> {
  // データディレクトリを全サービスに一括設定（起動時に一度だけ）
  // journalService, presetService の CRUD パスもこの設定に従う
  configureDataDirs(options.dataDir);

  // データディレクトリ初期化
  await ensureUndoDirectory();
  await ensurePresetsDirectory();
  await recoverIncompleteJournals();

  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 3001;

  return new Promise((resolve, reject) => {
    const server = app.listen(requestedPort, host, () => {
      const addr = server.address() as AddressInfo;
      console.log(`Server running on http://${host}:${addr.port}`);
      resolve({ port: addr.port, server });
    });
    server.once('error', reject);
  });
}
```

```ts
// server/src/index.ts（CLI エントリーポイントに縮小）
import { createExpressApp, startServer } from './app.js';

const app = createExpressApp({ enableCors: true });

startServer(app, {
  port: Number(process.env.PORT) || 3001,
  host: '127.0.0.1',
}).catch((err) => {
  console.error('[Startup] Fatal error:', err);
  process.exit(1);
});
```

> **重要**: `server/src/app.ts` は Electron に一切依存しない。`electron` パッケージの import は行わない。データディレクトリパスは `options.dataDir` として外部から注入される。

> **P2修正: dataDir 伝搬の設計**:
> `configureDataDirs(dataDir?)` 関数を追加し、起動時に一度呼ぶことで `journalService` と `presetService` が使うベースパスを設定する。`dataDir` 省略時はデフォルトの `server/data/` をフォールバックとして使用（Web 版互換）。この設定は内部的にモジュールレベル変数に保持され、各サービスの CRUD 操作で参照される。

### E2.2 メインプロセスで Express を起動（P0修正: ポート取得 + シャットダウン）

- [x] `electron/main.ts` を拡張
  - `app.whenReady()` 内で `createExpressApp()` + `startServer()` を呼び出す
  - ポート `0` で OS 自動割り当て → `server.address().port` で実際のポートを取得
  - `before-quit` イベントで `server.close()` を呼びグレースフルシャットダウン
  - データディレクトリは `app.getPath('userData')` から注入

```ts
// electron/main.ts の拡張イメージ（Phase E1 のコードに統合）
import { createExpressApp, startServer } from '@app/server/app';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import type { Server } from 'http';

let serverPort: number;
let httpServer: Server;

// シングルインスタンスロック（Phase E1 で追加済み）
// ...

app.whenReady().then(async () => {
  try {
    // データディレクトリ: ユーザーデータフォルダ配下
    const dataDir = path.join(app.getPath('userData'), 'data');

    // Express サーバーを構築・起動（ポート自動割り当て、127.0.0.1 にバインド）
    const isDev = !app.isPackaged;
    const expressApp = createExpressApp({
      enableCors: isDev,
      corsOrigin: isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined,
    });
    const result = await startServer(expressApp, {
      port: 0,
      host: '127.0.0.1',
      dataDir,
    });
    serverPort = result.port;
    httpServer = result.server;
    console.log(`Express server started on port ${serverPort}`);

    createWindow();
  } catch (err) {
    // 起動失敗時はユーザーにエラーを表示して終了
    dialog.showErrorBox(
      'File Renamer - 起動エラー',
      `サーバーの起動に失敗しました。\n\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

// グレースフルシャットダウン
app.on('before-quit', () => {
  httpServer?.close();
});

// IPC: レンダラにポート番号を提供
ipcMain.handle('get-server-port', () => serverPort);
```

> **修正ポイント**:
> - `server/src/app.ts` を import（副作用なし、二重起動を防止）
> - `server.address().port` で OS 割り当てポートを正確に取得
> - `server.once('error', reject)` で listen エラーをハンドリング
> - `127.0.0.1` に明示バインドし外部ネットワーク露出を防止
> - **開発時は CORS 有効**（Vite devserver オリジンのみ許可）、**本番時は CORS 無効**
> - `before-quit` でサーバーをグレースフルシャットダウン

### E2.3 レンダラへのポート伝達

- [x] `electron/preload.ts` を拡張
  - IPC 経由でメインプロセスからポート番号を取得
  - `contextBridge.exposeInMainWorld` で公開

```ts
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
});
```

```ts
// electron/main.ts に追加
import { ipcMain } from 'electron';
ipcMain.handle('get-server-port', () => serverPort);
```

### E2.4 client/src/services/api.ts の修正

- [x] API ベース URL の環境分岐を追加（**変更は1箇所のみ**）
  - Electron 内: `http://localhost:${port}` をプレフィックス
  - Web 版: 従来通り `/api/...`（Vite プロキシ経由）

```ts
// client/src/services/api.ts の変更イメージ
let apiBaseUrl = '';

export async function initApiBaseUrl(): Promise<void> {
  if (window.electronAPI?.isElectron) {
    const port = await window.electronAPI.getServerPort();
    apiBaseUrl = `http://127.0.0.1:${port}`;
  }
}

// 既存の fetch 呼び出しを apiBaseUrl + path に変更
// 例: fetch('/api/files?...') → fetch(`${apiBaseUrl}/api/files?...`)
```

- [x] `client/src/services/api.ts` 内の全 `fetch('/api/...')` を `fetch(`${apiBaseUrl}/api/...`)` に変更
- [x] Electron 用の型定義を追加（`window.electronAPI` の型）

```ts
// client/src/types/electron.d.ts
interface ElectronAPI {
  isElectron: boolean;
  getServerPort: () => Promise<number>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
```

### E2.5 App.tsx でのポート初期化（P1修正: レース条件回避）

**問題**: `useEffect` 内で `initApiBaseUrl()` を呼ぶと、初回レンダリング時の API 呼び出し（ファイル一覧取得等）とレース条件が発生する。

**対策**: React マウント前（`main.tsx` のブートストラップ段階）でポート初期化を完了させる。

- [x] `client/src/main.tsx` で `initApiBaseUrl()` を `await` してから `ReactDOM.createRoot` を呼ぶ

```tsx
// client/src/main.tsx の変更イメージ
import { initApiBaseUrl } from './services/api.js';

async function bootstrap() {
  await initApiBaseUrl(); // Electron 時はポート取得、Web 版は即座に resolve
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
```

### E2.6 CORS とネットワークセキュリティ

**対策**:
- [x] `startServer()` で `host: '127.0.0.1'` に明示バインド（Web版・Electron版共通）
- [x] `createExpressApp()` の `enableCors` / `corsOrigin` オプションで CORS を制御
  - **Electron 開発時** (`electron:dev`): `enableCors: true`, `corsOrigin: process.env['ELECTRON_RENDERER_URL']`（Vite devserver オリジンのみ許可。レンダラとExpressが別ポートのためクロスオリジン）
  - **Electron 本番時** (パッケージ版): `enableCors: false`（file:// プロトコル、CORS 不要）
  - **Web 版** (`npm run dev`): `enableCors: true`（Vite プロキシ経由、全オリジン許可で問題なし）
- [x] `server/src/index.ts`（CLIエントリー）でも `host: '127.0.0.1'` をデフォルトとする

> **P2修正**: ホスト名は全箇所で `127.0.0.1` に統一する（`localhost` は環境により `::1` に解決されるリスクあり）。Vite proxy の `target` も `http://127.0.0.1:3001` に変更する。

### E2.7 動作確認

- [x] `npm run electron:dev` で Electron アプリが起動する
- [x] ディレクトリパスを入力してファイル一覧が表示される
- [x] ルール設定 → プレビュー → リネーム実行が動作する
- [x] Undo が動作する
- [x] プリセットの保存/読み込みが動作する
- [x] 既存 `npm run dev`（Web版）が引き続き動作する
- [x] `npm test` で既存186テストが全パスする

### Phase E2 完了条件

- [x] Electron 内で Express サーバーが起動し、全 API が動作する
- [x] ファイル一覧 → プレビュー → リネーム → Undo の一連のフローが動作する
- [x] Web 版（`npm run dev`）が引き続き動作する（デュアルモード）
- [x] 既存テスト（186件）が全パス

---

## Phase E3: パッケージング

> **目標**: `npm run electron:package` で Windows 用 .exe インストーラーを生成する。

### E3.1 electron-builder のセットアップ

- [x] ルート `package.json` に devDependencies を追加:
  - `electron-builder` (^26.x)
- [x] ルート `package.json` に `build` 設定を追加:

```json
{
  "build": {
    "appId": "com.file-renamer.app",
    "productName": "File Renamer",
    "npmRebuild": false,
    "directories": {
      "output": "release"
    },
    "files": [
      "out/**/*",
      "package.json"
    ],
    "extraResources": [],
    "win": {
      "target": ["nsis"],
      "icon": "resources/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerLanguages": ["ja"],
      "language": "1041"
    }
  }
}
```

> **P2修正**: `files` glob を `out/**/*` + `package.json` に絞り込み。server/ のコードは electron-vite の main バンドルに含まれるため、ソースファイルの同梱は不要。`node_modules` は electron-builder が production dependencies を自動収集する。

> **実装時修正**: `"npmRebuild": false` を追加。本プロジェクトにはネイティブモジュールがなく、npm workspaces のシンボリンク構成で `@electron/rebuild` が EACCES エラーを起こすため無効化。

### E3.2 ビルドスクリプト追加

- [x] ルート `package.json` に scripts を追加:
  - `"electron:package": "electron-vite build && electron-builder --win"` — Windows 用パッケージ生成
  - `"electron:package:dir": "electron-vite build && electron-builder --win --dir"` — 展開形式（デバッグ用）
  - `"electron:installer": "electron-builder --win"` — ビルド済みの場合に electron-builder のみ実行（WSL/PowerShell 2段階ビルド用）

### E3.3 server/ の本番バンドル対応（P0修正: データパスの外部注入）

- [x] electron-vite の `main` 設定で server/ のコードをバンドルに含める
  - `externalizeDepsPlugin` で `express`, `cors`, `zod` 等を external 化
  - `node_modules` はパッケージに同梱
- [x] `server/data/` ディレクトリの実行時パスは **Phase E2.1 で設計済みの外部注入方式** を使用
  - Electron: `electron/main.ts` から `app.getPath('userData')` を注入
  - Web 版: `server/src/index.ts` でプロジェクト内 `server/data/` を使用
  - **server コードは Electron API に一切依存しない**（`import { app } from 'electron'` は禁止）

```ts
// electron/main.ts（Phase E2 で実装済み）
const dataDir = path.join(app.getPath('userData'), 'data');
const expressApp = createExpressApp({ enableCors: false });
await startServer(expressApp, { port: 0, host: '127.0.0.1', dataDir });

// server/src/index.ts（CLIエントリー）
const app = createExpressApp({ enableCors: true });
startServer(app, { port: 3001, host: '127.0.0.1' });
// dataDir 省略時はデフォルトの server/data/ を使用
```

> **P0修正ポイント**: server コード内で `import { app } from 'electron'` を行うと、Web 版で `electron` モジュールが見つからずクラッシュする。データパスは必ず外部注入する。`journalService.ts` と `presetService.ts` のデータパスも `ServerOptions.dataDir` 経由で設定する。

### E3.4 リソースファイル

- [x] `resources/` ディレクトリを作成
  - `icon.ico` — アプリアイコン（256x256）
  - `icon.png` — アプリアイコン（PNG版）
- [x] アイコンは仮のものでよい（後で差し替え可能）

### E3.5 .gitignore 更新

- [x] `.gitignore` に追加:
  - `out/` — electron-vite ビルド出力
  - `release/` — electron-builder 出力

### E3.6 パッケージング前提条件

`npm run electron:package` の実行には以下の条件が必要:

| 条件 | 詳細 |
|------|------|
| Windows 開発者モード | 設定 → プライバシーとセキュリティ → 開発者向け → 開発者モード ON（winCodeSign の 7z 展開時にシンボリックリンク作成が必要） |
| PowerShell 実行 | `electron-builder --win` は Windows ネイティブ環境で実行する必要がある（WSL では Wine + wine32 が必要だが安定しない） |
| 2段階ビルド（WSL） | WSL 環境では `npm run electron:build`（WSL）→ `npm run electron:installer`（PowerShell）の2段階方式を推奨 |

### E3.7 動作確認

- [x] `npm run electron:package:dir` で展開形式のビルドが成功する
- [ ] 生成された .exe を実行してアプリが起動する（Windows環境で要確認）
- [ ] パッケージ版で全機能が動作する（ファイル一覧/リネーム/Undo/プリセット）（Windows環境で要確認）
- [ ] `server/data/` がユーザーデータフォルダに正しく作成される（Windows環境で要確認）
- [x] `npm run electron:package` で NSIS インストーラーが生成される（`release/File Renamer Setup 0.1.0.exe`、93MB）

### Phase E3 完了条件

- [x] `.exe` インストーラーが生成される（`release/File Renamer Setup 0.1.0.exe` 生成確認済み）
- [ ] インストール → 起動 → 全機能動作が確認できる（Windows環境で要確認）
- [ ] ユーザーデータ（Undo ジャーナル、プリセット）がユーザーフォルダに保存される（Windows環境で要確認）
- [x] Web 版が引き続き動作する

---

## Phase E4: 仕上げ（任意）

> **目標**: デスクトップアプリとしての体験を向上させる。優先度に応じて取捨選択可能。

### E4.1 アプリケーションメニュー

- [x] カスタムメニューバーを作成（`Menu.buildFromTemplate`）
  - ファイル: 終了
  - 編集: 元に戻す（Ctrl+Z → Undo API 呼び出し）
  - 表示: 開発者ツール（開発ビルドのみ）
  - ヘルプ: バージョン情報

### E4.2 ネイティブダイアログ統合

- [x] ディレクトリ選択に `dialog.showOpenDialog` を使用（オプション）
  - preload 経由で IPC 公開
  - 既存のテキスト入力方式も維持（Web 版互換）

### E4.3 アプリアイコンの正式版

- [ ] デザイン済みアイコンを `resources/` に配置
  - `icon.ico` (Windows)
  - `icon.png` (一般)

### E4.4 自動更新基盤（将来対応）

- [ ] `electron-updater` の導入検討
  - GitHub Releases ベースの自動更新
  - 初回リリース後に優先度を判断

### E4.5 ドキュメント更新

- [x] `README.md` に Electron 版のセクションを追加
  - セットアップ手順
  - ビルド方法
  - 配布方法
- [ ] `docs/05_handoff-prompt.md` を更新
- [x] `CLAUDE.md` を更新（Electron 関連コマンド追加）

### Phase E4 完了条件

- [x] アプリケーションメニューが機能する
- [x] ドキュメントが更新されている

---

## 3. 依存関係

```
Phase E1 ──► Phase E2 ──► Phase E3 ──► Phase E4
 基盤構築     Express統合   パッケージング  仕上げ
```

- Phase E1 → E2 は厳密に順序依存
- Phase E3 は E2 完了後に実施
- Phase E4 は個別タスクを独立して実施可能

---

## 4. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| electron-vite と既存 Vite 設定の競合 | ビルドエラー | renderer 設定で既存 client/ を明示指定 |
| ESM + Electron の互換性問題 | 起動時エラー | electron-vite がビルド時に ESM/CJS を適切に処理。preload は `.mjs` 出力 |
| server/ の import 時副作用 | Express 二重起動 | `app.ts`（純粋構築）と `index.ts`（CLIエントリー）に分離 |
| server/ に Electron API 直接 import | Web 版クラッシュ | server は Electron 非依存。データパスは外部注入 |
| ポート 0 の実ポート取得失敗 | API 通信全断 | `server.address().port` で OS 割り当てポートを正確に取得 |
| Express のネットワーク露出 | 外部からの不正操作 | `127.0.0.1` に明示バインド（全箇所統一）。Electron 開発時は Vite オリジンのみ CORS 許可、本番時は CORS 無効 |
| Electron 開発時のクロスオリジン | API通信ブロック | `enableCors: true` + `corsOrigin` で Vite devserver オリジンのみ許可 |
| TypeScript プロジェクト境界違反 | `tsc -b` エラー | `@app/server/app` パッケージ export 経由で import |
| dataDir の実行時伝搬漏れ | Undo/プリセット保存失敗 | `configureDataDirs()` で起動時に全サービスへ一括設定 |
| パッケージサイズ肥大化 | 配布困難 | `externalizeDepsPlugin` + `files` glob を最小限に |
| データパスの差異（開発/本番） | データ消失 | `ServerOptions.dataDir` で外部注入、Electron は `app.getPath('userData')` |
| 既存テストへの影響 | テスト失敗 | server/ の変更はリファクタリングのみ、ロジック変更なし |
| API初期化のレース条件 | 初回API呼び出し失敗 | React マウント前（main.tsx）でポート初期化を完了 |
| メインプロセス起動失敗 | 白画面・無応答 | `try/catch` + `dialog.showErrorBox()` + `app.quit()` |
| ワークスペースの externalize | パッケージ版で起動失敗 | `externalizeDepsPlugin({ exclude: ['@app/shared', '@app/server'] })` |
| 多重インスタンス起動 | データ破損リスク | `app.requestSingleInstanceLock()` で防止 |

---

## 5. 最終成果物

| 成果物 | 形式 | 用途 |
|--------|------|------|
| Electron 開発環境 | `npm run electron:dev` | 開発者向け |
| Web 開発環境 | `npm run dev` | 開発者向け（従来通り） |
| Windows インストーラー | `release/File Renamer Setup 0.1.0.exe` (93MB) | エンドユーザー配布 |
| ポータブル版 | `release/win-unpacked/` | インストール不要版 |

---

## 6. npm scripts 一覧（最終形）

| スクリプト | コマンド | 説明 |
|-----------|---------|------|
| `dev` | `concurrently ...` | Web 版開発サーバー（従来通り） |
| `build` | `tsc -b` | TypeScript 型チェック |
| `test` | `vitest run` | テスト実行 |
| `electron:dev` | `electron-vite dev` | Electron 開発モード |
| `electron:build` | `electron-vite build` | Electron ビルド |
| `electron:package` | `electron-vite build && electron-builder --win` | インストーラー生成 |
| `electron:installer` | `electron-builder --win` | electron-builder のみ実行（ビルド済みの場合） |

---

## 7. ファイル構成（Phase E3 完了時）

```
10_file-editor/
├── electron/                  # 【新規】Electron メインプロセス
│   ├── main.ts                # アプリ起動 + Express 起動 + BrowserWindow
│   ├── preload.ts             # contextBridge（ポート伝達等）
│   └── tsconfig.json          # TypeScript 設定
├── client/                    # 【変更極小】React フロントエンド
│   ├── src/
│   │   ├── services/api.ts    # apiBaseUrl 環境分岐を追加
│   │   └── types/electron.d.ts # 【新規】window.electronAPI 型定義
│   └── ...
├── server/                    # 【変更極小】Express バックエンド
│   ├── src/
│   │   └── index.ts           # startServer() export 追加、データパス分岐
│   └── ...
├── shared/                    # 【変更なし】
├── resources/                 # 【新規】アプリリソース
│   ├── icon.ico
│   └── icon.png
├── electron.vite.config.ts    # 【新規】electron-vite 設定
├── out/                       # 【新規・gitignore】electron-vite 出力
├── release/                   # 【新規・gitignore】electron-builder 出力
├── package.json               # Electron 関連 scripts/deps/build 追加
├── tsconfig.json              # references に electron 追加
└── ...
```

---

## レビュー履歴

### 第1回 Codex MCP レビュー（2026-03-01）

**P0（重大）5件 → 全件修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | import 時副作用で Express 二重起動（`server/src/index.ts` を import すると自動起動） | `server/src/app.ts`（純粋構築）と `index.ts`（CLIエントリー）に分離 |
| 2 | `startServer(0)` が要求ポート `0` をそのまま返す。`Number(env)` が NaN になるリスク | `server.address().port` で実ポート取得、env パースを安全に |
| 3 | 出力パスの前提が electron-vite 実際の出力と不一致 | electron-vite 規約に従い `__dirname` + 相対パスで解決 |
| 4 | server コードに `import { app } from 'electron'` → Web 版で壊れる。journalService/presetService のデータパス未対応 | server を Electron 非依存に保持。`ServerOptions.dataDir` で外部注入 |
| 5 | Express の `listen()` ホスト未指定 + CORS 全許可 → LAN 露出 | `127.0.0.1` 明示バインド、Electron 時 CORS 無効化 |

**P1（高）3件 → 全件修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | `sandbox: false` は不要（Express はメインプロセスで動作） | `sandbox: true` に変更 |
| 2 | `startServer()` にエラーハンドリングとシャットダウンフックがない | `server.once('error', reject)` 追加、`before-quit` で `server.close()` |
| 3 | `initApiBaseUrl()` を `useEffect` で呼ぶとレース条件 | React マウント前（`main.tsx`）で初期化完了 |

**P2（中）5件 → 全件修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | Electron 34.x は EOL | ^40.x（現行安定版、EOL: 2026-06-30）に変更 |
| 2 | electron-vite ^3.x は旧バージョン | ^5.x（現行メジャー）に変更 |
| 3 | electron-builder の `files` glob が広すぎる | `out/**/*` + `package.json` に絞り込み |
| 4 | IPC チャンネルの sender 検証なし | 最小限の preload API + freeze で対応（Phase E4 で強化可能） |
| 5 | macOS `activate` イベント対応がコードサンプルに欠落 | `activate` ハンドラを追加 |

### 第2回 Codex MCP レビュー（2026-03-01）

**P0（重大）0件**

**P1（高）2件 → 全件修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | Electron 開発時（`electron:dev`）に `enableCors: false` だとレンダラ（Vite devserver オリジン）からのリクエストがクロスオリジンでブロックされる | 開発時は `enableCors: true` + `corsOrigin` で Vite オリジンのみ許可、本番時は `enableCors: false` |
| 2 | `electron/main.ts` が `../server/src/app.js` を直接 import すると `tsc -b` でプロジェクト境界違反 | `server/package.json` に `exports: { "./app": "./src/app.ts" }` を追加、`@app/server/app` 経由で import |

**P2（中）2件 → 全件修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | `dataDir` の実行時伝搬が不完全（journalService/presetService の CRUD パスが固定） | `configureDataDirs(dataDir)` を起動時に一度呼び、全サービスに一括設定 |
| 2 | `127.0.0.1` と `localhost` の混在（`localhost` が `::1` に解決されるリスク） | 全箇所で `127.0.0.1` に統一（apiBaseUrl、Vite proxy target 含む） |

### 第3回 Codex MCP レビュー（2026-03-01）

**P0（重大）0件**

**P1（高）2件 → 全件修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | メインプロセス起動失敗時のハンドリング欠如（`startServer()` 失敗で未処理 rejection） | `try/catch` で囲み、`dialog.showErrorBox()` でエラー表示後に `app.quit()` |
| 2 | `externalizeDepsPlugin` が `@app/server` を external 化 → パッケージ版でモジュール解決エラー | `exclude: ['@app/shared', '@app/server']` で内部ワークスペースをバンドル対象に |

**P2（中）1件 → 修正済み**

| # | 問題 | 対応 |
|---|------|------|
| 1 | シングルインスタンスロック未実装（多重起動でデータ破損リスク） | `app.requestSingleInstanceLock()` + `second-instance` ハンドリングを追加 |

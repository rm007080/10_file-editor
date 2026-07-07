# 配布整備 引き継ぎプロンプト

> **作成日: 2026-03-02**
> このドキュメントは、新しい Claude Code セッションが即座に作業を再開できるようにするための引き継ぎ資料です。

---

## 1. 現在の状況

### プロジェクト全体

| 項目 | 状態 |
|------|------|
| Web版（Phase 0〜4） | **完了**（186テスト全パス） |
| Electron化（Phase E1〜E4） | **完了** |
| .exe インストーラー生成 | **完了**（`release/File Renamer Setup 0.1.0.exe`, 93MB） |
| GitHub Release | **完了**（https://github.com/rm007080/10_file-editor/releases/tag/v0.1.0） |
| ドキュメント更新 | **完了**（4ドキュメント更新済み） |

### 確認済み事項

| 項目 | 状態 |
|------|------|
| `npm run build`（tsc -b） | エラーなし |
| `npm test` | 186件全パス |
| `npm run electron:dev` | 正常起動 |
| `npm run electron:package` | NSIS インストーラー生成成功（PowerShell） |
| Web版 `npm run dev` | 引き続き動作 |
| GitHub Release v0.1.0 | .exe アップロード済み |

### 未確認事項（Windows環境で手動テスト要）

- [ ] 生成された .exe をインストール → アプリ起動
- [ ] パッケージ版で全機能動作（ファイル一覧/リネーム/Undo/プリセット）
- [ ] ユーザーデータ（`%APPDATA%/File Renamer/data/`）が正しく作成される

---

## 2. 直前セッションで実施した作業

### GitHub Release 作成
- `gh release create v0.1.0` で v0.1.0 リリースを作成
- `File Renamer Setup 0.1.0.exe` をリリースアセットとしてアップロード
- リリースノート（インストール手順 + 主な機能一覧）を記載

### README.md 更新
- インストーラーの配布元を `release/` ローカルコピーから GitHub Releases URL に変更
- `https://github.com/rm007080/10_file-editor/releases/latest` へのリンク

### ドキュメント4ファイル更新（前セッションからの継続）

| ファイル | 更新内容 |
|---------|---------|
| `docs/06_electron-plan.md` | E3.1 に `npmRebuild: false` 追記、E3.2 に `electron:installer` スクリプト追加、E3.6 パッケージング前提条件セクション新設、npm scripts 一覧更新 |
| `docs/01_requirements_01.md` | セクション8「配布方式」新設（.exe/ポータブル/開発者の3方式）、セクション9 制約事項にインストーラー版・コード署名の記載追加 |
| `docs/02_architecture_01.md` | ディレクトリ構成に electron/resources 追加、セクション11「Electron デスクトップアプリ構成」新設 |
| `docs/03_tech-stack_01.md` | バージョン管理方針に Electron/electron-vite/electron-builder 追加、npm scripts 一覧に electron:* 追加、設定ファイル一覧更新 |
| `docs/08_electron-e4-handoff.md` | Phase E4 完了・配布整備完了に更新、パッケージング前提条件追加、残タスク整理 |

### 未コミットの変更

README.md の GitHub Releases URL 変更が未コミット。ユーザーが自分でコミット・プッシュする運用。

---

## 3. パッケージング・配布の技術詳細

### インストーラー生成の前提条件

| 条件 | 詳細 |
|------|------|
| Windows 開発者モード | 設定 → プライバシーとセキュリティ → 開発者向け → ON（winCodeSign 7z シンボリックリンク作成に必要） |
| `npmRebuild: false` | package.json の build 設定に追加済み。ネイティブモジュール不使用、npm workspaces シンボリンク EACCES 回避 |
| PowerShell 実行 | `electron-builder --win` は Windows ネイティブで実行。WSL Wine は不安定 |

### 2段階ビルドワークフロー（WSL環境）

```bash
# Step 1: WSL で electron-vite ビルド
npm run electron:build

# Step 2: PowerShell で electron-builder のみ実行
npm run electron:installer
```

### asar 内容（パッケージ版）

```
out/main/index.js       ← ESM、@app/shared と @app/server をバンドル済み
out/preload/index.cjs   ← CJS
out/renderer/           ← React ビルド成果物
package.json
```

- `node_modules` は electron-builder が production dependencies を自動収集
- ネイティブモジュールなし → `npmRebuild: false` で問題なし

### GitHub Release の管理

```bash
# 新しいバージョンをリリースする場合
# 1. package.json の version を更新
# 2. npm run electron:package（PowerShell）
# 3. gh release create vX.Y.Z "./release/File Renamer Setup X.Y.Z.exe" --title "..." --notes "..."
```

---

## 4. git 運用の注意点

- **ブランチ**: `master`（リモート `origin/master`）
- **git config**: ユーザーがローカルで手動設定する運用（`git config` の自動変更は拒否される）
- **コミット・プッシュ**: ユーザーが自分で実施する運用
- `.gitignore`: `out/` と `release/` は除外済み（ビルド成果物は GitHub Releases で配布）

---

## 5. 必読ドキュメント

```
@CLAUDE.md                           # プロジェクトルール・コマンド・構成
@README.md                           # 使い方・配布手順
@docs/06_electron-plan.md            # Electron化実装計画（全Phase完了）
@docs/08_electron-e4-handoff.md      # Electron 引き継ぎ（アーキテクチャ詳細）
```

必要に応じて参照:
```
@docs/01_requirements_01.md          # 要件定義（配布方式セクション追加済み）
@docs/02_architecture_01.md          # アーキテクチャ（Electron構成セクション追加済み）
@docs/03_tech-stack_01.md            # 技術スタック（Electron関連追加済み）
@docs/04_implementation-plan_01.md   # Web版実装計画（Phase 0〜4 全完了）
```

---

## 6. 主要ファイル一覧

| ファイル | 役割 |
|---------|------|
| `electron/main.ts` | Electron メインプロセス（Express起動 + BrowserWindow + IPC + メニュー） |
| `electron/preload.ts` | contextBridge（isElectron + getServerPort + selectDirectory） |
| `electron.vite.config.ts` | electron-vite 設定（main/preload/renderer 統合ビルド） |
| `server/src/app.ts` | Express 構築モジュール（createExpressApp + startServer）副作用なし |
| `server/src/index.ts` | CLI エントリーポイント（app.ts を呼ぶだけ） |
| `client/src/services/api.ts` | API通信（apiBaseUrl 環境分岐済み） |
| `client/src/main.tsx` | bootstrap() で initApiBaseUrl() を await してから React マウント |
| `package.json` | Electron scripts/deps/build 設定、`npmRebuild: false` |

---

## 7. 確認コマンド

```bash
npm run build              # 型チェック
npm test                   # 186件テスト
npm run dev                # Web版開発サーバー
npm run electron:dev       # Electron開発モード
npm run electron:build     # Electronビルド
npm run electron:package   # .exe生成（PowerShellで実行）
npm run electron:installer # electron-builderのみ（ビルド済みの場合）
```

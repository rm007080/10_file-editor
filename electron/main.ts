import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import path from 'path';
import type { Server } from 'http';
import { createExpressApp, startServer } from '@app/server/app';

let serverPort: number;
let httpServer: Server;
let mainWindow: BrowserWindow | null = null;

// シングルインスタンスロック（多重起動防止）
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function buildAppMenu(): void {
  const isDev = !app.isPackaged;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        {
          label: '終了',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: '編集',
      submenu: [
        {
          label: '元に戻す',
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          click: () => {
            mainWindow?.webContents.send('menu:undo');
          },
        },
      ],
    },
    ...(isDev
      ? [
          {
            label: '表示',
            submenu: [
              {
                label: '開発者ツール',
                accelerator: 'F12',
                click: () => {
                  mainWindow?.webContents.toggleDevTools();
                },
              },
              { role: 'reload' as const },
            ],
          },
        ]
      : []),
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'バージョン情報',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'File Renamer',
              message: 'File Renamer',
              detail: `バージョン: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode.js: ${process.versions.node}\nChromium: ${process.versions.chrome}`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow!.show());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // electron-vite が設定する環境変数でパスを解決
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

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

    buildAppMenu();
    createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'File Renamer - 起動エラー',
      `サーバーの起動に失敗しました。\n\n${err instanceof Error ? err.message : String(err)}`,
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

// IPC: ネイティブフォルダ選択ダイアログ
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  return dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'フォルダを選択',
  });
});

// macOS: ウィンドウが全て閉じてもアプリは終了しない（Dock クリックで再作成）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

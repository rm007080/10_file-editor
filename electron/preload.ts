import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:undo', () => handler(null as never, 'undo'));
    return () => {
      ipcRenderer.removeAllListeners('menu:undo');
    };
  },
});

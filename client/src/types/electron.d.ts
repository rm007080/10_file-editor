interface ElectronAPI {
  isElectron: boolean;
  getServerPort: () => Promise<number>;
  selectDirectory: () => Promise<Electron.OpenDialogReturnValue>;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}

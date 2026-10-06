export interface ElectronVersions {
  node: string;
  chrome: string;
  electron: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  platform: string;
  versions: ElectronVersions;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

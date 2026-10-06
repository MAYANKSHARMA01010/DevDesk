export interface ElectronVersions {
  node: string;
  chrome: string;
  electron: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  platform: NodeJS.Platform;
  versions: ElectronVersions;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export interface ElectronVersions {
  node: string;
  chrome: string;
  electron: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  selectDirectory: (defaultPath?: string) => Promise<string | null>;
  openInVSCode: (projectPath: string) => Promise<ActionResult>;
  openInEditor: (projectPath: string, editorId?: string) => Promise<ActionResult>;
  revealInFinder: (projectPath: string) => Promise<ActionResult>;
  platform: NodeJS.Platform;
  versions: ElectronVersions;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

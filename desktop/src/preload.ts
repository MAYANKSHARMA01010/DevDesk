import { contextBridge, ipcRenderer } from "electron";
import type { ActionResult, ElectronAPI } from "./types";

const electronAPI: ElectronAPI = {
  ping: (): Promise<string> => ipcRenderer.invoke("ping"),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:select-directory"),
  openInVSCode: (projectPath: string): Promise<ActionResult> =>
    ipcRenderer.invoke("project:open-vscode", projectPath),
  revealInFinder: (projectPath: string): Promise<ActionResult> =>
    ipcRenderer.invoke("project:reveal-finder", projectPath),
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

contextBridge.exposeInMainWorld("electron", electronAPI);

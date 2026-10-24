import { contextBridge, ipcRenderer } from "electron";
import type { ActionResult, ElectronAPI } from "./types";

const electronAPI: ElectronAPI = {
  ping: (): Promise<string> => ipcRenderer.invoke("ping"),
  selectDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke("dialog:select-directory", defaultPath),
  openInVSCode: (projectPath: string): Promise<ActionResult> =>
    ipcRenderer.invoke("project:open-vscode", projectPath),
  openInEditor: (projectPath: string, editorId?: string): Promise<ActionResult> =>
    ipcRenderer.invoke("project:open-editor", projectPath, editorId),
  revealInFinder: (projectPath: string): Promise<ActionResult> =>
    ipcRenderer.invoke("project:reveal-finder", projectPath),
  openExternal: (url: string): Promise<ActionResult> =>
    ipcRenderer.invoke("system:open-external", url),
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

contextBridge.exposeInMainWorld("electron", electronAPI);

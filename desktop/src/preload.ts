import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI } from "./types";

const electronAPI: ElectronAPI = {
  ping: (): Promise<string> => ipcRenderer.invoke("ping"),
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

contextBridge.exposeInMainWorld("electron", electronAPI);

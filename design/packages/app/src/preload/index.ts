import { contextBridge, ipcRenderer } from "electron";

export interface MaterialBlueMapBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;
}

const bridge: MaterialBlueMapBridge = {
    syncProfiles: (profiles) => ipcRenderer.invoke("profiles:sync", profiles),
    writeClipboardText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
    getVersion: () => ipcRenderer.invoke("app:version"),
};

contextBridge.exposeInMainWorld("materialBluemap", bridge);

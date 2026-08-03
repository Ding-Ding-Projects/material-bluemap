import { contextBridge, ipcRenderer } from "electron";

/** Mirrors `ConsentRecord` in the main process. */
export interface ConsentRecord {
    accepted: boolean;
    acceptedAt: string | null;
    documentUrl: string;
    termsVersion: number;
    appVersion: string | null;
}

export interface FirstRunState {
    completed: boolean;
    completedAt: string | null;
}

export interface MaterialBlueMapBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;

    /**
     * Mojang download consent.
     *
     * Asked once, during first-run setup, and remembered afterwards. Nothing in the
     * app may ask again: a render that needs consent and does not have it reports
     * what is missing and points at the setting, rather than putting a licence in
     * front of somebody who is halfway through a task.
     */
    readConsent(): Promise<ConsentRecord>;
    acceptDownload(): Promise<ConsentRecord>;
    revokeDownloadConsent(): Promise<ConsentRecord>;

    /** True only on the very first launch. The shell shows setup when it is. */
    needsFirstRun(): Promise<boolean>;
    /** Called when setup finishes, whichever way consent was answered. */
    completeFirstRun(): Promise<FirstRunState>;
}

const bridge: MaterialBlueMapBridge = {
    syncProfiles: (profiles) => ipcRenderer.invoke("profiles:sync", profiles),
    writeClipboardText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
    getVersion: () => ipcRenderer.invoke("app:version"),

    readConsent: () => ipcRenderer.invoke("consent:read"),
    acceptDownload: () => ipcRenderer.invoke("consent:accept"),
    revokeDownloadConsent: () => ipcRenderer.invoke("consent:revoke"),

    needsFirstRun: () => ipcRenderer.invoke("firstRun:needed"),
    completeFirstRun: () => ipcRenderer.invoke("firstRun:complete"),
};

contextBridge.exposeInMainWorld("materialBluemap", bridge);

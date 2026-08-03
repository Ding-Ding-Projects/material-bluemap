/** Typed surface of the Electron preload bridge (absent when running in a browser). */
interface MojangConsentRecord {
    accepted: boolean;
    acceptedAt: string | null;
    documentUrl: string;
    termsVersion: number;
    appVersion: string | null;
}

interface FirstRunState {
    completed: boolean;
    completedAt: string | null;
}

interface MaterialBlueMapBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;

    /**
     * Mojang download consent, asked once during first-run setup and remembered.
     *
     * Nothing in the interface may ask again. A render that needs consent and does
     * not have it reports what is missing and links to the setting; it never puts a
     * licence in front of somebody who is already halfway through a task.
     */
    readConsent(): Promise<MojangConsentRecord>;
    acceptDownload(): Promise<MojangConsentRecord>;
    revokeDownloadConsent(): Promise<MojangConsentRecord>;

    /** True only on the very first launch. The shell shows setup when it is. */
    needsFirstRun(): Promise<boolean>;
    /** Called when setup finishes, whichever way consent was answered. */
    completeFirstRun(): Promise<FirstRunState>;
}

interface Window {
    materialBluemap?: MaterialBlueMapBridge;
}

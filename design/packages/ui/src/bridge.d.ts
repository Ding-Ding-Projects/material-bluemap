/** Typed surface of the Electron preload bridge (absent when running in a browser). */
interface MaterialBlueMapBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;
}

interface Window {
    materialBluemap?: MaterialBlueMapBridge;
}

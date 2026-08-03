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

/**
 * Reading and writing a BlueMap config folder.
 *
 * Mirrors `ConfigBridge` in the preload, which mirrors `main/config/ipc.ts`. Every path is
 * relative to the config folder and spelled with forward slashes; the main process refuses
 * one that escapes it, or that is not a config file BlueMap would load, rather than
 * resolving it.
 */
interface BlueMapConfigFile {
    /** Relative to the config folder, e.g. `maps/overworld.conf`. */
    path: string;
    text: string;
}

interface BlueMapConfigFolderContents {
    /** The folder that was read, absolute. */
    folder: string;
    files: BlueMapConfigFile[];
}

interface BlueMapPickDirectoryOptions {
    title: string;
    /** Where the picker opens. Ignored unless it is a full path. */
    startIn?: string;
}

interface BlueMapPickFileOptions {
    title: string;
    /** Extensions without the dot, e.g. `["jar"]`. */
    extensions?: string[];
    startIn?: string;
}

interface BlueMapSqlProbeRequest {
    connectionUrl: string;
    /** `connection-properties`, which is where the user name and password live. */
    properties: Record<string, string>;
    dialect: string | null;
    driverJar: string | null;
    driverClass: string | null;
}

interface BlueMapSqlProbeResult {
    ok: boolean;
    /** One line for the user. On a driver failure this is the driver's own message. */
    message: string;
    /** Driver or dialect detail worth showing behind a disclosure. */
    detail?: string;
}

interface BlueMapConfigBridge {
    readFolder(folder: string): Promise<BlueMapConfigFolderContents>;
    writeFiles(folder: string, files: BlueMapConfigFile[]): Promise<void>;
    deleteFiles(folder: string, paths: string[]): Promise<void>;
    pickDirectory(options: BlueMapPickDirectoryOptions): Promise<string | null>;
    pickFile(options: BlueMapPickFileOptions): Promise<string | null>;
    testSqlConnection(request: BlueMapSqlProbeRequest): Promise<BlueMapSqlProbeResult>;
    suggestConfigFolder(): Promise<string>;
    /** `\\` on Windows, `/` elsewhere. Used only to build display paths. */
    pathSeparator: string;
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

    /**
     * The config folder, for the options screen.
     *
     * Declared here because this is the shell this interface ships with. `configHost.ts`
     * still probes for every method one at a time and refuses a partial answer, and it is
     * right to: a released shell can load a newer renderer than the one it was built
     * beside, and a control that throws when clicked is worse than a control that says
     * what it needs.
     */
    config: BlueMapConfigBridge;
}

interface Window {
    materialBluemap?: MaterialBlueMapBridge;
}

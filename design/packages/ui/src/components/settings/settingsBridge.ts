/**
 * The seam between the settings surface and the main process.
 *
 * Every type here is a structural mirror of one the Electron preload exposes on
 * `window.worldlens`, restated rather than imported for the same reason
 * `worldBridge.ts` and `firstRunFlow.ts` restate theirs: this package compiles and runs
 * in three places and only one of them has a preload. In a browser tab there is no main
 * process to ask, and under Vitest the whole surface is driven by a fake.
 *
 * **Nothing here invents a capability.** Each method is optional and is feature-detected
 * one at a time, so a build whose preload has grown half of this shows the half that
 * works and says plainly, on screen, what the other half needs. {@link JavaRuntimeBridge}
 * is the reason that matters: the desktop app now exposes `javaRuntime()` over the
 * `java:runtime` channel and the section reports the real discovery, rejections included,
 * while a browser tab - which has no main process to ask - still says so rather than
 * printing a version number nobody measured.
 */

/* -------------------------------------------------------------------------- */
/* Where maps are written                                                     */
/* -------------------------------------------------------------------------- */

export interface StorageDirectoryReadout {
    /** The absolute folder the main process resolved, already expanded. */
    readonly current: string;
    /** The absolute folder it would use if nothing had been chosen. */
    readonly default: string;
}

export type StorageWriteResult =
    | { readonly ok: true; readonly directory: string }
    | { readonly ok: false; readonly message: string };

/**
 * The folder renders are written into, under either of the two names the shell contract
 * has used for it.
 *
 * `mapStorageDirectory` is what the preload exposes today; `storageDirectory` is the
 * shorter name the same capability is described by elsewhere, accepted here so a rename
 * cannot silently cost this surface its storage control.
 */
export interface StorageDirectoryBridge {
    mapStorageDirectory?: () => Promise<StorageDirectoryReadout>;
    storageDirectory?: () => Promise<StorageDirectoryReadout | string>;
    setMapStorageDirectory?: (value: string) => Promise<StorageWriteResult>;
    setStorageDirectory?: (value: string) => Promise<StorageWriteResult>;
    /** Opens the platform folder picker. Resolves null when it is cancelled. */
    chooseMapStorageDirectory?: (current: string) => Promise<string | null>;
}

/* -------------------------------------------------------------------------- */
/* The Java the app found                                                     */
/* -------------------------------------------------------------------------- */

/** Mirrors `JavaVersionInfo` in `packages/app/src/main/java/version.ts`. */
export interface JavaVersionReadout {
    /** The feature release: 8, 17, 21, 25. Normalised across both numbering schemes. */
    readonly feature: number;
    /** Exactly as the JVM printed it, e.g. `25.0.3`. */
    readonly version: string;
    /** The runtime line, e.g. `OpenJDK Runtime Environment Temurin-25.0.3+9 (build ...)`. */
    readonly runtime: string | null;
}

/** Where a JVM came from. Reported so the choice is never a mystery. */
export type JavaSource = "JAVA_HOME" | "PATH" | "provisioned";

/** Mirrors `JavaInstallation`. */
export interface JavaInstallationReadout {
    readonly source: JavaSource;
    readonly executable: string;
    readonly home: string | null;
    readonly version: JavaVersionReadout;
}

/** Mirrors `JavaRejection`. `reason` is a sentence, not a code: it is shown as written. */
export interface JavaRejectionReadout {
    readonly source: JavaSource;
    readonly executable: string;
    readonly reason: string;
}

/** Mirrors `JavaDiscovery`, which is what `discoverJava()` already returns. */
export interface JavaRuntimeReadout {
    readonly installation: JavaInstallationReadout | null;
    readonly rejected: readonly JavaRejectionReadout[];
    /** The feature version that was required, so a message can quote it. */
    readonly required: number;
}

/**
 * Reporting the Java the app found.
 *
 * Optional because a browser tab has no main process to put the question to, and the
 * section works without it - saying so in as many words rather than showing a version it
 * did not measure. Rejects when discovery itself failed, which the section shows as a
 * failure rather than as "no Java installed"; those are different problems.
 */
export interface JavaRuntimeBridge {
    javaRuntime?: () => Promise<JavaRuntimeReadout>;
}

/* -------------------------------------------------------------------------- */
/* Downloading a Java runtime, when the app has to                           */
/* -------------------------------------------------------------------------- */

/** Mirrors `JavaDownloadConsentSummary` in `main/java/ipc.ts`. */
export interface JavaDownloadConsentReadout {
    readonly accepted: boolean;
    readonly acceptedAt: string | null;
}

/** Mirrors `ProvisionEvent` in `main/java/provision.ts`. */
export interface JavaProvisionEventReadout {
    readonly stage: "resolving" | "downloading" | "verifying" | "extracting" | "installing" | "done";
    readonly message: string;
    readonly received: number | null;
    readonly total: number | null;
}

/** Mirrors `JavaProvisionOutcome` in `main/java/ipc.ts`. Never rejects. */
export type JavaProvisionReadout =
    | { readonly ok: true; readonly installation: JavaInstallationReadout; readonly provisioned: boolean }
    | { readonly ok: false; readonly message: string };

/**
 * Downloading a JDK the app fetches for itself, in the same asked-once-remembered-forever
 * shape as the Mojang download consent: `javaDownloadConsent` reports whether it was
 * already agreed to, `acceptJavaDownloadConsent` records agreement, and
 * `provisionJavaRuntime` is the one call that actually starts the download - refused by
 * the main process rather than by this bridge when consent has not been given, so the
 * refusal is the same whichever surface asks. All optional: a browser tab has nothing to
 * provision into and the section says so rather than showing a dead button.
 */
export interface JavaProvisionBridge {
    javaDownloadConsent?: () => Promise<JavaDownloadConsentReadout>;
    acceptJavaDownloadConsent?: () => Promise<JavaDownloadConsentReadout>;
    provisionJavaRuntime?: () => Promise<JavaProvisionReadout>;
    onJavaProvisionEvent?: (listener: (event: JavaProvisionEventReadout) => void) => () => void;
}

/* -------------------------------------------------------------------------- */
/* How much memory a render may use                                          */
/* -------------------------------------------------------------------------- */

/** Mirrors `RenderMemoryReadout` in `main/files/ipc.ts`. */
export interface RenderMemoryReadout {
    readonly mode: "automatic" | "manual";
    readonly megabytes: number;
    /** What automatic would choose on this machine right now. */
    readonly recommendedMegabytes: number;
    /** Physical memory, in mebibytes. Zero when it could not be read. */
    readonly machineMegabytes: number;
    readonly minimumMegabytes: number;
    /** The ceiling the automatic default will never exceed on its own. */
    readonly automaticCeilingMegabytes: number;
    /** One paragraph naming the number, the unit and what happens either side of it. */
    readonly explanation: string;
    /** Exactly what a render will be started with, e.g. `["-Xmx4096m"]`. */
    readonly jvmArgs: readonly string[];
}

export type RenderMemoryWriteResult =
    | { readonly ok: true; readonly setting: RenderMemoryReadout }
    | { readonly ok: false; readonly reason: string };

/** What this row asks the main process to store. Mirrors `RenderMemorySetting`. */
export type RenderMemoryWriteRequest =
    | { readonly mode: "automatic" }
    | { readonly mode: "manual"; readonly megabytes: number };

/**
 * Reading and writing the render process's `-Xmx` ceiling.
 *
 * Optional, like every bridge here: a browser tab has no main process to hold the
 * setting, and the row says so rather than showing a number nobody measured.
 */
export interface RenderMemoryBridge {
    renderMemory?: () => Promise<RenderMemoryReadout>;
    setRenderMemory?: (setting: RenderMemoryWriteRequest) => Promise<RenderMemoryWriteResult>;
}

/* -------------------------------------------------------------------------- */
/* How many parts a download fetches at once                                 */
/* -------------------------------------------------------------------------- */

/** Mirrors `DownloadConcurrencyReadout` in `main/files/ipc.ts`. */
export interface DownloadConcurrencyReadout {
    readonly workers: number;
    /** True when nothing has been chosen and this is the shipped default. */
    readonly isDefault: boolean;
    readonly defaultWorkers: number;
    readonly minimumWorkers: number;
    readonly maximumWorkers: number;
    /** One paragraph naming the number and both directions of the trade-off. */
    readonly explanation: string;
}

export type DownloadConcurrencyWriteResult =
    | { readonly ok: true; readonly setting: DownloadConcurrencyReadout }
    | { readonly ok: false; readonly reason: string };

/**
 * Reading and writing how many release-asset parts a download fetches at once.
 *
 * Optional, like every bridge here: a browser tab has no main process to hold the
 * setting, and the row says so rather than showing a number nobody measured.
 */
export interface DownloadConcurrencyBridge {
    downloadConcurrency?: () => Promise<DownloadConcurrencyReadout>;
    setDownloadConcurrency?: (workers: number) => Promise<DownloadConcurrencyWriteResult>;
}

/* -------------------------------------------------------------------------- */
/* Renders that have already happened                                         */
/* -------------------------------------------------------------------------- */

/** The part of the preload's `RenderSummary` this surface reads. */
export interface RenderSummaryReadout {
    readonly renderId: string;
    readonly outcome: "running" | "finished" | "failed" | "cancelled";
    /** e.g. `BlueMap engine (Java) 5.22-27 on Java 25.0.3`. */
    readonly engine: string;
    readonly startedAt: string;
}

/**
 * The renders already on disk, each carrying the engine line it ran with.
 *
 * This is a record of what happened, not a reading of the machine as it stands now, and
 * the section labels it as exactly that. It is worth showing anyway: "the last render
 * ran on Java 25.0.3" is a fact somebody can act on, and it is the only Java fact this
 * build can honestly produce.
 */
export interface RenderHistoryBridge {
    listRenders?: () => Promise<readonly RenderSummaryReadout[]>;
}

export type SettingsBridge = StorageDirectoryBridge &
    JavaRuntimeBridge &
    JavaProvisionBridge &
    RenderHistoryBridge &
    RenderMemoryBridge &
    DownloadConcurrencyBridge;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload, or null when there is none. Every method on it is still optional. */
export function resolveSettingsBridge(): SettingsBridge | null {
    const host = (globalThis as { worldlens?: SettingsBridge }).worldlens;
    return host ?? null;
}

/** True when this build can open the platform's own folder picker. */
export function canBrowseForFolder(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.chooseMapStorageDirectory);
}

/** True when this build can point rendering at a different folder. */
export function canWriteStorageDirectory(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.setMapStorageDirectory) || isFunction(bridge?.setStorageDirectory);
}

/** True when this build can report the Java it found. False in a browser tab. */
export function canReportJava(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.javaRuntime);
}

/** True when this build can report whether the Java download has been agreed to. */
export function canReadJavaDownloadConsent(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.javaDownloadConsent);
}

/** True when this build can download and install a Java runtime for itself. */
export function canProvisionJava(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.provisionJavaRuntime);
}

/** True when this build can list the renders already on disk. */
export function canListRenders(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.listRenders);
}

/** True when this build can report and change the render memory ceiling. */
export function canReadRenderMemory(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.renderMemory);
}

/** True when this build can change the render memory ceiling, not merely report it. */
export function canWriteRenderMemory(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.setRenderMemory);
}

/** The current ceiling, or null when this build cannot ask about it. */
export async function readRenderMemory(bridge: SettingsBridge | null): Promise<RenderMemoryReadout | null> {
    if (!isFunction(bridge?.renderMemory)) return null;
    return await bridge.renderMemory();
}

/** Stores a new ceiling, reporting a refusal rather than swallowing it. */
export async function writeRenderMemory(
    bridge: SettingsBridge | null,
    setting: RenderMemoryWriteRequest,
): Promise<RenderMemoryWriteResult> {
    if (!isFunction(bridge?.setRenderMemory)) {
        return {
            ok: false,
            reason:
                "This build cannot change how much memory a render may use. The desktop app owns that setting; a browser tab has no access to it.",
        };
    }
    return await bridge.setRenderMemory(setting);
}

/**
 * Where renders are written, under whichever name the bridge offers.
 *
 * Null when neither exists, which the storage section reports rather than inventing an
 * absolute path that would look exactly like a resolved one.
 */
export async function readStorageDirectory(
    bridge: SettingsBridge | null,
): Promise<StorageDirectoryReadout | null> {
    if (isFunction(bridge?.mapStorageDirectory)) return await bridge.mapStorageDirectory();
    if (isFunction(bridge?.storageDirectory)) {
        const answer = await bridge.storageDirectory();
        return typeof answer === "string" ? { current: answer, default: answer } : answer;
    }
    return null;
}

/** Points rendering at a different folder, reporting a refusal rather than swallowing it. */
export async function writeStorageDirectory(
    bridge: SettingsBridge | null,
    value: string,
): Promise<StorageWriteResult> {
    if (isFunction(bridge?.setMapStorageDirectory)) return await bridge.setMapStorageDirectory(value);
    if (isFunction(bridge?.setStorageDirectory)) return await bridge.setStorageDirectory(value);
    return {
        ok: false,
        message:
            "This build cannot change where maps are written. The desktop app owns that folder; a browser tab has no access to it.",
    };
}

/** Opens the folder picker, or resolves null when there is none or it was cancelled. */
export async function browseForFolder(
    bridge: SettingsBridge | null,
    current: string,
): Promise<string | null> {
    const picker = bridge?.chooseMapStorageDirectory;
    if (!isFunction(picker)) return null;
    return await picker(current);
}

/** True when this build can report the download-concurrency setting. */
export function canReadDownloadConcurrency(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.downloadConcurrency);
}

/** True when this build can change it, not merely report it. */
export function canWriteDownloadConcurrency(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.setDownloadConcurrency);
}

/** The current worker count, or null when this build cannot ask about it. */
export async function readDownloadConcurrency(
    bridge: SettingsBridge | null,
): Promise<DownloadConcurrencyReadout | null> {
    if (!isFunction(bridge?.downloadConcurrency)) return null;
    return await bridge.downloadConcurrency();
}

/** Stores a new worker count, reporting a refusal rather than swallowing it. */
export async function writeDownloadConcurrency(
    bridge: SettingsBridge | null,
    workers: number,
): Promise<DownloadConcurrencyWriteResult> {
    if (!isFunction(bridge?.setDownloadConcurrency)) {
        return {
            ok: false,
            reason:
                "This build cannot change how many parts a download fetches at once. The desktop app owns that setting; a browser tab has no access to it.",
        };
    }
    return await bridge.setDownloadConcurrency(workers);
}

/**
 * The seam between the settings surface and the main process.
 *
 * Every type here is a structural mirror of one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
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

export type SettingsBridge = StorageDirectoryBridge & JavaRuntimeBridge & RenderHistoryBridge;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload, or null when there is none. Every method on it is still optional. */
export function resolveSettingsBridge(): SettingsBridge | null {
    const host = (globalThis as { materialBluemap?: SettingsBridge }).materialBluemap;
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

/** True when this build can list the renders already on disk. */
export function canListRenders(bridge: SettingsBridge | null): boolean {
    return isFunction(bridge?.listRenders);
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

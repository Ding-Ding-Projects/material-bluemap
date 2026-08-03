/**
 * The seam between the create-a-map flow and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes
 * on `window.materialBluemap`, restated rather than imported for the same reason
 * `firstRunFlow.ts` restates its own: this package compiles and runs in three
 * places, and only one of them has a preload. In a browser tab there is no local
 * rendering, and in vitest the whole flow is driven by a fake.
 *
 * Nothing here invents a capability. {@link resolveWorldBridge} returns `null`
 * when there is no bridge at all, and each optional method is feature-detected
 * one at a time, so a build whose preload has grown half of this shows the half
 * that works and says plainly what the other half needs.
 */

import { inspectWorldFolder, uncheckedWorld, unreadableWorld, type WorldInspection } from "./worldFolder.js";

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

export interface RenderMapRequest {
    readonly id: string;
    readonly world: string;
    readonly name?: string;
    readonly dimension?: string;
    readonly sorting?: number;
    readonly startPos?: { readonly x: number; readonly z: number };
    /**
     * The complete `maps/<id>.conf` body to render with, as HOCON.
     *
     * The fields above are the handful the bridge validates. A map has ninety-odd
     * more, and the wizard collects all of them, so the whole body travels as text
     * rather than being narrowed down to the five that happen to have a field here -
     * a settings screen that says it applied ninety-two settings and applies six is
     * worse than one that never offered them.
     *
     * The main process still owns `world`, `dimension` and `storage` and writes them
     * over whatever this says, because a render whose storage points somewhere the app
     * does not serve produces tiles nobody can see.
     */
    readonly config?: string;
}

export interface RenderRequest {
    readonly maps: readonly RenderMapRequest[];
    readonly renderId?: string;
    readonly force?: boolean;
    readonly fixEdges?: boolean;
    readonly metrics?: boolean;
    readonly renderThreads?: number;
}

/** Where the interface should send somebody to fix a failure. */
export interface SettingsTarget {
    readonly surface: "settings";
    readonly anchor: "mojang-download-consent" | "java-runtime" | "map-storage-directory" | "world-folder";
    readonly missing: boolean;
}

export interface RenderFailure {
    readonly code: string;
    readonly message: string;
    readonly settings: SettingsTarget | null;
    readonly detail: string | null;
    readonly exitCode: number | null;
}

export interface RenderTaskProgress {
    readonly kind: string;
    readonly mapId: string | null;
    readonly description: string;
    readonly percent: number;
    readonly etaSeconds: number | null;
    readonly etaText: string | null;
}

export interface EngineDescription {
    readonly id: "upstream-java" | "typescript";
    readonly label: string;
    readonly version: string;
    readonly javaVersion: string | null;
}

export type RenderEvent =
    | { type: "started"; renderId: string; mapIds: string[]; engine: EngineDescription; at: string }
    | { type: "phase"; renderId: string; phase: string; at: string }
    | { type: "progress"; renderId: string; phase: string; task: RenderTaskProgress; at: string }
    | { type: "log"; renderId: string; level: string; message: string; at: string }
    | {
          type: "finished";
          renderId: string;
          dataRoot: string;
          mapIds: string[];
          engine: EngineDescription;
          durationMs: number;
          at: string;
      }
    | { type: "failed"; renderId: string; failure: RenderFailure; at: string }
    | { type: "cancelled"; renderId: string; at: string };

export type RenderResult =
    | {
          ok: true;
          renderId: string;
          dataRoot: string;
          mapIds: string[];
          engine: EngineDescription;
          durationMs: number;
      }
    | { ok: false; renderId: string; failure: RenderFailure };

export interface InterruptedRenderMap {
    readonly id: string;
    readonly world: string;
    readonly dimension: string;
    readonly name: string;
}

export interface InterruptedRenderSummary {
    readonly renderId: string;
    readonly reason: "cancelled" | "failed" | "process-gone";
    readonly maps: readonly InterruptedRenderMap[];
    readonly startedAt: string;
    readonly interruptedAt: string | null;
    readonly percent: number | null;
    readonly description: string | null;
    readonly engine: string;
    readonly message: string;
}

export interface ResumeRefused {
    readonly ok: false;
    readonly renderId: string;
    readonly code: "no-session" | "not-interrupted" | "already-running" | "config-changed";
    readonly message: string;
}

export type ResumeResult =
    | { started: true; result: RenderResult }
    | { started: false; refusal: ResumeRefused };

export interface RenderSummary {
    readonly renderId: string;
    readonly outcome: "running" | "finished" | "failed" | "cancelled";
    readonly engine: string;
    readonly engineId: "upstream-java" | "typescript";
    readonly maps: readonly { id: string; name: string; world: string; dimension: string }[];
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    readonly dataRoot: string | null;
}

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

/** What the flow needs and the preload already exposes. */
export interface WorldBridge {
    startRender(request: RenderRequest): Promise<RenderResult>;
    cancelRender(renderId: string): Promise<boolean>;
    listRenders(): Promise<readonly RenderSummary[]>;
    renderEngine(renderId: string): Promise<RenderSummary | null>;
    /**
     * The ids of renders in flight right now.
     *
     * A different question from {@link interruptedRenders}, and never folded into
     * it. A render that is running has not stopped, so it is not something to carry
     * on: offering to resume it would be offering to start a second copy of a render
     * already going, which the main process can only refuse.
     */
    activeRenders(): Promise<readonly string[]>;
    interruptedRenders(): Promise<readonly InterruptedRenderSummary[]>;
    resumeRender(renderId: string, maps?: readonly RenderMapRequest[]): Promise<ResumeResult>;
    dismissResume(renderId: string): Promise<boolean>;
    onRenderEvent(listener: (event: RenderEvent) => void): () => void;
    readConsent(): Promise<{ accepted: boolean }>;
}

/**
 * The folder the render writes into, under either of the two names the shell
 * contract has used for it.
 *
 * `mapStorageDirectory` is what the preload exposes today. `storageDirectory` is
 * the shorter name the same capability is described by elsewhere, accepted here
 * so this flow keeps working if the preload settles on it, rather than silently
 * losing the storage step to a rename.
 */
export interface StorageDirectoryBridge {
    mapStorageDirectory?: () => Promise<{ current: string; default: string }>;
    storageDirectory?: () => Promise<{ current: string; default: string } | string>;
    setMapStorageDirectory?: (
        value: string,
    ) => Promise<{ ok: true; directory: string } | { ok: false; message: string }>;
    setStorageDirectory?: (
        value: string,
    ) => Promise<{ ok: true; directory: string } | { ok: false; message: string }>;
}

/**
 * Reading a folder well enough to tell a world from something that is not one.
 *
 * The desktop build answers this over `world:inspect`. It stays optional because a
 * browser build has no filesystem to read, and the wizard has to work without it: the
 * folder is taken as given, the step says in as many words that this build cannot check
 * it, and the dimension list falls back to the three vanilla ones rather than to the ones
 * that are really there. Nothing here pretends the check happened.
 */
export interface WorldProbeBridge {
    inspectWorldFolder?: (folder: string) => Promise<{
        folder: string;
        entries: readonly { path: string; directory: boolean }[];
        regionFiles: Readonly<Record<string, number>>;
    }>;
}

export type OptionalWorldBridge = StorageDirectoryBridge & WorldProbeBridge;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot render locally.
 *
 * All or nothing for the required half: a bridge missing `startRender` but
 * carrying `listRenders` would present a wizard whose last button throws, which
 * is worse than a wizard that says the desktop app is needed.
 */
export function resolveWorldBridge(): WorldBridge | null {
    const host = (globalThis as { materialBluemap?: Partial<WorldBridge> }).materialBluemap;
    if (host === undefined) return null;

    const required = [
        host.startRender,
        host.cancelRender,
        host.listRenders,
        host.interruptedRenders,
        host.resumeRender,
        host.onRenderEvent,
        host.readConsent,
    ];
    if (!required.every(isFunction)) return null;

    const complete = host as WorldBridge;
    return {
        startRender: (request) => complete.startRender(request),
        cancelRender: (renderId) => complete.cancelRender(renderId),
        listRenders: () => complete.listRenders(),
        renderEngine: (renderId) =>
            isFunction(host.renderEngine) ? complete.renderEngine(renderId) : Promise.resolve(null),
        // An empty list rather than a rejection, because "nothing is running" and "this
        // build cannot tell you what is running" lead to the same screen: no in-flight
        // renders named. What must not happen is a build inventing one.
        activeRenders: () => (isFunction(host.activeRenders) ? complete.activeRenders() : Promise.resolve([])),
        interruptedRenders: () => complete.interruptedRenders(),
        resumeRender: (renderId, maps) => complete.resumeRender(renderId, maps),
        dismissResume: (renderId) =>
            isFunction(host.dismissResume) ? complete.dismissResume(renderId) : Promise.resolve(false),
        onRenderEvent: (listener) => complete.onRenderEvent(listener),
        readConsent: () => complete.readConsent(),
    };
}

/** The optional halves, probed one method at a time. */
export function resolveOptionalWorldBridge(): OptionalWorldBridge | null {
    const host = (globalThis as { materialBluemap?: OptionalWorldBridge }).materialBluemap;
    return host ?? null;
}

/** True when this build can read a folder well enough to check it is a world. */
export function canInspectWorlds(bridge: OptionalWorldBridge | null): boolean {
    return isFunction(bridge?.inspectWorldFolder);
}

/**
 * Where renders are written, under whichever name the bridge offers.
 *
 * Returns null when neither exists, which the storage step reports rather than
 * inventing a path that would look like the real one.
 */
export async function readStorageDirectory(
    bridge: OptionalWorldBridge | null,
): Promise<{ current: string; default: string } | null> {
    if (isFunction(bridge?.mapStorageDirectory)) {
        return await bridge.mapStorageDirectory();
    }
    if (isFunction(bridge?.storageDirectory)) {
        const answer = await bridge.storageDirectory();
        return typeof answer === "string" ? { current: answer, default: answer } : answer;
    }
    return null;
}

/**
 * Reads a folder and decides whether it is a Minecraft world.
 *
 * A build with no reader gets an honest "not checked" answer rather than an
 * optimistic one: the wizard says so on the step, keeps the folder the person
 * chose, and offers the three vanilla dimensions instead of the ones that are
 * really there. It never reports a check that did not happen.
 */
export async function probeWorldFolder(
    bridge: OptionalWorldBridge | null,
    folder: string,
): Promise<WorldInspection> {
    const probe = bridge?.inspectWorldFolder;
    if (!isFunction(probe)) return uncheckedWorld(folder);
    try {
        return inspectWorldFolder(await probe(folder));
    } catch (error) {
        return unreadableWorld(folder, error instanceof Error ? error.message : String(error));
    }
}

/** Points rendering at a different folder, reporting the refusal rather than swallowing it. */
export async function writeStorageDirectory(
    bridge: OptionalWorldBridge | null,
    value: string,
): Promise<{ ok: true; directory: string } | { ok: false; message: string }> {
    if (isFunction(bridge?.setMapStorageDirectory)) return await bridge.setMapStorageDirectory(value);
    if (isFunction(bridge?.setStorageDirectory)) return await bridge.setStorageDirectory(value);
    return {
        ok: false,
        message:
            "This build cannot change where maps are written. The desktop app owns that folder; a browser tab has no access to it.",
    };
}

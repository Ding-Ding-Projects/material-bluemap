import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

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

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the render types in `main/render/`.
 *
 * Restated rather than imported because the preload is bundled separately from the main
 * process and importing across that boundary would pull `node:child_process` and the
 * whole orchestrator into the renderer's bundle.
 */
export interface RenderMapRequest {
    id: string;
    world: string;
    name?: string;
    dimension?: string;
    sorting?: number;
    startPos?: { x: number; z: number };
}

export interface RenderRequest {
    maps: RenderMapRequest[];
    renderId?: string;
    force?: boolean;
    fixEdges?: boolean;
    metrics?: boolean;
    renderThreads?: number;
}

/** Where the interface should send somebody to fix a failure. */
export interface SettingsTarget {
    surface: "settings";
    anchor: "mojang-download-consent" | "java-runtime" | "map-storage-directory" | "world-folder";
    missing: boolean;
}

export interface RenderFailure {
    code: string;
    message: string;
    settings: SettingsTarget | null;
    detail: string | null;
    exitCode: number | null;
}

export interface RenderTaskProgress {
    kind: string;
    mapId: string | null;
    description: string;
    percent: number;
    etaSeconds: number | null;
    etaText: string | null;
}

export interface EngineDescription {
    id: "upstream-java" | "typescript";
    label: string;
    version: string;
    javaVersion: string | null;
}

export type RenderEvent =
    | { type: "started"; renderId: string; mapIds: string[]; engine: EngineDescription; at: string }
    | { type: "phase"; renderId: string; phase: string; at: string }
    | {
          type: "progress";
          renderId: string;
          phase: string;
          task: RenderTaskProgress;
          at: string;
      }
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

export interface RenderSummary {
    renderId: string;
    outcome: "running" | "finished" | "failed" | "cancelled";
    /** e.g. `BlueMap engine (Java) 5.22-27 on Java 25.0.3`. */
    engine: string;
    engineId: "upstream-java" | "typescript";
    maps: { id: string; name: string; world: string; dimension: string }[];
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    dataRoot: string | null;
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

    /**
     * Renders a world locally, with upstream BlueMap's engine.
     *
     * Resolves when the render has ended, whichever way it ended. It never rejects and
     * never asks for consent: a render without it comes back `ok: false` with
     * `failure.code === "consent-required"` and the settings row to send somebody to.
     * Watch `onRenderEvent` for progress in the meantime.
     */
    startRender(request: RenderRequest): Promise<RenderResult>;

    /** Stops a running render. False when nothing is running under that id. */
    cancelRender(renderId: string): Promise<boolean>;

    /** Render ids in flight right now. */
    activeRenders(): Promise<string[]>;

    /** Every render on disk, finished or not, with the engine that produced it. */
    listRenders(): Promise<RenderSummary[]>;

    /**
     * Which engine rendered a given map, and when.
     *
     * The app never switches renderer silently, and this is how the interface can show
     * that rather than merely promise it.
     */
    renderEngine(renderId: string): Promise<RenderSummary | null>;

    /**
     * The real absolute folder maps are written to, and the default.
     *
     * The renderer has no home directory, so it can only show `%APPDATA%\...` or `~/...`
     * until the main process resolves it. This is that resolution.
     */
    mapStorageDirectory(): Promise<{ current: string; default: string }>;

    /** Points rendering at a different folder. Reports why rather than substituting one. */
    setMapStorageDirectory(
        value: string,
    ): Promise<{ ok: true; directory: string } | { ok: false; message: string }>;

    /**
     * Subscribes to render progress. Returns the unsubscribe function.
     *
     * Pushed rather than polled because a render takes minutes and moves in ten-second
     * steps: a spinner for four minutes is indistinguishable from a hang.
     */
    onRenderEvent(listener: (event: RenderEvent) => void): () => void;
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

    startRender: (request) => ipcRenderer.invoke("render:start", request),
    cancelRender: (renderId) => ipcRenderer.invoke("render:cancel", renderId),
    activeRenders: () => ipcRenderer.invoke("render:active"),
    listRenders: () => ipcRenderer.invoke("render:list"),
    renderEngine: (renderId) => ipcRenderer.invoke("render:engine", renderId),
    mapStorageDirectory: () => ipcRenderer.invoke("render:storageDirectory"),
    setMapStorageDirectory: (value) => ipcRenderer.invoke("render:setStorageDirectory", value),

    onRenderEvent: (listener) => {
        // The renderer never sees the raw IpcRendererEvent: handing it across the
        // context bridge would expose `sender`, and with it a way to send on any
        // channel the main process listens to.
        const forward = (_event: IpcRendererEvent, payload: RenderEvent): void => listener(payload);
        ipcRenderer.on("render:event", forward);
        return () => {
            ipcRenderer.off("render:event", forward);
        };
    },
};

contextBridge.exposeInMainWorld("materialBluemap", bridge);

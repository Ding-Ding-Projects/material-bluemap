/**
 * The seam between "host this map on my own server" and the main process.
 *
 * A structural mirror of `remoteBridge.ts`, not an import from it: this package compiles
 * and runs in three places and only one of them has a preload, so importing across that
 * boundary would drag `node:child_process` and an SSH client into the renderer's bundle -
 * exactly what the preload was split out to prevent. See `remoteBridge.ts`'s own doc
 * comment for the fuller version of this argument; it applies here unchanged.
 *
 * `resolveHostingBridge()` answers `null` when this build cannot host a map at all, and
 * every optional method is probed on its own so a surface built on this shows what really
 * works rather than a control that throws on press.
 */

import type { RemoteTarget } from "./remoteBridge.js";

export type { RemoteTarget };

export type RemoteHostingBindMode = "loopback" | "public";

export interface RemoteHostingPublish {
    readonly hostPort: number;
    readonly bindMode: RemoteHostingBindMode;
}

export interface RemoteHostMapRequest {
    readonly id: string;
    readonly world: string;
    readonly name?: string;
    readonly dimension?: string;
}

export interface RemoteHostRequest {
    readonly target: RemoteTarget;
    readonly hostingId: string;
    readonly renderId: string;
    readonly maps: readonly RemoteHostMapRequest[];
    readonly publish: RemoteHostingPublish;
}

export interface RemoteHostingFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
}

export type RemoteHostingStatus = "running" | "stopped" | "unknown";

export interface RemoteHostingRecord {
    readonly hostingId: string;
    readonly renderId: string;
    readonly target: RemoteTarget;
    readonly containerName: string;
    readonly remoteRoot: string;
    readonly mapIds: readonly string[];
    readonly publish: RemoteHostingPublish;
    readonly status: RemoteHostingStatus;
    readonly url: string | null;
    readonly verified: boolean;
    readonly verifiedVia: "network" | "ssh-loopback" | null;
    readonly remoteFilesKept: boolean;
    readonly startedAt: string;
    readonly lastCheckedAt: string;
    readonly notes: readonly string[];
}

export type RemoteHostResult =
    | { readonly ok: true; readonly hostingId: string; readonly record: RemoteHostingRecord }
    | { readonly ok: false; readonly hostingId: string; readonly failure: RemoteHostingFailure };

export interface RemoteHostStopReport {
    readonly hostingId: string;
    readonly target: string;
    readonly containerRemoved: boolean;
    readonly filesRemoved: boolean;
    readonly notes: readonly string[];
}

export type RemoteHostStopResult =
    | { readonly ok: true; readonly report: RemoteHostStopReport }
    | { readonly ok: false; readonly failure: RemoteHostingFailure };

export type RemoteHostPhase = "preflight" | "staging" | "uploading" | "starting" | "verifying" | "finished";

export type RemoteHostEvent =
    | { readonly type: "started"; readonly hostingId: string; readonly target: string; readonly at: string }
    | { readonly type: "phase"; readonly hostingId: string; readonly phase: RemoteHostPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly hostingId: string;
          readonly phase: RemoteHostPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly hostingId: string;
          readonly level: "INFO" | "WARNING" | "ERROR";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly hostingId: string;
          readonly record: RemoteHostingRecord;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly hostingId: string; readonly failure: RemoteHostingFailure; readonly at: string };

export interface RemoteHostingBridge {
    startRemoteHosting(request: RemoteHostRequest): Promise<RemoteHostResult>;
    remoteHostingRecords(): Promise<readonly RemoteHostingRecord[]>;
    remoteHostingRecord(hostingId: string): Promise<RemoteHostingRecord | null>;
    refreshRemoteHosting(hostingId: string): Promise<RemoteHostingRecord | null>;
    stopRemoteHosting(hostingId: string): Promise<RemoteHostStopResult>;
    onRemoteHostingEvent(listener: (event: RemoteHostEvent) => void): () => void;
    /** True when live progress events can actually be watched from here. */
    readonly canWatchEvents: boolean;
}

type Host = Partial<{
    startRemoteHosting: (request: unknown) => Promise<unknown>;
    remoteHostingRecords: () => Promise<unknown>;
    remoteHostingRecord: (hostingId: string) => Promise<unknown>;
    refreshRemoteHosting: (hostingId: string) => Promise<unknown>;
    stopRemoteHosting: (hostingId: string) => Promise<unknown>;
    onRemoteHostingEvent: (listener: (event: RemoteHostEvent) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

function host(): Host | undefined {
    return (globalThis as { worldlens?: Host }).worldlens;
}

/**
 * The hosting bridge, or `null` when this build cannot put a map on another machine at all.
 *
 * All-or-nothing for `startRemoteHosting` and `stopRemoteHosting`: a bridge that could start
 * hosting a map but never stop it again would leave the interface offering an action with no
 * way back, which is worse than not offering hosting at all.
 */
export function resolveHostingBridge(): RemoteHostingBridge | null {
    const found = host();
    if (found === undefined) return null;

    const { startRemoteHosting, stopRemoteHosting } = found;
    if (!isFunction(startRemoteHosting) || !isFunction(stopRemoteHosting)) return null;

    const canWatchEvents = isFunction(found.onRemoteHostingEvent);

    return {
        startRemoteHosting: async (request) => (await startRemoteHosting(request)) as RemoteHostResult,
        stopRemoteHosting: async (hostingId) => (await stopRemoteHosting(hostingId)) as RemoteHostStopResult,
        remoteHostingRecords: async () => {
            const list = found.remoteHostingRecords;
            return isFunction(list) ? ((await list()) as readonly RemoteHostingRecord[]) : [];
        },
        remoteHostingRecord: async (hostingId) => {
            const one = found.remoteHostingRecord;
            return isFunction(one) ? ((await one(hostingId)) as RemoteHostingRecord | null) : null;
        },
        refreshRemoteHosting: async (hostingId) => {
            const refresh = found.refreshRemoteHosting;
            return isFunction(refresh) ? ((await refresh(hostingId)) as RemoteHostingRecord | null) : null;
        },
        onRemoteHostingEvent: (listener) => {
            const watch = found.onRemoteHostingEvent;
            if (!isFunction(watch)) return () => undefined;
            return watch(listener);
        },
        canWatchEvents,
    };
}

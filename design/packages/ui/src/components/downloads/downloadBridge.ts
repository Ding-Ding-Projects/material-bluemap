/**
 * The seam between the release-downloads surface and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
 * `worldBridge.ts` restates its own: this package compiles and runs in three places and
 * only one of them has a preload. Importing across that boundary would also drag the
 * archive joiner, the zip reader and `node:fs` into the renderer's bundle, which is
 * exactly what the preload was split out to prevent.
 *
 * Nothing here invents a capability. {@link resolveDownloadBridge} returns `null` when the
 * three methods a download cannot happen without are missing, and the rest are probed one
 * at a time and reported as flags, so a build whose preload has grown half of this shows
 * the half that works and says plainly what the other half needs. A missing
 * `cancelDownload` in particular is survivable and must not be hidden: a download that
 * cannot be stopped is worth knowing about before one is started, not after.
 */

import type { SettingsTarget } from "../world/worldBridge.js";

export type { SettingsTarget };

/* -------------------------------------------------------------------------- */
/* What a release offers                                                      */
/* -------------------------------------------------------------------------- */

/** Which release to look at. A blank tag means whatever the latest one is. */
export interface ReleaseCoordinates {
    readonly owner: string;
    readonly repo: string;
    /** A tag, or blank/omitted for `latest`. */
    readonly tag?: string;
}

/**
 * One thing a release offers, as the one download it really is.
 *
 * A file past GitHub's two-gigabyte asset cap is published as `world.zip.001`,
 * `world.zip.002`, ... beside a `world.zip.parts.json`, and the main process reports that
 * as a single `world.zip` of the full size. `split` and `parts` are here so the surface
 * can say so rather than presenting a 4 GB download as though it were one file somebody
 * could fetch with a browser.
 */
export interface AvailableAsset {
    readonly name: string;
    readonly split: boolean;
    readonly parts: number;
    readonly bytes: number;
}

export interface DiscoveredRelease {
    readonly tag: string;
    readonly name: string;
    readonly htmlUrl: string;
    readonly downloads: readonly AvailableAsset[];
}

export type DiscoveryResult =
    | { readonly ok: true; readonly release: DiscoveredRelease }
    | { readonly ok: false; readonly message: string };

/* -------------------------------------------------------------------------- */
/* Downloading                                                                */
/* -------------------------------------------------------------------------- */

export interface DownloadRequest {
    readonly owner: string;
    readonly repo: string;
    /** A tag, or `latest` (the default). */
    readonly tag?: string;
    /** The name the download presents, e.g. `world.zip`, split or not. */
    readonly asset?: string;
    /** Unpack the archive afterwards. Defaults to true for a `.zip`. */
    readonly extract?: boolean;
}

export type DownloadPhase = "resolving" | "downloading" | "joining" | "extracting" | "finished";

export interface DownloadFailure {
    readonly code: string;
    readonly message: string;
    readonly settings: SettingsTarget | null;
    readonly detail: string | null;
    readonly status: number | null;
}

export interface DownloadTaskProgress {
    readonly phase: DownloadPhase;
    readonly description: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    /** The part being transferred, or null between parts. */
    readonly currentPart: string | null;
    /** 0 to 100, across every phase. An estimate; the byte counts are exact. */
    readonly percent: number;
    readonly etaSeconds: number | null;
    readonly etaText: string | null;
}

export type DownloadEvent =
    | {
          readonly type: "started";
          readonly downloadId: string;
          readonly asset: string;
          /** The release tag it is coming from. */
          readonly release: string;
          readonly parts: number;
          readonly bytesTotal: number;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly downloadId: string; readonly phase: DownloadPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly downloadId: string;
          readonly phase: DownloadPhase;
          readonly task: DownloadTaskProgress;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly downloadId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly downloadId: string;
          readonly archive: string;
          readonly content: string | null;
          readonly bytes: number;
          readonly sha256: string;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly downloadId: string; readonly failure: DownloadFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly downloadId: string; readonly at: string };

export type DownloadResult =
    | {
          readonly ok: true;
          readonly downloadId: string;
          readonly archive: string;
          readonly content: string | null;
          readonly bytes: number;
          readonly sha256: string;
          readonly durationMs: number;
      }
    | { readonly ok: false; readonly downloadId: string; readonly failure: DownloadFailure };

/** One download already on disk, as the main process reads its own record back. */
export interface DownloadSummary {
    readonly downloadId: string;
    readonly asset: string;
    /** `owner/repo`, exactly as the record wrote it. */
    readonly repository: string;
    readonly tag: string;
    readonly outcome: "running" | "finished" | "failed" | "cancelled";
    readonly bytes: number;
    readonly parts: number;
    readonly split: boolean;
    readonly archive: string;
    readonly content: string | null;
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
}

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

/** What the surface needs and the preload already exposes. */
export interface DownloadBridge {
    discoverRelease(request: ReleaseCoordinates): Promise<DiscoveryResult>;
    startDownload(request: DownloadRequest): Promise<DownloadResult>;
    cancelDownload(downloadId: string): Promise<boolean>;
    activeDownloads(): Promise<readonly string[]>;
    listDownloads(): Promise<readonly DownloadSummary[]>;
    onDownloadEvent(listener: (event: DownloadEvent) => void): () => void;
    /** True when a download in flight can actually be stopped from here. */
    readonly canCancel: boolean;
    /** True when downloads already on disk can be listed. */
    readonly canList: boolean;
    /** True when the ids in flight right now can be asked for. */
    readonly canSeeActive: boolean;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    discoverRelease: (request: ReleaseCoordinates) => Promise<DiscoveryResult>;
    startDownload: (request: DownloadRequest) => Promise<DownloadResult>;
    cancelDownload: (downloadId: string) => Promise<boolean>;
    activeDownloads: () => Promise<readonly string[]>;
    listDownloads: () => Promise<readonly DownloadSummary[]>;
    onDownloadEvent: (listener: (event: DownloadEvent) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot download releases at all.
 *
 * All or nothing for the three that a download cannot happen without. A bridge carrying
 * `startDownload` and no `onDownloadEvent` would present a Download button that starts
 * tens of minutes of invisible work, which is worse than a surface that says the desktop
 * app is needed: a bar that moves is the entire difference between a long download and a
 * hang, and people quit an application they believe has hung.
 */
export function resolveDownloadBridge(): DownloadBridge | null {
    const host = (globalThis as { materialBluemap?: Host }).materialBluemap;
    if (host === undefined) return null;

    const { discoverRelease, startDownload, onDownloadEvent } = host;
    if (!isFunction(discoverRelease) || !isFunction(startDownload) || !isFunction(onDownloadEvent)) {
        return null;
    }

    const canCancel = isFunction(host.cancelDownload);
    const canList = isFunction(host.listDownloads);
    const canSeeActive = isFunction(host.activeDownloads);

    return {
        discoverRelease: (request) => discoverRelease(request),
        startDownload: (request) => startDownload(request),
        // False rather than a rejection: "this build cannot stop a download" and "there
        // was nothing to stop" both leave the download running, and the surface says
        // which of the two it is from `canCancel` rather than from a thrown error.
        cancelDownload: (downloadId) =>
            isFunction(host.cancelDownload) ? host.cancelDownload(downloadId) : Promise.resolve(false),
        // Empty lists rather than rejections, for the same reason `activeRenders` answers
        // that way: not being able to ask what is in flight and nothing being in flight
        // lead to the same screen. What must never happen is a build inventing one.
        activeDownloads: () => (isFunction(host.activeDownloads) ? host.activeDownloads() : Promise.resolve([])),
        listDownloads: () => (isFunction(host.listDownloads) ? host.listDownloads() : Promise.resolve([])),
        onDownloadEvent: (listener) => onDownloadEvent(listener),
        canCancel,
        canList,
        canSeeActive,
    };
}

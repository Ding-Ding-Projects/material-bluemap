/**
 * What a CI render remembers between attempts, and where it keeps it.
 *
 * A CI render is a loop with four network-shaped steps in it - upload, dispatch, wait,
 * collect - and any of them can be interrupted by the thing most likely to interrupt
 * them, which is the application being closed while a run is still going. Without a
 * record on disk, reopening the app after lunch means the run on GitHub is finished, the
 * map is sitting in an artifact, and this computer has no idea any of it happened.
 *
 * So every step that produces a durable fact writes it down: which fingerprint was
 * uploaded, under which tag and asset name, which run that dispatch produced, and how it
 * ended. Starting a sync reads the record first, which is what makes `start` and `resume`
 * the same operation - see `sync.ts`.
 *
 * ## Where the render itself lands, and why not here
 *
 * The record and the downloaded artifact live under `<storage>/ci-render/<syncId>/`. The
 * **map** does not: it is unpacked into `<storage>/<renderId>/web`, beside every locally
 * rendered map, with the same `render.json` next to it. That is the whole point of the
 * feature - a map rendered on GitHub's runners has to open exactly like one rendered on
 * this computer - and putting it in a special folder that only this subsystem knows about
 * is how it would end up not appearing in the map list at all.
 *
 * The render id is prefixed `ci-` rather than reusing `renderIdForWorld`'s answer
 * directly. Two renders of the same world writing to one directory would have the CI
 * collector delete a local render's tiles to unpack over them, which is a data loss with
 * no warning and no undo.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** The folder under the map storage directory that holds every CI sync's record. */
export const CI_SYNC_DIRECTORY = "ci-render";

/** Bumped when the shape below changes incompatibly. */
export const CI_SYNC_STATE_VERSION = 1;

/**
 * How far a sync has got.
 *
 * Deliberately about *durable facts*, not about what the loop is doing right now. "The
 * world is uploaded" survives a restart; "the loop is currently polling" does not, and a
 * record that claimed it would be wrong the moment the process ended.
 */
export type CiSyncStage =
    | "idle"
    | "uploaded"
    | "dispatched"
    | "rendered"
    | "failed"
    | "cancelled";

export interface CiSyncState {
    readonly version: number;
    readonly syncId: string;
    readonly owner: string;
    readonly repo: string;
    /** The world folder, absolute. */
    readonly worldFolder: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;

    /** The fingerprint of the world as it was when it was last uploaded. */
    readonly fingerprint: string | null;
    readonly releaseTag: string | null;
    readonly assetName: string | null;

    /**
     * The release and archive an upload **in progress** was using, so it can be resumed.
     *
     * Written the moment the release exists and before a byte is sent, which is the only
     * moment that helps: an upload interrupted after four hours has to be able to find the
     * parts it already put up, and a tag recorded on success is a tag recorded exactly when
     * it is no longer needed.
     *
     * Deliberately **not** {@link releaseTag}, which means "the world that was successfully
     * uploaded". A half-finished upload writing into that field is the failure the record
     * writer already warns about - a release tag with no fingerprint beside it reads as
     * "already uploaded" and would dispatch a run against an incomplete release.
     */
    readonly pendingReleaseTag: string | null;
    readonly pendingAssetName: string | null;
    readonly archiveBytes: number | null;
    /** The archive's own SHA-256, from the backup that produced it. */
    readonly archiveSha256: string | null;

    readonly runId: number | null;
    readonly runNumber: number | null;
    readonly runUrl: string | null;
    readonly dispatchedAt: string | null;

    readonly stage: CiSyncStage;
    /** Set once a map has actually been unpacked and mounted. */
    readonly renderId: string | null;
    /** The artifact's SHA-256 as this computer measured it. Provenance, see `collect.ts`. */
    readonly artifactSha256: string | null;
    /** Why it failed, when it did. Kept so a reopened app can still say what happened. */
    readonly failureCode: string | null;
    readonly failureMessage: string | null;

    readonly updatedAt: string;
}

export interface CiSyncWorkspace {
    readonly syncId: string;
    /** `<storage>/ci-render/<syncId>`, absolute. */
    readonly root: string;
    readonly stateFile: string;
    /** Where the downloaded `rendered-map` artifact zip is staged. */
    readonly artifactFile: string;
}

export function ciSyncWorkspace(storageDir: string, syncId: string): CiSyncWorkspace {
    const root = resolve(storageDir, CI_SYNC_DIRECTORY, syncId);
    return {
        syncId,
        root,
        stateFile: join(root, "sync.json"),
        artifactFile: join(root, "rendered-map.zip"),
    };
}

/**
 * The id one sync is filed under: repository, map, and the world it came from.
 *
 * All four go into it because all four have to match for a resume to be the same piece of
 * work. The same world rendered as two maps is two syncs; the same map pushed to two
 * repositories is two syncs. Leaving the world path out would let a sync started for one
 * save resume against another save with the same map id, which would upload the wrong
 * world under a record claiming it was the right one.
 */
export function syncIdFor(owner: string, repo: string, worldFolder: string, mapId: string): string {
    const absolute = resolve(worldFolder);
    const digest = createHash("sha256")
        // Case-folded for the same reason `renderIdForWorld` folds: Windows and macOS
        // treat `C:\World` and `c:\world` as one folder, so hashing them apart would
        // produce two syncs for one world and upload it twice.
        .update(`${owner.toLowerCase()}/${repo.toLowerCase()}|${absolute.toLowerCase()}|${mapId}`)
        .digest("hex")
        .slice(0, 12);
    return `${slug(mapId)}-${digest}`;
}

/** The render id a collected CI map is mounted under. Never a local render's id. */
export function ciRenderIdFor(syncId: string): string {
    return `ci-${syncId}`;
}

function slug(value: string): string {
    const reduced = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    return reduced.length > 0 ? reduced : "map";
}

export interface NewStateInput {
    readonly syncId: string;
    readonly owner: string;
    readonly repo: string;
    readonly worldFolder: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    readonly at: string;
}

/** A record for a sync that has not done anything yet. */
export function newCiSyncState(input: NewStateInput): CiSyncState {
    return {
        version: CI_SYNC_STATE_VERSION,
        syncId: input.syncId,
        owner: input.owner,
        repo: input.repo,
        worldFolder: resolve(input.worldFolder),
        mapId: input.mapId,
        mapName: input.mapName,
        dimension: input.dimension,
        fingerprint: null,
        releaseTag: null,
        assetName: null,
        pendingReleaseTag: null,
        pendingAssetName: null,
        archiveBytes: null,
        archiveSha256: null,
        runId: null,
        runNumber: null,
        runUrl: null,
        dispatchedAt: null,
        stage: "idle",
        renderId: null,
        artifactSha256: null,
        failureCode: null,
        failureMessage: null,
        updatedAt: input.at,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stage(value: unknown): CiSyncStage {
    return value === "uploaded" ||
        value === "dispatched" ||
        value === "rendered" ||
        value === "failed" ||
        value === "cancelled"
        ? value
        : "idle";
}

/**
 * Reads a record back, or null.
 *
 * A missing, unreadable, malformed or older-versioned file is **no record**, never a
 * partial one. A half-understood record is the one input that could make a resume upload
 * against a release that does not exist, or follow a run id belonging to something else;
 * starting the sync from the beginning costs an upload and is always correct.
 */
export async function readCiSyncState(path: string): Promise<CiSyncState | null> {
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || parsed["version"] !== CI_SYNC_STATE_VERSION) return null;

    const syncId = str(parsed["syncId"]);
    const owner = str(parsed["owner"]);
    const repo = str(parsed["repo"]);
    const worldFolder = str(parsed["worldFolder"]);
    const mapId = str(parsed["mapId"]);
    if (syncId === null || owner === null || repo === null || worldFolder === null || mapId === null) {
        return null;
    }

    return {
        version: CI_SYNC_STATE_VERSION,
        syncId,
        owner,
        repo,
        worldFolder,
        mapId,
        mapName: str(parsed["mapName"]) ?? mapId,
        dimension: str(parsed["dimension"]) ?? "minecraft:overworld",
        fingerprint: str(parsed["fingerprint"]),
        releaseTag: str(parsed["releaseTag"]),
        assetName: str(parsed["assetName"]),
        // Absent in records written before uploads were resumable. Reading them as null is
        // correct rather than lenient: no pending upload is exactly what those records mean.
        pendingReleaseTag: str(parsed["pendingReleaseTag"]),
        pendingAssetName: str(parsed["pendingAssetName"]),
        archiveBytes: num(parsed["archiveBytes"]),
        archiveSha256: str(parsed["archiveSha256"]),
        runId: num(parsed["runId"]),
        runNumber: num(parsed["runNumber"]),
        runUrl: str(parsed["runUrl"]),
        dispatchedAt: str(parsed["dispatchedAt"]),
        stage: stage(parsed["stage"]),
        renderId: str(parsed["renderId"]),
        artifactSha256: str(parsed["artifactSha256"]),
        failureCode: str(parsed["failureCode"]),
        failureMessage: str(parsed["failureMessage"]),
        updatedAt: str(parsed["updatedAt"]) ?? "",
    };
}

/**
 * Writes a record, staged and renamed.
 *
 * A crash halfway through the write would otherwise leave a file that parses as a
 * *different* record than the one intended - most dangerously one with a release tag and
 * no fingerprint, which a resume reads as "already uploaded" for a world it has not
 * checked.
 */
export async function writeCiSyncState(path: string, state: CiSyncState): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const staging = `${path}.writing`;
    await writeFile(staging, `${JSON.stringify(state, null, 4)}\n`, "utf8");
    await rename(staging, path);
}

/** Every sync this computer has a record of. A directory listing, not an index. */
export async function listCiSyncIds(storageDir: string): Promise<string[]> {
    try {
        const entries = await readdir(join(resolve(storageDir), CI_SYNC_DIRECTORY), {
            withFileTypes: true,
        });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }
}

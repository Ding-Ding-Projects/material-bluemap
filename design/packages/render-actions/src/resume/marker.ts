import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listFiles } from "../merge/files.js";

/**
 * Telling a shard that finished from one that was cut off mid-write.
 *
 * This is the whole difficulty of resuming a sharded render. A shard's output directory
 * looks the same either way: tiles, a settings file, a texture gallery, a `rstate`
 * folder. Nothing in it says whether the job that wrote it ran to the end or was killed
 * at the five hour fifty-eighth minute with a tile half flushed. A resume that assumes
 * the first will merge a truncated tile and publish it, and no verification downstream
 * will catch it, because a truncated tile is a file like any other.
 *
 * So a shard declares itself finished, explicitly, in a small file written only after the
 * render process has exited cleanly:
 *
 * ```
 * <storageRoot>/shard-7.complete.json
 * <storageRoot>/<mapId>/tiles/0/...
 * ```
 *
 * Beside the map directory rather than inside it, deliberately. The merge is pointed at
 * `<shard>/<mapId>`, so a marker inside it would be a file the merge has to know to
 * ignore; one directory up, it travels in the same artifact and the same cache and the
 * merge never sees it at all.
 *
 * **Only output whose marker is present is trusted.** A shard without one is not a
 * failure and is not discarded: it is *unfinished*, and its cached state is exactly what
 * makes finishing it cheap. The next run restores the cache, renders again, and BlueMap
 * skips every tile its own `rstate` says is already done.
 *
 * ## Why the marker records a count
 *
 * A marker proves the render finished. It does not, on its own, prove the output arrived:
 * a cache restore can be partial, an artifact download can be interrupted, a runner can
 * run out of disk. So the marker records how many hires tiles the shard had written, and
 * `verifyShardMarker` counts them again. A marker that says 240 beside a directory
 * holding 197 is a marker describing output that is no longer all there, and it is
 * refused with both numbers rather than trusted because the file exists.
 *
 * The marker is written staged-and-renamed for the same reason everything else in this
 * project is: the one file whose job is to prove a write completed must not itself be
 * readable half written.
 */

/** Bumped when the shape below changes incompatibly. An older marker reads as absent. */
export const SHARD_MARKER_VERSION = 1;

export interface ShardCompletionMarker {
    readonly markerVersion: number;
    /** The shard's id, or `"all"` for an unsharded whole-world render. */
    readonly shardId: number | "all";
    readonly mapId: string;
    readonly dimension: string;
    /**
     * Which plan this shard belongs to.
     *
     * A marker from a different plan describes a shard that covered a different rectangle
     * of the world. Trusting it would leave a hole exactly where the two plans disagree,
     * so the fingerprint is checked rather than assumed. See `state.ts`.
     */
    readonly planFingerprint: string;
    /** Hires tiles present when the shard finished. Re-counted on every check. */
    readonly hiresTileCount: number;
    readonly finishedAt: string;
    /** The workflow run that wrote it, so "which run produced this" has an answer. */
    readonly runId: string | null;
    readonly runAttempt: number | null;
}

/** `<storageRoot>/shard-<id>.complete.json`, beside the map directory and not inside it. */
export function shardMarkerPath(storageRoot: string, shardId: number | "all"): string {
    return join(storageRoot, `shard-${String(shardId)}.complete.json`);
}

export interface NewMarkerInput {
    readonly shardId: number | "all";
    readonly mapId: string;
    readonly dimension: string;
    readonly planFingerprint: string;
    readonly hiresTileCount: number;
    readonly finishedAt?: string | undefined;
    readonly runId?: string | null | undefined;
    readonly runAttempt?: number | null | undefined;
}

export function newShardMarker(input: NewMarkerInput): ShardCompletionMarker {
    return {
        markerVersion: SHARD_MARKER_VERSION,
        shardId: input.shardId,
        mapId: input.mapId,
        dimension: input.dimension,
        planFingerprint: input.planFingerprint,
        hiresTileCount: input.hiresTileCount,
        finishedAt: input.finishedAt ?? new Date().toISOString(),
        runId: input.runId ?? null,
        runAttempt: input.runAttempt ?? null,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Reads a marker back. A missing, unreadable or malformed one is **no marker**.
 *
 * Never a partial marker. The only thing this file is for is answering "did that finish",
 * and an answer assembled out of half a file is worse than no answer, because it would be
 * believed.
 */
export async function readShardMarker(path: string): Promise<ShardCompletionMarker | null> {
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
    if (!isRecord(parsed)) return null;
    if (parsed.markerVersion !== SHARD_MARKER_VERSION) return null;

    const shardId = parsed.shardId;
    const mapId = parsed.mapId;
    const planFingerprint = parsed.planFingerprint;
    const finishedAt = parsed.finishedAt;
    if (typeof mapId !== "string" || typeof planFingerprint !== "string") return null;
    if (typeof finishedAt !== "string") return null;
    if (typeof shardId !== "number" && shardId !== "all") return null;
    if (typeof parsed.hiresTileCount !== "number" || !Number.isFinite(parsed.hiresTileCount))
        return null;

    return {
        markerVersion: SHARD_MARKER_VERSION,
        shardId,
        mapId,
        dimension: typeof parsed.dimension === "string" ? parsed.dimension : "minecraft:overworld",
        planFingerprint,
        hiresTileCount: parsed.hiresTileCount,
        finishedAt,
        runId: typeof parsed.runId === "string" ? parsed.runId : null,
        runAttempt: typeof parsed.runAttempt === "number" ? parsed.runAttempt : null,
    };
}

/** Writes a marker, staged and renamed, so it is never readable half written. */
export async function writeShardMarker(
    path: string,
    marker: ShardCompletionMarker,
): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const staging = `${path}.writing`;
    await writeFile(staging, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    await rename(staging, path);
}

/** How many hires tiles a map directory holds right now. */
export async function countHiresTiles(mapDirectory: string): Promise<number> {
    return (await listFiles(join(mapDirectory, "tiles", "0"))).size;
}

export interface ShardTrustReport {
    readonly shardId: number | "all";
    readonly trusted: boolean;
    /** Says why, in words a run summary can print unchanged. */
    readonly reason: string;
    readonly marker: ShardCompletionMarker | null;
    /** Hires tiles actually present, counted rather than taken from the marker. */
    readonly hiresTileCount: number;
}

export interface VerifyShardOptions {
    readonly shardId: number | "all";
    /** `<shard>/<mapId>`, the directory the merge would read. */
    readonly mapDirectory: string;
    /** The marker, already read. Null when there is none. */
    readonly marker: ShardCompletionMarker | null;
    /** The plan the caller is rendering. A marker from another plan is refused. */
    readonly planFingerprint?: string | undefined;
}

/**
 * Decides whether a shard's output can be treated as finished.
 *
 * Returns a report rather than throwing, because "this shard is unfinished" is an
 * ordinary and expected answer that the caller acts on by rendering it again, not an
 * error that should stop everything.
 */
export async function verifyShardMarker(options: VerifyShardOptions): Promise<ShardTrustReport> {
    const hiresTileCount = await countHiresTiles(options.mapDirectory);
    const marker = options.marker;

    if (marker === null) {
        return {
            shardId: options.shardId,
            trusted: false,
            reason:
                "No completion marker, so this shard either never finished or was cut off" +
                " mid-write. Its output holds " +
                hiresTileCount +
                " hires tiles, which are kept: rendering it again continues from them.",
            marker: null,
            hiresTileCount,
        };
    }

    if (
        options.planFingerprint !== undefined &&
        marker.planFingerprint !== options.planFingerprint
    ) {
        return {
            shardId: options.shardId,
            trusted: false,
            reason:
                "The completion marker was written for a different plan (" +
                marker.planFingerprint.slice(0, 12) +
                " rather than " +
                options.planFingerprint.slice(0, 12) +
                "), so it describes a shard that covered a different part of the world." +
                " Trusting it would leave a hole where the two plans disagree.",
            marker,
            hiresTileCount,
        };
    }

    if (marker.hiresTileCount !== hiresTileCount) {
        return {
            shardId: options.shardId,
            trusted: false,
            reason:
                "The completion marker recorded " +
                marker.hiresTileCount +
                " hires tiles and the output holds " +
                hiresTileCount +
                ". The shard finished, but its output is not all here, so it is treated as" +
                " unfinished rather than merged short.",
            marker,
            hiresTileCount,
        };
    }

    return {
        shardId: options.shardId,
        trusted: true,
        reason:
            "Finished at " +
            marker.finishedAt +
            " with " +
            hiresTileCount +
            " hires tiles, all present.",
        marker,
        hiresTileCount,
    };
}

/** Reads and verifies one shard in one step, from the directory the workflow uses. */
export async function inspectShard(options: {
    readonly storageRoot: string;
    readonly mapId: string;
    readonly shardId: number | "all";
    readonly planFingerprint?: string | undefined;
}): Promise<ShardTrustReport> {
    const marker = await readShardMarker(shardMarkerPath(options.storageRoot, options.shardId));
    return await verifyShardMarker({
        shardId: options.shardId,
        mapDirectory: join(options.storageRoot, options.mapId),
        marker,
        ...(options.planFingerprint === undefined
            ? {}
            : { planFingerprint: options.planFingerprint }),
    });
}

/**
 * A short digest of a marker, for a cache key or a log line.
 *
 * Deliberately not the whole file: a key wants something short and stable, and the parts
 * that vary between two runs of the same finished shard (the run id, the timestamp) are
 * not part of what makes it that shard.
 */
export function markerDigest(marker: ShardCompletionMarker): string {
    return createHash("sha256")
        .update(
            JSON.stringify({
                shardId: marker.shardId,
                mapId: marker.mapId,
                dimension: marker.dimension,
                planFingerprint: marker.planFingerprint,
                hiresTileCount: marker.hiresTileCount,
            }),
        )
        .digest("hex")
        .slice(0, 16);
}

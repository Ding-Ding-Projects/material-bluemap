import { createHash } from "node:crypto";
import type { ShardPlan } from "../plan/plan.js";

/**
 * Keeping a shard's half-finished work between runs.
 *
 * A shard that hits the six hour job ceiling has spent six hours producing tiles, and
 * those tiles are on the runner's disk when the job is killed. The runner is then thrown
 * away. Everything about resuming a CI render comes down to what leaves that runner
 * before it disappears, and there are exactly two ways out.
 *
 * ## `actions/cache` for the working state, an artifact for the output
 *
 * They are not interchangeable and the split is deliberate.
 *
 * **The cache holds the working state**: the shard's map directory *including its
 * `rstate`*, plus BlueMap's data directory with the downloaded client jar and the
 * extracted resources. Cache is right for this because it is keyed and restored
 * automatically at the start of a job, which is exactly the shape of "start again where
 * you left off". It is also allowed to disappear: an evicted cache costs a full re-render
 * of that shard and nothing else, and a resume path that *cannot* survive its own storage
 * being evicted is a resume path that turns an eviction into a failure.
 *
 * **The artifact holds the output**: the finished shard map, plus its completion marker.
 * Artifacts are what the merge job consumes and what a person downloads, they are
 * immutable, and they do not compete with the cache's eviction policy. The important
 * difference is that an artifact is written once, at the end, by a shard that finished;
 * the cache is written by every shard whether it finished or not, which is the entire
 * point.
 *
 * ## The key, and the trap in it
 *
 * `actions/cache` will not overwrite an existing key. A key that is identical between two
 * runs therefore saves nothing on the second run: run two restores run one's state,
 * renders for another six hours, and throws all of it away. Three runs of that make no
 * more progress than two.
 *
 * So the key carries the run id and attempt, which makes every save unique, and the
 * *restore* falls back to the longest matching prefix. That prefix is what carries
 * progress forward from run to run.
 *
 * The prefix contains the plan fingerprint, and that is not decoration. Restoring a cache
 * saved under a different plan would drop tiles and `rstate` from a shard that covered a
 * *different rectangle of the world* on top of this one's. `rstate` would then claim work
 * was done that this shard never did, and BlueMap would skip it: a hole in the map, with
 * nothing anywhere reporting a problem. So a different plan cannot match the prefix, and
 * a marker from a different plan is refused separately in `marker.ts`.
 *
 * ## The `rstate` decision this must not undo
 *
 * The shard merge deliberately does not merge `rstate`: shard render-state files group
 * tiles into regions that straddle the shard cuts, so no shard's copy describes the merged
 * map, and a merged copy would make a later incremental render skip tiles it never did.
 * See `merge/mergeMap.ts` and `docs/render-in-actions.md`.
 *
 * Nothing here changes that. `rstate` is cached **per shard, under a key nothing else can
 * restore**, and it is used by exactly one thing: that same shard, rendering the same
 * rectangle, with the same config, in a later run. It never travels in the shard artifact,
 * it never reaches the merge, and it never lands in the published map. The two facts are
 * consistent because they are about different journeys: `rstate` is valid along the one it
 * is kept for, and invalid along the one the merge refuses to take it on.
 */

/** Bumped when the cached layout changes, so old caches cannot be restored into it. */
export const CACHE_FORMAT_VERSION = 1;

const CACHE_NAMESPACE = "bluemap-shard-state";

/**
 * A stable digest of everything that makes a plan *this* plan.
 *
 * Two plans with the same fingerprint lay the same rectangles over the same world, so a
 * shard rendered under one is a shard rendered under the other. What goes in is the map
 * id, the dimension, the world as measured, the grid, the layout constants and every
 * shard's own bounds. What stays out is the estimate: passing `--rate` changes the numbers
 * in the run summary without moving a single cut, and refusing to resume over it would be
 * refusing for no reason.
 */
export function planFingerprint(plan: ShardPlan): string {
    const canonical = {
        fingerprintVersion: CACHE_FORMAT_VERSION,
        mapId: plan.mapId,
        dimension: plan.dimension,
        world: {
            regions: plan.world.regions,
            blocks: plan.world.blocks,
            regionFileCount: plan.world.regionFileCount,
            chunkCount: plan.world.chunkCount,
        },
        grid: plan.grid,
        layout: plan.layout,
        shards: plan.shards.map((shard) => ({
            id: shard.id,
            regions: shard.regions,
            bounds: shard.bounds,
        })),
    };
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export interface ShardCacheKeyOptions {
    readonly planFingerprint: string;
    readonly shardId: number | "all";
    /** `github.run_id`. Makes every save unique so a later run can save at all. */
    readonly runId: string;
    /** `github.run_attempt`. A re-run of the same run still gets its own key. */
    readonly runAttempt?: string | number | undefined;
}

/**
 * The prefix every cache for this shard shares, and the only thing `restore-keys` matches.
 *
 * Ends in a separator so `shard-1-` cannot match a key for shard 10.
 */
export function shardCacheRestorePrefix(
    options: Pick<ShardCacheKeyOptions, "planFingerprint" | "shardId">,
): string {
    return `${CACHE_NAMESPACE}-v${String(CACHE_FORMAT_VERSION)}-${options.planFingerprint.slice(
        0,
        16,
    )}-shard-${String(options.shardId)}-`;
}

/** The key this run saves under. Unique per run, and a prefix match for the next one. */
export function shardCacheKey(options: ShardCacheKeyOptions): string {
    const attempt = options.runAttempt === undefined ? "1" : String(options.runAttempt);
    return `${shardCacheRestorePrefix(options)}${options.runId}-${attempt}`;
}

/**
 * The paths a shard's cache holds.
 *
 * The map directory carries the tiles *and* `rstate`, which is the part that makes a
 * resume cheap: without it BlueMap has no record of what it has already done and renders
 * the shard from the beginning even though every tile is sitting there.
 *
 * The data directory carries the Minecraft client jar and the resources extracted from
 * it. Caching those is not about resuming at all; it is about not downloading the same
 * jar from Mojang's servers once per shard per run.
 */
export function shardCachePaths(options: {
    readonly storageRoot: string;
    readonly dataDirectory: string;
}): string[] {
    return [options.storageRoot, options.dataDirectory];
}

export interface ShardCacheDescription {
    readonly key: string;
    readonly restorePrefix: string;
    readonly paths: readonly string[];
    /** The lines the run summary prints about it. */
    readonly notes: readonly string[];
}

export function describeShardCache(
    options: ShardCacheKeyOptions & { readonly storageRoot: string; readonly dataDirectory: string },
): ShardCacheDescription {
    return {
        key: shardCacheKey(options),
        restorePrefix: shardCacheRestorePrefix(options),
        paths: shardCachePaths(options),
        notes: [
            "The shard's map directory is cached with its rstate, so a re-dispatched run" +
                " restores what this run rendered and BlueMap skips every tile it already did.",
            "The key carries the run id so each run can save; restore falls back to the" +
                " longest matching prefix, which is what carries the work forward.",
            "The prefix contains the plan fingerprint, so a cache saved for a different" +
                " shard layout can never be restored on top of this one. That rstate would" +
                " claim work this shard never did and BlueMap would skip it.",
            "rstate stays in the cache and never travels in the shard artifact, so the merge" +
                " still never sees it. That decision is unchanged.",
        ],
    };
}

/**
 * How much free disk a render needs, and therefore whether a runner has room for it.
 *
 * Two different stages of this workflow are disk-heavy, for two different reasons, and
 * both are estimated here so a plan can be checked against a runner's real, measured free
 * disk before either stage is attempted - never against the published spec, which this
 * project has already caught understating a real runner by a wide margin (a "~14 GB free"
 * assumption beside a runner that actually reported 87 GB free before anything was even
 * cleaned up). See docs/world-sources.md and docs/render-in-actions.md for the measurements
 * this file is calibrated against.
 */

/**
 * A world published as split release-asset parts needs room for three copies of roughly
 * the world's size at once, briefly: the downloaded parts, the archive they are joined
 * into, and the tree it is unpacked to. Measured rather than assumed - rendering the
 * 6.6 GB Andyville world through this workflow peaked around 21 GB above baseline while
 * holding all three, a ratio of about 3.2. Kept at that measured ratio rather than rounded
 * down, the same way the render-time estimate keeps its own margins on the high side:
 * repository and url sources never actually hold three copies at once, so this is
 * deliberately the worst case rather than the typical one.
 */
export const FETCH_PEAK_MULTIPLIER = 3.2;

/**
 * How much of the world's own size the rendered tiles come to, at the density this
 * project has measured: a 20 GB world renders to something on the order of 40 to 50 GB of
 * tiles. 2.5 is the upper end of that range, kept upper for the same reason the render-time
 * estimate keeps its own safety factor on the high side - a shard that runs out of disk
 * mid-render loses the run, and one that finishes with room to spare loses nothing.
 */
export const TILE_OUTPUT_RATIO = 2.5;

/**
 * Disk one shard's render needs besides the world and its own tiles: the Minecraft client
 * jar BlueMap downloads, the resources it extracts from that jar, and its runtime data
 * directory. A round figure on the high side, the same way `SHARD_OVERHEAD_SECONDS` in
 * `plan.ts` is - this has not been measured against a real large-world render yet.
 */
export const RENDER_DATA_MARGIN_BYTES = 2 * 1024 ** 3;

/** Applied to the final estimate, matching the render-time estimate's own safety margin. */
export const DISK_SAFETY_FACTOR = 1.2;

export interface DiskEstimateInputs {
    /** the world's own on-disk size, in bytes, as measured */
    worldBytes: number;
    /**
     * The busiest shard's share of the world's chunks, 0 to 1. 1 for an unsharded plan,
     * where the one job renders the whole map and therefore needs the whole map's tiles.
     */
    largestShardFraction: number;
}

export interface DiskEstimate {
    /** the world's own on-disk size, as measured */
    worldBytes: number;
    /** peak disk while the world is fetched: parts, joined archive and unpacked tree at once */
    fetchPeakBytes: number;
    /** the busiest shard's share of the rendered tiles */
    shardTileBytes: number;
    /** what one shard's runner needs: the world, its tile share, and the render data margin */
    perJobBytes: number;
    /** the larger of the two stages above, with the safety factor applied - this is what is checked */
    requiredBytes: number;
    /** the fraction of the world's chunks the busiest shard renders, after clamping */
    largestShardFraction: number;
}

/**
 * Estimates the free disk a render of this world needs, at its two disk-heaviest points:
 * fetching a split-archive world, and one shard's job holding the world plus its own
 * rendered tiles. The workflow checks the larger of the two against a runner's actually
 * measured free disk before dispatching any wave, so a world too large for the runners it
 * would run on fails at the plan step rather than partway through a render.
 */
export function estimateDiskBytes(inputs: DiskEstimateInputs): DiskEstimate {
    const worldBytes = Math.max(0, inputs.worldBytes);
    const largestShardFraction = Number.isFinite(inputs.largestShardFraction)
        ? Math.min(1, Math.max(0, inputs.largestShardFraction))
        : 1;

    const fetchPeakBytes = worldBytes * FETCH_PEAK_MULTIPLIER;
    const shardTileBytes = worldBytes * TILE_OUTPUT_RATIO * largestShardFraction;
    const perJobBytes = worldBytes + shardTileBytes + RENDER_DATA_MARGIN_BYTES;
    const requiredBytes = Math.max(fetchPeakBytes, perJobBytes) * DISK_SAFETY_FACTOR;

    return {
        worldBytes,
        fetchPeakBytes,
        shardTileBytes,
        perJobBytes,
        requiredBytes,
        largestShardFraction,
    };
}

/** A human-readable size, for the run summary and the workflow's disk check. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
    const gib = bytes / 1024 ** 3;
    if (gib >= 1) return gib.toFixed(1) + " GiB";
    return (bytes / 1024 ** 2).toFixed(0) + " MiB";
}

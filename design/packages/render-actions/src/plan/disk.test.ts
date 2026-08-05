import { describe, expect, it } from "vitest";
import {
    DISK_SAFETY_FACTOR,
    estimateDiskBytes,
    FETCH_PEAK_MULTIPLIER,
    formatBytes,
    RENDER_DATA_MARGIN_BYTES,
    TILE_OUTPUT_RATIO,
} from "./disk.js";

describe("estimating disk requirements", () => {
    it("scales the fetch peak with the world's own size", () => {
        const estimate = estimateDiskBytes({ worldBytes: 1_000_000, largestShardFraction: 1 });
        expect(estimate.fetchPeakBytes).toBe(1_000_000 * FETCH_PEAK_MULTIPLIER);
    });

    it("gives an unsharded plan the whole map's worth of tiles", () => {
        const estimate = estimateDiskBytes({ worldBytes: 1_000_000, largestShardFraction: 1 });
        expect(estimate.shardTileBytes).toBe(1_000_000 * TILE_OUTPUT_RATIO);
    });

    it("scales a sharded plan's tile share down with the busiest shard's fraction", () => {
        const whole = estimateDiskBytes({ worldBytes: 1_000_000, largestShardFraction: 1 });
        const quarter = estimateDiskBytes({ worldBytes: 1_000_000, largestShardFraction: 0.25 });
        expect(quarter.shardTileBytes).toBeCloseTo(whole.shardTileBytes * 0.25);
        expect(quarter.perJobBytes).toBeLessThan(whole.perJobBytes);
    });

    it("still counts the whole world for a shard's own download, however small its share", () => {
        const estimate = estimateDiskBytes({ worldBytes: 1_000_000, largestShardFraction: 0.01 });
        expect(estimate.perJobBytes).toBeGreaterThanOrEqual(1_000_000 + RENDER_DATA_MARGIN_BYTES);
    });

    it("required is the larger of the fetch peak and the per-job need, with the safety factor applied", () => {
        // A world large enough that the fetch peak - three copies of the world itself -
        // outweighs the fixed render-data margin, so the fetch stage is the one that governs.
        const fetchHeavy = estimateDiskBytes({ worldBytes: 2_000_000_000, largestShardFraction: 0.01 });
        expect(fetchHeavy.fetchPeakBytes).toBeGreaterThan(fetchHeavy.perJobBytes);
        expect(fetchHeavy.requiredBytes).toBe(fetchHeavy.fetchPeakBytes * DISK_SAFETY_FACTOR);

        // An unsharded plan renders the whole map's tiles on the one runner, which always
        // outweighs the fetch peak: the tile ratio alone (2.5x) already exceeds it (3.2x the
        // world, split across download+join+unpack) once the world's own download is added on
        // top of the tiles.
        const renderHeavy = estimateDiskBytes({ worldBytes: 10_000_000, largestShardFraction: 1 });
        expect(renderHeavy.perJobBytes).toBeGreaterThan(renderHeavy.fetchPeakBytes);
        expect(renderHeavy.requiredBytes).toBe(renderHeavy.perJobBytes * DISK_SAFETY_FACTOR);
    });

    it("never goes negative on a nonsense input", () => {
        const estimate = estimateDiskBytes({ worldBytes: -5, largestShardFraction: -1 });
        expect(estimate.worldBytes).toBe(0);
        expect(estimate.largestShardFraction).toBe(0);
        expect(estimate.requiredBytes).toBeGreaterThanOrEqual(0);
    });

    it("clamps a fraction above one, rather than overstating a shard's own tile share", () => {
        const estimate = estimateDiskBytes({ worldBytes: 1_000_000, largestShardFraction: 4 });
        expect(estimate.largestShardFraction).toBe(1);
    });
});

describe("formatting bytes for a human", () => {
    it("renders gibibytes with one decimal place", () => {
        expect(formatBytes(2.5 * 1024 ** 3)).toBe("2.5 GiB");
    });

    it("drops to mebibytes under one gibibyte", () => {
        expect(formatBytes(512 * 1024 ** 2)).toBe("512 MiB");
    });

    it("says unknown for a nonsense size rather than printing garbage", () => {
        expect(formatBytes(-1)).toBe("unknown");
        expect(formatBytes(Number.NaN)).toBe("unknown");
    });
});

import { DEFAULT_MERGE_GROUP_SIZE } from "../resume/mergeTree.js";
import { describe, expect, it } from "vitest";
import {
    GITHUB_MATRIX_JOB_LIMIT,
    isHiresTileBoundary,
    REGION_BLOCKS,
    type ClosedRange,
} from "../bluemap.js";
import type { RegionMeasurement, WorldMeasurement } from "../world/measure.js";
import { alignedCuts, chooseGrid, planShards, splitAxis, validatePlanAlignment,
    SHARD_OVERHEAD_SECONDS,
    SHARD_WORK_TO_OVERHEAD,
} from "./plan.js";

/** A dense square world of `size` by `size` regions, every region full. */
function denseWorld(size: number, chunksPerRegion = 1024, bytesPerChunk = 4104): WorldMeasurement {
    const regions: RegionMeasurement[] = [];
    for (let z = 0; z < size; z++)
        for (let x = 0; x < size; x++)
            regions.push({
                fileName: "r." + x + "." + z + ".mca",
                x,
                z,
                chunkCount: chunksPerRegion,
                bytes: chunksPerRegion * bytesPerChunk,
            });

    const bounds: ClosedRange = { min: 0, max: size - 1 };
    const chunkCount = regions.reduce((sum, region) => sum + region.chunkCount, 0);
    const bytes = regions.reduce((sum, region) => sum + region.bytes, 0);

    return {
        regionDirectory: "/world/region",
        dimension: "minecraft:overworld",
        regions,
        regionBounds: { x: bounds, z: bounds },
        blockBounds: {
            x: { min: 0, max: size * REGION_BLOCKS - 1 },
            z: { min: 0, max: size * REGION_BLOCKS - 1 },
        },
        chunkCount,
        bytes,
        bytesPerChunk,
        regionGridFillRatio: 1,
    };
}

const layout = { lowresTileSize: 500, lodFactor: 5, lodCount: 3 };

describe("splitting an axis", () => {
    it("divides evenly and gives the remainder to the leading ranges", () => {
        expect(splitAxis({ min: 0, max: 9 }, 3)).toEqual([
            { min: 0, max: 3 },
            { min: 4, max: 6 },
            { min: 7, max: 9 },
        ]);
    });

    it("never produces an empty range, even when asked for more parts than there are regions", () => {
        const parts = splitAxis({ min: -2, max: 0 }, 10);
        expect(parts).toHaveLength(3);
        for (const part of parts) expect(part.max).toBeGreaterThanOrEqual(part.min);
    });
});

describe("turning region splits into aligned block ranges", () => {
    it("leaves the outermost edges unbounded so the masks partition the plane", () => {
        const ranges = alignedCuts(splitAxis({ min: 0, max: 3 }, 4));
        expect(ranges[0]?.min).toBeNull();
        expect(ranges[3]?.max).toBeNull();
    });

    it("puts every interior cut on a hires tile boundary, two blocks past the region edge", () => {
        const ranges = alignedCuts(splitAxis({ min: 0, max: 3 }, 4));
        expect(ranges[1]?.min).toBe(REGION_BLOCKS + 2);
        expect(ranges[0]?.max).toBe(REGION_BLOCKS + 1);
        for (const range of ranges) {
            if (range.min !== null) expect(isHiresTileBoundary(range.min)).toBe(true);
            if (range.max !== null) expect(isHiresTileBoundary(range.max + 1)).toBe(true);
        }
    });

    it("leaves no gap and no overlap between neighbouring ranges", () => {
        const ranges = alignedCuts(splitAxis({ min: -3, max: 4 }, 5));
        for (let index = 1; index < ranges.length; index++)
            expect(ranges[index - 1]!.max! + 1).toBe(ranges[index]!.min);
    });
});

describe("choosing a shard grid", () => {
    it("stays at one job when one is enough", () => {
        expect(chooseGrid(1, 40, 40, 256)).toEqual({ x: 1, z: 1 });
    });

    it("reaches at least the number of jobs asked for", () => {
        for (const wanted of [2, 3, 7, 12, 40, 99]) {
            const grid = chooseGrid(wanted, 40, 40, 256);
            expect(grid.x * grid.z).toBeGreaterThanOrEqual(wanted);
        }
    });

    it("never exceeds the job cap", () => {
        const grid = chooseGrid(4000, 200, 200, GITHUB_MATRIX_JOB_LIMIT);
        expect(grid.x * grid.z).toBeLessThanOrEqual(GITHUB_MATRIX_JOB_LIMIT);
    });

    it("does not ask for more shards along an axis than there are regions", () => {
        const grid = chooseGrid(64, 2, 60, 256);
        expect(grid.x).toBeLessThanOrEqual(2);
        expect(grid.z).toBeLessThanOrEqual(60);
    });
});

describe("planning a small world", () => {
    const plan = planShards(denseWorld(2), { mapId: "world", budgetSeconds: 4 * 3600, ...layout });

    it("uses a single job and says so", () => {
        expect(plan.shards).toHaveLength(1);
        expect(plan.requestedShards).toBe(1);
        expect(plan.decision.join(" ")).toContain("One job is enough");
    });

    it("gives that job no render-mask at all, in both directions", () => {
        expect(plan.shards[0]?.bounds).toEqual({
            x: { min: null, max: null },
            z: { min: null, max: null },
        });
    });

    it("is aligned, trivially", () => {
        expect(validatePlanAlignment(plan)).toEqual([]);
    });
});

describe("planning a large world", () => {
    const world = denseWorld(24);
    const plan = planShards(world, { mapId: "world", budgetSeconds: 20 * 60, ...layout });

    it("splits into many jobs", () => {
        expect(plan.shards.length).toBeGreaterThan(4);
        expect(plan.shards.length).toBeLessThanOrEqual(GITHUB_MATRIX_JOB_LIMIT);
    });

    it("covers every chunk exactly once across the shards", () => {
        const total = plan.shards.reduce((sum, shard) => sum + shard.chunkCount, 0);
        expect(total).toBe(world.chunkCount);
    });

    it("aligns every shard edge to the hires tile grid", () => {
        expect(validatePlanAlignment(plan)).toEqual([]);
    });

    it("numbers the shards from zero without gaps", () => {
        expect(plan.shards.map((shard) => shard.id)).toEqual(
            plan.shards.map((_, index) => index),
        );
    });

    it("explains the arithmetic instead of just producing a number", () => {
        const decision = plan.decision.join("\n");
        expect(decision).toContain("chunks/second");
        expect(decision).toContain("safety margin");
        expect(decision).toMatch(/Splitting into a \d+ by \d+ shard grid/);
    });
});

describe("planning a world that wants more than 256 jobs", () => {
    const world = denseWorld(60);
    const plan = planShards(world, { mapId: "world", budgetSeconds: 60, ...layout });

    it("asks for far more shards than the matrix can hold", () => {
        expect(plan.requestedShards).toBeGreaterThan(GITHUB_MATRIX_JOB_LIMIT);
    });

    it("caps the matrix rather than exceeding it", () => {
        expect(plan.shards.length).toBeLessThanOrEqual(GITHUB_MATRIX_JOB_LIMIT);
    });

    it("enlarges each shard rather than silently dropping the rest of the world", () => {
        const total = plan.shards.reduce((sum, shard) => sum + shard.chunkCount, 0);
        expect(total).toBe(world.chunkCount);
    });

    it("says out loud that the shards are now longer than the budget", () => {
        const decision = plan.decision.join("\n");
        expect(decision).toContain("job limit");
        expect(decision).toContain("Nothing is being skipped");
    });

    it("is still aligned, so the merge still works", () => {
        expect(validatePlanAlignment(plan)).toEqual([]);
    });
});

describe("planning a sparse world", () => {
    it("drops shards that would render nothing", () => {
        const world = denseWorld(8);
        // keep only a diagonal, so most of the shard grid covers no region files at all
        world.regions = world.regions.filter((region) => region.x === region.z);
        world.chunkCount = world.regions.reduce((sum, region) => sum + region.chunkCount, 0);
        world.bytes = world.regions.reduce((sum, region) => sum + region.bytes, 0);

        const plan = planShards(world, { mapId: "world", budgetSeconds: 30, ...layout });
        expect(plan.shards.length).toBeLessThan(plan.grid.x * plan.grid.z);
        expect(plan.decision.join("\n")).toContain("covered no region files");
        expect(plan.shards.reduce((sum, shard) => sum + shard.chunkCount, 0)).toBe(world.chunkCount);
    });
});

describe("alignment validation", () => {
    it("catches a cut placed inside a hires tile", () => {
        const plan = planShards(denseWorld(4), { mapId: "world", budgetSeconds: 60, ...layout });
        const victim = plan.shards.find((shard) => shard.bounds.x.min !== null);
        expect(victim).toBeDefined();
        victim!.bounds.x.min = REGION_BLOCKS; // the unaligned region edge

        const problems = validatePlanAlignment(plan);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems.join("\n")).toContain("inside a hires tile");
    });
});

describe("planning for speed rather than merely for the budget", () => {
    // A world the size of the real one that exposed this: estimated in the tens of hours,
    // against a four-hour budget. The old planner asked only "how few shards still fit?"
    // and answered six, so the run finished inside its budget and took most of a day while
    // fifty-eight allowed jobs sat unused.
    const big = denseWorld(40);

    it("uses far more than the fewest shards that would fit the budget", () => {
        const plan = planShards(big, { mapId: "world", budgetSeconds: 4 * 3600, maxJobs: 64, ...layout });
        const fewestThatFit = Math.ceil(plan.estimate.seconds / (4 * 3600));

        expect(plan.requestedShards).toBeGreaterThan(fewestThatFit);
        expect(plan.shards.length).toBeGreaterThan(fewestThatFit);
    });

    it("never asks for more jobs than it was allowed", () => {
        const plan = planShards(big, { mapId: "world", budgetSeconds: 4 * 3600, maxJobs: 8, ...layout });
        expect(plan.shards.length).toBeLessThanOrEqual(8);
    });

    it("leaves each shard enough real work to be worth its own setup", () => {
        // The limit that stops this asking for the maximum every time. A shard pays for a
        // checkout, an install, a build and a download of the whole world before it draws
        // anything, so slicing until each renders for a minute would spend the run moving
        // the world around rather than rendering it.
        const plan = planShards(big, { mapId: "world", budgetSeconds: 4 * 3600, maxJobs: 256, ...layout });
        const perShardSeconds = plan.estimate.seconds / plan.shards.length;

        expect(perShardSeconds).toBeGreaterThanOrEqual(SHARD_OVERHEAD_SECONDS * SHARD_WORK_TO_OVERHEAD * 0.5);
    });

    it("still fits the budget when the budget is the tighter limit", () => {
        // A short budget must still win: the point is to be faster, never to be slower or
        // to plan a shard that cannot finish in the time a job is given.
        const plan = planShards(big, { mapId: "world", budgetSeconds: 10 * 60, maxJobs: 256, ...layout });
        const perShardSeconds = plan.estimate.seconds / plan.shards.length;

        expect(perShardSeconds).toBeLessThanOrEqual(10 * 60);
    });
});

describe("not buying speed with the map itself", () => {
    // The boundary that matters here is not time. Up to one merge group the run assembles
    // one complete map, which can be downloaded and hosted; past it the map is delivered
    // as partials no runner ever holds together. Sharding harder for speed and quietly
    // handing back a pile of parts would be a worse answer, not a faster one.
    const big = denseWorld(40);

    it("stops at the largest plan that still produces one whole map", () => {
        const plan = planShards(big, { mapId: "world", budgetSeconds: 4 * 3600, maxJobs: 256, ...layout });

        expect(plan.shards.length).toBeLessThanOrEqual(DEFAULT_MERGE_GROUP_SIZE);
        expect(plan.decision.join(" ")).toContain("one complete map");
    });

    it("crosses it anyway when the budget leaves no choice", () => {
        // A shard that cannot finish inside a job's time limit does not finish at all, so
        // here a map in parts genuinely beats no map.
        const plan = planShards(big, { mapId: "world", budgetSeconds: 60, maxJobs: 256, ...layout });

        expect(plan.shards.length).toBeGreaterThan(DEFAULT_MERGE_GROUP_SIZE);
    });

    it("still crosses it when a person asked for a specific count", () => {
        const plan = planShards(big, {
            mapId: "world",
            budgetSeconds: 4 * 3600,
            maxJobs: 256,
            forceShards: 64,
            ...layout,
        });

        expect(plan.shards.length).toBeGreaterThan(DEFAULT_MERGE_GROUP_SIZE);
    });

    it("says nothing about the limit when the plan was never near it", () => {
        const plan = planShards(denseWorld(2), { mapId: "world", budgetSeconds: 4 * 3600, ...layout });

        expect(plan.decision.join(" ")).not.toContain("one complete map");
    });
});

describe("the plan's disk estimate", () => {
    it("gives an unsharded plan the whole map's worth of tiles, not a shard's fraction", () => {
        const plan = planShards(denseWorld(2), { mapId: "world", budgetSeconds: 4 * 3600, ...layout });
        expect(plan.shards).toHaveLength(1);
        expect(plan.disk.largestShardFraction).toBe(1);
        expect(plan.disk.worldBytes).toBe(plan.world.bytes);
    });

    it("shrinks the busiest shard's tile share as a world is split into more even shards", () => {
        const big = denseWorld(40);
        const plan = planShards(big, { mapId: "world", budgetSeconds: 60, maxJobs: 256, ...layout });
        expect(plan.shards.length).toBeGreaterThan(1);
        expect(plan.disk.largestShardFraction).toBeLessThan(1);
        expect(plan.disk.largestShardFraction).toBeGreaterThan(0);
    });

    it("requires at least the world's own size, whatever the shard split", () => {
        const big = denseWorld(40);
        const plan = planShards(big, { mapId: "world", budgetSeconds: 60, maxJobs: 256, ...layout });
        expect(plan.disk.requiredBytes).toBeGreaterThanOrEqual(plan.world.bytes);
    });

    it("explains the disk arithmetic in the decision, the way the time estimate is explained", () => {
        const plan = planShards(denseWorld(24), { mapId: "world", budgetSeconds: 20 * 60, ...layout });
        const decision = plan.decision.join(" ");
        expect(decision).toContain("free disk");
        expect(decision).toContain("world is fetched");
    });
});

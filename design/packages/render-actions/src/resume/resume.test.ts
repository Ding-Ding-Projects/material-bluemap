import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    GITHUB_MATRIX_JOB_LIMIT,
    MAX_PLANNED_SHARDS,
    RENDER_WAVE_SLOTS,
    sanitizeMapId,
} from "../bluemap.js";
import type { ShardPlan } from "../plan/plan.js";
import {
    countHiresTiles,
    inspectShard,
    newShardMarker,
    readShardMarker,
    shardMarkerPath,
    verifyShardMarker,
    writeShardMarker,
} from "./marker.js";
import { describeMergeTree, groupOf, planMergeTree } from "./mergeTree.js";
import {
    planFingerprint,
    shardCacheKey,
    shardCachePaths,
    shardCacheRestorePrefix,
} from "./state.js";
import { describeWaves, planWaves, waveOf, wavesExceedWorkflow } from "./waves.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-ci-resume-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** A shard output directory holding `count` hires tiles. */
async function shardOutput(storageRoot: string, mapId: string, count: number): Promise<string> {
    const mapDirectory = join(storageRoot, mapId);
    await mkdir(join(mapDirectory, "tiles", "0", "x0"), { recursive: true });
    for (let index = 0; index < count; index++) {
        await writeFile(
            join(mapDirectory, "tiles", "0", "x0", `z${String(index)}.prbm.gz`),
            "not a real tile, but a real file",
            "utf8",
        );
    }
    return mapDirectory;
}

function plan(overrides: Partial<ShardPlan> = {}): ShardPlan {
    return {
        mapId: "world",
        dimension: "minecraft:overworld",
        world: {
            regions: { x: { min: 0, max: 1 }, z: { min: 0, max: 1 } },
            blocks: { x: { min: 0, max: 1023 }, z: { min: 0, max: 1023 } },
            regionFileCount: 4,
            chunkCount: 3969,
            bytes: 16_288_776,
            bytesPerChunk: 4104,
        },
        estimate: {
            chunksPerSecond: 24.8,
            rawSeconds: 160,
            seconds: 240,
            complexityFactor: 1,
            calibrated: false,
        } as ShardPlan["estimate"],
        disk: {
            worldBytes: 16_288_776,
            fetchPeakBytes: 52_124_083,
            shardTileBytes: 20_360_970,
            perJobBytes: 38_798_921,
            requiredBytes: 62_548_899,
            largestShardFraction: 2000 / 3969,
        },
        budgetSeconds: 14_400,
        requestedShards: 2,
        grid: { x: 2, z: 1 },
        shards: [
            {
                id: 0,
                gridX: 0,
                gridZ: 0,
                regions: { x: { min: 0, max: 0 }, z: { min: 0, max: 1 } },
                bounds: { x: { min: null, max: 513 }, z: { min: null, max: null } },
                chunkCount: 2000,
                estimatedSeconds: 120,
            },
            {
                id: 1,
                gridX: 1,
                gridZ: 0,
                regions: { x: { min: 1, max: 1 }, z: { min: 0, max: 1 } },
                bounds: { x: { min: 514, max: null }, z: { min: null, max: null } },
                chunkCount: 1969,
                estimatedSeconds: 120,
            },
        ],
        layout: {
            hiresTileSize: 32,
            hiresTileOffset: 2,
            lowresTileSize: 500,
            lodFactor: 5,
            lodCount: 3,
        },
        decision: [],
        ...overrides,
    };
}

/* -------------------------------------------------------------------------- */
/* Completion markers                                                         */
/* -------------------------------------------------------------------------- */

describe("shard completion markers", () => {
    it("treats a shard with no marker as unfinished, and keeps its tiles", async () => {
        const storageRoot = join(root, "bluemap-out", "maps");
        await shardOutput(storageRoot, "world", 12);

        const report = await inspectShard({ storageRoot, mapId: "world", shardId: 3 });

        expect(report.trusted).toBe(false);
        expect(report.reason).toContain("No completion marker");
        // The output is not condemned, only distrusted: it is what makes the re-render
        // cheap, and the report says so.
        expect(report.hiresTileCount).toBe(12);
        expect(report.reason).toContain("12 hires tiles");
    });

    it("trusts a shard whose marker is present and agrees with its output", async () => {
        const storageRoot = join(root, "bluemap-out", "maps");
        await shardOutput(storageRoot, "world", 12);
        await writeShardMarker(
            shardMarkerPath(storageRoot, 3),
            newShardMarker({
                shardId: 3,
                mapId: "world",
                dimension: "minecraft:overworld",
                planFingerprint: "abc123",
                hiresTileCount: 12,
                finishedAt: "2026-08-03T10:00:00.000Z",
            }),
        );

        const report = await inspectShard({
            storageRoot,
            mapId: "world",
            shardId: 3,
            planFingerprint: "abc123",
        });
        expect(report.trusted).toBe(true);
        expect(report.reason).toContain("12 hires tiles, all present");
    });

    it("refuses a marker whose count does not match what is actually there", async () => {
        const storageRoot = join(root, "bluemap-out", "maps");
        await shardOutput(storageRoot, "world", 9);
        await writeShardMarker(
            shardMarkerPath(storageRoot, 0),
            newShardMarker({
                shardId: 0,
                mapId: "world",
                dimension: "minecraft:overworld",
                planFingerprint: "abc123",
                hiresTileCount: 12,
            }),
        );

        const report = await inspectShard({ storageRoot, mapId: "world", shardId: 0 });
        expect(report.trusted).toBe(false);
        expect(report.reason).toContain("recorded 12");
        expect(report.reason).toContain("holds 9");
    });

    it("refuses a marker written for a different plan", async () => {
        const storageRoot = join(root, "bluemap-out", "maps");
        await shardOutput(storageRoot, "world", 4);
        await writeShardMarker(
            shardMarkerPath(storageRoot, 0),
            newShardMarker({
                shardId: 0,
                mapId: "world",
                dimension: "minecraft:overworld",
                planFingerprint: "1111111111111111",
                hiresTileCount: 4,
            }),
        );

        const report = await inspectShard({
            storageRoot,
            mapId: "world",
            shardId: 0,
            planFingerprint: "2222222222222222",
        });
        expect(report.trusted).toBe(false);
        expect(report.reason).toContain("different plan");
    });

    it("treats a half-written marker as no marker", async () => {
        const storageRoot = join(root, "bluemap-out", "maps");
        await shardOutput(storageRoot, "world", 2);
        const path = shardMarkerPath(storageRoot, 0);
        const complete = JSON.stringify(
            newShardMarker({
                shardId: 0,
                mapId: "world",
                dimension: "minecraft:overworld",
                planFingerprint: "abc",
                hiresTileCount: 2,
            }),
        );
        await writeFile(path, complete.slice(0, complete.length - 20), "utf8");

        expect(await readShardMarker(path)).toBeNull();
        expect((await inspectShard({ storageRoot, mapId: "world", shardId: 0 })).trusted).toBe(
            false,
        );
    });

    it("counts nothing for a shard directory that was never created", async () => {
        expect(await countHiresTiles(join(root, "never-rendered"))).toBe(0);
    });

    // Issue #47: a hyphenated map id renders correctly, but BlueMap sanitizes the hyphen to
    // an underscore before naming the storage directory. `inspectShard` is what backs both
    // `resume-check` and (via `countHiresTiles`) `shard-complete`, so this is the wrapper
    // round-trip for both: a shard that really finished, under the id BlueMap really wrote,
    // must be found and correctly counted when only the raw hyphenated id is given.
    it("finds and counts a hyphenated map id's real, sanitized output directory", async () => {
        const storageRoot = join(root, "bluemap-out", "maps");
        const rawMapId = "test-issue44-staging";

        // BlueMap's own behaviour: it wrote tiles under the underscored directory, not the
        // literal hyphenated id a naive `join(storageRoot, rawMapId)` would look for.
        expect(sanitizeMapId(rawMapId)).toBe("test_issue44_staging");
        await shardOutput(storageRoot, sanitizeMapId(rawMapId), 6400);
        await writeShardMarker(
            shardMarkerPath(storageRoot, 0),
            newShardMarker({
                shardId: 0,
                mapId: rawMapId,
                dimension: "minecraft:overworld",
                planFingerprint: "abc123",
                hiresTileCount: 6400,
            }),
        );

        // resume-check, given the raw hyphenated id exactly as a workflow would pass it.
        const report = await inspectShard({
            storageRoot,
            mapId: rawMapId,
            shardId: 0,
            planFingerprint: "abc123",
        });

        expect(report.trusted).toBe(true);
        expect(report.hiresTileCount).toBe(6400);
        expect(report.reason).toContain("6400 hires tiles, all present");
        expect(report.reason).not.toContain("No completion marker");

        // shard-complete's own count (cli.ts's commandShardComplete calls countHiresTiles on
        // the same sanitized join) agrees, rather than reading 0 for a render that worked.
        expect(await countHiresTiles(join(storageRoot, sanitizeMapId(rawMapId)))).toBe(6400);
    });

    it("reports an empty shard with no marker as unfinished rather than as done", async () => {
        // The dangerous case: a job killed before it wrote its first tile. Nothing on disk
        // says anything, and "no tiles" must not read as "nothing to do".
        const mapDirectory = join(root, "empty", "world");
        await mkdir(mapDirectory, { recursive: true });

        const report = await verifyShardMarker({ shardId: 0, mapDirectory, marker: null });
        expect(report.trusted).toBe(false);
        expect(report.hiresTileCount).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/* Cache keys                                                                 */
/* -------------------------------------------------------------------------- */

describe("cache keys", () => {
    it("gives every run its own key so a later run can save at all", () => {
        const base = { planFingerprint: "f".repeat(64), shardId: 4 };
        const first = shardCacheKey({ ...base, runId: "100", runAttempt: 1 });
        const second = shardCacheKey({ ...base, runId: "101", runAttempt: 1 });
        const retry = shardCacheKey({ ...base, runId: "100", runAttempt: 2 });

        expect(new Set([first, second, retry]).size).toBe(3);
    });

    it("puts every key for a shard behind one restore prefix", () => {
        const base = { planFingerprint: "f".repeat(64), shardId: 4 };
        const prefix = shardCacheRestorePrefix(base);
        expect(shardCacheKey({ ...base, runId: "100" }).startsWith(prefix)).toBe(true);
        expect(shardCacheKey({ ...base, runId: "999", runAttempt: 3 }).startsWith(prefix)).toBe(
            true,
        );
    });

    it("keeps shard 1 from matching shard 10's prefix", () => {
        const fingerprint = "f".repeat(64);
        const one = shardCacheRestorePrefix({ planFingerprint: fingerprint, shardId: 1 });
        const ten = shardCacheKey({ planFingerprint: fingerprint, shardId: 10, runId: "1" });
        expect(ten.startsWith(one)).toBe(false);
    });

    it("keeps a different plan out of this plan's caches", () => {
        const a = shardCacheRestorePrefix({ planFingerprint: planFingerprint(plan()), shardId: 0 });
        const b = shardCacheRestorePrefix({
            planFingerprint: planFingerprint(plan({ grid: { x: 4, z: 1 } })),
            shardId: 0,
        });
        expect(a).not.toBe(b);
    });

    it("does not change the fingerprint when only the estimate changes", () => {
        const measured = plan({
            estimate: {
                chunksPerSecond: 31.5,
                rawSeconds: 126,
                seconds: 189,
                complexityFactor: 1,
                calibrated: true,
            } as ShardPlan["estimate"],
        });
        expect(planFingerprint(measured)).toBe(planFingerprint(plan()));
    });

    it("changes the fingerprint when a shard covers a different rectangle", () => {
        const moved = plan();
        const shifted = plan({
            shards: [
                moved.shards[0]!,
                {
                    ...moved.shards[1]!,
                    bounds: { x: { min: 1026, max: null }, z: { min: null, max: null } },
                },
            ],
        });
        expect(planFingerprint(shifted)).not.toBe(planFingerprint(moved));
    });

    it("caches the map directory and the engine data directory", () => {
        expect(
            shardCachePaths({ storageRoot: "out/maps", dataDirectory: "bluemap-data" }),
        ).toEqual(["out/maps", "bluemap-data"]);
    });
});

/* -------------------------------------------------------------------------- */
/* Waves                                                                      */
/* -------------------------------------------------------------------------- */

describe("waves", () => {
    const ids = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

    it("keeps a plan that fits in one matrix as one wave", () => {
        const waves = planWaves(ids(256));
        expect(waves).toHaveLength(1);
        expect(waves[0]?.shardIds).toHaveLength(256);
    });

    it("splits a larger plan into waves and drops nothing", () => {
        const waves = planWaves(ids(600));
        expect(waves.map((wave) => wave.shardIds.length)).toEqual([256, 256, 88]);

        const rendered = waves.flatMap((wave) => wave.shardIds);
        expect(rendered).toHaveLength(600);
        expect(new Set(rendered).size).toBe(600);
    });

    it("never lets a wave exceed what a matrix can hold, however it is asked", () => {
        expect(planWaves(ids(600), 5_000)[0]?.shardIds.length).toBe(GITHUB_MATRIX_JOB_LIMIT);
    });

    it("says which wave a shard belongs to", () => {
        const waves = planWaves(ids(600));
        expect(waveOf(0, waves)).toBe(1);
        expect(waveOf(255, waves)).toBe(1);
        expect(waveOf(256, waves)).toBe(2);
        expect(waveOf(599, waves)).toBe(3);
        expect(waveOf(600, waves)).toBeNull();
    });

    it("reports a plan needing more waves than the workflow has, rather than truncating", () => {
        const tooMany = planWaves(ids(MAX_PLANNED_SHARDS + 256));
        expect(wavesExceedWorkflow(tooMany)).toBe(true);

        const summary = describeWaves(tooMany, { budgetSeconds: 14_400 }).join(" ");
        expect(summary).toContain("Nothing has been truncated");
        expect(summary).toContain("Raise budget-minutes");
    });

    it("explains the split in the run summary, with the numbers that produced it", () => {
        const summary = describeWaves(planWaves(ids(600)), { budgetSeconds: 14_400 }).join(" ");
        expect(summary).toContain("600 shards");
        expect(summary).toContain("3 sequential waves");
        expect(summary).toContain("Nothing is dropped");
        expect(summary).toContain("completion marker");
    });
});

/**
 * `render-world.yml` cannot generate a variable number of jobs, so it declares its wave
 * jobs statically - `wave1`..`wave{RENDER_WAVE_SLOTS}` - and that count has to agree with
 * this constant by hand. This is the thing that keeps "hand" honest: read the real
 * workflow file and fail if it and `RENDER_WAVE_SLOTS` ever drift apart, which is exactly
 * the failure mode issue #39 reported (a workflow silently declaring fewer waves than the
 * code thought it could dispatch).
 */
describe("the workflow's wave jobs stay in sync with RENDER_WAVE_SLOTS", () => {
    const workflowPath = fileURLToPath(
        new URL("../../../../../.github/workflows/render-world.yml", import.meta.url),
    );
    const workflow = readFileSync(workflowPath, "utf8");
    const expectedSlots = Array.from({ length: RENDER_WAVE_SLOTS }, (_, index) => index + 1);

    it("declares exactly one job per wave slot, numbered from 1 without gaps", () => {
        const declaredJobs = [...workflow.matchAll(/^ {2}wave(\d+):\s*$/gm)].map((match) =>
            Number(match[1]),
        );
        expect(declaredJobs).toEqual(expectedSlots);
    });

    it("declares a matching wave-shards and wave-needed output for every slot, and no more", () => {
        const shardSlots = new Set(
            [...workflow.matchAll(/wave(\d+)-shards:/g)].map((match) => Number(match[1])),
        );
        const neededSlots = new Set(
            [...workflow.matchAll(/wave(\d+)-needed:/g)].map((match) => Number(match[1])),
        );
        expect(shardSlots).toEqual(new Set(expectedSlots));
        expect(neededSlots).toEqual(new Set(expectedSlots));
    });

    it("waits on every declared wave before merging, in order and with none skipped", () => {
        const match = /needs: \[plan, (wave1(?:, wave\d+)*)\]/.exec(workflow);
        expect(match).not.toBeNull();
        const waveNumbers = match![1]!
            .split(",")
            .map((token) => Number(token.trim().replace("wave", "")));
        expect(waveNumbers).toEqual(expectedSlots);
    });
});

/* -------------------------------------------------------------------------- */
/* The merge tree                                                             */
/* -------------------------------------------------------------------------- */

describe("the merge tree", () => {
    const ids = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

    it("merges a small plan in one job, exactly as before", () => {
        const tree = planMergeTree(ids(4));
        expect(tree.singleGroup).toBe(true);
        expect(describeMergeTree(tree).join(" ")).toContain("single artifact");
    });

    it("splits a large plan into groups that keep neighbours together", () => {
        const tree = planMergeTree(ids(600), 32);
        expect(tree.groups).toHaveLength(19);
        expect(tree.groups[0]?.shardIds[0]).toBe(0);
        expect(tree.groups[0]?.shardIds.at(-1)).toBe(31);
        expect(tree.groups.at(-1)?.shardIds.at(-1)).toBe(599);

        const merged = tree.groups.flatMap((group) => group.shardIds);
        expect(new Set(merged).size).toBe(600);
    });

    it("says which group merges a shard", () => {
        const tree = planMergeTree(ids(100), 32);
        expect(groupOf(0, tree)).toBe(0);
        expect(groupOf(31, tree)).toBe(0);
        expect(groupOf(32, tree)).toBe(1);
        expect(groupOf(1000, tree)).toBeNull();
    });

    it("explains that a large map ships as parts, and why the final step is small", () => {
        const summary = describeMergeTree(planMergeTree(ids(600), 32)).join(" ");
        expect(summary).toContain("No single runner");
        expect(summary).toContain("partial-hires-");
        expect(summary).toContain("rebuilds lod 2");
        expect(summary).toContain("Unzip them into the same directory");
    });
});

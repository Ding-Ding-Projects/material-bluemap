/**
 * Batch planning: the margin that keeps seams out of the merged world, and the ownership
 * rule that keeps the margin from becoming data loss.
 *
 * All pure. Nothing here needs Chunker, a JVM, or a world.
 */

import { describe, expect, it } from "vitest";
import {
    MARGIN_CHUNKS,
    MAX_REGIONS_PER_BATCH,
    REGION_CHUNKS,
    dimensionDirectory,
    ownedRegionFiles,
    parseSettingsRegions,
    planBatches,
    pruningConfigFor,
    regionsPerBatch,
    type ConversionBatch,
} from "./batch.js";

describe("reading Chunker's settings report", () => {
    it("reads the regions each dimension actually has", () => {
        const raw = JSON.stringify({
            maps: [],
            settings: {},
            dimensions: {
                "minecraft:overworld": [
                    [0, 0],
                    [-1, 2],
                ],
                "minecraft:the_nether": [[3, -4]],
            },
        });

        expect(parseSettingsRegions(raw)).toEqual([
            { dimension: "minecraft:overworld", regions: [{ x: 0, z: 0 }, { x: -1, z: 2 }] },
            { dimension: "minecraft:the_nether", regions: [{ x: 3, z: -4 }] },
        ]);
    });

    it("refuses anything malformed rather than planning from half a world", () => {
        // A plan built from a partly-read report would convert some unknown subset and call
        // it finished. Every one of these must be a refusal, not a best effort.
        for (const raw of [
            "not json",
            "null",
            "[]",
            JSON.stringify({ dimensions: null }),
            JSON.stringify({ dimensions: { overworld: "nope" } }),
            JSON.stringify({ dimensions: { overworld: [[0]] } }),
            JSON.stringify({ dimensions: { overworld: [["a", "b"]] } }),
            JSON.stringify({ dimensions: { overworld: [[1.5, 2]] } }),
        ]) {
            expect(parseSettingsRegions(raw)).toBeNull();
        }
    });

    it("reads a world with no regions as empty rather than as a failure", () => {
        expect(parseSettingsRegions(JSON.stringify({ dimensions: {} }))).toEqual([]);
    });
});

describe("choosing a batch size", () => {
    it("fits the target byte budget", () => {
        // 1000 regions across 1 GB is ~1 MB per region, so ~100 fit in the 100 MB target -
        // capped by the per-batch maximum.
        expect(regionsPerBatch(1024 * 1024 * 1024, 1000)).toBe(MAX_REGIONS_PER_BATCH);
        // 100 regions across 4 GB is ~41 MB each, so two fit in the 100 MB target.
        expect(regionsPerBatch(4 * 1024 * 1024 * 1024, 100)).toBe(2);
        // 100 regions across 8 GB is ~82 MB each, so only one does.
        expect(regionsPerBatch(8 * 1024 * 1024 * 1024, 100)).toBe(1);
    });

    it("never returns zero, however large the regions are", () => {
        // A batch of no regions makes no progress, and a plan of them never finishes.
        expect(regionsPerBatch(500 * 1024 * 1024 * 1024, 10)).toBe(1);
    });

    it("falls back to the cap when the world was never measured", () => {
        expect(regionsPerBatch(null, 1000)).toBe(MAX_REGIONS_PER_BATCH);
        expect(regionsPerBatch(null, 5)).toBe(5);
    });
});

describe("planning batches", () => {
    const dimensions = [
        {
            dimension: "minecraft:overworld",
            regions: [
                { x: 1, z: 1 },
                { x: 0, z: 0 },
                { x: 1, z: 0 },
                { x: 0, z: 1 },
            ],
        },
        { dimension: "minecraft:the_nether", regions: [{ x: 0, z: 0 }] },
    ];

    it("covers every region exactly once", () => {
        const batches = planBatches(dimensions, 3);
        const seen = batches.flatMap((batch) =>
            batch.regions.map((region) => `${batch.dimension}:${String(region.x)},${String(region.z)}`),
        );

        // The property that matters most: a region converted twice would be written twice,
        // and one converted zero times is a hole in the map.
        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);
    });

    it("never mixes dimensions in one batch", () => {
        // Pruning is keyed by dimension, so a batch spanning two could not express itself.
        for (const batch of planBatches(dimensions, 100)) {
            expect(batch.regions.length).toBeGreaterThan(0);
        }
        expect(planBatches(dimensions, 100)).toHaveLength(2);
    });

    it("groups spatially, so neighbours share their margins", () => {
        const [first] = planBatches(dimensions, 2);
        // Row-major: (0,0) and (1,0) are adjacent, not (1,1) and (0,0).
        expect(first?.regions).toEqual([
            { x: 0, z: 0 },
            { x: 1, z: 0 },
        ]);
    });

    it("numbers batches consecutively across dimensions", () => {
        const batches = planBatches(dimensions, 2);
        expect(batches.map((batch) => batch.index)).toEqual([0, 1, 2]);
    });

    it("plans nothing for a world with no regions", () => {
        expect(planBatches([{ dimension: "minecraft:overworld", regions: [] }], 4)).toEqual([]);
    });
});

describe("the pruning config for a batch", () => {
    const batch: ConversionBatch = {
        index: 0,
        dimension: "minecraft:overworld",
        regions: [{ x: 0, z: 0 }],
    };

    it("reads one chunk beyond the region it keeps, on every side", () => {
        const config = pruningConfigFor(batch);
        const box = config.configs["minecraft:overworld"]?.regions[0];

        // Region (0,0) is chunks 0..31. The margin is what gives every owned chunk - including
        // the ones on the very edge - a real neighbour to decide its connections against.
        expect(box).toEqual({
            minChunkX: -MARGIN_CHUNKS,
            minChunkZ: -MARGIN_CHUNKS,
            maxChunkX: REGION_CHUNKS - 1 + MARGIN_CHUNKS,
            maxChunkZ: REGION_CHUNKS - 1 + MARGIN_CHUNKS,
        });
    });

    it("handles negative region coordinates", () => {
        const box = pruningConfigFor({ ...batch, regions: [{ x: -1, z: -2 }] }).configs[
            "minecraft:overworld"
        ]?.regions[0];

        expect(box).toEqual({
            minChunkX: -32 - 1,
            minChunkZ: -64 - 1,
            maxChunkX: -1 + 1,
            maxChunkZ: -33 + 1,
        });
    });

    it("includes rather than excludes, and names only this batch's dimension", () => {
        const config = pruningConfigFor({ ...batch, dimension: "minecraft:the_end" });
        expect(Object.keys(config.configs)).toEqual(["minecraft:the_end"]);
        expect(config.configs["minecraft:the_end"]?.include).toBe(true);
    });

    it("emits one box per region, so a non-rectangular batch is expressible", () => {
        const config = pruningConfigFor({
            ...batch,
            regions: [
                { x: 0, z: 0 },
                { x: 5, z: 9 },
            ],
        });
        expect(config.configs["minecraft:overworld"]?.regions).toHaveLength(2);
    });
});

describe("what a batch owns", () => {
    it("claims only its own region files, never the margin's", () => {
        const owned = ownedRegionFiles({
            index: 0,
            dimension: "minecraft:overworld",
            regions: [
                { x: 0, z: 0 },
                { x: -1, z: 2 },
            ],
        });

        // The batch also *writes* slivers of the eight regions around each of these. Keeping
        // one would overwrite the complete file that its owning batch produces, turning the
        // margin from a correctness mechanism into data loss.
        expect(owned).toEqual(["r.0.0.mca", "r.-1.2.mca"]);
    });
});

describe("where a dimension's regions live in a Java world", () => {
    it("uses Minecraft's own layout", () => {
        expect(dimensionDirectory("minecraft:overworld")).toBe("");
        expect(dimensionDirectory("minecraft:the_nether")).toBe("DIM-1");
        expect(dimensionDirectory("minecraft:the_end")).toBe("DIM1");
    });

    it("puts a custom dimension where the world reader already looks for one", () => {
        // `world/inspect.ts` reads `dimensions/<namespace>/<name>/region`, so a converted
        // custom dimension has to land there or it silently has no terrain.
        expect(dimensionDirectory("mypack:mining")).toBe("dimensions/mypack/mining");
    });
});

import { describe, expect, it } from "vitest";
import type { WorldInspection } from "../world/worldFolder.js";
import { maskWorldFor } from "./maskWorld.js";

const inspection: WorldInspection = {
    folder: "C:/saves/world",
    ok: true,
    problems: [],
    dimensions: [
        {
            key: "minecraft:overworld",
            dimensionType: "minecraft:overworld",
            label: "Overworld",
            regionDirectory: "region",
            regionFiles: 4,
            regionExtent: { minX: -512, maxX: 511, minZ: 0, maxZ: 1023 },
            preset: "overworld",
            sorting: 0,
            custom: false,
            external: false,
        },
        {
            key: "minecraft:the_nether",
            dimensionType: "minecraft:the_nether",
            label: "The Nether",
            regionDirectory: "DIM-1/region",
            regionFiles: 2,
            regionExtent: { minX: 0, maxX: 511, minZ: -512, maxZ: 511 },
            preset: "nether",
            sorting: 100,
            custom: false,
            external: false,
        },
    ],
    hasLevelDat: true,
    spawn: { x: 24, z: -40 },
    spawnError: null,
    unchecked: false,
};

describe("maskWorldFor", () => {
    it("carries the selected dimension's measured extent and overworld spawn exactly", () => {
        expect(maskWorldFor(inspection, "minecraft:overworld")).toEqual({
            extent: { minX: -512, maxX: 511, minZ: 0, maxZ: 1023 },
            extentUnavailableReason: null,
            spawn: { x: 24, z: -40 },
            spawnUnavailableReason: null,
            regionCount: 4,
        });
    });

    it("uses the nether's own extent and never relabels overworld spawn as nether spawn", () => {
        const world = maskWorldFor(inspection, "minecraft:the_nether");
        expect(world.extent).toEqual({ minX: 0, maxX: 511, minZ: -512, maxZ: 511 });
        expect(world.spawn).toBeNull();
        expect(world.spawnUnavailableReason).toContain("overworld");
    });
});

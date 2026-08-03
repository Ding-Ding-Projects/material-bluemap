import { generateWorld } from "@material-bluemap/worldgen";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REGION_BLOCKS } from "../bluemap.js";
import {
    chunksInRegionRectangle,
    measureWorld,
    regionDirectoryCandidates,
    type WorldMeasurement,
} from "./measure.js";
import { locateWorld, WorldValidationError } from "./validate.js";

/**
 * Measured against a world this repository generates itself, in real anvil format, so
 * the location-table parsing is exercised on files a Minecraft client would accept
 * rather than on a fixture written to match the parser.
 */
describe("measuring a generated world", () => {
    let root: string;
    let worldFolder: string;
    let measurement: WorldMeasurement;

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), "render-actions-measure-"));
        const world = await generateWorld({ seed: 20260803, size: 600, outDir: root, name: "world" });
        worldFolder = world.worldFolder;
        measurement = await measureWorld(join(worldFolder, "region"), "minecraft:overworld");
    }, 120_000);

    afterAll(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("finds every region file and counts the chunks that are really in them", () => {
        // a 600-block world is 38 chunks square, which spans regions 0 and 1 on both axes
        expect(measurement.regions.map((region) => region.fileName).sort()).toEqual([
            "r.0.0.mca",
            "r.0.1.mca",
            "r.1.0.mca",
            "r.1.1.mca",
        ]);
        expect(measurement.chunkCount).toBe(38 * 38);
    });

    it("counts each region's own chunks rather than assuming it is full", () => {
        const byName = new Map(measurement.regions.map((region) => [region.fileName, region]));
        // the world's far edge only reaches chunk 37, so the outer regions are partial
        expect(byName.get("r.0.0.mca")?.chunkCount).toBe(32 * 32);
        expect(byName.get("r.1.0.mca")?.chunkCount).toBe(6 * 32);
        expect(byName.get("r.0.1.mca")?.chunkCount).toBe(32 * 6);
        expect(byName.get("r.1.1.mca")?.chunkCount).toBe(6 * 6);
    });

    it("derives the bounding box from the regions on disk", () => {
        expect(measurement.regionBounds).toEqual({ x: { min: 0, max: 1 }, z: { min: 0, max: 1 } });
        expect(measurement.blockBounds).toEqual({
            x: { min: 0, max: 2 * REGION_BLOCKS - 1 },
            z: { min: 0, max: 2 * REGION_BLOCKS - 1 },
        });
    });

    it("reports a bytes-per-chunk figure for the work estimate to calibrate on", () => {
        expect(measurement.bytesPerChunk).toBeGreaterThan(0);
        expect(measurement.bytes).toBe(
            measurement.regions.reduce((sum, region) => sum + region.bytes, 0),
        );
    });

    it("sums the chunks inside a region rectangle", () => {
        expect(chunksInRegionRectangle(measurement, { min: 0, max: 0 }, { min: 0, max: 1 })).toBe(
            32 * 32 + 32 * 6,
        );
        expect(chunksInRegionRectangle(measurement, { min: 5, max: 9 }, { min: 5, max: 9 })).toBe(0);
    });

    it("locates the world through a wrapper folder, the way an unzipped archive arrives", async () => {
        const located = await locateWorld(root, "minecraft:overworld");
        expect(located.worldDirectory).toBe(worldFolder);
        expect(located.regionFileCount).toBe(4);
    });

    it("refuses a directory that is not a world, and says what it looked at", async () => {
        const empty = await mkdtemp(join(tmpdir(), "render-actions-empty-"));
        await writeFile(join(empty, "readme.txt"), "not a world");
        await expect(locateWorld(empty, "minecraft:overworld")).rejects.toBeInstanceOf(
            WorldValidationError,
        );
        await expect(locateWorld(empty, "minecraft:overworld")).rejects.toThrow(/No level\.dat/);
        await rm(empty, { recursive: true, force: true });
    });

    it("refuses a dimension the world has not generated", async () => {
        await expect(locateWorld(root, "minecraft:the_nether")).rejects.toThrow(
            /no region files for dimension 'minecraft:the_nether'/,
        );
    });
});

describe("dimension to region directory", () => {
    it("puts the overworld at the world root and the others where minecraft does", () => {
        expect(regionDirectoryCandidates("/w", "minecraft:overworld")).toEqual([join("/w", "region")]);
        expect(regionDirectoryCandidates("/w", "minecraft:the_nether")[0]).toBe(
            join("/w", "DIM-1", "region"),
        );
        expect(regionDirectoryCandidates("/w", "minecraft:the_end")[0]).toBe(
            join("/w", "DIM1", "region"),
        );
    });

    it("sends a modded or datapack dimension to the dimensions folder", () => {
        expect(regionDirectoryCandidates("/w", "mymod:mining")).toEqual([
            join("/w", "dimensions", "mymod", "mining", "region"),
        ]);
    });
});

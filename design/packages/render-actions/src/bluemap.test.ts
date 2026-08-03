import { describe, expect, it } from "vitest";
import {
    alignBoundaryUp,
    HIRES_TILE_OFFSET,
    HIRES_TILE_SIZE,
    hiresTileMaxBlock,
    hiresTileMinBlock,
    hiresTileOfBlock,
    isHiresTileBoundary,
    regionBlockRange,
    REGION_BLOCKS,
} from "./bluemap.js";

describe("the hires tile grid", () => {
    it("is offset by two blocks, which is the whole reason alignment matters", () => {
        // confirmed against a real render: settings.json says hires.translate = [2, 2]
        expect(hiresTileMinBlock(0)).toBe(2);
        expect(hiresTileMaxBlock(0)).toBe(33);
        expect(hiresTileMinBlock(15)).toBe(482);
        expect(hiresTileMaxBlock(15)).toBe(513);
        expect(hiresTileMinBlock(16)).toBe(514);
    });

    it("puts a region edge inside a tile rather than between two", () => {
        // block 512 is a region boundary, and it lands mid-tile
        expect(isHiresTileBoundary(512)).toBe(false);
        expect(hiresTileOfBlock(512)).toBe(hiresTileOfBlock(513));
    });

    it("rounds a region edge up to the next tile edge", () => {
        expect(alignBoundaryUp(512)).toBe(514);
        expect(alignBoundaryUp(0)).toBe(2);
        expect(alignBoundaryUp(2)).toBe(2);
        expect(alignBoundaryUp(-512)).toBe(-510);
    });

    it("aligns every region boundary onto a tile boundary", () => {
        for (let region = -8; region <= 8; region++) {
            const aligned = alignBoundaryUp(region * REGION_BLOCKS);
            expect(isHiresTileBoundary(aligned)).toBe(true);
            expect(aligned - region * REGION_BLOCKS).toBe(2);
        }
    });

    it("agrees with itself about which tile a block is in", () => {
        for (let block = -200; block <= 200; block++) {
            const tile = hiresTileOfBlock(block);
            expect(hiresTileMinBlock(tile)).toBeLessThanOrEqual(block);
            expect(hiresTileMaxBlock(tile)).toBeGreaterThanOrEqual(block);
        }
    });

    it("keeps the constants that the shard configs and the merge both depend on", () => {
        expect(HIRES_TILE_SIZE).toBe(32);
        expect(HIRES_TILE_OFFSET).toBe(2);
        expect(regionBlockRange(-1)).toEqual({ min: -512, max: -1 });
        expect(regionBlockRange(2)).toEqual({ min: 1024, max: 1535 });
    });
});

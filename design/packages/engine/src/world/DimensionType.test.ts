import { describe, expect, it } from "vitest";
import { DimensionType } from "./DimensionType.js";

describe("DimensionType builtin presets", () => {
    it("OVERWORLD", () => {
        const overworld = DimensionType.OVERWORLD;
        expect(overworld.hasSkylight()).toBe(true);
        expect(overworld.hasCeiling()).toBe(false);
        expect(overworld.getAmbientLight()).toBe(0);
        expect(overworld.getMinY()).toBe(-64);
        expect(overworld.getHeight()).toBe(384);
        expect(overworld.getFixedTime()).toBeNull();
        expect(overworld.getCoordinateScale()).toBe(1.0);
    });

    it("OVERWORLD_CAVES", () => {
        const caves = DimensionType.OVERWORLD_CAVES;
        expect(caves.hasSkylight()).toBe(true);
        expect(caves.hasCeiling()).toBe(true);
        expect(caves.getAmbientLight()).toBe(0);
        expect(caves.getMinY()).toBe(-64);
        expect(caves.getHeight()).toBe(384);
        expect(caves.getFixedTime()).toBeNull();
        expect(caves.getCoordinateScale()).toBe(1.0);
    });

    it("NETHER", () => {
        const nether = DimensionType.NETHER;
        expect(nether.hasSkylight()).toBe(false);
        expect(nether.hasCeiling()).toBe(true);
        // 0.1f widened to double, like in Java
        expect(nether.getAmbientLight()).toBe(Math.fround(0.1));
        expect(nether.getMinY()).toBe(0);
        expect(nether.getHeight()).toBe(256);
        expect(nether.getFixedTime()).toBe(6000);
        expect(nether.getCoordinateScale()).toBe(8.0);
    });

    it("END", () => {
        const end = DimensionType.END;
        expect(end.hasSkylight()).toBe(true);
        expect(end.hasCeiling()).toBe(false);
        expect(end.getAmbientLight()).toBe(0);
        expect(end.getMinY()).toBe(0);
        expect(end.getHeight()).toBe(256);
        expect(end.getFixedTime()).toBe(18000);
        expect(end.getCoordinateScale()).toBe(1.0);
    });
});

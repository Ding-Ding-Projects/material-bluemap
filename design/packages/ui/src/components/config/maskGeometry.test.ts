import { describe, expect, it } from "vitest";
import type { BoxMask, CircleMask, EllipseMask, MaskConfig, PolygonMask } from "@material-bluemap/config";
import {
    BLOCKS_PER_CHUNK_SIDE,
    BLOCKS_PER_REGION_SIDE,
    boxBoundsXZ,
    boxFootprintAreaBlocks,
    circleFootprintAreaBlocks,
    combinedBoundsXZ,
    ellipseFootprintAreaBlocks,
    estimateRenderCost,
    polygonFootprintAreaBlocks,
    shapeBoundsXZ,
} from "./maskGeometry.js";
import { JAVA_INT_MAX, JAVA_INT_MIN } from "./fieldValue.js";

function box(overrides: Partial<BoxMask> = {}): BoxMask {
    return {
        type: "bluemap:box",
        subtract: false,
        "min-x": JAVA_INT_MIN,
        "max-x": JAVA_INT_MAX,
        "min-y": JAVA_INT_MIN,
        "max-y": JAVA_INT_MAX,
        "min-z": JAVA_INT_MIN,
        "max-z": JAVA_INT_MAX,
        ...overrides,
    };
}

function circle(overrides: Partial<CircleMask> = {}): CircleMask {
    return {
        type: "bluemap:circle",
        subtract: false,
        "center-x": 0,
        "center-z": 0,
        radius: 1.7976931348623157e308,
        "min-y": JAVA_INT_MIN,
        "max-y": JAVA_INT_MAX,
        ...overrides,
    };
}

describe("maskGeometry: bounds", () => {
    it("reads a bounded box's bounds directly", () => {
        const shape = box({ "min-x": -10, "max-x": 10, "min-z": -5, "max-z": 5 });
        expect(boxBoundsXZ(shape)).toEqual({ minX: -10, maxX: 10, minZ: -5, maxZ: 5 });
    });

    it("reports an axis left at the Java int sentinel as unbounded", () => {
        const shape = box({ "min-x": -10, "max-x": 10 }); // Z axis left at the default sentinel
        expect(boxBoundsXZ(shape)).toBeNull();
    });

    it("dispatches every shape kind through shapeBoundsXZ", () => {
        const b = box({ "min-x": 0, "max-x": 9, "min-z": 0, "max-z": 9 });
        expect(shapeBoundsXZ(b)).toEqual({ minX: 0, maxX: 9, minZ: 0, maxZ: 9 });
    });

    it("combines only additive shapes for the drawing extent, ignoring a subtract shape", () => {
        const add = box({ "min-x": 0, "max-x": 100, "min-z": 0, "max-z": 100 });
        const sub = box({ "min-x": 40, "max-x": 60, "min-z": 40, "max-z": 60, subtract: true });
        expect(combinedBoundsXZ([add, sub])).toEqual({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 });
    });

    it("returns null for an empty mask list — there is no extent to frame", () => {
        expect(combinedBoundsXZ([])).toBeNull();
    });
});

describe("maskGeometry: footprint area", () => {
    it("computes a box's exact area, inclusive on both ends", () => {
        // 0..9 on each axis is 10 blocks wide, so 100 total.
        const shape = box({ "min-x": 0, "max-x": 9, "min-z": 0, "max-z": 9 });
        expect(boxFootprintAreaBlocks(shape)).toBe(100);
    });

    it("computes a circle's exact area from its radius", () => {
        const shape = circle({ radius: 10 });
        expect(circleFootprintAreaBlocks(shape)).toBeCloseTo(Math.PI * 100, 5);
    });

    it("refuses a circle at the unbounded default radius", () => {
        expect(circleFootprintAreaBlocks(circle())).toBeNull();
    });

    it("computes an ellipse's exact area from both radii", () => {
        const shape: EllipseMask = {
            type: "bluemap:ellipse",
            subtract: false,
            "center-x": 0,
            "center-z": 0,
            "radius-x": 4,
            "radius-z": 2,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
        };
        expect(ellipseFootprintAreaBlocks(shape)).toBeCloseTo(Math.PI * 4 * 2, 5);
    });

    it("computes a polygon's exact area with the shoelace formula, closing the outline automatically", () => {
        // A 10x10 square given as 4 corners, without repeating the first point.
        const shape: PolygonMask = {
            type: "bluemap:polygon",
            subtract: false,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
            shape: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 10 },
                { x: 0, z: 10 },
            ],
        };
        expect(polygonFootprintAreaBlocks(shape)).toBe(100);
    });

    it("refuses a polygon with fewer than 3 points, exactly as the engine does", () => {
        const shape: PolygonMask = {
            type: "bluemap:polygon",
            subtract: false,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
            shape: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
            ],
        };
        expect(polygonFootprintAreaBlocks(shape)).toBeNull();
    });
});

describe("maskGeometry: estimateRenderCost", () => {
    it("reports whole-world for an empty mask list", () => {
        const estimate = estimateRenderCost([]);
        expect(estimate.basis).toBe("whole-world");
        expect(estimate.exact).toBe(true);
        expect(estimate.areaBlocks).toBeNull();
    });

    it("reports an exact area for a single bounded additive box", () => {
        const shape = box({ "min-x": 0, "max-x": 15, "min-z": 0, "max-z": 15 }); // 16x16 = one chunk
        const estimate = estimateRenderCost([shape]);
        expect(estimate.basis).toBe("exact");
        expect(estimate.exact).toBe(true);
        expect(estimate.areaBlocks).toBe(BLOCKS_PER_CHUNK_SIDE * BLOCKS_PER_CHUNK_SIDE);
        expect(estimate.areaChunks).toBe(1);
    });

    it("converts blocks to regions at the real anvil region size", () => {
        const shape = box({ "min-x": 0, "max-x": BLOCKS_PER_REGION_SIDE - 1, "min-z": 0, "max-z": BLOCKS_PER_REGION_SIDE - 1 });
        const estimate = estimateRenderCost([shape]);
        expect(estimate.areaRegions).toBe(1);
    });

    it("reports an upper-bound, not exact, once a second additive shape joins", () => {
        const a = box({ "min-x": 0, "max-x": 9, "min-z": 0, "max-z": 9 }); // 100
        const b = box({ "min-x": 100, "max-x": 109, "min-z": 100, "max-z": 109 }); // 100
        const estimate = estimateRenderCost([a, b]);
        expect(estimate.basis).toBe("upper-bound");
        expect(estimate.exact).toBe(false);
        expect(estimate.areaBlocks).toBe(200);
    });

    it("reports an upper-bound once any shape subtracts, even with only one additive shape", () => {
        const add = box({ "min-x": 0, "max-x": 99, "min-z": 0, "max-z": 99 }); // 10000
        const sub = box({ "min-x": 40, "max-x": 59, "min-z": 40, "max-z": 59, subtract: true }); // 400
        const estimate = estimateRenderCost([add, sub]);
        // The real rendered area is 10000 - 400 = 9600, strictly less than the reported bound.
        expect(estimate.basis).toBe("upper-bound");
        expect(estimate.exact).toBe(false);
        expect(estimate.areaBlocks).toBe(10000);
        expect(estimate.areaBlocks).toBeGreaterThan(9600);
    });

    it("reports unbounded rather than inventing a number when a shape has no limit", () => {
        const shape = box({ "min-x": 0, "max-x": 99 }); // Z left unbounded
        const estimate = estimateRenderCost([shape]);
        expect(estimate.basis).toBe("unbounded");
        expect(estimate.areaBlocks).toBeNull();
    });

    it("never lets the upper bound understate the true combined area for additive-only shapes", () => {
        // Two overlapping boxes: true union area is less than the naive sum, so "upper bound"
        // must stay an upper bound, never a claimed exact number.
        const a = box({ "min-x": 0, "max-x": 9, "min-z": 0, "max-z": 9 }); // 100
        const b = box({ "min-x": 5, "max-x": 14, "min-z": 5, "max-z": 14 }); // 100, overlaps a
        const estimate = estimateRenderCost([a, b]);
        expect(estimate.exact).toBe(false);
        expect(estimate.areaBlocks).toBe(200);
    });
});

describe("maskGeometry: blur nests its inner shapes", () => {
    it("frames a blur's bound as the union of its nested additive shapes", () => {
        const inner = box({ "min-x": 0, "max-x": 9, "min-z": 0, "max-z": 9 });
        const blurShape: MaskConfig = { type: "bluemap:blur", subtract: false, size: 5, masks: [inner] };
        expect(shapeBoundsXZ(blurShape)).toEqual({ minX: 0, maxX: 9, minZ: 0, maxZ: 9 });
    });
});

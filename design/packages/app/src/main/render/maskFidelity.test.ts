import { describe, expect, it } from "vitest";
import type { BoxMask, CircleMask, MaskConfig } from "@material-bluemap/config";
import { checkCloudFidelity, localFidelity } from "./maskFidelity.js";

const BOX: BoxMask = {
    type: "bluemap:box",
    subtract: false,
    "min-x": -100,
    "max-x": 100,
    "min-y": -64,
    "max-y": 320,
    "min-z": -100,
    "max-z": 100,
};

const SUBTRACT_BOX: BoxMask = { ...BOX, subtract: true };

const CIRCLE: CircleMask = {
    type: "bluemap:circle",
    subtract: false,
    "center-x": 0,
    "center-z": 0,
    radius: 50,
    "min-y": -64,
    "max-y": 320,
};

describe("checkCloudFidelity: mirrors packages/cli/src/maps.ts maskFor exactly", () => {
    it("honors an empty mask list (Mask.ALL either way)", () => {
        const result = checkCloudFidelity([]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("whole-world-no-mask");
    });

    it("honors exactly one non-subtracting box", () => {
        const result = checkCloudFidelity([BOX]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-box");
        expect(result.unsupportedReason).toBeNull();
    });

    it("does NOT honor a single subtracting box — silently downgrades to the whole world", () => {
        const result = checkCloudFidelity([SUBTRACT_BOX]);
        expect(result.honored).toBe(false);
        expect(result.effect).toBe("whole-world-unsupported");
        expect(result.unsupportedReason).toMatch(/subtract/i);
    });

    it("does NOT honor a circle", () => {
        const result = checkCloudFidelity([CIRCLE]);
        expect(result.honored).toBe(false);
        expect(result.unsupportedReason).toMatch(/circle/i);
    });

    it("does NOT honor more than one shape, even two identical boxes", () => {
        const result = checkCloudFidelity([BOX, { ...BOX, "min-x": 200, "max-x": 300 }]);
        expect(result.honored).toBe(false);
        expect(result.unsupportedReason).toMatch(/2 shapes/i);
    });

    it("names every one of the four unsupported shape kinds distinctly", () => {
        const ellipse: MaskConfig = { type: "bluemap:ellipse", subtract: false, "center-x": 0, "center-z": 0, "radius-x": 10, "radius-z": 5, "min-y": -64, "max-y": 320 };
        const polygon: MaskConfig = { type: "bluemap:polygon", subtract: false, "min-y": -64, "max-y": 320, shape: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] };
        const blur: MaskConfig = { type: "bluemap:blur", subtract: false, size: 5, masks: [BOX] };

        expect(checkCloudFidelity([ellipse]).unsupportedReason).toMatch(/ellipse/i);
        expect(checkCloudFidelity([polygon]).unsupportedReason).toMatch(/polygon/i);
        expect(checkCloudFidelity([blur]).unsupportedReason).toMatch(/blur/i);
    });
});

describe("localFidelity: the local desktop render always applies exactly what was drawn", () => {
    it("is honored for an empty mask", () => {
        expect(localFidelity([])).toEqual({ honored: true, effect: "whole-world-no-mask", unsupportedReason: null });
    });

    it("is honored even for shapes the cloud path cannot translate", () => {
        const result = localFidelity([CIRCLE, SUBTRACT_BOX]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-full");
    });
});

import { describe, expect, it } from "vitest";
import type { BoxMask, CircleMask, MaskConfig } from "@worldlens/config";
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

describe("checkCloudFidelity: mirrors packages/cli/src/maps.ts full mask parity", () => {
    it("honors an empty mask list (Mask.ALL either way)", () => {
        const result = checkCloudFidelity([]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("whole-world-no-mask");
    });

    it("honors exactly one non-subtracting box", () => {
        const result = checkCloudFidelity([BOX]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-full");
        expect(result.unsupportedReason).toBeNull();
    });

    it("honors a single subtracting box", () => {
        const result = checkCloudFidelity([SUBTRACT_BOX]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-full");
        expect(result.unsupportedReason).toBeNull();
    });

    it("honors a circle", () => {
        const result = checkCloudFidelity([CIRCLE]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-full");
    });

    it("honors more than one ordered shape", () => {
        const result = checkCloudFidelity([BOX, { ...BOX, "min-x": 200, "max-x": 300 }]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-full");
    });

    it("honors every remaining shape kind, including recursive blur", () => {
        const ellipse: MaskConfig = {
            type: "bluemap:ellipse",
            subtract: false,
            "center-x": 0,
            "center-z": 0,
            "radius-x": 10,
            "radius-z": 5,
            "min-y": -64,
            "max-y": 320,
        };
        const polygon: MaskConfig = {
            type: "bluemap:polygon",
            subtract: false,
            "min-y": -64,
            "max-y": 320,
            shape: [
                { x: 0, z: 0 },
                { x: 1, z: 0 },
                { x: 1, z: 1 },
            ],
        };
        const blur: MaskConfig = { type: "bluemap:blur", subtract: false, size: 5, masks: [BOX] };

        for (const mask of [ellipse, polygon, blur]) {
            expect(checkCloudFidelity([mask])).toEqual({
                honored: true,
                effect: "exact-full",
                unsupportedReason: null,
            });
        }
    });
});

describe("localFidelity: the local desktop render always applies exactly what was drawn", () => {
    it("is honored for an empty mask", () => {
        expect(localFidelity([])).toEqual({
            honored: true,
            effect: "whole-world-no-mask",
            unsupportedReason: null,
        });
    });

    it("is honored for a multi-layer mask", () => {
        const result = localFidelity([CIRCLE, SUBTRACT_BOX]);
        expect(result.honored).toBe(true);
        expect(result.effect).toBe("exact-full");
    });
});

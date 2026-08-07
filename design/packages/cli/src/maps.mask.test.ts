import { describe, expect, it } from "vitest";
import type { MaskConfig } from "@material-bluemap/config";
import { BlurMask, CombinedMask } from "@material-bluemap/engine";
import { combinedMaskFromConfig, createMaskFromConfig, maskFor } from "./maps.js";

const BOX: MaskConfig = {
    type: "bluemap:box",
    subtract: false,
    "min-x": 0,
    "min-y": 0,
    "min-z": 0,
    "max-x": 20,
    "max-y": 20,
    "max-z": 20,
};

const CIRCLE: MaskConfig = {
    type: "bluemap:circle",
    subtract: false,
    "center-x": 10,
    "center-z": 10,
    radius: 4,
    "min-y": 0,
    "max-y": 20,
};

describe("CombinedMaskSerializer parity", () => {
    it("keeps an empty list as upstream's all-true empty CombinedMask", () => {
        const mask = maskFor({ "render-mask": [] });

        expect(mask).toBeInstanceOf(CombinedMask);
        expect((mask as CombinedMask).size()).toBe(0);
        expect(mask.test(-1_000_000, -64, 1_000_000)).toBe(true);
    });

    it("creates every concrete non-blur shape with the exact configured geometry", () => {
        const box = createMaskFromConfig(BOX);
        const circle = createMaskFromConfig(CIRCLE);
        const ellipse = createMaskFromConfig({
            type: "bluemap:ellipse",
            subtract: false,
            "center-x": 0,
            "center-z": 0,
            "radius-x": 10,
            "radius-z": 2,
            "min-y": -10,
            "max-y": 10,
        });
        const polygon = createMaskFromConfig({
            type: "bluemap:polygon",
            subtract: false,
            "min-y": 0,
            "max-y": 20,
            shape: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 10 },
                { x: 0, z: 10 },
            ],
        });

        expect(box.test(0, 0, 0)).toBe(true);
        expect(box.test(21, 10, 10)).toBe(false);
        expect(circle.test(14, 10, 10)).toBe(true);
        expect(circle.test(15, 10, 10)).toBe(false);
        expect(ellipse.test(10, 0, 0)).toBe(true);
        expect(ellipse.test(0, 0, 3)).toBe(false);
        expect(polygon.test(5, 10, 5)).toBe(true);
        expect(polygon.test(11, 10, 5)).toBe(false);
    });

    it("preserves ordered additive and subtractive layer semantics", () => {
        const cutout = combinedMaskFromConfig([BOX, { ...CIRCLE, subtract: true }]);
        expect(cutout.test(2, 10, 2)).toBe(true);
        expect(cutout.test(10, 10, 10)).toBe(false);
        expect(cutout.test(30, 10, 30)).toBe(false);

        const readded = combinedMaskFromConfig([
            BOX,
            { ...CIRCLE, subtract: true },
            {
                type: "bluemap:box",
                subtract: false,
                "min-x": 9,
                "min-y": 9,
                "min-z": 9,
                "max-x": 11,
                "max-y": 11,
                "max-z": 11,
            },
        ]);
        expect(readded.test(10, 10, 10)).toBe(true);
    });

    it("preserves upstream's first-subtract implicit whole-world layer", () => {
        const mask = combinedMaskFromConfig([{ ...BOX, subtract: true }]);

        expect(mask.size()).toBe(2);
        expect(mask.test(10, 10, 10)).toBe(false);
        expect(mask.test(30, 10, 30)).toBe(true);
    });

    it("recursively builds blur masks and disables only the blur for non-positive sizes", () => {
        const nested: MaskConfig[] = [BOX, { ...CIRCLE, subtract: true }];
        const enabled = createMaskFromConfig({
            type: "bluemap:blur",
            subtract: false,
            size: 5,
            masks: nested,
        });
        const disabled = createMaskFromConfig({
            type: "bluemap:blur",
            subtract: false,
            size: 0,
            masks: nested,
        });

        expect(enabled).toBeInstanceOf(BlurMask);
        expect(disabled).toBeInstanceOf(CombinedMask);
        expect(disabled.test(2, 10, 2)).toBe(true);
        expect(disabled.test(10, 10, 10)).toBe(false);
    });
});

describe("MaskConfig validation parity", () => {
    it.each([
        [{ ...BOX, "min-x": 21 }, /box-mask.*degenerate/i],
        [{ ...CIRCLE, radius: 0 }, /circle-mask.*radius.*greater than 0/i],
        [{ ...CIRCLE, "min-y": 21 }, /circle-mask.*min-y.*smaller/i],
        [
            {
                type: "bluemap:ellipse",
                subtract: false,
                "center-x": 0,
                "center-z": 0,
                "radius-x": 0,
                "radius-z": 2,
                "min-y": 0,
                "max-y": 20,
            },
            /ellipse-mask.*radius values.*greater than 0/i,
        ],
        [
            {
                type: "bluemap:polygon",
                subtract: false,
                "min-y": 0,
                "max-y": 20,
                shape: [
                    { x: 0, z: 0 },
                    { x: 1, z: 1 },
                ],
            },
            /polygon-mask.*at least 3 points/i,
        ],
    ] satisfies readonly [MaskConfig, RegExp][])(
        "refuses the same degenerate input as upstream",
        (entry, expected) => {
            expect(() => createMaskFromConfig(entry)).toThrow(expected);
        },
    );
});

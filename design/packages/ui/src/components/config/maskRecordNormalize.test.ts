import { describe, expect, it } from "vitest";
import { JAVA_INT_MAX, JAVA_INT_MIN } from "./fieldValue.js";
import { normalizeMaskList } from "./maskRecordNormalize.js";

describe("normalizeMaskList", () => {
    it("fills every field of a partially-typed box with the schema's own default", () => {
        const [box] = normalizeMaskList([{ type: "bluemap:box", "min-x": 0, "max-x": 10 }]);
        expect(box).toMatchObject({
            type: "bluemap:box",
            "min-x": 0,
            "max-x": 10,
            "min-z": JAVA_INT_MIN,
            "max-z": JAVA_INT_MAX,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
            subtract: false,
        });
    });

    it("normalises a bare shape name the same way the config schema's Key.parse does", () => {
        const [circle] = normalizeMaskList([{ type: "circle" }]);
        expect(circle).toMatchObject({ type: "bluemap:circle" });
    });

    it("drops an entry whose type is not one of the five real shapes", () => {
        const result = normalizeMaskList([{ type: "bluemap:not-a-real-shape" }]);
        expect(result).toEqual([]);
    });

    it("recursively normalises a blur's nested masks", () => {
        const [blur] = normalizeMaskList([
            { type: "bluemap:blur", masks: [{ type: "bluemap:box", "min-x": 5, "max-x": 15 }] },
        ]);
        expect(blur).toMatchObject({ type: "bluemap:blur", size: 5 });
        const nested = (blur as unknown as { masks: readonly unknown[] }).masks;
        expect(nested).toHaveLength(1);
        expect(nested[0]).toMatchObject({ "min-x": 5, "max-x": 15 });
    });

    it("defaults subtract to false when a row never mentions it", () => {
        const [box] = normalizeMaskList([{ type: "bluemap:box" }]);
        expect(box!.subtract).toBe(false);
    });

    it("keeps an explicit subtract: true rather than overwriting it", () => {
        const [box] = normalizeMaskList([{ type: "bluemap:box", subtract: true }]);
        expect(box!.subtract).toBe(true);
    });

    it("returns an empty list for an empty render-mask", () => {
        expect(normalizeMaskList([])).toEqual([]);
    });
});

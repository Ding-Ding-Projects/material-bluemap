import { describe, expect, it } from "vitest";
import type { BoxMask, MaskConfig, PolygonMask } from "@material-bluemap/config";
import { MASK_FILE_FORMAT, MASK_FILE_VERSION, exportMaskFile, parseMaskFile, serializeMaskFile } from "./maskFile.js";

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

const POLYGON: PolygonMask = {
    type: "bluemap:polygon",
    subtract: true,
    "min-y": -64,
    "max-y": 320,
    shape: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 10 },
    ],
};

describe("maskFile: export", () => {
    it("states the format, version, units and coordinate convention in the file itself", () => {
        const file = exportMaskFile([BOX], new Date("2026-01-01T00:00:00.000Z"));
        expect(file.format).toBe(MASK_FILE_FORMAT);
        expect(file.version).toBe(MASK_FILE_VERSION);
        expect(file.units).toBe("blocks");
        expect(file.coordinateSystem).toBe("minecraft-world-xyz");
        expect(file.exportedAt).toBe("2026-01-01T00:00:00.000Z");
        expect(file.masks).toEqual([BOX]);
    });

    it("serializes to readable, parseable JSON with a trailing newline", () => {
        const text = serializeMaskFile([BOX]);
        expect(text.endsWith("\n")).toBe(true);
        expect(() => JSON.parse(text)).not.toThrow();
    });
});

describe("maskFile: round trip", () => {
    it("preserves a single box exactly", () => {
        const text = serializeMaskFile([BOX]);
        const result = parseMaskFile(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.masks).toEqual([BOX]);
    });

    it("preserves multiple shapes, order, and a subtract polygon exactly", () => {
        const masks: MaskConfig[] = [BOX, POLYGON];
        const text = serializeMaskFile(masks);
        const result = parseMaskFile(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.masks).toEqual(masks);
    });

    it("preserves an empty mask list (the whole world) as an empty array, not an error", () => {
        const text = serializeMaskFile([]);
        const result = parseMaskFile(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.masks).toEqual([]);
    });
});

describe("maskFile: import errors, named rather than silent", () => {
    it("refuses text that is not JSON", () => {
        const result = parseMaskFile("not json at all {");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/JSON/i);
    });

    it("refuses a JSON file that is not this format", () => {
        const result = parseMaskFile(JSON.stringify({ hello: "world" }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/render-mask file/i);
    });

    it("refuses a file from a newer, unrecognised format version", () => {
        const future = JSON.stringify({
            format: MASK_FILE_FORMAT,
            version: MASK_FILE_VERSION + 1,
            units: "blocks",
            coordinateSystem: "minecraft-world-xyz",
            exportedAt: new Date().toISOString(),
            masks: [],
        });
        const result = parseMaskFile(future);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/newer/i);
    });

    it("refuses a shape the schema does not accept, naming the problem rather than importing nothing silently", () => {
        const bad = JSON.stringify({
            format: MASK_FILE_FORMAT,
            version: MASK_FILE_VERSION,
            units: "blocks",
            coordinateSystem: "minecraft-world-xyz",
            exportedAt: new Date().toISOString(),
            masks: [{ type: "bluemap:not-a-real-shape" }],
        });
        const result = parseMaskFile(bad);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    });
});

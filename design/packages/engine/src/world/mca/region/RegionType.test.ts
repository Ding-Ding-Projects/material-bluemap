import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Compression } from "../../../storage/compression/Compression.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { LinearRegion } from "./LinearRegion.js";
import { MCARegion } from "./MCARegion.js";
import { RegionType } from "./RegionType.js";

const stubLoader: ChunkLoader<string> = {
    load: (_data: Uint8Array, _offset: number, _length: number, _compression: Compression) =>
        Promise.resolve("chunk"),
    emptyChunk: () => "<empty>",
    erroredChunk: () => "<errored>",
};

const dir = mkdtempSync(join(tmpdir(), "region-type-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("RegionType", () => {
    it("resolves region-types by file-name", () => {
        expect(RegionType.forFileName("r.1.2.mca")).toBe(RegionType.MCA);
        expect(RegionType.forFileName("r.-3.4.linear")).toBe(RegionType.LINEAR);
        expect(RegionType.forFileName("r.1.2.mcb")).toBeNull();
        expect(RegionType.forFileName("r.1.mca")).toBeNull();
        expect(RegionType.forFileName("c.1.2.mcc")).toBeNull();
    });

    it("parses region-positions from file-names (with the sanity-bounds)", () => {
        const pos = RegionType.regionForFileName("r.-3.4.mca");
        expect(pos?.getX()).toBe(-3);
        expect(pos?.getY()).toBe(4);

        const linear = RegionType.regionForFileName("r.7.-8.linear");
        expect(linear?.getX()).toBe(7);
        expect(linear?.getY()).toBe(-8);

        // sanity-check for roughly minecraft max boundaries
        expect(RegionType.regionForFileName("r.100001.0.mca")).toBeNull();
        expect(RegionType.regionForFileName("r.0.-100001.mca")).toBeNull();
        expect(RegionType.regionForFileName("r.100000.100000.mca")).not.toBeNull();
    });

    it("formats region-file names", () => {
        expect(RegionType.MCA.getRegionFileName(1, -2)).toBe("r.1.-2.mca");
        expect(RegionType.LINEAR.getRegionFileName(1, -2)).toBe("r.1.-2.linear");
        expect(RegionType.DEFAULT).toBe(RegionType.MCA);
    });

    it("keeps both types in the registry", () => {
        expect(RegionType.REGISTRY.values()).toContain(RegionType.MCA);
        expect(RegionType.REGISTRY.values()).toContain(RegionType.LINEAR);
    });

    it("loadRegion picks the existing region-file, defaulting to mca", () => {
        writeFileSync(join(dir, "r.0.0.linear"), Buffer.alloc(0));

        expect(RegionType.loadRegion(stubLoader, dir, 0, 0)).toBeInstanceOf(LinearRegion);
        // no file at all: the default (mca) region is created
        expect(RegionType.loadRegion(stubLoader, dir, 5, 5)).toBeInstanceOf(MCARegion);
    });
});

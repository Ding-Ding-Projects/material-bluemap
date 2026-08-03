import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync, gunzipSync, gzipSync } from "node:zlib";
import { decompressNbt } from "./compression.js";
import { NBTReader } from "./NBTReader.js";
import { TagType } from "./TagType.js";
import { bytes, i32, utf } from "../test/bytes.js";

const doc = bytes(TagType.COMPOUND, utf(""), TagType.INT, utf("x"), i32(42), TagType.END);

describe("decompressNbt", () => {
    it("detects and decompresses gzip data (0x1f 0x8b)", () => {
        const compressed = gzipSync(doc);
        expect(compressed[0]).toBe(0x1f);
        expect(compressed[1]).toBe(0x8b);
        expect([...decompressNbt(compressed)]).toEqual([...doc]);
    });

    it("detects and decompresses zlib/deflate data (0x78)", () => {
        const compressed = deflateSync(doc);
        expect(compressed[0]).toBe(0x78);
        expect([...decompressNbt(compressed)]).toEqual([...doc]);
    });

    it("passes raw nbt-data through unchanged", () => {
        expect(decompressNbt(doc)).toBe(doc);
    });

    it("decompresses a real gzipped level.dat", () => {
        const file = readFileSync(new URL("../test/fixtures/level.dat", import.meta.url));
        const decompressed = decompressNbt(file);
        expect([...decompressed]).toEqual([...gunzipSync(file)]);

        const reader = new NBTReader(decompressed);
        expect(reader.peek()).toBe(TagType.COMPOUND);
        reader.beginCompound();
        expect(reader.name()).toBe("Data");
    });
});

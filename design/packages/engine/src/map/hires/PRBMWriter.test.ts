import { describe, expect, it } from "vitest";
import { ArrayTileModel } from "./ArrayTileModel.js";
import { PRBMWriter, writeTileModelToPRBM } from "./PRBMWriter.js";
import { ORACLE_CASES } from "./prbmOracleData.js";
import { ORACLE_MODEL_BUILDERS, toHex } from "./prbmOracleFixture.js";

/**
 * upstream: map/hires/PRBMWriter.java
 *
 * The gate: the byte-for-byte comparison against the real Java writer's output. The
 * reference bytes in `prbmOracleData.ts` came out of the built oracle jar (see
 * `prbmOracleFixture.ts` for how), so these are not expectations written from reading
 * the source — they are what the reference implementation actually emitted.
 */
describe("PRBMWriter — byte-identity with the upstream Java writer", () => {
    for (const [name, expected] of Object.entries(ORACLE_CASES)) {
        it(`matches the oracle for "${name}"`, () => {
            const build = ORACLE_MODEL_BUILDERS[name];
            expect(build, `no model builder for oracle case ${name}`).toBeTypeOf("function");

            const bytes = writeTileModelToPRBM(build!());
            expect(toHex(bytes)).toBe(expected.prbm);
        });
    }

    it("covers every oracle case with a builder, and vice versa", () => {
        expect(Object.keys(ORACLE_MODEL_BUILDERS).sort()).toEqual(Object.keys(ORACLE_CASES).sort());
    });
});

/**
 * A hand-decoded walk through the smallest non-empty file, so the byte comparison above
 * is anchored to a human-readable description of the format rather than only to a blob.
 */
describe("PRBMWriter — file layout", () => {
    const asciiAt = (bytes: Uint8Array, offset: number, text: string): boolean =>
        [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0)) &&
        bytes[offset + text.length] === 0;

    it("writes the header, then seven named attributes, then the material groups", () => {
        const bytes = writeTileModelToPRBM(ORACLE_MODEL_BUILDERS["empty"]!());

        // version, flags, value-count (3 bytes LE), index-count (3 bytes LE)
        expect(bytes[0]).toBe(1); // FORMAT_VERSION
        expect(bytes[1]).toBe(0b0_0_0_00111); // not indexed, little endian, 7 attributes
        expect([bytes[2], bytes[3], bytes[4]]).toEqual([0, 0, 0]);
        expect([bytes[5], bytes[6], bytes[7]]).toEqual([0, 0, 0]);

        // seven attribute names, in upstream's order
        let offset = 8;
        for (const [name, flags] of [
            ["position", 0x21],
            ["normal", 0x63],
            ["color", 0x67],
            ["uv", 0x11],
            ["ao", 0x47],
            ["blocklight", 0x03],
            ["sunlight", 0x03],
        ] as const) {
            expect(asciiAt(bytes, offset, name), `attribute ${name} at ${offset}`).toBe(true);
            offset += name.length + 1;
            expect(bytes[offset]).toBe(flags);
            offset += 1;
            // padding to the next 4-byte boundary; an empty model has no values to skip
            offset = Math.ceil(offset / 4) * 4;
        }

        // the group table of an empty model is just the -1 terminator
        expect([...bytes.subarray(offset)]).toEqual([0xff, 0xff, 0xff, 0xff]);
        expect(offset + 4).toBe(bytes.length);
    });

    it("emits one material group per run of equal material indices, in face order", () => {
        // materials 2,2,7 after sorting -> groups (2, start 0, count 6) and (7, start 6, count 3)
        const bytes = writeTileModelToPRBM(ORACLE_MODEL_BUILDERS["threeFacesUnsorted"]!());
        const tail = bytes.subarray(bytes.length - 4 * 7);
        const read4 = (i: number): number =>
            (tail[i]! | (tail[i + 1]! << 8) | (tail[i + 2]! << 16) | (tail[i + 3]! << 24)) | 0;

        expect([read4(0), read4(4), read4(8)]).toEqual([2, 0, 6]);
        expect([read4(12), read4(16), read4(20)]).toEqual([7, 6, 3]);
        expect(read4(24)).toBe(-1);
    });

    it("pads every attribute header to a 4-byte boundary", () => {
        const bytes = writeTileModelToPRBM(ORACLE_MODEL_BUILDERS["single"]!());
        // "position\0" + flags = 10 bytes after the 8-byte header -> 18, padded to 20
        expect(bytes.length % 4).toBe(0);
        expect(bytes[18]).toBe(0);
        expect(bytes[19]).toBe(0);
    });
});

describe("PRBMWriter — numeric edge cases", () => {
    /**
     * A zero-area face makes `calculateSurfaceNormal` divide by zero. Java's
     * `(byte) (Float.POSITIVE_INFINITY * 0x80 - 0.5)` saturates through `(int)` to
     * `Integer.MAX_VALUE` and writes 0xFF; `NaN` narrows to 0. Javascript's `| 0` would
     * have written 0x00 for both.
     */
    it("writes a saturated normal for a degenerate (zero-area) face", () => {
        const model = new ArrayTileModel(1);
        const face = model.add(1);
        model.setPositions(face, 1, 2, 3, 1, 2, 3, 1, 2, 3);
        model.setMaterialIndex(face, 0);

        const bytes = writeTileModelToPRBM(model);
        const normalOffset = bytes.length - 4 * 4 - 3 - 3 - 3 * 3 - 3 * 3 - 3 * 2 * 4;
        // all three components come out of 0/0 = NaN -> 0
        expect([...bytes.subarray(normalOffset - 9, normalOffset)]).toEqual([
            0, 0, 0, 0, 0, 0, 0, 0, 0,
        ]);
    });

    it("clamps a normalized-unsigned-byte write to the low 8 bits, truncating toward zero", () => {
        const model = new ArrayTileModel(1);
        const face = model.add(1);
        model.setPositions(face, 0, 0, 0, 1, 0, 0, 0, 1, 0);
        // 1.0 * 255 = 255 -> 0xFF, 0.5 * 255 = 127.5 -> (int) 127 -> 0x7F
        model.setColor(face, 1, 0.5, 0);
        model.setAOs(face, 1, 0.5, 0);
        model.setMaterialIndex(face, 0);

        const hex = toHex(writeTileModelToPRBM(model));
        expect(hex).toContain("ff7f00ff7f00ff7f00"); // color, thrice (once per vertex)
        expect(hex).toContain("ff7f00"); // ao, once per vertex
    });

    it("refuses a value-count that does not fit in three bytes", () => {
        // 0xFFFFFF / 3 = 5592405 faces, well past MAX_CAPACITY, so the guard is only
        // reachable through a model whose size was set directly
        const model = new ArrayTileModel(0);
        model.reset(0x1000000);
        expect(() => writeTileModelToPRBM(model)).toThrow(/Value too high/);
    });

    it("close() is safe to call and getBytes() returns what was written", () => {
        const writer = new PRBMWriter();
        writer.write(ORACLE_MODEL_BUILDERS["single"]!());
        const first = writer.getBytes();
        writer.close();
        expect(toHex(writer.getBytes())).toBe(toHex(first));
        expect(toHex(first)).toBe(ORACLE_CASES["single"]!.prbm);
    });
});

import { describe, expect, it } from "vitest";
import { BufferAttribute } from "three";
import { PRBMLoader } from "./PRBMLoader";

/**
 * Builds a minimal PRBM (PRWM + groups) buffer:
 * - version 1, little- or big-endian
 * - attributes: "position" (float32 x3, 4 values) and "ao" (float32 x1, 4 values)
 * - non-indexed (like BlueMap's hires tiles): followed by one group
 *   { materialIndex, start, count } terminated by -1
 * - indexed: followed by 6 uint16 indices (the parser does not advance past the
 *   indices block, so no group data is appended in that layout)
 */
function buildPrbm(
    bigEndian: boolean,
    indexed: boolean,
): {
    buffer: ArrayBuffer;
    positions: number[];
    ao: number[];
    indices: number[];
    group: { materialIndex: number; start: number; count: number };
} {
    const positions = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1];
    const ao = [0.25, 0.5, 0.75, 1];
    const indices = [0, 1, 2, 0, 2, 3];
    const group = { materialIndex: 5, start: 0, count: 6 };

    const buffer = new ArrayBuffer(indexed ? 100 : 104);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    const valuesNumber = 4;
    const indicesNumber = indexed ? indices.length : 0;

    bytes[0] = 1; // version
    // flags: indexed << 7 | indicesType(uint16) << 6 | bigEndian << 5 | attributesNumber
    bytes[1] = (indexed ? 0x80 : 0) | (bigEndian ? 0x20 : 0) | 2;
    if (bigEndian) {
        bytes[2] = (valuesNumber >> 16) & 0xff;
        bytes[3] = (valuesNumber >> 8) & 0xff;
        bytes[4] = valuesNumber & 0xff;
        bytes[5] = (indicesNumber >> 16) & 0xff;
        bytes[6] = (indicesNumber >> 8) & 0xff;
        bytes[7] = indicesNumber & 0xff;
    } else {
        bytes[2] = valuesNumber & 0xff;
        bytes[3] = (valuesNumber >> 8) & 0xff;
        bytes[4] = (valuesNumber >> 16) & 0xff;
        bytes[5] = indicesNumber & 0xff;
        bytes[6] = (indicesNumber >> 8) & 0xff;
        bytes[7] = (indicesNumber >> 16) & 0xff;
    }

    let pos = 8;
    const writeName = (name: string) => {
        for (let i = 0; i < name.length; i++) bytes[pos++] = name.charCodeAt(i);
        bytes[pos++] = 0;
    };
    const pad4 = () => {
        pos = Math.ceil(pos / 4) * 4;
    };

    // attribute "position": float type (0), not normalized, cardinality 3, encoding 1 (Float32Array)
    writeName("position"); // pos: 8 -> 17
    bytes[pos++] = ((3 - 1) << 4) | 1; // pos: 17 -> 18
    pad4(); // -> 20
    for (const v of positions) {
        view.setFloat32(pos, v, !bigEndian);
        pos += 4;
    } // -> 68

    // attribute "ao": float type, cardinality 1, encoding 1 (Float32Array)
    writeName("ao"); // 68 -> 71
    bytes[pos++] = 1; // 71 -> 72
    pad4(); // 72
    for (const v of ao) {
        view.setFloat32(pos, v, !bigEndian);
        pos += 4;
    } // -> 88

    pad4(); // 88
    if (indexed) {
        // indices (uint16)
        for (const v of indices) {
            view.setUint16(pos, v, !bigEndian);
            pos += 2;
        } // -> 100
    } else {
        // groups (always little-endian 4-byte ints, terminated by -1)
        view.setInt32(pos, group.materialIndex, true);
        view.setInt32(pos + 4, group.start, true);
        view.setInt32(pos + 8, group.count, true);
        view.setInt32(pos + 12, -1, true);
    }

    return { buffer, positions, ao, indices, group };
}

describe("PRBMLoader", () => {
    it("parses a little-endian non-indexed prbm buffer with groups", () => {
        const { buffer, positions, ao, group } = buildPrbm(false, false);
        const geometry = new PRBMLoader().parse(buffer);

        const positionAttribute = geometry.getAttribute("position") as BufferAttribute;
        expect(positionAttribute.itemSize).toBe(3);
        expect(positionAttribute.count).toBe(4);
        expect(positionAttribute.normalized).toBe(false);
        expect(Array.from(positionAttribute.array as Float32Array)).toEqual(positions);

        const aoAttribute = geometry.getAttribute("ao") as BufferAttribute;
        expect(aoAttribute.itemSize).toBe(1);
        expect(Array.from(aoAttribute.array as Float32Array)).toEqual(ao);

        expect(geometry.index).toBeNull();
        expect(geometry.groups).toEqual([group]);
    });

    it("parses uint16 indices of an indexed prbm buffer", () => {
        const { buffer, indices } = buildPrbm(false, true);
        const geometry = new PRBMLoader().parse(buffer);

        expect(geometry.index).not.toBeNull();
        expect(geometry.index!.array).toBeInstanceOf(Uint16Array);
        expect(Array.from(geometry.index!.array as Uint16Array)).toEqual(indices);
    });

    it("parses an opposite-endianness buffer via the slow DataView path", () => {
        const loader = new PRBMLoader();
        // platform-endianness dictates which of the two buffers takes the slow path;
        // both must decode to the same values
        const le = loader.parse(buildPrbm(false, false).buffer);
        const be = loader.parse(buildPrbm(true, false).buffer);

        expect(Array.from(be.getAttribute("position").array as Float32Array)).toEqual(
            Array.from(le.getAttribute("position").array as Float32Array),
        );
        expect(Array.from(be.getAttribute("ao").array as Float32Array)).toEqual(
            Array.from(le.getAttribute("ao").array as Float32Array),
        );
        expect(be.groups).toEqual(le.groups);
    });

    it("rejects unsupported versions and invalid non-indexed headers", () => {
        const loader = new PRBMLoader();

        const { buffer } = buildPrbm(false, false);
        new Uint8Array(buffer)[0] = 0;
        expect(() => loader.parse(buffer)).toThrow("Invalid format version: 0");

        const v2 = buildPrbm(false, false).buffer;
        new Uint8Array(v2)[0] = 2;
        expect(() => loader.parse(v2)).toThrow("Unsupported format version: 2");

        // non-indexed geometry with a non-zero indices count must be rejected
        const nonIndexed = buildPrbm(false, true).buffer;
        new Uint8Array(nonIndexed)[1]! &= 0x7f; // clear indexedGeometry bit, keep indicesNumber = 6
        expect(() => loader.parse(nonIndexed)).toThrow("Number of indices must be set to 0");

        expect(() => loader.parse(buildPrbm(false, false).buffer, 2)).toThrow(
            "Offset should be a multiple of 4",
        );
    });
});

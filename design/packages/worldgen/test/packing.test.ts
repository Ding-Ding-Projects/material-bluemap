import { describe, expect, it } from "vitest";
import { PackedIntArrayAccess } from "@worldlens/engine";
import { Random } from "../src/random.js";
import {
    blockStateBitWidth,
    ceilLog2,
    isDerivableBitWidth,
    packPadded,
} from "../src/packing.js";
import { BIOMES_PER_SECTION, BLOCKS_PER_SECTION, VALUES_PER_HEIGHTMAP } from "../src/version.js";

/*
 * The packed layout is the one place where the generator and the reader have to agree
 * on a bit-for-bit convention, and the only way a disagreement shows up in a rendered
 * world is as scrambled blocks. So it is checked directly against the reader's own
 * unpacker rather than only through a whole generated world.
 */

function randomValues(count: number, bits: number, seed: number): Int32Array {
    const random = new Random(seed);
    const values = new Int32Array(count);
    const max = bits >= 31 ? 0x7fffffff : (1 << bits) - 1;
    for (let i = 0; i < count; i++) values[i] = random.nextInt(max + 1);
    return values;
}

describe("packPadded", () => {
    it("round-trips through the reader's unpacker with an explicit bit-width", () => {
        for (let bits = 1; bits <= 16; bits++) {
            const values = randomValues(BIOMES_PER_SECTION, bits, 1000 + bits);
            const packed = packPadded(values, BIOMES_PER_SECTION, bits);
            const access = new PackedIntArrayAccess(bits, packed);

            for (let i = 0; i < BIOMES_PER_SECTION; i++) {
                expect(access.get(i), "bits=" + bits + " index=" + i).toBe(values[i]);
            }
        }
    });

    it("round-trips a full section through the reader's derived bit-width", () => {
        // the block-states array carries no bit-width of its own: the reader derives it
        // from the long-array's length, so the two have to agree without being told
        const widths = new Set<number>();
        for (const paletteSize of [2, 3, 16, 17, 32, 33, 64, 65, 128, 300, 1200, 2049, 4096]) {
            widths.add(blockStateBitWidth(paletteSize, BLOCKS_PER_SECTION));
        }

        for (const bits of widths) {
            const values = randomValues(BLOCKS_PER_SECTION, bits, 2000 + bits);
            const packed = packPadded(values, BLOCKS_PER_SECTION, bits);
            const access = new PackedIntArrayAccess(packed, BLOCKS_PER_SECTION);

            for (let i = 0; i < BLOCKS_PER_SECTION; i += 7) {
                expect(access.get(i), "bits=" + bits + " index=" + i).toBe(values[i]);
            }
            expect(access.get(BLOCKS_PER_SECTION - 1)).toBe(values[BLOCKS_PER_SECTION - 1]);
        }
    });

    it("only chooses bit-widths the length-only reader can recover", () => {
        // 11, 13, 14 and 15 bits all produce a long-array whose length says something
        // else, so the width has to be widened past them
        for (let paletteSize = 1; paletteSize <= 4096; paletteSize++) {
            const bits = blockStateBitWidth(paletteSize, BLOCKS_PER_SECTION);
            expect(bits, "palette=" + paletteSize).toBeGreaterThanOrEqual(
                Math.max(4, ceilLog2(paletteSize)),
            );
            expect(isDerivableBitWidth(bits, BLOCKS_PER_SECTION), "palette=" + paletteSize).toBe(
                true,
            );
        }

        expect(blockStateBitWidth(2048, BLOCKS_PER_SECTION)).toBe(12);
        expect(blockStateBitWidth(8192, BLOCKS_PER_SECTION)).toBe(16);
    });

    it("produces a heightmap the reader accepts as correctly sized", () => {
        const bits = ceilLog2(385);
        expect(bits).toBe(9);

        const values = randomValues(VALUES_PER_HEIGHTMAP, bits, 3000);
        const packed = packPadded(values, VALUES_PER_HEIGHTMAP, bits);
        const access = new PackedIntArrayAccess(bits, packed);

        expect(access.isCorrectSize(VALUES_PER_HEIGHTMAP)).toBe(true);
        for (let i = 0; i < VALUES_PER_HEIGHTMAP; i++) {
            expect(access.get(i), "index=" + i).toBe(values[i]);
        }
    });

    it("matches Java's ceilLog2 on the palette sizes that matter", () => {
        expect(ceilLog2(1)).toBe(0);
        expect(ceilLog2(2)).toBe(1);
        expect(ceilLog2(3)).toBe(2);
        expect(ceilLog2(4)).toBe(2);
        expect(ceilLog2(5)).toBe(3);
        expect(ceilLog2(16)).toBe(4);
        expect(ceilLog2(17)).toBe(5);
        expect(ceilLog2(32)).toBe(5);
        expect(ceilLog2(33)).toBe(6);
    });
});

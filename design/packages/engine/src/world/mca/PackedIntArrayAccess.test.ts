import { describe, expect, it } from "vitest";
import { PackedIntArrayAccess } from "./PackedIntArrayAccess.js";

/** packs values in the 1.16+ "padded" layout (elements never span longs) */
function packPadded(values: readonly number[], bitsPerElement: number): BigInt64Array {
    const elementsPerLong = Math.trunc(64 / bitsPerElement);
    const data = new BigInt64Array(Math.ceil(values.length / elementsPerLong));
    for (let i = 0; i < values.length; i++) {
        const longIndex = Math.trunc(i / elementsPerLong);
        const bitOffset = BigInt((i % elementsPerLong) * bitsPerElement);
        const value = BigInt(values[i]!) & ((1n << BigInt(bitsPerElement)) - 1n);
        data[longIndex] = BigInt.asIntN(
            64,
            BigInt.asUintN(64, data[longIndex]!) | (value << bitOffset),
        );
    }
    return data;
}

/** deterministic pseudo-random int in [0, bound) */
function makeRandom(seed: number): (bound: number) => number {
    let state = seed >>> 0;
    return (bound: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % bound;
    };
}

describe("PackedIntArrayAccess (padded 1.16+ layout)", () => {
    it.each([1, 4, 5, 6, 9, 13, 31])("round-trips random values at %i bits per element", (bits) => {
        const random = makeRandom(bits * 7919);
        const bound = bits >= 31 ? 2147483647 : 1 << bits;
        const values = Array.from({ length: 100 }, () => random(bound));

        const access = new PackedIntArrayAccess(bits, packPadded(values, bits));
        for (let i = 0; i < values.length; i++) {
            expect(access.get(i), `bits=${bits} index=${i}`).toBe(values[i]);
        }
    });

    it("reads 32-bit elements with int-semantics (high bit becomes the sign)", () => {
        const values = [0xffffffff, 0x80000000, 0x7fffffff, 0];
        const access = new PackedIntArrayAccess(32, packPadded(values, 32));
        expect(access.get(0)).toBe(-1);
        expect(access.get(1)).toBe(-2147483648);
        expect(access.get(2)).toBe(2147483647);
        expect(access.get(3)).toBe(0);
    });

    it("derives bitsPerElement from the element-count (data, elementCount constructor)", () => {
        const random = makeRandom(42);
        const values = Array.from({ length: 4096 }, () => random(16));
        const data = packPadded(values, 4);
        expect(data.length).toBe(256); // 16 elements per long

        // 256 * 64 / 4096 = 4 bits
        const access = new PackedIntArrayAccess(data, 4096);
        for (let i = 0; i < values.length; i++) {
            expect(access.get(i)).toBe(values[i]);
        }
    });

    it("clamps the derived bitsPerElement to at least 1", () => {
        const access = new PackedIntArrayAccess(new BigInt64Array(1), 4096);
        expect(access.getCapacity()).toBe(64); // treated as 1 bit / 64 elements per long
    });

    it("returns 0 for indices beyond the data (truncated array)", () => {
        const access = new PackedIntArrayAccess(13, packPadded([1, 2, 3, 4], 13));
        // 4 elements per long -> storageIndex(30) = 7 >= data.length
        expect(access.get(30)).toBe(0);
    });

    it("computes getCapacity and isCorrectSize like upstream", () => {
        // 9 bits -> 7 elements per long; 256 values need ceil(256/7) = 37 longs
        const exact = new PackedIntArrayAccess(9, new BigInt64Array(37));
        expect(exact.getCapacity()).toBe(259);
        expect(exact.isCorrectSize(256)).toBe(true);

        const tooLarge = new PackedIntArrayAccess(9, new BigInt64Array(38));
        expect(tooLarge.isCorrectSize(256)).toBe(false);

        const tooSmall = new PackedIntArrayAccess(9, new BigInt64Array(36));
        expect(tooSmall.isCorrectSize(256)).toBe(false);

        const empty = new PackedIntArrayAccess(9, new BigInt64Array(0));
        expect(empty.getCapacity()).toBe(0);
        expect(empty.get(0)).toBe(0);
    });
});

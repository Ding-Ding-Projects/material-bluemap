import { describe, expect, it } from "vitest";
import {
    ceilLog2,
    getByteHalf,
    getValueFromLongStream,
    javaParseInt,
    NumberFormatError,
} from "./MCAUtil.js";

/** packs values as one continuous bit-stream (the pre-1.16 spanning layout) */
function packSpanning(values: readonly number[], bitsPerValue: number): BigInt64Array {
    const data = new BigInt64Array(Math.ceil((values.length * bitsPerValue) / 64));
    for (let i = 0; i < values.length; i++) {
        const bitIndex = i * bitsPerValue;
        const longIndex = bitIndex >> 6;
        const bitOffset = bitIndex & 0x3f;
        const value = BigInt(values[i]!) & ((1n << BigInt(bitsPerValue)) - 1n);

        data[longIndex] = BigInt.asIntN(
            64,
            BigInt.asUintN(64, data[longIndex]!) | BigInt.asUintN(64, value << BigInt(bitOffset)),
        );
        if (bitOffset + bitsPerValue > 64) {
            data[longIndex + 1] = BigInt.asIntN(
                64,
                BigInt.asUintN(64, data[longIndex + 1]!) | (value >> BigInt(64 - bitOffset)),
            );
        }
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

describe("getValueFromLongStream (bit-spanning 1.13 layout)", () => {
    it.each([5, 9, 13, 14])("round-trips random values at %i bits per value", (bits) => {
        const random = makeRandom(bits * 31337);
        const values = Array.from({ length: 150 }, () => random(1 << bits));

        const data = packSpanning(values, bits);
        for (let i = 0; i < values.length; i++) {
            expect(getValueFromLongStream(data, i, bits), `bits=${bits} index=${i}`).toBe(
                values[i],
            );
        }
    });

    it("reads values that span a long-boundary", () => {
        // 13 bits: value 4 occupies bits 52..64 -> spans long 0 and long 1
        const values = [0, 0, 0, 0, 0b1010110011110, 0];
        const data = packSpanning(values, 13);
        expect(data.length).toBe(2);
        expect(getValueFromLongStream(data, 4, 13)).toBe(0b1010110011110);
    });

    it("returns 0 for indices beyond the data", () => {
        const data = packSpanning([1, 2, 3], 9);
        expect(getValueFromLongStream(data, 100, 9)).toBe(0);
    });

    it("drops the bits of a missing second long (truncated array)", () => {
        // 13 bits at index 4 spans longs 0..1; drop long 1
        const full = packSpanning([1, 2, 3, 4, 0x1eaf], 13);
        const truncated = full.slice(0, 1);
        // remaining low bits of the value: stored bits 52..63 only
        const expected = Number((BigInt.asUintN(64, full[0]!) >> 52n) & 0x1fffn);
        expect(getValueFromLongStream(truncated, 4, 13)).toBe(expected);
    });

    it("matches the 9-bit heightmap layout (256 values in 36 longs)", () => {
        const random = makeRandom(9001);
        const heights = Array.from({ length: 256 }, () => random(512));
        const data = packSpanning(heights, 9);
        expect(data.length).toBe(36);
        for (let i = 0; i < 256; i++) {
            expect(getValueFromLongStream(data, i, 9)).toBe(heights[i]);
        }
    });
});

describe("getByteHalf", () => {
    it("extracts the nibbles of an unsigned byte", () => {
        expect(getByteHalf(0xab, false)).toBe(0xb);
        expect(getByteHalf(0xab, true)).toBe(0xa);
        expect(getByteHalf(0x0f, true)).toBe(0);
        expect(getByteHalf(0x0f, false)).toBe(0xf);
    });

    it("treats negative (signed-byte) input like Java's int-widening", () => {
        // Java: byte -1 widens to int -1; -1 >> 4 & 0xF == 15, -1 & 0xF == 15
        expect(getByteHalf(-1, true)).toBe(15);
        expect(getByteHalf(-1, false)).toBe(15);
        // byte 0x90 as signed = -112
        expect(getByteHalf(-112, true)).toBe(9);
        expect(getByteHalf(-112, false)).toBe(0);
    });
});

describe("ceilLog2", () => {
    it("matches Integer.SIZE - Integer.numberOfLeadingZeros(n - 1)", () => {
        expect(ceilLog2(1)).toBe(0);
        expect(ceilLog2(2)).toBe(1);
        expect(ceilLog2(3)).toBe(2);
        expect(ceilLog2(4)).toBe(2);
        expect(ceilLog2(5)).toBe(3);
        expect(ceilLog2(256)).toBe(8);
        expect(ceilLog2(257)).toBe(9);
        expect(ceilLog2(385)).toBe(9); // the 1.18 overworld heightmap element-size
        expect(ceilLog2(0)).toBe(32); // nlz(-1) == 0 in Java
    });
});

describe("javaParseInt", () => {
    it("parses strict decimal integers", () => {
        expect(javaParseInt("123")).toBe(123);
        expect(javaParseInt("-42")).toBe(-42);
        expect(javaParseInt("+7")).toBe(7);
        expect(javaParseInt("-2147483648")).toBe(-2147483648);
        expect(javaParseInt("2147483647")).toBe(2147483647);
    });

    it("rejects non-decimal and out-of-range input", () => {
        expect(() => javaParseInt("1.5")).toThrow(NumberFormatError);
        expect(() => javaParseInt("0x10")).toThrow(NumberFormatError);
        expect(() => javaParseInt("")).toThrow(NumberFormatError);
        expect(() => javaParseInt("2147483648")).toThrow(NumberFormatError);
        expect(() => javaParseInt("12abc")).toThrow(NumberFormatError);
    });
});

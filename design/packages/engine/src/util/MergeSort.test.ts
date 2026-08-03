import { describe, expect, it } from "vitest";
import { compareInt, mergeSortInt } from "./MergeSort.js";

/** upstream: util/MergeSort.java */
describe("MergeSort", () => {
    const sortWith = (values: number[], keys?: number[]): number[] => {
        const a = Int32Array.from(values);
        const supp = Int32Array.from(values);
        const key = (v: number): number => (keys === undefined ? v : keys[v]!);
        mergeSortInt(a, 0, a.length, (i1, i2) => compareInt(key(i1), key(i2)), supp);
        return [...a];
    };

    it("compareInt matches Integer.compare", () => {
        expect(compareInt(1, 2)).toBe(-1);
        expect(compareInt(2, 2)).toBe(0);
        expect(compareInt(3, 2)).toBe(1);
        expect(compareInt(-2147483648, 2147483647)).toBe(-1);
    });

    it("sorts through the insertion path (fewer than 16 elements)", () => {
        expect(sortWith([5, 3, 9, 1, 8, 0, 2])).toEqual([0, 1, 2, 3, 5, 8, 9]);
        expect(sortWith([])).toEqual([]);
        expect(sortWith([7])).toEqual([7]);
        expect(sortWith([2, 1])).toEqual([1, 2]);
    });

    it("sorts through the merge path (16 or more elements)", () => {
        const values = Array.from({ length: 257 }, (_, i) => (i * 101) % 257);
        expect(sortWith(values)).toEqual([...values].sort((a, b) => a - b));
    });

    it("leaves an already-sorted run alone (the fast path that copies the support array)", () => {
        const values = Array.from({ length: 40 }, (_, i) => i);
        expect(sortWith(values)).toEqual(values);
    });

    it("handles an all-equal comparator without reordering (stability)", () => {
        // sort indices 0..31 by a key that is constant, so a stable sort must not move them
        const values = Array.from({ length: 32 }, (_, i) => i);
        const keys = Array.from({ length: 32 }, () => 1);
        expect(sortWith(values, keys)).toEqual(values);
    });

    it("is stable across a key with many ties", () => {
        const values = Array.from({ length: 60 }, (_, i) => i);
        const keys = values.map((v) => v % 3);
        const sorted = sortWith(values, keys);

        // within every key-bucket the original index order must be preserved
        for (let k = 0; k < 3; k++) {
            const bucket = sorted.filter((v) => keys[v] === k);
            expect(bucket).toEqual([...bucket].sort((a, b) => a - b));
        }
        expect(sorted.map((v) => keys[v])).toEqual([...keys].sort((a, b) => a - b));
    });

    it("sorts only the requested sub-range", () => {
        const a = Int32Array.from([9, 5, 3, 1, 8]);
        const supp = Int32Array.from(a);
        mergeSortInt(a, 1, 4, compareInt, supp);
        expect([...a]).toEqual([9, 1, 3, 5, 8]);
    });

    it("allocates its own support array when given none", () => {
        const values = Array.from({ length: 40 }, (_, i) => (i * 17) % 40);
        const a = Int32Array.from(values);
        mergeSortInt(a, 0, a.length, compareInt, null);
        expect([...a]).toEqual([...values].sort((x, y) => x - y));
    });
});

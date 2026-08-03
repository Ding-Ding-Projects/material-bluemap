/**
 * upstream: util/MergeSort.java
 *
 * A *stable* merge sort over an int array with an external comparator and a caller
 * supplied support array (adapted upstream from fastutil). Stability is not an
 * incidental property here: `ArrayTileModel.sort()` sorts faces by material index
 * only, so every face that shares a material keeps its emission order, and that order
 * is the order the faces land in the .prbm file.
 */

/** upstream: `it.unimi.dsi.fastutil.ints.IntComparator` */
export type IntComparator = (i1: number, i2: number) => number;

/** upstream: `Integer.compare(int, int)` */
export function compareInt(x: number, y: number): number {
    return x < y ? -1 : x === y ? 0 : 1;
}

/**
 * upstream: `void mergeSortInt(int[] a, int from, int to, IntComparator comp, int[] supp)`
 */
export function mergeSortInt(
    a: Int32Array,
    from: number,
    to: number,
    comp: IntComparator,
    supp: Int32Array | null,
): void {
    const len = to - from;

    if (len < 16) {
        insertionSortInt(a, from, to, comp);
        return;
    }
    // upstream: `java.util.Arrays.copyOf(a, to)`
    if (supp === null) supp = a.slice(0, to);

    const mid = (from + to) >>> 1;
    mergeSortInt(supp, from, mid, comp, a);
    mergeSortInt(supp, mid, to, comp, a);

    if (comp(supp[mid - 1]!, supp[mid]!) <= 0) {
        a.set(supp.subarray(from, from + len), from);
        return;
    }

    for (let i = from, p = from, q = mid; i < to; i++) {
        if (q >= to || (p < mid && comp(supp[p]!, supp[q]!) <= 0)) a[i] = supp[p++]!;
        else a[i] = supp[q++]!;
    }
}

/**
 * upstream: `void insertionSortInt(int[] a, int from, int to, IntComparator comp)`
 */
function insertionSortInt(a: Int32Array, from: number, to: number, comp: IntComparator): void {
    for (let i = from; ++i < to; ) {
        const t = a[i]!;
        let j = i;
        for (let u = a[j - 1]!; comp(t, u) < 0; u = a[--j - 1]!) {
            a[j] = u;
            if (from === j - 1) {
                --j;
                break;
            }
        }
        a[j] = t;
    }
}

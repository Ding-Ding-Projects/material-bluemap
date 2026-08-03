import { LONG_HIGH_HALF, LONG_LOW_HALF, longArrayHalves } from "./MCAUtil.js";

// magic constants for fast division
// prettier-ignore
const DIVISION_MAGIC: readonly number[] = [
    // <editor-fold defaultstate="collapsed" desc="Division-Magic Constants">
    -1, -1, 0,
    -2147483648, 0, 0,
    1431655765, 1431655765, 0,
    -2147483648, 0, 1,
    858993459, 858993459, 0,
    715827882, 715827882, 0,
    613566756, 613566756, 0,
    -2147483648, 0, 2,
    477218588, 477218588, 0,
    429496729, 429496729, 0,
    390451572, 390451572, 0,
    357913941, 357913941, 0,
    330382099, 330382099, 0,
    306783378, 306783378, 0,
    286331153, 286331153, 0,
    -2147483648, 0, 3,
    252645135, 252645135, 0,
    238609294, 238609294, 0,
    226050910, 226050910, 0,
    214748364, 214748364, 0,
    204522252, 204522252, 0,
    195225786, 195225786, 0,
    186737708, 186737708, 0,
    178956970, 178956970, 0,
    171798691, 171798691, 0,
    165191049, 165191049, 0,
    159072862, 159072862, 0,
    153391689, 153391689, 0,
    148102320, 148102320, 0,
    143165576, 143165576, 0,
    138547332, 138547332, 0,
    -2147483648, 0, 4,
    130150524, 130150524, 0,
    126322567, 126322567, 0,
    122713351, 122713351, 0,
    119304647, 119304647, 0,
    116080197, 116080197, 0,
    113025455, 113025455, 0,
    110127366, 110127366, 0,
    107374182, 107374182, 0,
    104755299, 104755299, 0,
    102261126, 102261126, 0,
    99882960, 99882960, 0,
    97612893, 97612893, 0,
    95443717, 95443717, 0,
    93368854, 93368854, 0,
    91382282, 91382282, 0,
    89478485, 89478485, 0,
    87652393, 87652393, 0,
    85899345, 85899345, 0,
    84215045, 84215045, 0,
    82595524, 82595524, 0,
    81037118, 81037118, 0,
    79536431, 79536431, 0,
    78090314, 78090314, 0,
    76695844, 76695844, 0,
    75350303, 75350303, 0,
    74051160, 74051160, 0,
    72796055, 72796055, 0,
    71582788, 71582788, 0,
    70409299, 70409299, 0,
    69273666, 69273666, 0,
    68174084, 68174084, 0,
    -2147483648, 0, 5
    // </editor-fold>
];

/**
 * The 1.16+ "padded" packed-int layout: elements never span multiple longs, the top
 * 64 % bitsPerElement bits of every long are unused padding.
 *
 * The long-data is kept as a BigInt64Array but all extraction works on an
 * Int32Array-view of its 32bit-halves, so no per-element BigInt math is needed
 * (see docs/decisions.md D1).
 */
export class PackedIntArrayAccess {
    private readonly bitsPerElement: number;
    private readonly data: BigInt64Array;
    private readonly halves: Int32Array;

    private readonly elementsPerLong: number;
    private readonly indexShift: number;
    /** low-32-bit mask of upstream's long maxValue ((1 << bitsPerElement) - 1) */
    private readonly maxValue: number;
    private readonly indexScale: number;
    private readonly indexOffset: number;

    constructor(data: BigInt64Array, elementCount: number);
    constructor(bitsPerElement: number, data: BigInt64Array);
    constructor(first: BigInt64Array | number, second: number | BigInt64Array) {
        let bitsPerElement: number;
        let data: BigInt64Array;
        if (typeof first === "number") {
            bitsPerElement = first;
            data = second as BigInt64Array;
        } else {
            data = first;
            const elementCount = second as number;
            bitsPerElement = Math.max(Math.trunc((data.length * 64) / elementCount), 1);
        }

        this.bitsPerElement = bitsPerElement;
        this.data = data;
        this.halves = longArrayHalves(data);

        // (1L << bitsPerElement) - 1L, truncated to its low 32 bits (Java shift-counts are mod 64)
        this.maxValue = Number(BigInt.asIntN(32, (1n << BigInt(bitsPerElement & 63)) - 1n));
        this.elementsPerLong = Math.trunc(64 / this.bitsPerElement);
        if (this.elementsPerLong < 1)
            // upstream fails with an ArrayIndexOutOfBoundsException on the magic-table here
            throw new RangeError("Invalid bitsPerElement: " + bitsPerElement);

        const i = 3 * (this.elementsPerLong - 1);
        this.indexScale = DIVISION_MAGIC[i]! >>> 0; // Integer.toUnsignedLong
        this.indexOffset = DIVISION_MAGIC[i + 1]! >>> 0;
        this.indexShift = DIVISION_MAGIC[i + 2]! + 32;
    }

    get(i: number): number {
        const storageIndex = this.storageIndex(i);
        if (storageIndex >= this.data.length) return 0;
        const offset = (i - storageIndex * this.elementsPerLong) * this.bitsPerElement;

        // (int) (data[storageIndex] >> offset & maxValue) via the 32bit-halves
        // (the & maxValue keeps at most bitsPerElement low bits, so only the low 32 bits
        // of the arithmetically shifted long are ever needed)
        const lo = this.halves[storageIndex * 2 + LONG_LOW_HALF]!;
        const hi = this.halves[storageIndex * 2 + LONG_HIGH_HALF]!;
        let value: number;
        if (offset === 0) value = lo;
        else if (offset < 32) value = (lo >>> offset) | (hi << (32 - offset));
        else if (offset === 32) value = hi;
        else value = hi >> (offset - 32);

        return (value & this.maxValue) | 0;
    }

    private storageIndex(i: number): number {
        // this is the same as doing: floor(i / elementsPerLong)
        // (exact in double-math: i * indexScale + indexOffset < 2^53 for any valid index)
        return Math.floor((i * this.indexScale + this.indexOffset) / 2 ** this.indexShift);
    }

    getCapacity(): number {
        return this.data.length * this.elementsPerLong;
    }

    isCorrectSize(expectedSize: number): boolean {
        const capacity = this.getCapacity();
        return expectedSize <= capacity && expectedSize + this.elementsPerLong > capacity;
    }
}

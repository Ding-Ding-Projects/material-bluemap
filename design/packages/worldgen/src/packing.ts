/**
 * The 1.16+ "padded" packed-integer layout used by `block_states.data`,
 * `biomes.data` and the heightmaps: elements never span two longs, and the top
 * `64 % bitsPerElement` bits of every long are unused padding.
 *
 * The packing is done through an Int32Array view over the long-array's own buffer, so
 * the inner loop is plain 32-bit integer math. Doing it with BigInt instead would
 * allocate one BigInt per element, and a 1000x1000 world has roughly 200 million of
 * them.
 */

/** true on a little-endian host, which decides which Int32 half of a long is the low one */
const LITTLE_ENDIAN: boolean = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** offset of the low 32 bits of a long inside an Int32Array view over long-data */
const LOW_HALF = LITTLE_ENDIAN ? 0 : 1;
/** offset of the high 32 bits of a long inside an Int32Array view over long-data */
const HIGH_HALF = LITTLE_ENDIAN ? 1 : 0;

/** smallest number of bits that can hold every value in `0..count-1` (Java's ceilLog2) */
export function ceilLog2(count: number): number {
    if (count <= 1) return 0;
    return 32 - Math.clz32(count - 1);
}

/** vanilla never packs block-state indices tighter than 4 bits */
const MIN_BLOCK_STATE_BITS = 4;

/**
 * True when a reader can recover `bitsPerElement` from the packed array's length alone.
 *
 * A section's `block_states.data` carries no bit-width: BlueMap (and Minecraft) derive
 * it as `floor(longs * 64 / elementCount)`. That derivation is not injective. At 11
 * bits, for instance, 4096 elements need 820 longs, exactly as 12 bits does, so a
 * reader handed an 11-bit array reads it back as 12-bit garbage.
 */
export function isDerivableBitWidth(bitsPerElement: number, elementCount: number): boolean {
    const elementsPerLong = Math.trunc(64 / bitsPerElement);
    if (elementsPerLong < 1) return false;
    const longCount = Math.ceil(elementCount / elementsPerLong);
    return Math.trunc((longCount * 64) / elementCount) === bitsPerElement;
}

/**
 * The bit-width to pack a section's block-state indices at.
 *
 * It is the vanilla width, widened to the next one a length-only reader can recover
 * (see {@link isDerivableBitWidth}). Widening is always safe: a wider field holds every
 * value a narrower one could.
 */
export function blockStateBitWidth(paletteSize: number, elementCount: number): number {
    let bits = Math.max(MIN_BLOCK_STATE_BITS, ceilLog2(paletteSize));
    while (bits < 32 && !isDerivableBitWidth(bits, elementCount)) bits++;
    if (!isDerivableBitWidth(bits, elementCount))
        throw new Error("No usable bit-width for a palette of " + paletteSize + " entries");
    return bits;
}

/**
 * Packs `count` values of `bitsPerElement` bits each into a long-array in the padded
 * layout. `values` must hold at least `count` entries.
 */
export function packPadded(
    values: ArrayLike<number>,
    count: number,
    bitsPerElement: number,
): BigInt64Array {
    if (bitsPerElement < 1 || bitsPerElement > 32)
        throw new RangeError("Unsupported bits-per-element: " + bitsPerElement);

    const elementsPerLong = Math.trunc(64 / bitsPerElement);
    const longCount = Math.ceil(count / elementsPerLong);
    const data = new BigInt64Array(longCount);
    const halves = new Int32Array(data.buffer);

    const mask = bitsPerElement === 32 ? -1 : (1 << bitsPerElement) - 1;

    for (let i = 0; i < count; i++) {
        const value = values[i]! & mask;
        if (value === 0) continue;

        const longIndex = Math.trunc(i / elementsPerLong);
        const bitOffset = (i - longIndex * elementsPerLong) * bitsPerElement;

        const low = longIndex * 2 + LOW_HALF;
        const high = longIndex * 2 + HIGH_HALF;

        if (bitOffset + bitsPerElement <= 32) {
            halves[low] = halves[low]! | (value << bitOffset);
        } else if (bitOffset >= 32) {
            halves[high] = halves[high]! | (value << (bitOffset - 32));
        } else {
            // the element straddles the two 32-bit halves of this long
            halves[low] = halves[low]! | (value << bitOffset);
            halves[high] = halves[high]! | (value >>> (32 - bitOffset));
        }
    }

    return data;
}

import type { Tristate } from "../../util/Tristate.js";
import type { CombinedMask } from "./CombinedMask.js";
import { Mask } from "./Mask.js";

const MASK_24 = 0x00ffffffn;

/** upstream: map/mask/BlurMask.java */
export class BlurMask implements Mask {
    private readonly masks: CombinedMask;
    private readonly size: number;

    /** upstream: the lombok {@code @RequiredArgsConstructor} over {@code masks, size} */
    constructor(masks: CombinedMask, size: number) {
        this.masks = masks;
        this.size = size;
    }

    test(x: number, y: number, z: number): boolean;
    test(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Tristate;
    test(
        a: number,
        b: number,
        c: number,
        maxX?: number,
        maxY?: number,
        maxZ?: number,
    ): boolean | Tristate {
        if (maxX === undefined || maxY === undefined || maxZ === undefined)
            return this.masks.test(
                a + this.randomOffset(a, b, c, 23948n),
                b + this.randomOffset(a, b, c, 53242n),
                c + this.randomOffset(a, b, c, 75654n),
            );

        return this.masks.test(
            a - this.size,
            b - this.size,
            c - this.size,
            maxX + this.size,
            maxY + this.size,
            maxZ + this.size,
        );
    }

    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
        return this.masks.isEdge(
            minX - this.size,
            minZ - this.size,
            maxX + this.size,
            maxZ + this.size,
        );
    }

    submask(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Mask {
        return Mask.submask(this, minX, minY, minZ, maxX, maxY, maxZ);
    }

    inverted(): Mask {
        return Mask.inverted(this);
    }

    /**
     * upstream:
     * <pre>
     * final long hash = x * 73428767L ^ y * 4382893L ^ z * 2937119L ^ seed * 457;
     * return (int)((((hash * (hash + 456149) &amp; 0x00ffffff) / (float) 0x01000000) - 0.5f) * 2 * size);
     * </pre>
     *
     * The hash is 64-bit java arithmetic — each {@code int} coordinate widens to
     * {@code long} <em>before</em> its multiply, and {@code hash * (hash + 456149)}
     * wraps at 64 bits — so it runs on {@code BigInt} with {@link BigInt.asIntN} at every
     * step java wraps, exactly like {@code VariantSet.hashToFloat}. Everything after the
     * mask is 32-bit float arithmetic: the masked value is below 2^24 so its conversion and
     * the division by 2^24 are exact, and {@code Math.fround} pins the remaining products.
     */
    private randomOffset(x: number, y: number, z: number, seed: bigint): number {
        const hash =
            BigInt.asIntN(64, BigInt(x | 0) * 73428767n) ^
            BigInt.asIntN(64, BigInt(y | 0) * 4382893n) ^
            BigInt.asIntN(64, BigInt(z | 0) * 2937119n) ^
            BigInt.asIntN(64, seed * 457n);
        const product = BigInt.asIntN(64, hash * BigInt.asIntN(64, hash + 456149n));
        const unit = Number(product & MASK_24) / 0x01000000;
        return Math.trunc(Math.fround(Math.fround(Math.fround(unit - 0.5) * 2) * this.size));
    }
}

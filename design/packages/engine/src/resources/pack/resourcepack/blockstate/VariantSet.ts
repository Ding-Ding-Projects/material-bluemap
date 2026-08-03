import { AbstractTypeAdapterFactory } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { isJsonArray, type JsonValue } from "../../../adapter/JsonMapper.js";
import { BlockStateCondition } from "./BlockStateCondition.js";
import { Variant } from "./Variant.js";

const MASK_24 = 0x00ffffffn;

/**
 * upstream: {@code private static float hashToFloat(int x, int y, int z)}
 *
 * <pre>
 * final long hash = x * 73438747L ^ y * 9357269L ^ z * 4335792L;
 * return (hash * (hash + 456149) &amp; 0x00ffffff) / (float) 0x01000000;
 * </pre>
 *
 * This is the position-based PRNG that picks which variant a block at a given coordinate
 * renders, so it has to reproduce java's 64-bit arithmetic *bit for bit*:
 *
 * <ul>
 *   <li>each {@code int} operand is widened to {@code long} <em>before</em> the multiply,
 *       so the products are full 64-bit values with no 32-bit truncation;</li>
 *   <li>{@code hash * (hash + 456149)} is a 64-bit multiply with java's defined
 *       two's-complement wraparound on overflow;</li>
 *   <li>{@code &amp; 0x00ffffff} takes the low 24 bits of that (signed) long; the mask is
 *       positive, so the result is always in {@code [0, 0x00ffffff]} and the quotient
 *       lands in {@code [0, 1)}.</li>
 * </ul>
 *
 * A {@code number} implementation is wrong twice over: the products are already rounded
 * doubles by the time {@code ^} coerces them with ToInt32, and {@code hash * (hash +
 * 456149)} is far above 2^53. So the arithmetic runs on {@code BigInt} with
 * {@link BigInt.asIntN} at every step where java would wrap — a literal transcription of
 * the java expression. The final division is exact in both languages: the masked value is
 * below 2^24 (so it converts to {@code float} without rounding) and 0x01000000 is a power
 * of two, hence the java {@code float} result equals this {@code number} result exactly.
 *
 * <p>(An all-{@code Math.imul} implementation happens to produce the identical masked
 * value — only the low 24 bits survive, and both the XOR and the multiply are congruent
 * mod 2^24 — but it no longer looks like the java it ports, so the 64-bit form is what
 * stands here. VariantSet.test.ts pins that equivalence for a later performance pass.)</p>
 *
 * <p>Exported (upstream: private) so the port's tests can pin these semantics directly.</p>
 */
export function hashToFloat(x: number, y: number, z: number): number {
    // the parameters are java ints — `| 0` reproduces that domain
    const hash =
        BigInt.asIntN(64, BigInt(x | 0) * 73438747n) ^
        BigInt.asIntN(64, BigInt(y | 0) * 9357269n) ^
        BigInt.asIntN(64, BigInt(z | 0) * 4335792n);
    const product = BigInt.asIntN(64, hash * BigInt.asIntN(64, hash + 456149n));
    return Number(product & MASK_24) / 0x01000000;
}

/** upstream: resources/pack/resourcepack/blockstate/VariantSet.java */
export class VariantSet {
    private condition: BlockStateCondition;
    private variants: Variant[];

    private totalWeight: number;

    constructor(...variants: Variant[]);
    constructor(condition: BlockStateCondition, ...variants: Variant[]);
    constructor(conditionOrVariant?: BlockStateCondition | Variant, ...rest: Variant[]) {
        if (conditionOrVariant === undefined) {
            // upstream: VariantSet() resolving to the varargs constructor with an empty array
            this.condition = BlockStateCondition.all();
            this.variants = [];
        } else if (conditionOrVariant instanceof Variant) {
            this.condition = BlockStateCondition.all();
            this.variants = [conditionOrVariant, ...rest];
        } else {
            this.condition = conditionOrVariant;
            this.variants = rest;
        }

        this.totalWeight = this.summarizeWeights();
    }

    getCondition(): BlockStateCondition {
        return this.condition;
    }

    setCondition(condition: BlockStateCondition): void {
        this.condition = condition;
    }

    getVariants(): Variant[] {
        return this.variants;
    }

    /**
     * upstream sums with {@code DoubleStream#sum()}, which uses Kahan compensated
     * summation; this is a plain left-to-right sum (see docs/deviations.md).
     */
    private summarizeWeights(): number {
        let sum = 0;
        for (const variant of this.variants) sum += variant.getWeight();
        return sum;
    }

    forEach(consumer: (variant: Variant) => void): void;
    forEach(x: number, y: number, z: number, consumer: (variant: Variant) => void): void;
    forEach(
        a: ((variant: Variant) => void) | number,
        b?: number,
        c?: number,
        d?: (variant: Variant) => void,
    ): void {
        if (typeof a === "function") {
            for (const variant of this.variants) {
                a(variant);
            }
            return;
        }

        const x = a,
            y = b as number,
            z = c as number,
            consumer = d as (variant: Variant) => void;

        let selection = hashToFloat(x, y, z) * this.totalWeight; // random based on position
        for (const variant of this.variants) {
            selection -= variant.getWeight();
            if (selection <= 0) {
                consumer(variant);
                return;
            }
        }
    }

    /** upstream: VariantSet.Adapter */
    static readonly Adapter: AbstractTypeAdapterFactory<VariantSet> =
        new (class Adapter extends AbstractTypeAdapterFactory<VariantSet> {
            read(json: JsonValue): VariantSet {
                let variants: Variant[];
                if (isJsonArray(json)) {
                    variants = json.map((element) => Variant.Adapter.read(element));
                } else {
                    variants = [Variant.Adapter.read(json)];
                }

                return new VariantSet(...variants);
            }
        })();
}

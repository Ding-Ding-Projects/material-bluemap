import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { BlockState } from "../../../../world/BlockState.js";
import { Key } from "@worldlens/shared";
import { BlockStateCondition } from "./BlockStateCondition.js";
import { MISSING_BLOCK_MODEL, Variant } from "./Variant.js";
import { hashToFloat, VariantSet } from "./VariantSet.js";

function weighted(weight: number): Variant {
    return new Variant(MISSING_BLOCK_MODEL, 0, 0, 0, false, weight);
}

/**
 * Ground truth produced by compiling and running upstream's VariantSet#hashToFloat
 * verbatim on a JDK (Temurin 25):
 *
 * <pre>
 * private static float hashToFloat(int x, int y, int z) {
 *     final long hash = x * 73438747L ^ y * 9357269L ^ z * 4335792L;
 *     return (hash * (hash + 456149) &amp; 0x00ffffff) / (float) 0x01000000;
 * }
 * </pre>
 *
 * Every row encodes the java semantics the port has to reproduce exactly:
 *   - each int operand is widened to long *before* the multiply (no 32-bit truncation),
 *   - {@code hash * (hash + 456149)} wraps as a 64-bit two's-complement multiply,
 *   - {@code & 0x00ffffff} keeps the low 24 bits of that signed long, so `masked` is
 *     always in [0, 0x00ffffff] and `expected` = masked / 2^24 lands in [0, 1).
 *
 * `expected` is java's {@code float} result widened to {@code double}; it is exact in
 * both languages because masked < 2^24 (representable in a float without rounding) and
 * the divisor is a power of two.
 */
const HASH_TO_FLOAT_CASES: ReadonlyArray<
    readonly [x: number, y: number, z: number, masked: number, expected: number]
> = [
    [0, 0, 0, 0, 0.0],
    [1, 0, 0, 15360592, 0.915562629699707],
    [0, 1, 0, 5370994, 0.3201361894607544],
    [0, 0, 1, 5489520, 0.32720088958740234],
    [1, 1, 1, 11732442, 0.6993080377578735],
    [-1, -1, -1, 4587770, 0.27345240116119385],
    [-1, 0, 0, 10283874, 0.6129666566848755],
    [0, -1, 0, 4176384, 0.248931884765625],
    [0, 0, -1, 1781392, 0.10617923736572266],
    [2, 3, 4, 1550158, 0.09239661693572998],
    [-2, -3, -4, 13595296, 0.8103427886962891],
    [16, 64, 16, 2704304, 0.16118907928466797],
    [100, 70, -100, 12991774, 0.7743700742721558],
    [-30000000, 255, 30000000, 217984, 0.01299285888671875],
    [123456789, -987654321, 456789123, 3087580, 0.18403410911560059],
    // Integer.MAX_VALUE / Integer.MIN_VALUE corners
    [2147483647, 2147483647, 2147483647, 4587770, 0.27345240116119385],
    [-2147483648, -2147483648, -2147483648, 0, 0.0],
    [-2147483648, 0, 2147483647, 1781392, 0.10617923736572266],
    [1000000, -1000000, 1000000, 4263936, 0.254150390625],
    [7, 8, 9, 2720546, 0.16215717792510986],
    [-7, 8, -9, 16475056, 0.981989860534668],
    [12345, 67, -890, 637148, 0.037976980209350586],
];

describe("VariantSet.hashToFloat", () => {
    it.each(HASH_TO_FLOAT_CASES)(
        "matches java for (%i, %i, %i)",
        (x, y, z, masked, expected) => {
            const value = hashToFloat(x, y, z);
            expect(value).toBe(expected);
            // the float is exactly masked / 2^24, so this round-trips without error
            expect(value * 0x01000000).toBe(masked);
        },
    );

    it("always lands in [0, 1)", () => {
        for (let x = -40; x <= 40; x++) {
            for (let z = -40; z <= 40; z++) {
                const value = hashToFloat(x, x * 3 - 7, z);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(1);
            }
        }
    });

    it("is a pure function of the coordinate", () => {
        expect(hashToFloat(13, -4, 900)).toBe(hashToFloat(13, -4, 900));
    });

    /**
     * The two ways this is easy to get wrong in JavaScript, each shown producing a
     * different value than java for at least one coordinate:
     *   - plain {@code *} on the operands, whose products are rounded doubles by the time
     *     {@code ^} coerces them with ToInt32, so the low bits are already gone;
     *   - a correct 64-bit hash but {@code Number} arithmetic for
     *     {@code hash * (hash + 456149)}, which loses precision above 2^53.
     */
    it("differs from the double-precision implementations", () => {
        const doubleProducts = (x: number, y: number, z: number): number => {
            const hash = (x * 73438747) ^ (y * 9357269) ^ (z * 4335792);
            return (hash * (hash + 456149)) & 0x00ffffff;
        };
        const doubleSquare = (x: number, y: number, z: number): number => {
            const hash = Number(
                BigInt.asIntN(64, BigInt(x) * 73438747n) ^
                    BigInt.asIntN(64, BigInt(y) * 9357269n) ^
                    BigInt.asIntN(64, BigInt(z) * 4335792n),
            );
            return (hash * (hash + 456149)) & 0x00ffffff;
        };

        // java: 12991774
        expect(doubleProducts(100, 70, -100)).not.toBe(12991774);
        expect(hashToFloat(100, 70, -100) * 0x01000000).toBe(12991774);

        // java: 217984
        expect(doubleSquare(-30000000, 255, 30000000)).not.toBe(217984);
        expect(hashToFloat(-30000000, 255, 30000000) * 0x01000000).toBe(217984);
    });

    /**
     * The exception to the "64 bits or bust" rule, pinned so a later performance pass can
     * rely on it: because the result only keeps the low 24 bits and both XOR and the
     * multiply are congruent mod 2^24, an all-{@link Math.imul} implementation produces
     * the identical masked value. It is not what this module does — the BigInt form is a
     * literal transcription of the java expression — but the equivalence is real and this
     * test would catch a future swap that got it wrong.
     */
    it("agrees with an all-Math.imul implementation (congruent mod 2^24)", () => {
        const imul32 = (x: number, y: number, z: number): number => {
            const hash =
                (Math.imul(x, 73438747) ^ Math.imul(y, 9357269) ^ Math.imul(z, 4335792)) | 0;
            return Math.imul(hash, (hash + 456149) | 0) & 0x00ffffff;
        };

        for (const [x, y, z, masked] of HASH_TO_FLOAT_CASES) {
            expect(imul32(x, y, z)).toBe(masked);
        }
        for (let x = -25; x <= 25; x++) {
            for (let z = -25; z <= 25; z++) {
                const y = x * 37 - z * 11;
                expect(imul32(x, y, z)).toBe(hashToFloat(x, y, z) * 0x01000000);
            }
        }
    });
});

describe("VariantSet", () => {
    it("defaults to the all() condition and sums the weights", () => {
        const set = new VariantSet(weighted(1), weighted(3), weighted(2));
        expect(set.getCondition()).toBe(BlockStateCondition.all());
        expect(set.getVariants()).toHaveLength(3);
    });

    it("takes an explicit condition", () => {
        const condition = BlockStateCondition.property("facing", "north");
        const set = new VariantSet(condition, weighted(1));
        expect(set.getCondition()).toBe(condition);
        expect(set.getVariants()).toHaveLength(1);
    });

    it("setCondition replaces the condition", () => {
        const set = new VariantSet(weighted(1));
        const condition = BlockStateCondition.property("half", "top");
        set.setCondition(condition);
        expect(set.getCondition()).toBe(condition);
    });

    it("forEach(consumer) visits every variant in order", () => {
        const a = weighted(1),
            b = weighted(2);
        const seen: Variant[] = [];
        new VariantSet(a, b).forEach((v) => seen.push(v));
        expect(seen).toEqual([a, b]);
    });

    describe("weighted position-based selection", () => {
        const build = (): { set: VariantSet; variants: Variant[] } => {
            const variants = [weighted(1), weighted(3), weighted(2)];
            return { set: new VariantSet(...variants), variants };
        };

        const pick = (set: VariantSet, variants: Variant[], x: number, y: number, z: number) => {
            let picked = -1;
            set.forEach(x, y, z, (v) => {
                picked = variants.indexOf(v);
            });
            return picked;
        };

        it("picks the first variant when the hash is exactly 0", () => {
            // hashToFloat(0,0,0) === 0, so `selection` starts at 0 and the first
            // `selection -= weight` already satisfies `selection <= 0`
            expect(hashToFloat(0, 0, 0)).toBe(0);
            const { set, variants } = build();
            expect(pick(set, variants, 0, 0, 0)).toBe(0);
        });

        it("is deterministic per coordinate", () => {
            const { set, variants } = build();
            for (let i = 0; i < 5; i++) {
                expect(pick(set, variants, 7, -3, 11)).toBe(pick(set, variants, 7, -3, 11));
            }
        });

        /**
         * Reference picks produced by the same JDK run as HASH_TO_FLOAT_CASES, using
         * weights {1, 3, 2} (totalWeight 6) and the upstream loop
         * `selection -= weight; if (selection <= 0) accept`.
         */
        it.each([
            [0, 0, 0, 0],
            [0, 0, 1, 1],
            [0, 0, 2, 0],
            [0, 0, 3, 1],
            [1, 0, 0, 2],
            [1, 0, 1, 2],
            [1, 0, 2, 2],
            [1, 0, 3, 2],
            [2, 0, 0, 1],
            [2, 0, 1, 2],
            [2, 0, 2, 1],
            [2, 0, 3, 1],
            [3, 0, 0, 1],
            [3, 0, 1, 2],
            [3, 0, 2, 1],
            [3, 0, 3, 1],
        ])("matches java at (%i, %i, %i)", (x, y, z, expected) => {
            const { set, variants } = build();
            expect(pick(set, variants, x, y, z)).toBe(expected);
        });

        it("respects the weights over a coordinate sweep (java reference counts)", () => {
            const { set, variants } = build();
            const counts = [0, 0, 0];
            for (let x = 0; x < 16; x++) {
                for (let y = 0; y < 4; y++) {
                    for (let z = 0; z < 16; z++) {
                        const picked = pick(set, variants, x, y, z);
                        expect(picked).toBeGreaterThanOrEqual(0);
                        counts[picked]!++;
                    }
                }
            }
            // java reference over the same 16x4x16 sweep; expected shares of the 1024
            // coordinates are 170.7 / 512 / 341.3 for weights 1 / 3 / 2
            expect(counts).toEqual([170, 520, 334]);
            expect(counts[0]! + counts[1]! + counts[2]!).toBe(1024);
        });

        it("emits nothing for an empty variant-set", () => {
            const set = new VariantSet();
            let calls = 0;
            set.forEach(1, 2, 3, () => calls++);
            expect(calls).toBe(0);
            expect(set.getCondition()).toBe(BlockStateCondition.all());
        });

        it("always picks the single variant of a one-element set", () => {
            const only = weighted(1);
            const set = new VariantSet(only);
            for (let x = -20; x < 20; x++) {
                const seen: Variant[] = [];
                set.forEach(x, x * 7, -x, (v) => seen.push(v));
                expect(seen).toEqual([only]);
            }
        });
    });

    describe("Adapter", () => {
        it("reads a single variant-object", () => {
            const set = VariantSet.Adapter.read(parse('{"model": "block/stone"}'));
            expect(set.getVariants()).toHaveLength(1);
            expect(set.getVariants()[0]!.getModel().getFormatted()).toBe("minecraft:block/stone");
            expect(set.getCondition()).toBe(BlockStateCondition.all());
        });

        it("reads an array of variants", () => {
            const set = VariantSet.Adapter.read(
                parse('[{"model": "a", "weight": 2}, {"model": "b", "weight": 5}]'),
            );
            expect(set.getVariants().map((v) => v.getWeight())).toEqual([2, 5]);
        });

        it("reads an empty array", () => {
            const set = VariantSet.Adapter.read(parse("[]"));
            expect(set.getVariants()).toHaveLength(0);
        });

        it("the parsed condition still matches every state until it is replaced", () => {
            const set = VariantSet.Adapter.read(parse('{"model": "a"}'));
            expect(set.getCondition().matches(new BlockState(Key.minecraft("stone")))).toBe(true);
        });
    });
});

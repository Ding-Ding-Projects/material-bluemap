/**
 * Seeded integer mixing and a small deterministic PRNG.
 *
 * Everything here is 32-bit integer math (Math.imul, shifts, xor) so that the same
 * seed produces the same stream on every platform and every Node build: no floating
 * point accumulation, no BigInt, no dependency on a host random source.
 */

/** finalizer of the "lowbias32" integer hash — good avalanche, cheap to evaluate */
export function mix32(value: number): number {
    let h = value | 0;
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
    h = h ^ (h >>> 15);
    return h >>> 0;
}

/**
 * Fixed-arity three-lane hash. The noise lattice calls this tens of millions of times
 * per world, so it takes its lanes as plain arguments: the rest-parameter form below
 * allocates an array on every call, which at that call-count is the single most
 * expensive thing in the generator.
 */
export function hash3(a: number, b: number, c: number): number {
    let h = 0x9e3779b9 | 0;
    h = Math.imul(h ^ (a | 0), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h ^ (b | 0), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h ^ (c | 0), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
    return mix32(h);
}

/** hashes any number of 32-bit lanes into one unsigned 32-bit value */
export function hash32(...lanes: readonly number[]): number {
    let h = 0x9e3779b9 | 0;
    for (let i = 0; i < lanes.length; i++) {
        h = Math.imul(h ^ (lanes[i]! | 0), 0x85ebca6b);
        h = (h << 13) | (h >>> 19);
    }
    return mix32(h);
}

/**
 * Splits a seed that may exceed 32 bits (a GitHub run-id, for example) into two
 * 32-bit lanes, so the whole seed takes part in the mixing.
 */
export function seedLanes(seed: number): [number, number] {
    const truncated = Math.trunc(seed);
    const low = truncated >>> 0;
    const high = Math.trunc(truncated / 0x100000000) | 0;
    return [low | 0, high];
}

/** collapses a possibly-64-bit seed into a single 32-bit lane */
export function seedLane(seed: number, salt: number): number {
    const [low, high] = seedLanes(seed);
    return hash32(low, high, salt) | 0;
}

/**
 * A small, fast, fully deterministic PRNG (mulberry32). Used for the scattered
 * decoration passes, always seeded from the world-seed plus the chunk coordinates so
 * a chunk's decorations never depend on the order chunks are generated in.
 */
export class Random {
    private state: number;

    constructor(seed: number) {
        this.state = seed | 0;
    }

    /** next raw unsigned 32-bit value */
    nextUint32(): number {
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    }

    /** next value in [0, 1) */
    nextFloat(): number {
        return this.nextUint32() / 0x100000000;
    }

    /** next integer in [0, bound) */
    nextInt(bound: number): number {
        if (bound <= 0) return 0;
        return this.nextUint32() % bound;
    }

    /** next integer in [min, max] (both inclusive) */
    nextRange(min: number, max: number): number {
        if (max <= min) return min;
        return min + this.nextInt(max - min + 1);
    }

    /** true with the given probability */
    chance(probability: number): boolean {
        return this.nextFloat() < probability;
    }
}

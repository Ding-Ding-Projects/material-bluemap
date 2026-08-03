import { hash3, seedLane } from "./random.js";

/**
 * Seeded 2D value noise with fractal (fBm) and ridged variants.
 *
 * Value noise rather than gradient/simplex noise on purpose: it needs nothing but the
 * integer hash in random.ts, so it has no dependencies, no permutation table to
 * initialize, and no floating-point state that could drift between runs. The quintic
 * fade curve below is the same one Perlin noise uses, which is what keeps the
 * interpolated field free of the visible grid creases plain bilinear value noise has.
 */

/** 6t^5 - 15t^4 + 10t^3 */
function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export class ValueNoise2D {
    private readonly lane: number;

    /**
     * @param seed the world-seed (may exceed 32 bits)
     * @param salt distinguishes the independent noise fields derived from one seed
     */
    constructor(seed: number, salt: number) {
        this.lane = seedLane(seed, salt);
    }

    /** the lattice value at integer coordinates, in [0, 1) */
    private latticeValue(xi: number, zi: number): number {
        return hash3(this.lane, xi, zi) / 0x100000000;
    }

    /** one octave of value noise, in [0, 1] */
    sample(x: number, z: number): number {
        const xi = Math.floor(x);
        const zi = Math.floor(z);
        const fx = fade(x - xi);
        const fz = fade(z - zi);

        const v00 = this.latticeValue(xi, zi);
        const v10 = this.latticeValue(xi + 1, zi);
        const v01 = this.latticeValue(xi, zi + 1);
        const v11 = this.latticeValue(xi + 1, zi + 1);

        return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
    }

    /**
     * Fractal brownian motion: `octaves` octaves at doubling frequency and halving
     * amplitude, normalized back into [0, 1].
     */
    fbm(x: number, z: number, octaves: number): number {
        let amplitude = 1;
        let frequency = 1;
        let sum = 0;
        let total = 0;

        for (let i = 0; i < octaves; i++) {
            sum += this.sample(x * frequency, z * frequency) * amplitude;
            total += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }

        return sum / total;
    }

    /**
     * Ridged fractal noise, in [0, 1]: each octave is folded around its midpoint so
     * the maxima become sharp creases. This is what gives the mountains their ridges
     * instead of the rounded blobs plain fBm produces.
     */
    ridged(x: number, z: number, octaves: number): number {
        let amplitude = 1;
        let frequency = 1;
        let sum = 0;
        let total = 0;

        for (let i = 0; i < octaves; i++) {
            const folded = 1 - Math.abs(this.sample(x * frequency, z * frequency) * 2 - 1);
            sum += folded * folded * amplitude;
            total += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }

        return sum / total;
    }
}

/** clamps a value into [min, max] */
export function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/** 0 below `edge0`, 1 above `edge1`, smoothly interpolated in between */
export function smoothStep(edge0: number, edge1: number, value: number): number {
    if (edge1 <= edge0) return value < edge0 ? 0 : 1;
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

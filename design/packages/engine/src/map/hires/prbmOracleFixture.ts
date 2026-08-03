/**
 * Test-only: rebuilds, in TypeScript, the exact models the upstream Java oracle was run
 * over, so `prbmOracleData.ts` can pin this port against the real mesher's output.
 *
 * ## How the reference data was produced
 *
 * A program in the upstream package `de.bluecolored.bluemap.core.map.hires` (so it can
 * read `ArrayTileModel`'s package-private arrays) builds each model below through the
 * same public calls, then dumps `size`, `materialIndex`, `Float.floatToIntBits` of every
 * position, and `PRBMWriter`'s complete output. It is compiled and run against the built
 * oracle jar:
 *
 * ```
 * javac -cp vendor/BlueMap/implementations/cli/build/libs/cli-5.22-27-shadow.jar \
 *       -d out de/bluecolored/bluemap/core/map/hires/PrbmOracle.java
 * java  -cp "<jar>;out" de.bluecolored.bluemap.core.map.hires.PrbmOracle
 * ```
 *
 * The builders here are a line-for-line transcription of that program's model
 * construction — if you change one, the reference data has to be regenerated with the
 * matching change, or the comparison stops meaning anything.
 */
import { floatToIntBits } from "../../util/math/JavaMath.js";
import { ArrayTileModel } from "./ArrayTileModel.js";

/**
 * The oracle's deterministic 32-bit LCG. `Math.imul` + `| 0` reproduce Java's wrapping
 * `int` multiply exactly; anything else silently drifts once the product passes 2^53.
 */
class Lcg {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed | 0;
    }

    /** oracle: `seed = seed * 1103515245 + 12345; return ((seed >>> 16) & 0x7FFF) % bound;` */
    nextInt(bound: number): number {
        this.seed = (Math.imul(this.seed, 1103515245) + 12345) | 0;
        const v = (this.seed >>> 16) & 0x7fff;
        return v % bound;
    }

    /** oracle: `nextInt(20001) / 1000f - 10f` — a float expression */
    nextFloat(): number {
        return Math.fround(Math.fround(this.nextInt(20001) / 1000) - 10);
    }
}

/** oracle: `empty()` */
export function buildEmpty(): ArrayTileModel {
    return new ArrayTileModel(0);
}

/** oracle: `single()` */
export function buildSingle(): ArrayTileModel {
    const m = new ArrayTileModel(4);
    const f = m.add(1);
    m.setPositions(f, 0, 0, 0, 1, 0, 0, 0, 1, 0);
    m.setUvs(f, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0);
    m.setAOs(f, 1, 0.5, 0.25);
    m.setColor(f, 1, 0.5, 0.0);
    m.setSunlight(f, 15);
    m.setBlocklight(f, 7);
    m.setMaterialIndex(f, 3);
    m.sort();
    return m;
}

/** oracle: `threeFacesUnsorted()` — starts under-capacity on purpose, so `add` has to grow */
export function buildThreeFacesUnsorted(): ArrayTileModel {
    const m = new ArrayTileModel(2);
    const start = m.add(3);

    m.setPositions(start, 0.1, 0.2, 0.3, 1.1, 0.2, 0.3, 0.1, 1.2, 0.3);
    m.setUvs(start, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75);
    m.setAOs(start, 0, 0.5, 1);
    m.setColor(start, 0.1, 0.2, 0.3);
    m.setSunlight(start, 15);
    m.setBlocklight(start, 0);
    m.setMaterialIndex(start, 7);

    m.setPositions(start + 1, -1.5, 2.25, -3.75, 4.5, -5.25, 6.75, -7.5, 8.25, -9.75);
    m.setUvs(start + 1, 1, 0, 0, 1, 1, 1);
    m.setAOs(start + 1, 0.33333334, 0.6666667, 0.99999994);
    m.setColor(start + 1, 0.99999994, 0.33333334, 0.6666667);
    m.setSunlight(start + 1, 4);
    m.setBlocklight(start + 1, 12);
    m.setMaterialIndex(start + 1, 2);

    m.setPositions(start + 2, 16, 16, 16, 0, 16, 16, 16, 0, 16);
    m.setUvs(start + 2, 0, 0, 0.0625, 0, 0, 0.0625);
    m.setAOs(start + 2, 1, 1, 1);
    m.setColor(start + 2, 0, 0, 0);
    m.setSunlight(start + 2, 0);
    m.setBlocklight(start + 2, 15);
    m.setMaterialIndex(start + 2, 2);

    m.sort();
    return m;
}

/** oracle: `transformed()` — every geometry operation, chained, on overlapping ranges */
export function buildTransformed(): ArrayTileModel {
    const fr = Math.fround;
    const m = new ArrayTileModel(8);
    const start = m.add(4);
    for (let i = 0; i < 4; i++) {
        const f = start + i;
        // oracle: `i + 0.1f` — an int-plus-float add, so the literal is narrowed FIRST
        m.setPositions(
            f,
            fr(i + fr(0.1)), fr(i + fr(0.2)), fr(i + fr(0.3)),
            fr(i + fr(1.1)), fr(i + fr(1.2)), fr(i + fr(1.3)),
            fr(i + fr(2.1)), fr(i + fr(2.2)), fr(i + fr(2.3)),
        );
        m.setUvs(f, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6);
        m.setAOs(f, 0.2, 0.4, 0.8);
        m.setColor(f, 0.9, 0.8, 0.7);
        m.setSunlight(f, i * 3);
        m.setBlocklight(f, 15 - i * 3);
        m.setMaterialIndex(f, (i % 2) + 1);
    }

    m.translate(start, 4, 0.5, -0.25, 1.75);
    m.scale(start, 4, 0.0625, 2, -1);
    m.rotate(start, 2, 22.5, 0, 1, 0);
    m.rotateXYZ(start, 4, 15, 30, 45);
    m.rotateZYX(start + 1, 2, -10, 20, -30);
    m.rotateYXZ(start, 3, 12.5, -7.5, 100);
    m.transform(start, 4,
        1.5, 0.25, -0.75,
        0, 2, 0.5,
        -1, 0.125, 3,
    );
    m.transform(start, 4,
        0.5, 0, 0, 1,
        0, 0.5, 0, 2,
        0, 0, 0.5, 3,
        0, 0, 0, 1,
    );
    m.invertOrientation(start + 1);

    m.sort();
    return m;
}

/**
 * oracle: `floatIntermediates()` — a single face whose transform result differs
 * depending on whether the multiply-add chain is rounded to `float` after every
 * operator (which Java does) or accumulated in wider precision and rounded once
 * (which a naive javascript port does). Off by exactly one ulp, which is one byte.
 */
export function buildFloatIntermediates(): ArrayTileModel {
    const m = new ArrayTileModel(1);
    const f = m.add(1);
    m.setPositions(
        f,
        0.7499656677246094, -3.517979621887207, -217.63333129882812,
        0.0003674277104437351, -0.004270222969353199, -0.0012166306842118502,
        1.276799201965332, 95.83064270019531, 0.0016251394990831614,
    );
    m.setMaterialIndex(f, 0);
    m.transform(f, 1,
        0.3499417304992676, 0.09921848773956299, -0.3815346956253052,
        -0.9278327226638794, -0.20076239109039307, -0.0070441048592329025,
        -6.990570068359375, 13.897296905517578, -0.4894551634788513,
    );
    m.sort();
    return m;
}

/** oracle: `mergeSort40()` — 40 faces (>= 16, so the merge path runs) over 5 materials */
export function buildMergeSort40(): ArrayTileModel {
    const rng = new Lcg(987654321);
    const m = new ArrayTileModel(1);
    const start = m.add(40);
    for (let i = 0; i < 40; i++) {
        const f = start + i;
        m.setPositions(
            f,
            rng.nextFloat(), rng.nextFloat(), rng.nextFloat(),
            rng.nextFloat(), rng.nextFloat(), rng.nextFloat(),
            rng.nextFloat(), rng.nextFloat(), rng.nextFloat(),
        );
        m.setUvs(
            f,
            rng.nextFloat(), rng.nextFloat(),
            rng.nextFloat(), rng.nextFloat(),
            rng.nextFloat(), rng.nextFloat(),
        );
        m.setAOs(
            f,
            Math.fround(rng.nextInt(101) / 100),
            Math.fround(rng.nextInt(101) / 100),
            Math.fround(rng.nextInt(101) / 100),
        );
        m.setColor(
            f,
            Math.fround(rng.nextInt(101) / 100),
            Math.fround(rng.nextInt(101) / 100),
            Math.fround(rng.nextInt(101) / 100),
        );
        m.setSunlight(f, rng.nextInt(16));
        m.setBlocklight(f, rng.nextInt(16));
        m.setMaterialIndex(f, rng.nextInt(5));
    }
    m.sort();
    return m;
}

export const ORACLE_MODEL_BUILDERS: Readonly<Record<string, () => ArrayTileModel>> = {
    empty: buildEmpty,
    single: buildSingle,
    threeFacesUnsorted: buildThreeFacesUnsorted,
    transformed: buildTransformed,
    floatIntermediates: buildFloatIntermediates,
    mergeSort40: buildMergeSort40,
};

/** `Float.floatToIntBits` of every live entry of a model's position array. */
export function positionBitsOf(model: ArrayTileModel): number[] {
    const bits: number[] = [];
    for (let i = 0; i < model.size() * ArrayTileModel.FI_POSITION; i++) {
        bits.push(floatToIntBits(model.position[i]!));
    }
    return bits;
}

/** The live prefix of a model's material-index array. */
export function materialIndicesOf(model: ArrayTileModel): number[] {
    return Array.from(model.materialIndex.subarray(0, model.size()));
}

export function toHex(bytes: Uint8Array): string {
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex;
}

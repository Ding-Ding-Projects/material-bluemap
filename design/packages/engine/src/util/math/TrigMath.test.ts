import { TrigMath } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { floatToIntBits, toRadians } from "./JavaMath.js";

/**
 * The mesher's side of `com.flowpowered.math.TrigMath` (flow-math 1.0.3).
 *
 * The port itself lives in `@material-bluemap/shared` (it is what `MatrixM3f`/`MatrixM4f`
 * rotate with too, and there must only be one). What is pinned here is the pairing the
 * engine depends on: the exact half-angles `ArrayTileModel.rotate`/`rotateXYZ`/
 * `rotateZYX`/`rotateYXZ` compute — `toRadians(deg) * 0.5` — and the sine/cosine
 * flow-math returns for them.
 *
 * Reference values captured by running flow-math's own `TrigMath` out of the built
 * oracle jar (`vendor/BlueMap/implementations/cli/build/libs/cli-5.22-27-shadow.jar`).
 * `mathSinBits`/`mathCosBits` are `(float) Math.sin`/`Math.cos` of the same angle,
 * recorded so the difference between the two is a fact in this file rather than an
 * assertion about one.
 */
interface TrigCase {
    readonly deg: number;
    /** `Double.doubleToLongBits(Math.toRadians(deg) * 0.5)` */
    readonly halfBits: bigint;
    /** `Float.floatToIntBits(TrigMath.sin(half))` */
    readonly sinBits: number;
    /** `Float.floatToIntBits(TrigMath.cos(half))` */
    readonly cosBits: number;
    /** `Float.floatToIntBits((float) Math.sin(half))` */
    readonly mathSinBits: number;
    /** `Float.floatToIntBits((float) Math.cos(half))` */
    readonly mathCosBits: number;
}

const CASES: readonly TrigCase[] = [
    { deg: 0, halfBits: 0n, sinBits: 0, cosBits: 1065353216, mathSinBits: 0, mathCosBits: 1065353216 },
    { deg: 22.5, halfBits: 4596242258042563864n, sinBits: 1044891074, cosBits: 1065030846, mathSinBits: 1044891074, mathCosBits: 1065030846 },
    { deg: -22.5, halfBits: -4627129778812211944n, sinBits: -1102592574, cosBits: 1065030846, mathSinBits: -1102592574, mathCosBits: 1065030846 },
    { deg: 45, halfBits: 4600745857669934360n, sinBits: 1053028117, cosBits: 1064076126, mathSinBits: 1053028117, mathCosBits: 1064076126 },
    { deg: 90, halfBits: 4605249457297304856n, sinBits: 1060439283, cosBits: 1060439283, mathSinBits: 1060439283, mathCosBits: 1060439283 },
    { deg: 180, halfBits: 4609753056924675352n, sinBits: 1065353216, cosBits: 621621554, mathSinBits: 1065353216, mathCosBits: 613232946 },
    { deg: 270, halfBits: 4612488097114038738n, sinBits: 1060439283, cosBits: -1087044365, mathSinBits: 1060439283, mathCosBits: -1087044365 },
    { deg: 360, halfBits: 4614256656552045848n, sinBits: 621621554, cosBits: -1082130432, mathSinBits: 621621554, mathCosBits: -1082130432 },
    { deg: 15, halfBits: 4593884178791887717n, sinBits: 1040558215, cosBits: 1065209686, mathSinBits: 1040558248, mathCosBits: 1065209685 },
    { deg: 30, halfBits: 4598387778419258213n, sinBits: 1048871886, cosBits: 1064781551, mathSinBits: 1048871918, mathCosBits: 1064781546 },
    { deg: 12.5, halfBits: 4592524684832085417n, sinBits: 1038021885, cosBits: 1065253500, mathSinBits: 1038022041, mathCosBits: 1065253498 },
    { deg: -7.5, halfBits: -4633991457690258587n, sinBits: -1115295146, cosBits: 1065317294, mathSinBits: -1115295213, mathCosBits: 1065317295 },
    { deg: 100, halfBits: 4606035483714196905n, sinBits: 1061428089, cosBits: 1059360191, mathSinBits: 1061428093, mathCosBits: 1059360187 },
    { deg: -10, halfBits: -4632419404856474489n, sinBits: -1112375470, cosBits: 1065289372, mathSinBits: -1112375626, mathCosBits: 1065289374 },
    { deg: 20, halfBits: 4595456231625671815n, sinBits: 1043452072, cosBits: 1065098334, mathSinBits: 1043452116, mathCosBits: 1065098332 },
    { deg: -30, halfBits: -4624984258435517595n, sinBits: -1098611714, cosBits: 1064781544, mathSinBits: -1098611730, mathCosBits: 1064781546 },
    { deg: 1, halfBits: 4576184190849162553n, sinBits: 1007613719, cosBits: 1065352577, mathSinBits: 1007614398, mathCosBits: 1065352577 },
    { deg: 2, halfBits: 4580687790476533049n, sinBits: 1016001970, cosBits: 1065350661, mathSinBits: 1016002649, mathCosBits: 1065350661 },
    { deg: 3, halfBits: 4583203075010587606n, sinBits: 1020686388, cosBits: 1065347467, mathSinBits: 1020686602, mathCosBits: 1065347467 },
    { deg: 7.5, halfBits: 4589380579164517221n, sinBits: 1032188302, cosBits: 1065317296, mathSinBits: 1032188435, mathCosBits: 1065317295 },
    { deg: 67.5, halfBits: 4603480897859297746n, sinBits: 1057896922, cosBits: 1062525745, mathSinBits: 1057896922, mathCosBits: 1062525745 },
    { deg: 112.5, halfBits: 4607018016735311966n, sinBits: 1062525745, cosBits: 1057896922, mathSinBits: 1062525745, mathCosBits: 1057896922 },
    { deg: 135, halfBits: 4607984497486668242n, sinBits: 1064076126, cosBits: 1053028117, mathSinBits: 1064076126, mathCosBits: 1053028117 },
    { deg: 157.5, halfBits: 4608868777205671797n, sinBits: 1065030846, cosBits: 1044891074, mathSinBits: 1065030846, mathCosBits: 1044891074 },
    { deg: 999.75, halfBits: 4621101054994057312n, sinBits: 1059388216, cosBits: -1086079127, mathSinBits: 1059388200, mathCosBits: -1086079113 },
    { deg: -1234.5, halfBits: -4601117733727184693n, sinBits: 1064939530, cosBits: -1100874136, mathSinBits: 1064939529, mathCosBits: -1100874110 },
];

const DOUBLE_BITS = new DataView(new ArrayBuffer(8));

/** `Double.doubleToLongBits(double)` */
function doubleToLongBits(value: number): bigint {
    DOUBLE_BITS.setFloat64(0, value);
    return DOUBLE_BITS.getBigInt64(0);
}

describe("TrigMath, over the half-angles the mesher asks for", () => {
    it("computes the same half-angle Java does", () => {
        for (const { deg, halfBits } of CASES) {
            expect(doubleToLongBits(toRadians(deg) * 0.5), `toRadians(${deg}) * 0.5`).toBe(halfBits);
        }
    });

    it("matches flow-math's sin() bit for bit", () => {
        for (const { deg, sinBits } of CASES) {
            const half = toRadians(deg) * 0.5;
            expect(floatToIntBits(TrigMath.sin(half)), `sin of half-angle of ${deg} deg`).toBe(
                sinBits,
            );
        }
    });

    it("matches flow-math's cos() bit for bit", () => {
        for (const { deg, cosBits } of CASES) {
            const half = toRadians(deg) * 0.5;
            expect(floatToIntBits(TrigMath.cos(half)), `cos of half-angle of ${deg} deg`).toBe(
                cosBits,
            );
        }
    });

    /**
     * The point of porting flow-math at all: its table quantisation is visibly coarser
     * than libm, so a port that reached for `Math.sin` would emit different bytes for
     * every rotated model. `cos(pi/2)` is the extreme case — flow-math returns
     * 4.371e-8 where libm returns 6.12e-17.
     */
    it("is NOT (float) Math.sin / Math.cos", () => {
        const differingSin = CASES.filter((c) => c.sinBits !== c.mathSinBits);
        const differingCos = CASES.filter((c) => c.cosBits !== c.mathCosBits);
        expect(differingSin.length).toBeGreaterThan(10);
        expect(differingCos.length).toBeGreaterThan(10);

        for (const { deg, sinBits, cosBits } of differingSin) {
            const half = toRadians(deg) * 0.5;
            expect(floatToIntBits(TrigMath.sin(half))).toBe(sinBits);
            expect(floatToIntBits(Math.fround(Math.sin(half)))).not.toBe(sinBits);
            expect(floatToIntBits(TrigMath.cos(half))).toBe(cosBits);
        }
    });

    it("wraps the table index, so a huge angle still resolves", () => {
        expect(Number.isFinite(TrigMath.sin(1e9))).toBe(true);
        expect(Number.isFinite(TrigMath.cos(-1e9))).toBe(true);
        // sin is periodic in the table index: stepping a whole SIN_SIZE is the identity
        const angle = 0.3;
        const period = 4194304 / 667544.214430109;
        expect(TrigMath.sin(angle + period)).toBe(TrigMath.sin(angle));
        expect(TrigMath.cos(0)).toBe(1);
        expect(TrigMath.sin(0)).toBe(0);
    });
});

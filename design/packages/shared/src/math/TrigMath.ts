/**
 * upstream: com.flowpowered.math.TrigMath (flow-math 1.0.3) — the trigonometry
 * BlueMap's matrices and vectors actually call, which is NOT `java.lang.Math`.
 *
 * This matters far more than it looks. `MatrixM3f`/`MatrixM4f`'s rotate/rotateXYZ/
 * rotateZYX/rotateYXZ build their quaternions from `TrigMath.sin`/`TrigMath.cos`, and
 * `MatrixM4f#rotateYXZ` is what `blockstate/Variant` and `model/Rotation` use to bake
 * their transform-matrices. `TrigMath.sin` is a 2^22-entry *quantized table lookup*, so
 * it differs from `Math.sin` by up to ~1.5e-6 — roughly 25 float-ulps, which moves
 * vertices by a visible amount and changes rendered tile bytes. `TrigMath.acos`/
 * `atan2` are likewise polynomial approximations, not the libm functions.
 *
 * Ported exactly, with two deliberate implementation choices recorded in
 * docs/deviations.md:
 *
 * - **The 2^22-entry sine table is computed on demand instead of being materialized.**
 *   Upstream fills `float[4194304]` in a static initializer with
 *   `SIN_TABLE[i] = (float) Math.sin(i * TWO_PI / SIN_SIZE)`, then indexes it. This port
 *   evaluates that same expression for the one index a call needs, which is the identical
 *   value by construction and saves a permanently-resident 16 MB `Float32Array`.
 * - **`Math.sin` is assumed to agree with java's to within a double-ulp.** Both are
 *   fdlibm-derived and both are required to be faithfully rounded; a disagreement only
 *   survives the `Math.fround` to a float when the double result lies within one
 *   double-ulp of a float rounding boundary, which is a ~2^-29 event per index. The
 *   ported table is pinned against the real flow-math output in TrigMath.test.ts.
 */

const fr = Math.fround;

const SIN_SIZE = 4194304; // 1 << 22
const SIN_MASK = 4194303; // SIN_SIZE - 1
const COS_OFFSET = 1048576; // SIN_SIZE / 4

/** upstream: {@code SIN_CONVERSION_FACTOR = (double) SIN_SIZE / TWO_PI} */
const SIN_CONVERSION_FACTOR = 667544.214430109;

// upstream: the msatan/mxatan polynomial coefficients
const SQ2P1 = 2.414213562373095;
const SQ2M1 = 0.41421356237309503;
const P4 = 16.15364129822302;
const P3 = 268.42548195503974;
const P2 = 1153.029351540485;
const P1 = 1780.406316433197;
const P0 = 896.7859740366387;
const Q4 = 58.95697050844462;
const Q3 = 536.2653740312153;
const Q2 = 1666.7838148816338;
const Q1 = 2079.33497444541;
const Q0 = 896.7859740366387;

/**
 * upstream: {@code com.flowpowered.math.GenericMath#floor(double)} —
 * {@code int y = (int) a; return a < y ? y - 1 : y;}
 *
 * The java narrowing conversion truncates towards zero, maps NaN to 0 and *saturates* at
 * the int bounds (javascript's `| 0` would wrap instead), so the three cases are spelled
 * out here.
 */
export function genericMathFloor(a: number): number {
    if (Number.isNaN(a)) return 0;
    let y: number;
    if (a >= 2147483647) y = 2147483647;
    else if (a <= -2147483648) y = -2147483648;
    else y = Math.trunc(a);
    return a < y ? y - 1 : y;
}

/** upstream: {@code SIN_TABLE[idx & SIN_MASK]} */
function sinRaw(idx: number): number {
    // & is int-wise in java too, and SIN_MASK is positive, so the index is always in range
    const i = idx & SIN_MASK;
    return fr(Math.sin((i * TrigMath.TWO_PI) / SIN_SIZE));
}

/** upstream: {@code SIN_TABLE[idx + COS_OFFSET & SIN_MASK]} */
function cosRaw(idx: number): number {
    // java: int addition, which can overflow — `| 0` reproduces the wraparound
    return sinRaw((idx + COS_OFFSET) | 0);
}

/** upstream: {@code private static double mxatan(double arg)} */
function mxatan(arg: number): number {
    const argsq = arg * arg;
    let value = (((P4 * argsq + P3) * argsq + P2) * argsq + P1) * argsq + P0;
    value /= ((((argsq + Q4) * argsq + Q3) * argsq + Q2) * argsq + Q1) * argsq + Q0;
    return value * arg;
}

/** upstream: {@code private static double msatan(double arg)} */
function msatan(arg: number): number {
    if (arg < SQ2M1) return mxatan(arg);
    if (arg > SQ2P1) return TrigMath.HALF_PI - mxatan(1 / arg);
    return TrigMath.QUARTER_PI + mxatan((arg - 1) / (arg + 1));
}

/**
 * upstream: {@code java.lang.Math.toRadians(double)}.
 *
 * It is a *single multiply* by `Math.PI / 180.0`, not `angdeg / 180.0 * PI`. Java 8 had
 * the two-operation form and Java 9 replaced it (JDK-8145213); the two differ by an ulp
 * for many inputs, and for `-337.5`, `-247.5`, `-168.75` and `-123.75` — all ordinary
 * model rotations — that ulp lands on a *different* entry of the sine table below, which
 * is a visibly different matrix. Duplicated from `engine/util/math/JavaMath` because
 * `shared` can not depend on `engine`; both carry the same constant.
 */
export function toRadians(angdeg: number): number {
    return angdeg * DEGREES_TO_RADIANS;
}

/** upstream: {@code java.lang.Math.DEGREES_TO_RADIANS} — the compile-time `Math.PI / 180.0` */
const DEGREES_TO_RADIANS = 0.017453292519943295;

export const TrigMath = {
    PI: Math.PI,
    SQUARED_PI: 9.869604401089358,
    HALF_PI: Math.PI / 2,
    QUARTER_PI: Math.PI / 4,
    TWO_PI: Math.PI * 2,
    THREE_PI_HALVES: (Math.PI * 3) / 2,
    DEG_TO_RAD: Math.PI / 180,
    HALF_DEG_TO_RAD: 0.008726646259971648,
    RAD_TO_DEG: 180 / Math.PI,
    SQRT_OF_TWO: Math.SQRT2,
    HALF_SQRT_OF_TWO: Math.SQRT2 / 2,

    /** upstream: {@code public static float sin(double angle)} — returns a float */
    sin(angle: number): number {
        return sinRaw(genericMathFloor(angle * SIN_CONVERSION_FACTOR));
    },

    /** upstream: {@code public static float cos(double angle)} — returns a float */
    cos(angle: number): number {
        return cosRaw(genericMathFloor(angle * SIN_CONVERSION_FACTOR));
    },

    /** upstream: {@code public static float tan(double angle)} */
    tan(angle: number): number {
        const idx = genericMathFloor(angle * SIN_CONVERSION_FACTOR);
        return fr(sinRaw(idx) / cosRaw(idx));
    },

    /** upstream: {@code public static double asin(double value)} */
    asin(value: number): number {
        if (value > 1) return NaN;
        if (value < 0) return -TrigMath.asin(-value);
        const temp = Math.sqrt(1 - value * value);
        return value > 0.7
            ? TrigMath.HALF_PI - msatan(temp / value)
            : msatan(value / temp);
    },

    /** upstream: {@code public static double acos(double value)} */
    acos(value: number): number {
        return !(value > 1) && !(value < -1) ? TrigMath.HALF_PI - TrigMath.asin(value) : NaN;
    },

    /** upstream: {@code public static double atan(double value)} */
    atan(value: number): number {
        return value > 0 ? msatan(value) : -msatan(-value);
    },

    /** upstream: {@code public static double atan2(double y, double x)} */
    atan2(y: number, x: number): number {
        if (y + x === y) return y >= 0 ? TrigMath.HALF_PI : -TrigMath.HALF_PI;
        const a = TrigMath.atan(y / x);
        if (x < 0) return a <= 0 ? a + Math.PI : a - Math.PI;
        return a;
    },
};

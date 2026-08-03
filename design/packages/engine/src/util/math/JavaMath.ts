/**
 * upstream: no single file — these are the JLS/JDK numeric primitives that the
 * float-exact parts of the mesher are written in (`(int) someDouble`,
 * `Float.floatToIntBits`, `Math.toRadians`). Java has them in the language and in
 * `java.lang`; javascript does not, and getting any of them subtly wrong changes
 * bytes in every rendered tile, so they live here rather than being re-improvised
 * per call-site.
 */

/**
 * Java's narrowing primitive conversion from `double`/`float` to `int`
 * (JLS 5.1.3): round toward zero, NaN becomes `0`, and out-of-range values
 * *saturate* at `Integer.MIN_VALUE`/`Integer.MAX_VALUE`.
 *
 * Javascript's `| 0` and `>> 0` wrap modulo 2^32 instead of saturating, so they are
 * not a substitute — `(int) Float.POSITIVE_INFINITY` is `2147483647` in Java and `0`
 * with `| 0`, and PRBMWriter's normal-encoding hits exactly that case on a
 * degenerate (zero-area) face.
 */
export function javaCastToInt(value: number): number {
    if (Number.isNaN(value)) return 0;
    const truncated = Math.trunc(value);
    if (truncated >= 2147483647) return 2147483647;
    if (truncated <= -2147483648) return -2147483648;
    return truncated;
}

/**
 * Java's narrowing primitive conversion from `double`/`float` to `byte`
 * (JLS 5.1.3): narrow to `int` first, then keep the low 8 bits. Returned as the
 * unsigned 0..255 byte, which is what every caller here writes out.
 */
export function javaCastToUnsignedByte(value: number): number {
    return javaCastToInt(value) & 0xff;
}

const FLOAT_BITS_FLOAT = new Float32Array(1);
const FLOAT_BITS_INT = new Int32Array(FLOAT_BITS_FLOAT.buffer);

/**
 * upstream: `Float.floatToIntBits(float)` — the IEEE-754 single-precision bit pattern,
 * with every NaN collapsed to the canonical `0x7fc00000` (this is what separates
 * `floatToIntBits` from `floatToRawIntBits`).
 */
export function floatToIntBits(value: number): number {
    FLOAT_BITS_FLOAT[0] = value;
    const bits = FLOAT_BITS_INT[0]!;
    if ((bits & 0x7f800000) === 0x7f800000 && (bits & 0x007fffff) !== 0) return 0x7fc00000;
    return bits;
}

/**
 * upstream: `java.lang.Math.DEGREES_TO_RADIANS` — the compile-time value of
 * `Math.PI / 180.0`.
 */
const DEGREES_TO_RADIANS = 0.017453292519943295;

/**
 * upstream: `Math.toRadians(double)`.
 *
 * It is a *single multiply* by the constant above, not `angdeg / 180.0 * PI`. Java 8
 * had the two-operation form and Java 9 replaced it (JDK-8145213), and the two differ
 * by an ulp for some inputs — `toRadians(3)` and `toRadians(999.75)` among them. The
 * oracle jar runs on a modern JDK, so this is the form that produces its numbers.
 */
export function toRadians(angdeg: number): number {
    return angdeg * DEGREES_TO_RADIANS;
}

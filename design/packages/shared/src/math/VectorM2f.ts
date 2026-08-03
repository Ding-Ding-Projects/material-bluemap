import { TrigMath } from "./TrigMath.js";
import type { MatrixM3f } from "./MatrixM3f.js";

const fr = Math.fround;

/**
 * Mutable, allocation-free 2d float-vector.
 *
 * upstream: util/math/VectorM2f.java — every field and every operand is a java `float`,
 * so every arithmetic step is rounded to 32-bit before the next one runs. `Math.fround`
 * marks each of those steps: a double intermediate that is only rounded at the end lands
 * on a different float often enough to change rendered tile bytes (see docs/deviations.md).
 * Incoming `float` parameters are rounded on entry, which is what the jvm does at the
 * call-site of a `float`-typed parameter.
 */
export class VectorM2f {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = fr(x);
        this.y = fr(y);
    }

    set(x: number, y: number): VectorM2f {
        this.x = fr(x);
        this.y = fr(y);
        return this;
    }

    translate(x: number, y: number): VectorM2f {
        this.x = fr(this.x + fr(x));
        this.y = fr(this.y + fr(y));
        return this;
    }

    rotate(sx: number, sy: number): VectorM2f {
        //sx,sy should be normalized
        const fsx = fr(sx),
            fsy = fr(sy);
        return this.set(
            fr(fr(this.x * fsx) - fr(this.y * fsy)),
            fr(fr(this.y * fsx) + fr(this.x * fsy))
        );
    }

    transform(t: MatrixM3f): VectorM2f {
        return this.set(
            fr(fr(fr(t.m00 * this.x) + fr(t.m01 * this.y)) + t.m02),
            fr(fr(fr(t.m10 * this.x) + fr(t.m11 * this.y)) + t.m12)
        );
    }

    normalize(): VectorM2f {
        const length = this.length();
        this.x = fr(this.x / length);
        this.y = fr(this.y / length);
        return this;
    }

    /** upstream returns a `float` (the double sqrt narrowed) */
    length(): number {
        return fr(Math.sqrt(this.lengthSquared()));
    }

    /** upstream returns a `float` */
    lengthSquared(): number {
        return fr(fr(this.x * this.x) + fr(this.y * this.y));
    }

    /**
     * upstream: {@code (float) TrigMath.acos((this.x * x + this.y * y) / (this.length() *
     * Math.sqrt(x * x + y * y)))}
     *
     * Note the mixed widths: the numerator and {@link length} are `float`, while
     * {@code Math.sqrt} returns a `double`, so the division and the acos run in double
     * and only the final result is narrowed. And it is {@link TrigMath#acos} — a
     * polynomial approximation — not `Math.acos`, which matters because
     * `LiquidModelRenderer` truncates {@code angleTo(0, -1) * RAD_TO_DEG} to an int.
     */
    angleTo(x: number, y: number): number {
        const fx = fr(x),
            fy = fr(y);
        const dot = fr(fr(this.x * fx) + fr(this.y * fy));
        const otherLengthSquared = fr(fr(fx * fx) + fr(fy * fy));
        return fr(TrigMath.acos(dot / (this.length() * Math.sqrt(otherLengthSquared))));
    }
}

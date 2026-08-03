import type { MatrixM3f } from "./MatrixM3f.js";
import { MatrixM4f } from "./MatrixM4f.js";
import type { Vector3i } from "./Vector3i.js";

const fr = Math.fround;

/**
 * Mutable, allocation-free 3d float-vector.
 *
 * upstream: util/math/VectorM3f.java — the fields and every operand are java `float`s, so
 * each arithmetic step rounds to 32-bit before the next one runs; `Math.fround` marks
 * those steps (see docs/deviations.md). The one exception upstream makes is
 * {@link lengthSquared}, which computes in `float` and *returns* a `double`.
 */
export class VectorM3f {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number) {
        this.x = fr(x);
        this.y = fr(y);
        this.z = fr(z);
    }

    set(x: number, y: number, z: number): VectorM3f;
    set(v: Vector3i): VectorM3f;
    set(v: VectorM3f): VectorM3f;
    set(a: number | Vector3i | VectorM3f, b?: number, c?: number): VectorM3f {
        if (typeof a === "number") {
            this.x = fr(a);
            this.y = fr(b as number);
            this.z = fr(c as number);
        } else if (a instanceof VectorM3f) {
            this.x = a.x;
            this.y = a.y;
            this.z = a.z;
        } else {
            // upstream: the int components widen to float
            this.x = fr(a.getX());
            this.y = fr(a.getY());
            this.z = fr(a.getZ());
        }
        return this;
    }

    mul(a: number): VectorM3f {
        const fa = fr(a);
        this.x = fr(this.x * fa);
        this.y = fr(this.y * fa);
        this.z = fr(this.z * fa);
        return this;
    }

    cross(v: VectorM3f): VectorM3f {
        return this.set(
            fr(fr(this.y * v.z) - fr(this.z * v.y)),
            fr(fr(this.z * v.x) - fr(this.x * v.z)),
            fr(fr(this.x * v.y) - fr(this.y * v.x))
        );
    }

    transform(t: MatrixM3f | MatrixM4f): VectorM3f {
        if (t instanceof MatrixM4f) {
            return this.set(
                fr(fr(fr(fr(t.m00 * this.x) + fr(t.m01 * this.y)) + fr(t.m02 * this.z)) + t.m03),
                fr(fr(fr(fr(t.m10 * this.x) + fr(t.m11 * this.y)) + fr(t.m12 * this.z)) + t.m13),
                fr(fr(fr(fr(t.m20 * this.x) + fr(t.m21 * this.y)) + fr(t.m22 * this.z)) + t.m23)
            );
        }
        return this.set(
            fr(fr(fr(t.m00 * this.x) + fr(t.m01 * this.y)) + fr(t.m02 * this.z)),
            fr(fr(fr(t.m10 * this.x) + fr(t.m11 * this.y)) + fr(t.m12 * this.z)),
            fr(fr(fr(t.m20 * this.x) + fr(t.m21 * this.y)) + fr(t.m22 * this.z))
        );
    }

    rotateAndScale(t: MatrixM4f): VectorM3f {
        return this.set(
            fr(fr(fr(t.m00 * this.x) + fr(t.m01 * this.y)) + fr(t.m02 * this.z)),
            fr(fr(fr(t.m10 * this.x) + fr(t.m11 * this.y)) + fr(t.m12 * this.z)),
            fr(fr(fr(t.m20 * this.x) + fr(t.m21 * this.y)) + fr(t.m22 * this.z))
        );
    }

    normalize(): VectorM3f {
        const length = this.length();
        this.x = fr(this.x / length);
        this.y = fr(this.y / length);
        this.z = fr(this.z / length);
        return this;
    }

    absolute(): VectorM3f {
        this.x = Math.abs(this.x);
        this.y = Math.abs(this.y);
        this.z = Math.abs(this.z);
        return this;
    }

    /** upstream returns a `float` (the double sqrt narrowed) */
    length(): number {
        return fr(Math.sqrt(this.lengthSquared()));
    }

    /** upstream computes in `float` and returns a `double` */
    lengthSquared(): number {
        return fr(fr(fr(this.x * this.x) + fr(this.y * this.y)) + fr(this.z * this.z));
    }

    /** upstream returns a `float` */
    dot(v: VectorM3f): number {
        return fr(fr(fr(this.x * v.x) + fr(this.y * v.y)) + fr(this.z * v.z));
    }

    max(): number {
        return Math.max(this.x, Math.max(this.y, this.z));
    }

    min(): number {
        return Math.min(this.x, Math.min(this.y, this.z));
    }
}

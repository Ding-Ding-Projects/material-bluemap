import type { MatrixM3f } from "./MatrixM3f.js";

/** Mutable, allocation-free 2d float-vector. */
export class VectorM2f {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    set(x: number, y: number): VectorM2f {
        this.x = x;
        this.y = y;
        return this;
    }

    translate(x: number, y: number): VectorM2f {
        this.x += x;
        this.y += y;
        return this;
    }

    rotate(sx: number, sy: number): VectorM2f {
        //sx,sy should be normalized
        return this.set(this.x * sx - this.y * sy, this.y * sx + this.x * sy);
    }

    transform(t: MatrixM3f): VectorM2f {
        return this.set(
            t.m00 * this.x + t.m01 * this.y + t.m02,
            t.m10 * this.x + t.m11 * this.y + t.m12
        );
    }

    normalize(): VectorM2f {
        const length = this.length();
        this.x /= length;
        this.y /= length;
        return this;
    }

    length(): number {
        return Math.sqrt(this.lengthSquared());
    }

    lengthSquared(): number {
        return this.x * this.x + this.y * this.y;
    }

    angleTo(x: number, y: number): number {
        // upstream uses TrigMath.acos which, like Math.acos, is NaN outside [-1, 1]
        return Math.acos(
            (this.x * x + this.y * y) / (this.length() * Math.sqrt(x * x + y * y))
        );
    }
}

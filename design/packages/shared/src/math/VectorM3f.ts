import type { MatrixM3f } from "./MatrixM3f.js";
import { MatrixM4f } from "./MatrixM4f.js";
import type { Vector3i } from "./Vector3i.js";

/** Mutable, allocation-free 3d float-vector. */
export class VectorM3f {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    set(x: number, y: number, z: number): VectorM3f;
    set(v: Vector3i): VectorM3f;
    set(v: VectorM3f): VectorM3f;
    set(a: number | Vector3i | VectorM3f, b?: number, c?: number): VectorM3f {
        if (typeof a === "number") {
            this.x = a;
            this.y = b as number;
            this.z = c as number;
        } else if (a instanceof VectorM3f) {
            this.x = a.x;
            this.y = a.y;
            this.z = a.z;
        } else {
            this.x = a.getX();
            this.y = a.getY();
            this.z = a.getZ();
        }
        return this;
    }

    mul(a: number): VectorM3f {
        this.x *= a;
        this.y *= a;
        this.z *= a;
        return this;
    }

    cross(v: VectorM3f): VectorM3f {
        return this.set(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }

    transform(t: MatrixM3f | MatrixM4f): VectorM3f {
        if (t instanceof MatrixM4f) {
            return this.set(
                t.m00 * this.x + t.m01 * this.y + t.m02 * this.z + t.m03,
                t.m10 * this.x + t.m11 * this.y + t.m12 * this.z + t.m13,
                t.m20 * this.x + t.m21 * this.y + t.m22 * this.z + t.m23
            );
        }
        return this.set(
            t.m00 * this.x + t.m01 * this.y + t.m02 * this.z,
            t.m10 * this.x + t.m11 * this.y + t.m12 * this.z,
            t.m20 * this.x + t.m21 * this.y + t.m22 * this.z
        );
    }

    rotateAndScale(t: MatrixM4f): VectorM3f {
        return this.set(
            t.m00 * this.x + t.m01 * this.y + t.m02 * this.z,
            t.m10 * this.x + t.m11 * this.y + t.m12 * this.z,
            t.m20 * this.x + t.m21 * this.y + t.m22 * this.z
        );
    }

    normalize(): VectorM3f {
        const length = this.length();
        this.x /= length;
        this.y /= length;
        this.z /= length;
        return this;
    }

    absolute(): VectorM3f {
        this.x = Math.abs(this.x);
        this.y = Math.abs(this.y);
        this.z = Math.abs(this.z);
        return this;
    }

    length(): number {
        return Math.sqrt(this.lengthSquared());
    }

    lengthSquared(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    dot(v: VectorM3f): number {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    max(): number {
        return Math.max(this.x, Math.max(this.y, this.z));
    }

    min(): number {
        return Math.min(this.x, Math.min(this.y, this.z));
    }
}

/**
 * Immutable 3d float-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector3f API used by the engine.
 * (Components are stored as JS numbers; like the other float-ports no fround-narrowing
 * is applied.)
 */
export class Vector3f {
    static readonly ZERO: Vector3f = new Vector3f(0, 0, 0);
    static readonly ONE: Vector3f = new Vector3f(1, 1, 1);

    readonly x: number;
    readonly y: number;
    readonly z: number;

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getZ(): number {
        return this.z;
    }

    add(v: Vector3f): Vector3f;
    add(x: number, y: number, z: number): Vector3f;
    add(a: Vector3f | number, b?: number, c?: number): Vector3f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3f(this.x + x, this.y + y, this.z + z);
    }

    sub(v: Vector3f): Vector3f;
    sub(x: number, y: number, z: number): Vector3f;
    sub(a: Vector3f | number, b?: number, c?: number): Vector3f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3f(this.x - x, this.y - y, this.z - z);
    }

    mul(a: number): Vector3f;
    mul(v: Vector3f): Vector3f;
    mul(x: number, y: number, z: number): Vector3f;
    mul(a: Vector3f | number, b?: number, c?: number): Vector3f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        return new Vector3f(this.x * x, this.y * y, this.z * z);
    }

    div(a: number): Vector3f;
    div(v: Vector3f): Vector3f;
    div(x: number, y: number, z: number): Vector3f;
    div(a: Vector3f | number, b?: number, c?: number): Vector3f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        return new Vector3f(this.x / x, this.y / y, this.z / z);
    }

    dot(v: Vector3f): number;
    dot(x: number, y: number, z: number): number;
    dot(a: Vector3f | number, b?: number, c?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return this.x * x + this.y * y + this.z * z;
    }

    cross(v: Vector3f): Vector3f;
    cross(x: number, y: number, z: number): Vector3f;
    cross(a: Vector3f | number, b?: number, c?: number): Vector3f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3f(
            this.y * z - this.z * y,
            this.z * x - this.x * z,
            this.x * y - this.y * x
        );
    }

    length(): number {
        return Math.sqrt(this.lengthSquared());
    }

    lengthSquared(): number {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector3f)) return false;
        return this.x === o.x && this.y === o.y && this.z === o.z;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ", " + this.z + ")";
    }
}

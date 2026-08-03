/**
 * Immutable 4d double-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector4d API used by the engine.
 */
export class Vector4d {
    static readonly ZERO: Vector4d = new Vector4d(0, 0, 0, 0);
    static readonly ONE: Vector4d = new Vector4d(1, 1, 1, 1);

    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;

    constructor(x: number, y: number, z: number, w: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
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

    getW(): number {
        return this.w;
    }

    add(v: Vector4d): Vector4d;
    add(x: number, y: number, z: number, w: number): Vector4d;
    add(a: Vector4d | number, b?: number, c?: number, d?: number): Vector4d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        const w = typeof a === "number" ? (d as number) : a.w;
        return new Vector4d(this.x + x, this.y + y, this.z + z, this.w + w);
    }

    sub(v: Vector4d): Vector4d;
    sub(x: number, y: number, z: number, w: number): Vector4d;
    sub(a: Vector4d | number, b?: number, c?: number, d?: number): Vector4d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        const w = typeof a === "number" ? (d as number) : a.w;
        return new Vector4d(this.x - x, this.y - y, this.z - z, this.w - w);
    }

    mul(a: number): Vector4d;
    mul(v: Vector4d): Vector4d;
    mul(x: number, y: number, z: number, w: number): Vector4d;
    mul(a: Vector4d | number, b?: number, c?: number, d?: number): Vector4d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        const w = typeof a === "number" ? (d ?? a) : a.w;
        return new Vector4d(this.x * x, this.y * y, this.z * z, this.w * w);
    }

    div(a: number): Vector4d;
    div(v: Vector4d): Vector4d;
    div(x: number, y: number, z: number, w: number): Vector4d;
    div(a: Vector4d | number, b?: number, c?: number, d?: number): Vector4d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        const w = typeof a === "number" ? (d ?? a) : a.w;
        return new Vector4d(this.x / x, this.y / y, this.z / z, this.w / w);
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector4d)) return false;
        return this.x === o.x && this.y === o.y && this.z === o.z && this.w === o.w;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ", " + this.z + ", " + this.w + ")";
    }
}

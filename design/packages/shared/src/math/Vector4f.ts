/**
 * Immutable 4d float-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector4f API used by the engine.
 * (Components are stored as JS numbers; like the other float-ports no fround-narrowing
 * is applied.)
 */
export class Vector4f {
    static readonly ZERO: Vector4f = new Vector4f(0, 0, 0, 0);
    static readonly ONE: Vector4f = new Vector4f(1, 1, 1, 1);

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

    add(v: Vector4f): Vector4f;
    add(x: number, y: number, z: number, w: number): Vector4f;
    add(a: Vector4f | number, b?: number, c?: number, d?: number): Vector4f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        const w = typeof a === "number" ? (d as number) : a.w;
        return new Vector4f(this.x + x, this.y + y, this.z + z, this.w + w);
    }

    sub(v: Vector4f): Vector4f;
    sub(x: number, y: number, z: number, w: number): Vector4f;
    sub(a: Vector4f | number, b?: number, c?: number, d?: number): Vector4f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        const w = typeof a === "number" ? (d as number) : a.w;
        return new Vector4f(this.x - x, this.y - y, this.z - z, this.w - w);
    }

    mul(a: number): Vector4f;
    mul(v: Vector4f): Vector4f;
    mul(x: number, y: number, z: number, w: number): Vector4f;
    mul(a: Vector4f | number, b?: number, c?: number, d?: number): Vector4f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        const w = typeof a === "number" ? (d ?? a) : a.w;
        return new Vector4f(this.x * x, this.y * y, this.z * z, this.w * w);
    }

    div(a: number): Vector4f;
    div(v: Vector4f): Vector4f;
    div(x: number, y: number, z: number, w: number): Vector4f;
    div(a: Vector4f | number, b?: number, c?: number, d?: number): Vector4f {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        const w = typeof a === "number" ? (d ?? a) : a.w;
        return new Vector4f(this.x / x, this.y / y, this.z / z, this.w / w);
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector4f)) return false;
        return this.x === o.x && this.y === o.y && this.z === o.z && this.w === o.w;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ", " + this.z + ", " + this.w + ")";
    }
}

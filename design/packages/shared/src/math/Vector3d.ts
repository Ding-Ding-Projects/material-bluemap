/**
 * Immutable 3d double-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector3d API used by the engine.
 */
export class Vector3d {
    static readonly ZERO: Vector3d = new Vector3d(0, 0, 0);
    static readonly ONE: Vector3d = new Vector3d(1, 1, 1);

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

    getFloorX(): number {
        return Math.floor(this.x) | 0;
    }

    getFloorY(): number {
        return Math.floor(this.y) | 0;
    }

    getFloorZ(): number {
        return Math.floor(this.z) | 0;
    }

    add(v: Vector3d): Vector3d;
    add(x: number, y: number, z: number): Vector3d;
    add(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3d(this.x + x, this.y + y, this.z + z);
    }

    sub(v: Vector3d): Vector3d;
    sub(x: number, y: number, z: number): Vector3d;
    sub(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3d(this.x - x, this.y - y, this.z - z);
    }

    mul(a: number): Vector3d;
    mul(v: Vector3d): Vector3d;
    mul(x: number, y: number, z: number): Vector3d;
    mul(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        return new Vector3d(this.x * x, this.y * y, this.z * z);
    }

    div(a: number): Vector3d;
    div(v: Vector3d): Vector3d;
    div(x: number, y: number, z: number): Vector3d;
    div(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        return new Vector3d(this.x / x, this.y / y, this.z / z);
    }

    min(v: Vector3d): Vector3d;
    min(x: number, y: number, z: number): Vector3d;
    min(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3d(Math.min(this.x, x), Math.min(this.y, y), Math.min(this.z, z));
    }

    max(v: Vector3d): Vector3d;
    max(x: number, y: number, z: number): Vector3d;
    max(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3d(Math.max(this.x, x), Math.max(this.y, y), Math.max(this.z, z));
    }

    floor(): Vector3d {
        return new Vector3d(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    }

    dot(v: Vector3d): number;
    dot(x: number, y: number, z: number): number;
    dot(a: Vector3d | number, b?: number, c?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return this.x * x + this.y * y + this.z * z;
    }

    cross(v: Vector3d): Vector3d;
    cross(x: number, y: number, z: number): Vector3d;
    cross(a: Vector3d | number, b?: number, c?: number): Vector3d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3d(
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

    distance(v: Vector3d): number;
    distance(x: number, y: number, z: number): number;
    distance(a: Vector3d | number, b?: number, c?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return Math.sqrt(this.distanceSquared(x, y, z));
    }

    distanceSquared(v: Vector3d): number;
    distanceSquared(x: number, y: number, z: number): number;
    distanceSquared(a: Vector3d | number, b?: number, c?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        const dx = this.x - x;
        const dy = this.y - y;
        const dz = this.z - z;
        return dx * dx + dy * dy + dz * dz;
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector3d)) return false;
        return this.x === o.x && this.y === o.y && this.z === o.z;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ", " + this.z + ")";
    }
}

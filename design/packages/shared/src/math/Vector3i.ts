/**
 * Immutable 3d int-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector3i API used by the engine.
 * Components use Java int semantics (construction floors like flow-math's double
 * constructor, mul/div truncate to 32-bit integers).
 */
export class Vector3i {
    static readonly ZERO: Vector3i = new Vector3i(0, 0, 0);
    static readonly ONE: Vector3i = new Vector3i(1, 1, 1);
    static readonly UNIT_X: Vector3i = new Vector3i(1, 0, 0);
    static readonly UNIT_Y: Vector3i = new Vector3i(0, 1, 0);
    static readonly UNIT_Z: Vector3i = new Vector3i(0, 0, 1);

    readonly x: number;
    readonly y: number;
    readonly z: number;

    constructor(x: number, y: number, z: number) {
        this.x = Math.floor(x) | 0;
        this.y = Math.floor(y) | 0;
        this.z = Math.floor(z) | 0;
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

    add(v: Vector3i): Vector3i;
    add(x: number, y: number, z: number): Vector3i;
    add(a: Vector3i | number, b?: number, c?: number): Vector3i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3i((this.x + x) | 0, (this.y + y) | 0, (this.z + z) | 0);
    }

    sub(v: Vector3i): Vector3i;
    sub(x: number, y: number, z: number): Vector3i;
    sub(a: Vector3i | number, b?: number, c?: number): Vector3i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3i((this.x - x) | 0, (this.y - y) | 0, (this.z - z) | 0);
    }

    mul(a: number): Vector3i;
    mul(v: Vector3i): Vector3i;
    mul(x: number, y: number, z: number): Vector3i;
    mul(a: Vector3i | number, b?: number, c?: number): Vector3i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        return new Vector3i(Math.imul(this.x, x), Math.imul(this.y, y), Math.imul(this.z, z));
    }

    div(a: number): Vector3i;
    div(v: Vector3i): Vector3i;
    div(x: number, y: number, z: number): Vector3i;
    div(a: Vector3i | number, b?: number, c?: number): Vector3i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        const z = typeof a === "number" ? (c ?? a) : a.z;
        // Java int division truncates towards zero
        return new Vector3i(
            Math.trunc(this.x / x) | 0,
            Math.trunc(this.y / y) | 0,
            Math.trunc(this.z / z) | 0
        );
    }

    min(v: Vector3i): Vector3i;
    min(x: number, y: number, z: number): Vector3i;
    min(a: Vector3i | number, b?: number, c?: number): Vector3i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3i(Math.min(this.x, x), Math.min(this.y, y), Math.min(this.z, z));
    }

    max(v: Vector3i): Vector3i;
    max(x: number, y: number, z: number): Vector3i;
    max(a: Vector3i | number, b?: number, c?: number): Vector3i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const z = typeof a === "number" ? (c as number) : a.z;
        return new Vector3i(Math.max(this.x, x), Math.max(this.y, y), Math.max(this.z, z));
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector3i)) return false;
        return this.x === o.x && this.y === o.y && this.z === o.z;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ", " + this.z + ")";
    }
}

/**
 * Immutable 2d double-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector2d API used by the engine.
 */
export class Vector2d {
    static readonly ZERO: Vector2d = new Vector2d(0, 0);
    static readonly ONE: Vector2d = new Vector2d(1, 1);

    readonly x: number;
    readonly y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getFloorX(): number {
        return Math.floor(this.x) | 0;
    }

    getFloorY(): number {
        return Math.floor(this.y) | 0;
    }

    add(v: Vector2d): Vector2d;
    add(x: number, y: number): Vector2d;
    add(a: Vector2d | number, b?: number): Vector2d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2d(this.x + x, this.y + y);
    }

    sub(v: Vector2d): Vector2d;
    sub(x: number, y: number): Vector2d;
    sub(a: Vector2d | number, b?: number): Vector2d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2d(this.x - x, this.y - y);
    }

    mul(a: number): Vector2d;
    mul(v: Vector2d): Vector2d;
    mul(x: number, y: number): Vector2d;
    mul(a: Vector2d | number, b?: number): Vector2d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        return new Vector2d(this.x * x, this.y * y);
    }

    div(a: number): Vector2d;
    div(v: Vector2d): Vector2d;
    div(x: number, y: number): Vector2d;
    div(a: Vector2d | number, b?: number): Vector2d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        return new Vector2d(this.x / x, this.y / y);
    }

    min(v: Vector2d): Vector2d;
    min(x: number, y: number): Vector2d;
    min(a: Vector2d | number, b?: number): Vector2d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2d(Math.min(this.x, x), Math.min(this.y, y));
    }

    max(v: Vector2d): Vector2d;
    max(x: number, y: number): Vector2d;
    max(a: Vector2d | number, b?: number): Vector2d {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2d(Math.max(this.x, x), Math.max(this.y, y));
    }

    floor(): Vector2d {
        return new Vector2d(Math.floor(this.x), Math.floor(this.y));
    }

    dot(v: Vector2d): number;
    dot(x: number, y: number): number;
    dot(a: Vector2d | number, b?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return this.x * x + this.y * y;
    }

    length(): number {
        return Math.sqrt(this.lengthSquared());
    }

    lengthSquared(): number {
        return this.x * this.x + this.y * this.y;
    }

    distance(v: Vector2d): number;
    distance(x: number, y: number): number;
    distance(a: Vector2d | number, b?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return Math.sqrt(this.distanceSquared(x, y));
    }

    distanceSquared(v: Vector2d): number;
    distanceSquared(x: number, y: number): number;
    distanceSquared(a: Vector2d | number, b?: number): number {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        const dx = this.x - x;
        const dy = this.y - y;
        return dx * dx + dy * dy;
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector2d)) return false;
        return this.x === o.x && this.y === o.y;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ")";
    }
}

/**
 * Immutable 2d int-vector.
 * Minimal port of the com.flowpowered.math.vector.Vector2i API used by the engine.
 * Components use Java int semantics (construction floors like flow-math's double
 * constructor, mul/div truncate to 32-bit integers).
 */
export class Vector2i {
    static readonly ZERO: Vector2i = new Vector2i(0, 0);
    static readonly ONE: Vector2i = new Vector2i(1, 1);
    static readonly UNIT_X: Vector2i = new Vector2i(1, 0);
    static readonly UNIT_Y: Vector2i = new Vector2i(0, 1);

    readonly x: number;
    readonly y: number;

    constructor(x: number, y: number) {
        this.x = Math.floor(x) | 0;
        this.y = Math.floor(y) | 0;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    add(v: Vector2i): Vector2i;
    add(x: number, y: number): Vector2i;
    add(a: Vector2i | number, b?: number): Vector2i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2i((this.x + x) | 0, (this.y + y) | 0);
    }

    sub(v: Vector2i): Vector2i;
    sub(x: number, y: number): Vector2i;
    sub(a: Vector2i | number, b?: number): Vector2i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2i((this.x - x) | 0, (this.y - y) | 0);
    }

    mul(a: number): Vector2i;
    mul(v: Vector2i): Vector2i;
    mul(x: number, y: number): Vector2i;
    mul(a: Vector2i | number, b?: number): Vector2i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        return new Vector2i(Math.imul(this.x, x), Math.imul(this.y, y));
    }

    div(a: number): Vector2i;
    div(v: Vector2i): Vector2i;
    div(x: number, y: number): Vector2i;
    div(a: Vector2i | number, b?: number): Vector2i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b ?? a) : a.y;
        // Java int division truncates towards zero
        return new Vector2i(Math.trunc(this.x / x) | 0, Math.trunc(this.y / y) | 0);
    }

    min(v: Vector2i): Vector2i;
    min(x: number, y: number): Vector2i;
    min(a: Vector2i | number, b?: number): Vector2i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2i(Math.min(this.x, x), Math.min(this.y, y));
    }

    max(v: Vector2i): Vector2i;
    max(x: number, y: number): Vector2i;
    max(a: Vector2i | number, b?: number): Vector2i {
        const x = typeof a === "number" ? a : a.x;
        const y = typeof a === "number" ? (b as number) : a.y;
        return new Vector2i(Math.max(this.x, x), Math.max(this.y, y));
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof Vector2i)) return false;
        return this.x === o.x && this.y === o.y;
    }

    toString(): string {
        return "(" + this.x + ", " + this.y + ")";
    }
}

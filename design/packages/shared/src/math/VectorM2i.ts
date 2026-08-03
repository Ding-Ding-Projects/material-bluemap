/** Mutable, allocation-free 2d int-vector. Components use Java int semantics. */
export class VectorM2i {
    x: number = 0;
    y: number = 0;

    constructor();
    constructor(from: VectorM2i);
    constructor(x: number, y: number);
    constructor(a?: VectorM2i | number, b?: number) {
        if (a instanceof VectorM2i) {
            this.x = a.x;
            this.y = a.y;
        } else if (a !== undefined) {
            this.x = a | 0;
            this.y = (b as number) | 0;
        }
    }

    set(x: number, y: number): VectorM2i {
        this.x = x | 0;
        this.y = y | 0;
        return this;
    }

    normalize(): VectorM2i {
        const length = this.length();
        // Java int division truncates towards zero
        this.x = Math.trunc(this.x / length) | 0;
        this.y = Math.trunc(this.y / length) | 0;
        return this;
    }

    add(x: number, y: number): VectorM2i {
        this.x = (this.x + x) | 0;
        this.y = (this.y + y) | 0;
        return this;
    }

    div(x: number, y: number): VectorM2i {
        // Java int division truncates towards zero
        this.x = Math.trunc(this.x / x) | 0;
        this.y = Math.trunc(this.y / y) | 0;
        return this;
    }

    floorDiv(x: number, y: number): VectorM2i {
        this.x = Math.floor(this.x / x) | 0;
        this.y = Math.floor(this.y / y) | 0;
        return this;
    }

    length(): number {
        // NaN | 0 === 0, matching Java's (int) cast of NaN
        return Math.trunc(Math.sqrt(this.lengthSquared())) | 0;
    }

    lengthSquared(): number {
        return (Math.imul(this.x, this.x) + Math.imul(this.y, this.y)) | 0;
    }

    equals(o: unknown): boolean {
        if (this === o) return true;
        if (!(o instanceof VectorM2i)) return false;
        return this.x === o.x && this.y === o.y;
    }

    hashCode(): number {
        return (this.x ^ ((this.y + 34985735) | 0)) | 0;
    }
}

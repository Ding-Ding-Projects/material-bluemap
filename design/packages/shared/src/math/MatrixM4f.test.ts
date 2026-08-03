import { describe, expect, it } from "vitest";
import { MatrixM3f } from "./MatrixM3f.js";
import { MatrixM4f } from "./MatrixM4f.js";
import { VectorM3f } from "./VectorM3f.js";

// float precision: the matrices and vectors are 32-bit, so ~7 significant digits
function expectVector(v: VectorM3f, x: number, y: number, z: number, digits = 6): void {
    expect(v.x).toBeCloseTo(x, digits);
    expect(v.y).toBeCloseTo(y, digits);
    expect(v.z).toBeCloseTo(z, digits);
}

describe("MatrixM4f", () => {
    it("initializes as identity", () => {
        const m = new MatrixM4f();
        expect(m.m00).toBe(1);
        expect(m.m11).toBe(1);
        expect(m.m22).toBe(1);
        expect(m.m33).toBe(1);
        expect(m.m01).toBe(0);
        expect(m.m30).toBe(0);
    });

    it("translate moves points", () => {
        const m = new MatrixM4f().translate(1, 2, 3);
        expectVector(new VectorM3f(0, 0, 0).transform(m), 1, 2, 3);
        expectVector(new VectorM3f(1, 1, 1).transform(m), 2, 3, 4);
    });

    it("scale is applied on top of a previous translate (multiplyTo order)", () => {
        // point (0,0,0) --translate(1,2,3)--> (1,2,3) --scale(2)--> (2,4,6)
        const m = new MatrixM4f().translate(1, 2, 3).scale(2, 2, 2);
        expectVector(new VectorM3f(0, 0, 0).transform(m), 2, 4, 6);
    });

    it("rotate 90 degrees around the z-axis rotates x onto y", () => {
        const m = new MatrixM4f().rotate(90, 0, 0, 1);
        expectVector(new VectorM3f(1, 0, 0).transform(m), 0, 1, 0, 6);
    });

    it("rotateAndScale ignores the translation part", () => {
        const m = new MatrixM4f().translate(5, 6, 7).scale(2, 2, 2);
        expectVector(new VectorM3f(1, 0, 0).rotateAndScale(m), 2, 0, 0);
        expectVector(new VectorM3f(0, 0, 0).rotateAndScale(m), 0, 0, 0);
    });

    it("copy copies all components", () => {
        const m = new MatrixM4f().translate(1, 2, 3).rotate(45, 0, 1, 0);
        const c = new MatrixM4f().copy(m);
        expect(c.m00).toBe(m.m00);
        expect(c.m03).toBe(m.m03);
        expect(c.m13).toBe(m.m13);
        expect(c.m23).toBe(m.m23);
        expect(c.m33).toBe(m.m33);
    });

    it("identity resets the matrix", () => {
        const m = new MatrixM4f().translate(1, 2, 3).identity();
        expectVector(new VectorM3f(4, 5, 6).transform(m), 4, 5, 6);
    });

    it("multiplyTo with a MatrixM3f keeps the bottom row and applies the linear part", () => {
        // translation first, then a 3x3 scale: (1,1,1) -> T -> (2,3,4) -> S -> (4,6,8)
        const m = new MatrixM4f().translate(1, 2, 3);
        const s = new MatrixM3f().scale(2, 2, 2);
        m.multiplyTo(s);
        expectVector(new VectorM3f(1, 1, 1).transform(m), 4, 6, 8);
        expect(m.m30).toBe(0);
        expect(m.m31).toBe(0);
        expect(m.m32).toBe(0);
        expect(m.m33).toBe(1);
    });

    it("rotateXYZ matches single-axis rotate", () => {
        const a = new MatrixM4f().rotateXYZ(0, 60, 0);
        const b = new MatrixM4f().rotate(60, 0, 1, 0);
        expectVector(
            new VectorM3f(1, 2, 3).transform(a),
            new VectorM3f(1, 2, 3).transform(b).x,
            new VectorM3f(1, 2, 3).transform(b).y,
            new VectorM3f(1, 2, 3).transform(b).z
        );
    });
});

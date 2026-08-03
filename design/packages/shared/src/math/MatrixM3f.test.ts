import { describe, expect, it } from "vitest";
import { MatrixM3f } from "./MatrixM3f.js";
import { VectorM2f } from "./VectorM2f.js";
import { VectorM3f } from "./VectorM3f.js";

function expectMatrix(m: MatrixM3f, expected: number[], epsilon = 1e-9): void {
    const actual = [m.m00, m.m01, m.m02, m.m10, m.m11, m.m12, m.m20, m.m21, m.m22];
    for (let i = 0; i < 9; i++) {
        expect(actual[i]).toBeCloseTo(expected[i]!, -Math.log10(epsilon));
    }
}

describe("MatrixM3f", () => {
    it("initializes as identity", () => {
        expectMatrix(new MatrixM3f(), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it("set and identity", () => {
        const m = new MatrixM3f().set(1, 2, 3, 4, 5, 6, 7, 8, 9);
        expect(m.m01).toBe(2);
        expect(m.m21).toBe(8);
        expectMatrix(m.identity(), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it("computes the determinant", () => {
        // det([1,2,3],[4,5,6],[7,8,10]) = 1*(50-48) - 2*(40-42) + 3*(32-35) = -3
        const m = new MatrixM3f().set(1, 2, 3, 4, 5, 6, 7, 8, 10);
        expect(m.determinant()).toBeCloseTo(-3, 9);
    });

    it("inverts a diagonal matrix", () => {
        const m = new MatrixM3f().set(2, 0, 0, 0, 4, 0, 0, 0, 8).invert();
        expectMatrix(m, [0.5, 0, 0, 0, 0.25, 0, 0, 0, 0.125]);
    });

    it("invert multiplied with the original gives identity", () => {
        const m = new MatrixM3f().set(1, 2, 3, 4, 5, 6, 7, 8, 10);
        m.invert().multiply(1, 2, 3, 4, 5, 6, 7, 8, 10);
        expectMatrix(m, [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-9);
    });

    it("translate builds a 2d translation (applied after existing transform)", () => {
        const m = new MatrixM3f().translate(3, 4);
        const v = new VectorM2f(1, 1).transform(m);
        expect(v.x).toBeCloseTo(4, 9);
        expect(v.y).toBeCloseTo(5, 9);
    });

    it("scale is applied on top of a previous translate (multiplyTo order)", () => {
        // point (0,0) --translate(1,2)--> (1,2) --scale(2,2)--> (2,4)
        const m = new MatrixM3f().translate(1, 2).scale(2, 2, 1);
        const v = new VectorM2f(0, 0).transform(m);
        expect(v.x).toBeCloseTo(2, 9);
        expect(v.y).toBeCloseTo(4, 9);
    });

    it("rotate 90 degrees around the z-axis rotates x onto y", () => {
        const m = new MatrixM3f().rotate(90, 0, 0, 1);
        const v = new VectorM3f(1, 0, 0).transform(m);
        expect(v.x).toBeCloseTo(0, 6);
        expect(v.y).toBeCloseTo(1, 6);
        expect(v.z).toBeCloseTo(0, 6);
    });

    it("rotate 90 degrees around the y-axis rotates z onto x", () => {
        const m = new MatrixM3f().rotate(90, 0, 1, 0);
        const v = new VectorM3f(0, 0, 1).transform(m);
        expect(v.x).toBeCloseTo(1, 6);
        expect(v.y).toBeCloseTo(0, 6);
        expect(v.z).toBeCloseTo(0, 6);
    });

    it("rotateByQuaternion with the identity quaternion is a no-op", () => {
        const m = new MatrixM3f().rotateByQuaternion(0, 0, 0, 1);
        expectMatrix(m, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it("rotateXYZ matches a single-axis rotation for pitch only", () => {
        const single = new MatrixM3f().rotate(30, 1, 0, 0);
        const m = new MatrixM3f().rotateXYZ(30, 0, 0);
        expectMatrix(m, [
            single.m00, single.m01, single.m02,
            single.m10, single.m11, single.m12,
            single.m20, single.m21, single.m22,
        ], 1e-9);
    });

    it("rotateYXZ with zero angles is the identity", () => {
        expectMatrix(new MatrixM3f().rotateYXZ(0, 0, 0), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it("rotateZYX keeps the upstream quaternion argument order (MatrixM3f.java:147-152)", () => {
        // upstream passes (qw, qx, qy, qz) of the ZYX euler quaternion into the
        // (qx, qy, qz, qw) parameters, so zero angles yield the quaternion (1,0,0,0):
        // a 180-degree rotation around the x-axis. The method is unused upstream;
        // ported bug-for-bug.
        expectMatrix(new MatrixM3f().rotateZYX(0, 0, 0), [1, 0, 0, 0, -1, 0, 0, 0, -1]);
    });

    it("multiply appends on the right, multiplyTo on the left", () => {
        // A = translate(1,0), B = scale(2)
        // multiply:   M = A * B   -> scale first, then translate
        const m = new MatrixM3f().translate(1, 0).multiply(2, 0, 0, 0, 2, 0, 0, 0, 1);
        const v = new VectorM2f(1, 0).transform(m);
        expect(v.x).toBeCloseTo(3, 9); // 1*2 + 1
        expect(v.y).toBeCloseTo(0, 9);
    });
});

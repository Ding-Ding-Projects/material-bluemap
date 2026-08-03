import { describe, expect, it } from "vitest";
import { MatrixM3f } from "./MatrixM3f.js";
import { MatrixM4f } from "./MatrixM4f.js";
import { Vector3i } from "./Vector3i.js";
import { VectorM2f } from "./VectorM2f.js";
import { VectorM2i } from "./VectorM2i.js";
import { VectorM3f } from "./VectorM3f.js";

describe("VectorM2f", () => {
    it("set/translate mutate in place and return this", () => {
        const v = new VectorM2f(1, 2);
        expect(v.set(3, 4)).toBe(v);
        expect(v.x).toBe(3);
        expect(v.y).toBe(4);
        v.translate(1, -1);
        expect(v.x).toBe(4);
        expect(v.y).toBe(3);
    });

    it("rotate by a normalized direction (45 degrees)", () => {
        const s = Math.sqrt(0.5);
        const v = new VectorM2f(1, 0).rotate(s, s);
        expect(v.x).toBeCloseTo(s, 6);
        expect(v.y).toBeCloseTo(s, 6);
    });

    it("rotate by 90 degrees", () => {
        const v = new VectorM2f(1, 0).rotate(0, 1);
        expect(v.x).toBeCloseTo(0, 9);
        expect(v.y).toBeCloseTo(1, 9);
    });

    it("transform applies a 2d affine matrix", () => {
        const m = new MatrixM3f().translate(10, 20);
        const v = new VectorM2f(1, 2).transform(m);
        expect(v.x).toBeCloseTo(11, 9);
        expect(v.y).toBeCloseTo(22, 9);
    });

    it("length / lengthSquared / normalize", () => {
        expect(new VectorM2f(3, 4).lengthSquared()).toBe(25);
        expect(new VectorM2f(3, 4).length()).toBe(5);
        const v = new VectorM2f(3, 4).normalize();
        expect(v.x).toBeCloseTo(0.6, 6);
        expect(v.y).toBeCloseTo(0.8, 6);
    });

    it("angleTo", () => {
        expect(new VectorM2f(1, 0).angleTo(1, 0)).toBeCloseTo(0, 9);
        expect(new VectorM2f(1, 0).angleTo(0, 1)).toBeCloseTo(Math.PI / 2, 6);
        expect(new VectorM2f(1, 0).angleTo(-1, 0)).toBeCloseTo(Math.PI, 6);
        expect(new VectorM2f(0, -1).angleTo(0, -1)).toBeCloseTo(0, 6);
    });
});

describe("VectorM3f", () => {
    it("set overloads: components, Vector3i and VectorM3f", () => {
        const v = new VectorM3f(0, 0, 0);
        expect(v.set(1, 2, 3)).toBe(v);
        expect([v.x, v.y, v.z]).toEqual([1, 2, 3]);

        v.set(new Vector3i(4, 5, 6));
        expect([v.x, v.y, v.z]).toEqual([4, 5, 6]);

        v.set(new VectorM3f(7, 8, 9));
        expect([v.x, v.y, v.z]).toEqual([7, 8, 9]);
    });

    it("mul scales all components", () => {
        const v = new VectorM3f(1, -2, 3).mul(2);
        expect([v.x, v.y, v.z]).toEqual([2, -4, 6]);
    });

    it("cross product of the unit axes", () => {
        const v = new VectorM3f(1, 0, 0).cross(new VectorM3f(0, 1, 0));
        expect([v.x, v.y, v.z]).toEqual([0, 0, 1]);
    });

    it("cross with itself is the zero vector (arguments evaluated before assignment)", () => {
        const v = new VectorM3f(1, 2, 3);
        v.cross(v);
        expect([v.x, v.y, v.z]).toEqual([0, 0, 0]);
    });

    it("transform with MatrixM3f applies only the linear part", () => {
        const m = new MatrixM3f().scale(2, 3, 4);
        const v = new VectorM3f(1, 1, 1).transform(m);
        expect([v.x, v.y, v.z]).toEqual([2, 3, 4]);
    });

    it("transform with MatrixM4f includes the translation", () => {
        const m = new MatrixM4f().translate(1, 2, 3);
        const v = new VectorM3f(1, 1, 1).transform(m);
        expect([v.x, v.y, v.z]).toEqual([2, 3, 4]);
    });

    it("rotateAndScale with MatrixM4f excludes the translation", () => {
        const m = new MatrixM4f().translate(1, 2, 3);
        const v = new VectorM3f(1, 1, 1).rotateAndScale(m);
        expect([v.x, v.y, v.z]).toEqual([1, 1, 1]);
    });

    it("normalize / length / lengthSquared", () => {
        expect(new VectorM3f(0, 3, 4).length()).toBe(5);
        expect(new VectorM3f(1, 2, 2).lengthSquared()).toBe(9);
        const v = new VectorM3f(0, 3, 4).normalize();
        expect(v.x).toBeCloseTo(0, 6);
        expect(v.y).toBeCloseTo(0.6, 6);
        expect(v.z).toBeCloseTo(0.8, 6);
    });

    it("absolute / dot / max / min", () => {
        const v = new VectorM3f(-1, 2, -3).absolute();
        expect([v.x, v.y, v.z]).toEqual([1, 2, 3]);
        expect(new VectorM3f(1, 2, 3).dot(new VectorM3f(4, -5, 6))).toBe(12);
        expect(new VectorM3f(1, 5, 3).max()).toBe(5);
        expect(new VectorM3f(1, 5, 3).min()).toBe(1);
        expect(new VectorM3f(-1, -5, -3).max()).toBe(-1);
        expect(new VectorM3f(-1, -5, -3).min()).toBe(-5);
    });
});

describe("VectorM2i", () => {
    it("constructors: empty, copy and components", () => {
        expect(new VectorM2i().equals(new VectorM2i(0, 0))).toBe(true);
        const from = new VectorM2i(3, -4);
        expect(new VectorM2i(from).equals(from)).toBe(true);
        const v = new VectorM2i(1, 2);
        expect(v.x).toBe(1);
        expect(v.y).toBe(2);
    });

    it("set and add use int semantics", () => {
        const v = new VectorM2i().set(5, -7);
        expect([v.x, v.y]).toEqual([5, -7]);
        v.add(-10, 10);
        expect([v.x, v.y]).toEqual([-5, 3]);
    });

    it("div truncates towards zero (Java int division)", () => {
        const v = new VectorM2i(-17, 17).div(16, 16);
        expect([v.x, v.y]).toEqual([-1, 1]);
        expect([new VectorM2i(-1, 1).div(2, 2).x, new VectorM2i(-1, 1).div(2, 2).y]).toEqual([
            0, 0,
        ]);
    });

    it("floorDiv floors (Java Math.floorDiv)", () => {
        const v = new VectorM2i(-17, 17).floorDiv(16, 16);
        expect([v.x, v.y]).toEqual([-2, 1]);
        expect(new VectorM2i(-1, -16).floorDiv(16, 16).equals(new VectorM2i(-1, -1))).toBe(true);
    });

    it("length is the int sqrt of lengthSquared", () => {
        expect(new VectorM2i(3, 4).length()).toBe(5);
        expect(new VectorM2i(1, 1).length()).toBe(1); // (int) sqrt(2)
        expect(new VectorM2i(3, 4).lengthSquared()).toBe(25);
    });

    it("normalize uses int division", () => {
        const v = new VectorM2i(10, 0).normalize();
        expect([v.x, v.y]).toEqual([1, 0]);
        // int division rounds (3/5, 4/5) both to 0
        const w = new VectorM2i(3, 4).normalize();
        expect([w.x, w.y]).toEqual([0, 0]);
    });

    it("equals and hashCode", () => {
        expect(new VectorM2i(1, 2).equals(new VectorM2i(1, 2))).toBe(true);
        expect(new VectorM2i(1, 2).equals(new VectorM2i(2, 1))).toBe(false);
        expect(new VectorM2i(1, 2).equals(null)).toBe(false);
        expect(new VectorM2i(1, 2).equals({ x: 1, y: 2 })).toBe(false);
        // x ^ (y + 34985735), all int math
        expect(new VectorM2i(0, 0).hashCode()).toBe(34985735);
        expect(new VectorM2i(1, 2).hashCode()).toBe(1 ^ (2 + 34985735));
        expect(new VectorM2i(0, 2147483647).hashCode()).toBe((2147483647 + 34985735) | 0);
    });
});

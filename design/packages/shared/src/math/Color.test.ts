import { describe, expect, it } from "vitest";
import { Color } from "./Color.js";

describe("Color", () => {
    it("set from packed ARGB int", () => {
        const c = new Color().set(0x80ff0000 | 0);
        expect(c.a).toBe(Math.fround(128 / 255));
        expect(c.r).toBe(1);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.isPremultiplied).toBe(false);
    });

    it("set from components and from another color", () => {
        const c = new Color().set(0.1, 0.2, 0.3, 0.4, true);
        expect([c.r, c.g, c.b, c.a, c.isPremultiplied]).toEqual([
            Math.fround(0.1),
            Math.fround(0.2),
            Math.fround(0.3),
            Math.fround(0.4),
            true,
        ]);
        const d = new Color().set(c);
        expect([d.r, d.g, d.b, d.a, d.isPremultiplied]).toEqual([
            Math.fround(0.1),
            Math.fround(0.2),
            Math.fround(0.3),
            Math.fround(0.4),
            true,
        ]);
    });

    it("getInt packs back to ARGB (truncating like a Java int cast)", () => {
        const c = new Color().set(1, 0.5, 0.25, 1, false);
        // r=255, g=(int)127.5=127, b=(int)63.75=63, a=255
        expect(c.getInt()).toBe(0xffff7f3f | 0);
        expect(new Color().set(0x11223344).getInt()).toBe(0x11223344);
    });

    it("parse css-style hex colors", () => {
        // doc comment: #f16 becomes #ff1166 (with full alpha)
        const c = new Color().parse("#f16");
        expect(c.r).toBe(1);
        expect(c.g).toBe(Math.fround(0x11 / 255));
        expect(c.b).toBe(Math.fround(0x66 / 255));
        expect(c.a).toBe(1);

        const rgba = new Color().parse("#11223344");
        expect(rgba.r).toBe(Math.fround(0x11 / 255));
        expect(rgba.g).toBe(Math.fround(0x22 / 255));
        expect(rgba.b).toBe(Math.fround(0x33 / 255));
        expect(rgba.a).toBe(Math.fround(0x44 / 255));
    });

    it("parse integer strings, assuming full alpha when absent", () => {
        const c = new Color().parse("255");
        expect([c.r, c.g, c.b, c.a]).toEqual([0, 0, 1, 1]);
        const d = new Color().parse("-1"); // 0xFFFFFFFF
        expect([d.r, d.g, d.b, d.a]).toEqual([1, 1, 1, 1]);
    });

    it("parse rejects malformed values", () => {
        expect(() => new Color().parse("#12345")).toThrow();
        expect(() => new Color().parse("nope")).toThrow();
    });

    it("premultiplied and straight convert back and forth", () => {
        const c = new Color().set(1, 0.5, 0, 0.5, false);
        c.premultiplied();
        expect([c.r, c.g, c.b, c.a, c.isPremultiplied]).toEqual([0.5, 0.25, 0, 0.5, true]);
        c.premultiplied(); // no-op when already premultiplied
        expect(c.r).toBe(0.5);
        c.straight();
        expect(c.r).toBeCloseTo(1, 9);
        expect(c.g).toBeCloseTo(0.5, 9);
        expect(c.isPremultiplied).toBe(false);
    });

    it("overlay blends premultiplied colors", () => {
        const base = new Color().set(1, 0, 0, 0.5, false);
        const over = new Color().set(0, 0.5, 0, 0.5, true);
        base.overlay(over);
        expect(base.isPremultiplied).toBe(true);
        expect(base.a).toBeCloseTo(0.75, 9);
        expect(base.r).toBeCloseTo(0.25, 9);
        expect(base.g).toBeCloseTo(0.5, 9);
        expect(base.b).toBeCloseTo(0, 9);

        base.flatten();
        expect(base.a).toBe(1);
        expect(base.r).toBeCloseTo(1 / 3, 6);
        expect(base.g).toBeCloseTo(2 / 3, 6);
    });

    it("overlay/underlay/add reject straight translucent colors", () => {
        const translucentStraight = new Color().set(1, 1, 1, 0.5, false);
        expect(() => new Color().overlay(translucentStraight)).toThrow();
        expect(() => new Color().underlay(translucentStraight)).toThrow();
        expect(() => new Color().add(translucentStraight)).toThrow();
    });

    it("underlay blends underneath", () => {
        const base = new Color().set(0, 0.5, 0, 0.5, true);
        const under = new Color().set(1, 0, 0, 1, false);
        base.underlay(under);
        expect(base.a).toBeCloseTo(1, 9);
        expect(base.r).toBeCloseTo(0.5, 9);
        expect(base.g).toBeCloseTo(0.5, 9);
    });

    it("add and div average colors", () => {
        const sum = new Color();
        sum.add(new Color().set(1, 0, 0, 1, false));
        sum.add(new Color().set(0, 1, 0, 1, false));
        sum.div(2);
        expect(sum.r).toBeCloseTo(0.5, 9);
        expect(sum.g).toBeCloseTo(0.5, 9);
        expect(sum.b).toBeCloseTo(0, 9);
        expect(sum.a).toBeCloseTo(1, 9);
    });

    it("multiply converts to the mode of the argument", () => {
        const c = new Color().set(0.5, 0.5, 0.5, 1, false);
        c.multiply(new Color().set(1, 0.5, 0.25, 1, false));
        expect([c.r, c.g, c.b, c.a]).toEqual([0.5, 0.25, 0.125, 1]);
        expect(c.isPremultiplied).toBe(false);
    });

    it("flatten on an already opaque color is a no-op", () => {
        const c = new Color().set(0.1, 0.2, 0.3, 1, false);
        c.flatten();
        expect([c.r, c.g, c.b, c.a]).toEqual([
            Math.fround(0.1),
            Math.fround(0.2),
            Math.fround(0.3),
            1,
        ]);
    });
});

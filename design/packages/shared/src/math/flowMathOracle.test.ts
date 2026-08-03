import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MatrixM3f } from "./MatrixM3f.js";
import { MatrixM4f } from "./MatrixM4f.js";
import { TrigMath } from "./TrigMath.js";
import { VectorM2f } from "./VectorM2f.js";
import { VectorM3f } from "./VectorM3f.js";

/**
 * Oracle test: every expected value in `flowMathOracle.json` was produced by *running*
 * flow-math 1.0.3 and BlueMap's own `util/math` classes out of the reference jar
 * (`vendor/BlueMap/implementations/cli/…-shadow.jar`) on this machine, printed with the
 * raw bit-pattern so nothing is lost in the round-trip. Nothing here is re-derived from
 * the formula — that would only test the port against itself.
 *
 * The assertions are `Object.is`, not `toBeCloseTo`: these classes are 32-bit float
 * arithmetic, and "close" is precisely the failure mode this pins down. Before this port
 * used `Math.fround` at each step and flow-math's `TrigMath` for the rotations, 30 of the
 * 52 uv-transform comparisons below produced a different float — which is a different
 * vertex, a different tile byte, and a phase gate that can never close.
 */

interface F {
    v: number;
    bits: number;
}
interface Fixture {
    trig: { angle: F; cos: F; sin: F }[];
    atan2: { y: F; x: F; atan2: F; asFloat: F }[];
    acos: { v: F; acos: F; asin: F | { v: "NaN" } }[];
    flowingUvScale: Record<string, F>;
    flowingUvScaleApplied: { in: [number, number]; x: F; y: F }[];
    flowUvRotations: { flowAngle: number; in: [number, number]; x: F; y: F }[];
    uvLockRotate: { angle: F; in: [number, number]; cx: F; cy: F; x: F; y: F }[];
    vectorM3f: { in: [number, number, number]; lengthSquared: F; normalized: number[] }[];
    radToDeg: F;
    rotateZ: { angle: number; m: number[] }[];
    rotateYXZ: { angle: number; m: number[] }[];
}

const oracle = JSON.parse(
    readFileSync(new URL("./flowMathOracle.json", import.meta.url), "utf8"),
) as Fixture;

/** collects every mismatch instead of stopping at the first, so a regression shows its shape */
function collector(): { eq: (name: string, actual: number, expected: number) => void; bad: string[] } {
    const bad: string[] = [];
    return {
        bad,
        eq(name, actual, expected) {
            if (!Object.is(actual, expected)) bad.push(`${name}: got ${actual}, want ${expected}`);
        },
    };
}

describe("flow-math oracle", () => {
    it("TrigMath.sin/cos reproduce the 2^22-entry table exactly", () => {
        const { eq, bad } = collector();
        for (const t of oracle.trig) {
            eq(`cos(${t.angle.v})`, TrigMath.cos(t.angle.v), t.cos.v);
            eq(`sin(${t.angle.v})`, TrigMath.sin(t.angle.v), t.sin.v);
        }
        expect(bad).toEqual([]);
    });

    it("TrigMath.atan2/acos/asin reproduce the polynomial approximation exactly", () => {
        const { eq, bad } = collector();
        for (const t of oracle.atan2) {
            eq(`atan2(${t.y.v}, ${t.x.v})`, TrigMath.atan2(t.y.v, t.x.v), t.atan2.v);
            eq(`(float) atan2`, Math.fround(TrigMath.atan2(t.y.v, t.x.v)), t.asFloat.v);
        }
        for (const t of oracle.acos) {
            eq(`acos(${t.v.v})`, TrigMath.acos(t.v.v), t.acos.v);
            const asin = TrigMath.asin(t.v.v);
            if (t.asin.v === "NaN") expect(Number.isNaN(asin)).toBe(true);
            else eq(`asin(${t.v.v})`, asin, t.asin.v as number);
        }
        expect(bad).toEqual([]);
    });

    it("RAD_TO_DEG is the same double", () => {
        expect(TrigMath.RAD_TO_DEG).toBe(oracle.radToDeg.v);
    });

    it("MatrixM3f builds LiquidModelRenderer's FLOWING_UV_SCALE bit-exactly", () => {
        const { eq, bad } = collector();
        const m = new MatrixM3f()
            .identity()
            .translate(-0.5, -0.5)
            .scale(0.5, 0.5, 1)
            .translate(0.5, 0.5);
        for (const [k, expected] of Object.entries(oracle.flowingUvScale)) {
            eq(`FLOWING_UV_SCALE.${k}`, (m as unknown as Record<string, number>)[k]!, expected.v);
        }
        for (const r of oracle.flowingUvScaleApplied) {
            const v = new VectorM2f(r.in[0], r.in[1]).transform(m);
            eq(`applied(${r.in}).x`, v.x, r.x.v);
            eq(`applied(${r.in}).y`, v.y, r.y.v);
        }
        expect(bad).toEqual([]);
    });

    it("MatrixM3f.rotate reproduces the flowing up-face uv transform bit-exactly", () => {
        const { eq, bad } = collector();
        for (const r of oracle.flowUvRotations) {
            const t = new MatrixM3f()
                .identity()
                .translate(-0.5, -0.5)
                .scale(0.5, 0.5, 1)
                .rotate(-r.flowAngle, 0, 0, 1)
                .translate(0.5, 0.5);
            const v = new VectorM2f(r.in[0], r.in[1]).transform(t);
            eq(`flow(${r.flowAngle}, ${r.in}).x`, v.x, r.x.v);
            eq(`flow(${r.flowAngle}, ${r.in}).y`, v.y, r.y.v);
        }
        expect(bad).toEqual([]);
    });

    it("VectorM2f translate/rotate reproduce the uv-lock counter-rotation bit-exactly", () => {
        const { eq, bad } = collector();
        for (const r of oracle.uvLockRotate) {
            // upstream narrows the atan2 result to a float before handing it to TrigMath
            const uvRotation = Math.fround(r.angle.v);
            const cx = TrigMath.cos(uvRotation);
            const cy = TrigMath.sin(uvRotation);
            eq(`cos(${uvRotation})`, cx, r.cx.v);
            eq(`sin(${uvRotation})`, cy, r.cy.v);

            const v = new VectorM2f(r.in[0], r.in[1]);
            v.translate(-0.5, -0.5);
            v.rotate(cx, cy);
            v.translate(0.5, 0.5);
            eq(`uvlock(${r.angle.v}, ${r.in}).x`, v.x, r.x.v);
            eq(`uvlock(${r.angle.v}, ${r.in}).y`, v.y, r.y.v);
        }
        expect(bad).toEqual([]);
    });

    it("MatrixM3f.rotate matches at every angle, including the JDK-9 toRadians cases", () => {
        const { eq, bad } = collector();
        for (const r of oracle.rotateZ) {
            const m = new MatrixM3f().rotate(r.angle, 0, 0, 1);
            const actual = [m.m00, m.m01, m.m02, m.m10, m.m11, m.m12, m.m20, m.m21, m.m22];
            for (let i = 0; i < 9; i++) eq(`rotate(${r.angle})[${i}]`, actual[i]!, r.m[i]!);
        }
        expect(bad).toEqual([]);
    });

    /**
     * `-337.5`, `-247.5`, `-168.75` and `-123.75` are the angles where java 8's
     * `angdeg / 180.0 * PI` and java 9's `angdeg * DEGREES_TO_RADIANS` land on *different*
     * entries of the sine table. `blockstate/Variant` bakes exactly this matrix for every
     * rotated variant, so using the wrong formulation silently rotates models by a
     * visible amount at those four angles and at no others — the sort of divergence that
     * only shows up as "a few tiles differ".
     */
    it("MatrixM4f.rotateYXZ matches the variant transform matrix, including those angles", () => {
        const { eq, bad } = collector();
        for (const r of oracle.rotateYXZ) {
            const m = new MatrixM4f()
                .translate(-0.5, -0.5, -0.5)
                .rotateYXZ(0, -r.angle, 0)
                .translate(0.5, 0.5, 0.5);
            const actual = [
                m.m00, m.m01, m.m02, m.m03,
                m.m10, m.m11, m.m12, m.m13,
                m.m20, m.m21, m.m22, m.m23,
                m.m30, m.m31, m.m32, m.m33,
            ];
            for (let i = 0; i < 16; i++) eq(`rotateYXZ(${r.angle})[${i}]`, actual[i]!, r.m[i]!);
        }
        expect(bad).toEqual([]);
    });

    it("VectorM3f lengthSquared/normalize match (float maths, double result)", () => {
        const { eq, bad } = collector();
        for (const r of oracle.vectorM3f) {
            const v = new VectorM3f(r.in[0], r.in[1], r.in[2]);
            eq(`lengthSquared(${r.in})`, v.lengthSquared(), r.lengthSquared.v);
            const n = new VectorM3f(r.in[0], r.in[1], r.in[2]).normalize();
            eq(`normalize(${r.in}).x`, n.x, r.normalized[0]!);
            eq(`normalize(${r.in}).y`, n.y, r.normalized[1]!);
            eq(`normalize(${r.in}).z`, n.z, r.normalized[2]!);
        }
        expect(bad).toEqual([]);
    });
});

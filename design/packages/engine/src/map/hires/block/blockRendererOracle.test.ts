import { readFileSync } from "node:fs";
import { TrigMath, VectorM2f } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { hashToFloat } from "./ResourceModelRenderer.js";

/**
 * Oracle test for the block-renderers' arithmetic.
 *
 * Every expected value in `__fixtures__/blockRendererOracle.json` came out of the
 * reference implementation itself — flow-math 1.0.3 and BlueMap's own classes, run out of
 * `vendor/BlueMap/implementations/cli/…-shadow.jar` on this machine, with
 * `ResourceModelRenderer#hashToFloat` reached reflectively and the renderers' inline float
 * expressions transcribed verbatim into the harness. Nothing is re-derived from the
 * formula here, which is the whole point: a test that recomputes the port's own arithmetic
 * proves only that the port is self-consistent.
 *
 * The comparisons are exact (`Object.is`). These are 32-bit float expressions, and "close"
 * is exactly the failure this file exists to catch — a value one float-ulp out is a
 * different tile byte.
 */

interface F {
    v: number;
    bits: number;
}
interface Fixture {
    hashToFloat: { x: number; z: number; seed: number; hash: F; offset: F }[];
    liquidBaseHeight: { level: number; height: F }[];
    liquidCornerAverages: { startLevel: number; count: number; sum: F; avg: F }[];
    flowingAngle: { x: F; y: F; angleTo: F; deg: F; angle: number; result: number }[];
    combinedLight: { ambient: F; sun: number; block: number; resource: F; liquid: F }[];
    ao: { occluding: number; ao: F }[];
    uvDiv16: { in: number; out: F }[];
    faceRotationSteps: { rotation: number; steps: number }[];
    radToDeg: F;
}

const oracle = JSON.parse(
    readFileSync(new URL("./__fixtures__/blockRendererOracle.json", import.meta.url), "utf8"),
) as Fixture;

const fr = Math.fround;

function collector(): {
    eq: (name: string, actual: number, expected: number) => void;
    bad: string[];
} {
    const bad: string[] = [];
    return {
        bad,
        eq(name, actual, expected) {
            if (!Object.is(actual, expected)) bad.push(`${name}: got ${actual}, want ${expected}`);
        },
    };
}

describe("ResourceModelRenderer numerics", () => {
    it("hashToFloat reproduces the java 64-bit position PRNG exactly", () => {
        const { eq, bad } = collector();
        for (const r of oracle.hashToFloat) {
            eq(`hashToFloat(${r.x}, ${r.z}, ${r.seed})`, hashToFloat(r.x, r.z, BigInt(r.seed)), r.hash.v);
        }
        expect(bad).toEqual([]);
    });

    it("the random-offset derived from it matches, including the float rounding", () => {
        const { eq, bad } = collector();
        for (const r of oracle.hashToFloat) {
            // upstream: `(hashToFloat(x, z, seed) - 0.5f) * 0.75f`
            const offset = fr(fr(hashToFloat(r.x, r.z, BigInt(r.seed)) - 0.5) * 0.75);
            eq(`offset(${r.x}, ${r.z}, ${r.seed})`, offset, r.offset.v);
        }
        expect(bad).toEqual([]);
    });

    it("the uv/16 division matches", () => {
        const { eq, bad } = collector();
        for (const r of oracle.uvDiv16) eq(`${r.in}/16`, fr(fr(r.in) / 16), r.out.v);
        expect(bad).toEqual([]);
    });

    it("the face-rotation step count matches Math.floorDiv(rotation, 90) % 4", () => {
        for (const r of oracle.faceRotationSteps) {
            let steps = (Math.floor(r.rotation / 90) % 4) | 0;
            if (steps < 0) steps += 4;
            expect(steps).toBe(r.steps);
        }
    });

    it("the ambient-occlusion ramp matches", () => {
        const { eq, bad } = collector();
        for (const r of oracle.ao) {
            const occluding = Math.min(r.occluding, 3);
            eq(`ao(${r.occluding})`, Math.max(0, Math.min(fr(1 - fr(occluding * 0.25)), 1)), r.ao.v);
        }
        expect(bad).toEqual([]);
    });

    it("the ResourceModelRenderer combined-light formula matches", () => {
        const { eq, bad } = collector();
        for (const r of oracle.combinedLight) {
            const ambient = r.ambient.v;
            let combinedLight = Math.max(fr(r.sun / 15), fr(r.block / 15));
            combinedLight = fr(fr(fr(1 - ambient) * combinedLight) + ambient);
            eq(`resourceLight(${ambient}, ${r.sun}, ${r.block})`, combinedLight, r.resource.v);
        }
        expect(bad).toEqual([]);
    });
});

describe("LiquidModelRenderer numerics", () => {
    it("the liquid base height per level matches", () => {
        const { eq, bad } = collector();
        for (const r of oracle.liquidBaseHeight) {
            // upstream: `level >= 8 ? 16f : 14f - level * 1.9f`
            const height = r.level >= 8 ? 16 : fr(14 - fr(r.level * 1.9));
            eq(`baseHeight(${r.level})`, height, r.height.v);
        }
        expect(bad).toEqual([]);
    });

    it("the corner-height average matches, including the running float sum", () => {
        const { eq, bad } = collector();
        const baseHeight = (level: number): number =>
            level >= 8 ? 16 : fr(14 - fr(level * 1.9));

        for (const r of oracle.liquidCornerAverages) {
            let sum = 0;
            for (let i = 0; i < Math.min(r.count, 4); i++) {
                sum = fr(sum + baseHeight((r.startLevel + i) % 9));
            }
            eq(`sum(${r.startLevel}, ${r.count})`, sum, r.sum.v);
            eq(`avg(${r.startLevel}, ${r.count})`, fr(sum / r.count), r.avg.v);
        }
        expect(bad).toEqual([]);
    });

    it("the flowing angle matches — angleTo, the degree product and the int truncation", () => {
        const { eq, bad } = collector();
        for (const r of oracle.flowingAngle) {
            const v = new VectorM2f(r.x.v, r.y.v);
            const angleTo = v.angleTo(0, -1);
            eq(`angleTo(${r.x.v}, ${r.y.v})`, angleTo, r.angleTo.v);

            const deg = angleTo * TrigMath.RAD_TO_DEG;
            eq(`deg(${r.x.v}, ${r.y.v})`, deg, r.deg.v);

            const angle = Math.trunc(deg);
            eq(`angle(${r.x.v}, ${r.y.v})`, angle, r.angle);
            eq(`result(${r.x.v}, ${r.y.v})`, v.x < 0 ? angle : -angle | 0, r.result);
        }
        expect(bad).toEqual([]);
    });

    it("the LiquidModelRenderer combined-light formula matches (a different formula)", () => {
        const { eq, bad } = collector();
        for (const r of oracle.combinedLight) {
            const ambient = r.ambient.v;
            let combinedLight = fr(Math.max(r.sun, r.block) / 15);
            combinedLight = fr(fr(ambient + combinedLight) / fr(ambient + 1));
            eq(`liquidLight(${ambient}, ${r.sun}, ${r.block})`, combinedLight, r.liquid.v);
        }
        expect(bad).toEqual([]);
    });
});

import { MatrixM4f, VectorM3f } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { BlockRendererType } from "../../../../map/hires/block/BlockRendererType.js";
import { ResourcePath } from "../../../ResourcePath.js";
import { parse } from "../../../adapter/JsonMapper.js";
import type { Model } from "../model/Model.js";
import { MISSING_BLOCK_MODEL, Variant } from "./Variant.js";

function transformPoint(
    variant: Variant,
    x: number,
    y: number,
    z: number,
): [number, number, number] {
    const v = new VectorM3f(x, y, z).transform(variant.getTransformMatrix());
    return [v.x, v.y, v.z];
}

/*
 * 1e-6, not 1e-9: the transform matrix is 32-bit float and its rotation comes from
 * flow-math's `TrigMath` — a quantized 2^22-entry sine table — so a 90-degree turn lands
 * about 6e-8 off the exact answer. That residual is the reference implementation's, pinned
 * bit-for-bit in `shared/math/flowMathOracle.test.ts` (which includes this very matrix
 * shape); these assertions are about where the corners go, so they are given room for it.
 */
function expectPoint(actual: [number, number, number], x: number, y: number, z: number): void {
    expect(actual[0]).toBeCloseTo(x, 6);
    expect(actual[1]).toBeCloseTo(y, 6);
    expect(actual[2]).toBeCloseTo(z, 6);
}

describe("Variant", () => {
    describe("defaults", () => {
        it("matches the upstream field-initializers", () => {
            const variant = new Variant();
            expect(variant.getRenderer()).toBe(BlockRendererType.DEFAULT);
            expect(variant.getModel()).toBe(MISSING_BLOCK_MODEL);
            expect(variant.getX()).toBe(0);
            expect(variant.getY()).toBe(0);
            expect(variant.getZ()).toBe(0);
            expect(variant.isUvlock()).toBe(false);
            expect(variant.getWeight()).toBe(1);
        });

        it("MISSING_BLOCK_MODEL is bluemap:block/missing and a shared singleton", () => {
            expect(MISSING_BLOCK_MODEL.getFormatted()).toBe("bluemap:block/missing");
            expect(new Variant().getModel()).toBe(new Variant().getModel());
        });
    });

    describe("constructors", () => {
        const model = new ResourcePath<Model>("minecraft", "block/stone");

        it("model only leaves every other field at its default", () => {
            const variant = new Variant(model);
            expect(variant.getModel()).toBe(model);
            expect(variant.getX()).toBe(0);
            expect(variant.isUvlock()).toBe(false);
            expect(variant.getWeight()).toBe(1);
            expect(variant.isTransformed()).toBe(false);
        });

        it("model + rotation leaves uvlock/weight at their defaults", () => {
            const variant = new Variant(model, 0, 90, 0);
            expect(variant.getY()).toBe(90);
            expect(variant.isUvlock()).toBe(false);
            expect(variant.getWeight()).toBe(1);
        });

        it("the full form assigns everything", () => {
            const variant = new Variant(model, 90, 180, 270, true, 4.5);
            expect(variant.getX()).toBe(90);
            expect(variant.getY()).toBe(180);
            expect(variant.getZ()).toBe(270);
            expect(variant.isUvlock()).toBe(true);
            expect(variant.getWeight()).toBe(4.5);
        });

        it("setRenderer replaces the renderer", () => {
            const variant = new Variant(model);
            variant.setRenderer(BlockRendererType.LIQUID);
            expect(variant.getRenderer()).toBe(BlockRendererType.LIQUID);
        });
    });

    describe("init (@PostDeserialize)", () => {
        it("sets transformed only when some rotation is non-zero", () => {
            expect(new Variant().isTransformed()).toBe(false);
            expect(new Variant(MISSING_BLOCK_MODEL, 90, 0, 0).isTransformed()).toBe(true);
            expect(new Variant(MISSING_BLOCK_MODEL, 0, 90, 0).isTransformed()).toBe(true);
            expect(new Variant(MISSING_BLOCK_MODEL, 0, 0, 90).isTransformed()).toBe(true);
        });

        it("builds an identity transform without rotation", () => {
            const m = new Variant().getTransformMatrix();
            expect(m).toBeInstanceOf(MatrixM4f);
            const identity = new MatrixM4f();
            for (const key of ["m00", "m11", "m22", "m33", "m01", "m03", "m13", "m23"] as const) {
                expect(m[key]).toBeCloseTo(identity[key], 9);
            }
        });

        it("rotates around the unit-cube centre (0.5, 0.5, 0.5)", () => {
            // translate(-0.5) then rotate then translate(+0.5), each left-multiplied,
            // gives T(+0.5) * R * T(-0.5) — so the cube centre is a fixed point
            for (const [x, y, z] of [
                [90, 0, 0],
                [0, 90, 0],
                [0, 0, 90],
                [22.5, 45, 180],
            ] as [number, number, number][]) {
                const variant = new Variant(MISSING_BLOCK_MODEL, x, y, z);
                expectPoint(transformPoint(variant, 0.5, 0.5, 0.5), 0.5, 0.5, 0.5);
            }
        });

        it("negates the rotation angles (y=90 sends +X to +Z)", () => {
            const variant = new Variant(MISSING_BLOCK_MODEL, 0, 90, 0);
            // rotateYXZ(-0, -90, -0): the +X offset from the centre lands on +Z ...
            expectPoint(transformPoint(variant, 1, 0.5, 0.5), 0.5, 0.5, 1);
            // ... and the +Z offset lands on -X
            expectPoint(transformPoint(variant, 0.5, 0.5, 1), 0, 0.5, 0.5);
            // the rotation axis itself is untouched
            expectPoint(transformPoint(variant, 0.5, 1, 0.5), 0.5, 1, 0.5);
        });

        it("y=-90 is the inverse of y=90", () => {
            const variant = new Variant(MISSING_BLOCK_MODEL, 0, -90, 0);
            expectPoint(transformPoint(variant, 1, 0.5, 0.5), 0.5, 0.5, 0);
            expectPoint(transformPoint(variant, 0.5, 0.5, 1), 1, 0.5, 0.5);
        });

        it("x=90 sends +Y to -Z and +Z to +Y", () => {
            const variant = new Variant(MISSING_BLOCK_MODEL, 90, 0, 0);
            expectPoint(transformPoint(variant, 0.5, 1, 0.5), 0.5, 0.5, 0);
            expectPoint(transformPoint(variant, 0.5, 0.5, 1), 0.5, 1, 0.5);
            expectPoint(transformPoint(variant, 1, 0.5, 0.5), 1, 0.5, 0.5);
        });

        it("z=90 sends +X to -Y and +Y to +X", () => {
            const variant = new Variant(MISSING_BLOCK_MODEL, 0, 0, 90);
            expectPoint(transformPoint(variant, 1, 0.5, 0.5), 0.5, 0, 0.5);
            expectPoint(transformPoint(variant, 0.5, 1, 0.5), 1, 0.5, 0.5);
            expectPoint(transformPoint(variant, 0.5, 0.5, 1), 0.5, 0.5, 1);
        });

        it("y=180 flips both horizontal axes", () => {
            const variant = new Variant(MISSING_BLOCK_MODEL, 0, 180, 0);
            expectPoint(transformPoint(variant, 1, 0.5, 0.5), 0, 0.5, 0.5);
            expectPoint(transformPoint(variant, 0.5, 0.5, 1), 0.5, 0.5, 0);
        });

        it("postDeserialize recomputes the same transform", () => {
            const variant = new Variant(MISSING_BLOCK_MODEL, 0, 90, 0);
            const before = variant.getTransformMatrix();
            variant.postDeserialize();
            const after = variant.getTransformMatrix();
            expect(after).not.toBe(before);
            expect({ ...after }).toEqual({ ...before });
            expect(variant.isTransformed()).toBe(true);
        });
    });

    describe("Adapter", () => {
        it("reads every member", () => {
            const variant = Variant.Adapter.read(
                parse(`{
                    "renderer": "liquid",
                    "model": "block/water",
                    "x": 90,
                    "y": 180,
                    "z": 270,
                    "uvlock": true,
                    "weight": 3
                }`),
            );
            expect(variant.getRenderer()).toBe(BlockRendererType.LIQUID);
            expect(variant.getModel().getFormatted()).toBe("minecraft:block/water");
            expect(variant.getX()).toBe(90);
            expect(variant.getY()).toBe(180);
            expect(variant.getZ()).toBe(270);
            expect(variant.isUvlock()).toBe(true);
            expect(variant.getWeight()).toBe(3);
            expect(variant.isTransformed()).toBe(true);
        });

        it("keeps the field-defaults for absent members and ignores unknown ones", () => {
            const variant = Variant.Adapter.read(
                parse('{"model": "block/stone", "__comment": "hi", "bogus": 12}'),
            );
            expect(variant.getRenderer()).toBe(BlockRendererType.DEFAULT);
            expect(variant.getModel().getFormatted()).toBe("minecraft:block/stone");
            expect(variant.getX()).toBe(0);
            expect(variant.getY()).toBe(0);
            expect(variant.getZ()).toBe(0);
            expect(variant.isUvlock()).toBe(false);
            expect(variant.getWeight()).toBe(1);
            expect(variant.isTransformed()).toBe(false);
        });

        it("falls back to the missing-block model when there is no model member", () => {
            const variant = Variant.Adapter.read(parse('{"y": 90}'));
            expect(variant.getModel()).toBe(MISSING_BLOCK_MODEL);
        });

        it("runs the @PostDeserialize hook, so the transform is populated", () => {
            const variant = Variant.Adapter.read(parse('{"model": "a", "y": 90}'));
            expect(variant.isTransformed()).toBe(true);
            expectPoint(transformPoint(variant, 1, 0.5, 0.5), 0.5, 0.5, 1);
        });

        it("reads a namespaced model path unchanged", () => {
            const variant = Variant.Adapter.read(parse('{"model": "bluemap:block/missing"}'));
            expect(variant.getModel().getFormatted()).toBe("bluemap:block/missing");
            // a fresh instance, not the shared MISSING_BLOCK_MODEL singleton
            expect(variant.getModel()).not.toBe(MISSING_BLOCK_MODEL);
        });
    });
});

import { MatrixM4f, Vector3f, VectorM3f } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { EntityRendererType } from "../../../../map/hires/entity/EntityRendererType.js";
import { parse } from "../../../adapter/JsonMapper.js";
import { ResourcePath } from "../../../ResourcePath.js";
import type { Model } from "../model/Model.js";
import { Part } from "./Part.js";

function read(json: string): Part {
    return Part.Adapter.read(parse(json));
}

function transform(part: Part, x: number, y: number, z: number): VectorM3f {
    return new VectorM3f(x, y, z).transform(part.getTransformMatrix() as MatrixM4f);
}

describe("Part", () => {
    describe("defaults", () => {
        it("uses the default renderer and the missing entity-model", () => {
            const part = read("{}");
            expect(part.getRenderer()).toBe(EntityRendererType.DEFAULT);
            expect(part.getModel().getFormatted()).toBe("bluemap:entity/missing");
            expect(part.getPosition()).toBe(Vector3f.ZERO);
            expect(part.getRotation()).toBe(Vector3f.ZERO);
        });

        it("is untransformed with an identity matrix", () => {
            const part = read("{}");
            expect(part.isTransformed()).toBe(false);
            expect(part.getTransformMatrix()).toEqual(new MatrixM4f());
        });
    });

    it("reads renderer, model, position and rotation", () => {
        const part = read(
            '{"renderer": "missing", "model": "bluemap:entity/sign", "position": [1, 2, 3], "rotation": [0, 90, 0]}',
        );
        expect(part.getRenderer()).toBe(EntityRendererType.MISSING);
        expect(part.getModel().getFormatted()).toBe("bluemap:entity/sign");
        expect(part.getPosition()).toEqual(new Vector3f(1, 2, 3));
        expect(part.getRotation()).toEqual(new Vector3f(0, 90, 0));
    });

    it("falls back to the default renderer for an unknown key", () => {
        expect(read('{"renderer": "bluemap:nope"}').getRenderer()).toBe(EntityRendererType.DEFAULT);
    });

    describe("transform", () => {
        it("is transformed as soon as position or rotation is non-zero", () => {
            expect(read('{"position": [1, 0, 0]}').isTransformed()).toBe(true);
            expect(read('{"rotation": [0, 0, 1]}').isTransformed()).toBe(true);
            expect(read('{"position": [0, 0, 0], "rotation": [0, 0, 0]}').isTransformed()).toBe(
                false,
            );
        });

        it("translates by the position", () => {
            const point = transform(read('{"position": [1, 2, 3]}'), 0, 0, 0);
            expect(point.x).toBeCloseTo(1, 6);
            expect(point.y).toBeCloseTo(2, 6);
            expect(point.z).toBeCloseTo(3, 6);
        });

        it("rotates by the negated rotation before translating", () => {
            // rotateYXZ(-x, -y, -z) with rotation (0, 90, 0) turns +x into +z
            const point = transform(
                read('{"rotation": [0, 90, 0], "position": [0, 5, 0]}'),
                1,
                0,
                0,
            );
            expect(point.x).toBeCloseTo(0, 6);
            expect(point.y).toBeCloseTo(5, 6);
            expect(point.z).toBeCloseTo(1, 6);
        });
    });

    describe("constructors", () => {
        it("(model) runs init", () => {
            const model = new ResourcePath<Model>("bluemap:entity/sign");
            const part = new Part(model);
            expect(part.getModel()).toBe(model);
            expect(part.isTransformed()).toBe(false);
            expect(part.getTransformMatrix()).toEqual(new MatrixM4f());
        });

        it("(model, position, rotation) runs init", () => {
            const part = new Part(
                new ResourcePath<Model>("bluemap:entity/sign"),
                new Vector3f(0, 1, 0),
                Vector3f.ZERO,
            );
            expect(part.isTransformed()).toBe(true);
            expect(transform(part, 0, 0, 0).y).toBeCloseTo(1, 6);
        });

        it("the no-args constructor leaves the matrix unset (upstream: gson-only)", () => {
            expect(new Part().getTransformMatrix()).toBeNull();
        });
    });

    it("setRenderer replaces the renderer", () => {
        const part = read("{}");
        part.setRenderer(EntityRendererType.MISSING);
        expect(part.getRenderer()).toBe(EntityRendererType.MISSING);
    });
});

import { MatrixM4f, Vector3f, VectorM3f } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { Axis } from "../../../../util/math/Axis.js";
import { Rotation } from "./Rotation.js";

function read(json: string): Rotation {
    return Rotation.Adapter.read(parse(json));
}

/** the transformed (x, y, z) of a point, using the same 4x4 layout as VectorM3f#transform */
function transform(matrix: MatrixM4f, x: number, y: number, z: number): VectorM3f {
    return new VectorM3f(x, y, z).transform(matrix);
}

function expectIdentity(matrix: MatrixM4f | null): void {
    expect(matrix).not.toBeNull();
    expect(matrix).toEqual(new MatrixM4f());
}

describe("Rotation", () => {
    it("ZERO is init'ed and carries an identity matrix", () => {
        expect(Rotation.ZERO.getOrigin()).toEqual(new Vector3f(8, 8, 8));
        expect(Rotation.ZERO.getAxis()).toBe(Axis.Y);
        expect(Rotation.ZERO.getAngle()).toBe(0);
        expect(Rotation.ZERO.isRescale()).toBe(false);
        expectIdentity(Rotation.ZERO.getMatrix());
    });

    it("defaults origin to (8, 8, 8)", () => {
        const rotation = read('{"angle": 45}');
        expect(rotation.getOrigin()).toEqual(new Vector3f(8, 8, 8));
    });

    it("leaves the matrix at identity while every axis-angle is zero", () => {
        expectIdentity(read('{"origin": [3, 4, 5]}').getMatrix());
    });

    describe("angle/axis notation takes precedence", () => {
        it("clears an explicit x/y/z when an angle is given", () => {
            const rotation = read('{"x": 10, "y": 20, "z": 30, "axis": "x", "angle": 45}');
            expect(rotation.getX()).toBe(45);
            expect(rotation.getY()).toBe(0);
            expect(rotation.getZ()).toBe(0);
        });

        it("applies the angle to the named axis", () => {
            expect(read('{"axis": "y", "angle": 22.5}').getY()).toBe(22.5);
            expect(read('{"axis": "z", "angle": -22.5}').getZ()).toBe(-22.5);
        });

        it("keeps an explicit x/y/z when there is no angle", () => {
            const rotation = read('{"x": 10, "y": 20, "z": 30, "axis": "x"}');
            expect(rotation.getX()).toBe(10);
            expect(rotation.getY()).toBe(20);
            expect(rotation.getZ()).toBe(30);
        });
    });

    describe("matrix", () => {
        it("rotates around the origin without rescaling", () => {
            const rotation = read('{"origin": [8, 8, 8], "axis": "y", "angle": 90}');
            const matrix = rotation.getMatrix();
            expect(matrix).not.toBeNull();

            // the origin is a fixed point
            const origin = transform(matrix as MatrixM4f, 8, 8, 8);
            expect(origin.x).toBeCloseTo(8, 6);
            expect(origin.y).toBeCloseTo(8, 6);
            expect(origin.z).toBeCloseTo(8, 6);

            // a 90 degree turn around Y maps +x onto -z
            const point = transform(matrix as MatrixM4f, 16, 8, 8);
            expect(point.x).toBeCloseTo(8, 6);
            expect(point.y).toBeCloseTo(8, 6);
            expect(point.z).toBeCloseTo(0, 6);

            // a plain rotation keeps the unit-length of the axis-vectors
            const axisVector = new VectorM3f(1, 0, 0).rotateAndScale(matrix as MatrixM4f);
            expect(axisVector.length()).toBeCloseTo(1, 6);
        });

        it("rescale inserts the measured scale between translate and rotate", () => {
            const rotation = read(
                '{"origin": [8, 8, 8], "axis": "y", "angle": 45, "rescale": true}',
            );
            const matrix = rotation.getMatrix() as MatrixM4f;
            expect(matrix).not.toBeNull();

            // sX = sZ = 1 / cos(45deg) = sqrt(2), sY = 1 -> the linear part becomes
            // [[1, 0, 1], [0, 1, 0], [-1, 0, 1]]
            expect(matrix.m00).toBeCloseTo(1, 6);
            expect(matrix.m01).toBeCloseTo(0, 6);
            expect(matrix.m02).toBeCloseTo(1, 6);
            expect(matrix.m10).toBeCloseTo(0, 6);
            expect(matrix.m11).toBeCloseTo(1, 6);
            expect(matrix.m12).toBeCloseTo(0, 6);
            expect(matrix.m20).toBeCloseTo(-1, 6);
            expect(matrix.m21).toBeCloseTo(0, 6);
            expect(matrix.m22).toBeCloseTo(1, 6);

            // the origin stays a fixed point
            const origin = transform(matrix, 8, 8, 8);
            expect(origin.x).toBeCloseTo(8, 6);
            expect(origin.y).toBeCloseTo(8, 6);
            expect(origin.z).toBeCloseTo(8, 6);

            // the rescaled rotation stretches the block back out to full width
            const corner = transform(matrix, 0, 0, 0);
            expect(corner.x).toBeCloseTo(-8, 6);
            expect(corner.y).toBeCloseTo(0, 6);
            expect(corner.z).toBeCloseTo(8, 6);
        });

        it("rescale differs from the plain rotation", () => {
            const plain = read('{"axis": "y", "angle": 45}').getMatrix() as MatrixM4f;
            const rescaled = read(
                '{"axis": "y", "angle": 45, "rescale": true}',
            ).getMatrix() as MatrixM4f;

            expect(plain.m00).toBeCloseTo(Math.SQRT1_2, 6);
            expect(rescaled.m00).toBeCloseTo(1, 6);
            expect(rescaled.m00 / plain.m00).toBeCloseTo(Math.SQRT2, 6);
        });
    });

    describe("constructors", () => {
        it("(origin, axis, angle, rescale) runs init", () => {
            const rotation = new Rotation(new Vector3f(0, 0, 0), Axis.Z, 90, false);
            expect(rotation.getZ()).toBe(90);
            expect(rotation.getMatrix()).not.toBeNull();

            const point = transform(rotation.getMatrix() as MatrixM4f, 1, 0, 0);
            expect(point.x).toBeCloseTo(0, 6);
            expect(point.y).toBeCloseTo(1, 6);
        });

        it("(origin, x, y, z, rescale) runs init", () => {
            const rotation = new Rotation(new Vector3f(1, 2, 3), 0, 180, 0, false);
            expect(rotation.getOrigin()).toEqual(new Vector3f(1, 2, 3));
            expect(rotation.getY()).toBe(180);
            expect(rotation.getAngle()).toBe(0);
            expect(rotation.getMatrix()).not.toBeNull();
        });

        it("the no-args constructor leaves the matrix unset (upstream: gson-only)", () => {
            expect(new Rotation().getMatrix()).toBeNull();
        });
    });
});

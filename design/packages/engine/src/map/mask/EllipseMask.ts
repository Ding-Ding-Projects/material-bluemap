import type { Vector2d } from "@worldlens/shared";
import { Tristate } from "../../util/Tristate.js";
import { Mask } from "./Mask.js";

/** java.lang.Math#clamp(double, double, double) */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** upstream: map/mask/EllipseMask.java */
export class EllipseMask implements Mask {
    private readonly center: Vector2d;
    private readonly radiusSquaredX: number;
    private readonly radiusSquaredZ: number;
    private readonly minY: number;
    private readonly maxY: number;

    /** upstream: {@code EllipseMask(Vector2d center, double radius, int minY, int maxY)} */
    constructor(center: Vector2d, radius: number, minY: number, maxY: number);
    /** upstream: {@code EllipseMask(Vector2d center, double radiusX, double radiusZ, int minY, int maxY)} */
    constructor(center: Vector2d, radiusX: number, radiusZ: number, minY: number, maxY: number);
    constructor(center: Vector2d, a: number, b: number, c: number, d?: number) {
        this.center = center;

        if (d === undefined) {
            // (center, radius, minY, maxY)
            this.radiusSquaredX = a * a;
            this.radiusSquaredZ = this.radiusSquaredX;
            this.minY = b;
            this.maxY = c;
            return;
        }

        // (center, radiusX, radiusZ, minY, maxY)
        this.radiusSquaredX = a * a;
        this.radiusSquaredZ = b * b;
        this.minY = c;
        this.maxY = d;
    }

    test(x: number, y: number, z: number): boolean;
    test(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Tristate;
    test(
        a: number,
        b: number,
        c: number,
        maxX?: number,
        maxY?: number,
        maxZ?: number,
    ): boolean | Tristate {
        if (maxX === undefined || maxY === undefined || maxZ === undefined)
            return this.minY <= b && this.maxY >= b && this.testXZ(a, c);

        const minX = a;
        const minY = b;
        const minZ = c;
        return this.testY(minY, maxY).and(() => this.testXZ(minX, minZ, maxX, maxZ));
    }

    /** upstream: {@code boolean testXZ(double x, double z)} */
    testXZ(x: number, z: number): boolean;
    /** upstream: {@code Tristate testXZ(int minX, int minZ, int maxX, int maxZ)} */
    testXZ(minX: number, minZ: number, maxX: number, maxZ: number): Tristate;
    testXZ(a: number, b: number, maxX?: number, maxZ?: number): boolean | Tristate {
        if (maxX === undefined || maxZ === undefined) {
            const x = a - this.center.getX();
            const z = b - this.center.getY();
            return (x * x) / this.radiusSquaredX + (z * z) / this.radiusSquaredZ <= 1.0;
        }

        const minX = a;
        const minZ = b;

        // if all corners are inside the circle then it's fully in
        if (
            this.testXZ(minX, minZ) &&
            this.testXZ(maxX, minZ) &&
            this.testXZ(minX, maxZ) &&
            this.testXZ(maxX, maxZ)
        )
            return Tristate.TRUE;

        // if the closest point of the rectangle is outside then it's fully out
        const closestX = clamp(this.center.getX(), minX, maxX);
        const closestZ = clamp(this.center.getY(), minZ, maxZ);
        if (!this.testXZ(closestX, closestZ)) return Tristate.FALSE;

        // else its on the circles border
        return Tristate.UNDEFINED;
    }

    testY(minY: number, maxY: number): Tristate {
        if (maxY < this.minY || minY > this.maxY) return Tristate.FALSE;
        if (minY >= this.minY && maxY <= this.maxY) return Tristate.TRUE;
        return Tristate.UNDEFINED;
    }

    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
        return this.testXZ(minX, minZ, maxX, maxZ) === Tristate.UNDEFINED;
    }

    submask(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Mask {
        return Mask.submask(this, minX, minY, minZ, maxX, maxY, maxZ);
    }

    inverted(): Mask {
        return Mask.inverted(this);
    }
}

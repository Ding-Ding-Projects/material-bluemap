import type { Vector2d } from "@worldlens/shared";
import { Tristate } from "../../util/Tristate.js";
import { Mask } from "./Mask.js";

/**
 * Port seam for {@code de.bluecolored.bluemap.api.math.Shape} — the BlueMapAPI artifact is
 * not part of the engine port, and the only member this mask uses is the point-list. A
 * shape's points are the polygon's corners in order, on the xz-plane
 * ({@code Vector2d#getY()} is the z coordinate).
 */
export interface Shape {
    getPoints(): readonly Vector2d[];
}

/** upstream: map/mask/PolygonMask.java */
export class PolygonMask implements Mask {
    private readonly shape: Shape;
    private readonly minY: number;
    private readonly maxY: number;

    /** upstream: the lombok {@code @RequiredArgsConstructor} over {@code shape, minY, maxY} */
    constructor(shape: Shape, minY: number, maxY: number) {
        this.shape = shape;
        this.minY = minY;
        this.maxY = maxY;
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

    /** upstream: {@code boolean testXZ(int x, int z)} — the even-odd point-in-polygon rule */
    testXZ(x: number, z: number): boolean;
    /** upstream: {@code Tristate testXZ(int minX, int minZ, int maxX, int maxZ)} */
    testXZ(minX: number, minZ: number, maxX: number, maxZ: number): Tristate;
    testXZ(a: number, b: number, maxX?: number, maxZ?: number): boolean | Tristate {
        const points = this.shape.getPoints();

        if (maxX === undefined || maxZ === undefined) {
            const x = a;
            const z = b;
            let contains = false;
            for (let i = 0, j = points.length - 1; i < points.length; i++) {
                const pi = points[i]!;
                const pj = points[j]!;
                const x1 = pi.getX();
                const x2 = pj.getX();
                const z1 = pi.getY();
                const z2 = pj.getY();

                if (z1 > z !== z2 > z && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1)
                    contains = !contains;

                j = i;
            }
            return contains;
        }

        const minX = a;
        const minZ = b;

        for (let i = 0, j = points.length - 1; i < points.length; i++) {
            const pi = points[i]!;
            const pj = points[j]!;
            const x1 = pi.getX();
            const x2 = pj.getX();
            const z1 = pi.getY();
            const z2 = pj.getY();

            // check polygon-line collision with all 4 sides of the rectangle
            if (linesCollide(minX, minZ, minX, maxZ, x1, z1, x2, z2)) return Tristate.UNDEFINED;
            if (linesCollide(minX, maxZ, maxX, maxZ, x1, z1, x2, z2)) return Tristate.UNDEFINED;
            if (linesCollide(maxX, maxZ, maxX, minZ, x1, z1, x2, z2)) return Tristate.UNDEFINED;
            if (linesCollide(maxX, minZ, minX, minZ, x1, z1, x2, z2)) return Tristate.UNDEFINED;

            j = i;
        }

        // no collision: check if any point of the rectangle is inside or outside
        return Tristate.valueOf(this.testXZ(minX, minZ));
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

/** upstream: {@code private static boolean linesCollide(...)} */
function linesCollide(
    xA1: number,
    yA1: number,
    xA2: number,
    yA2: number,
    xB1: number,
    yB1: number,
    xB2: number,
    yB2: number,
): boolean {
    const v = (yB2 - yB1) * (xA2 - xA1) - (xB2 - xB1) * (yA2 - yA1);
    const uA = ((xB2 - xB1) * (yA1 - yB1) - (yB2 - yB1) * (xA1 - xB1)) / v;
    const uB = ((xA2 - xA1) * (yA1 - yB1) - (yA2 - yA1) * (xA1 - xB1)) / v;
    return uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1;
}

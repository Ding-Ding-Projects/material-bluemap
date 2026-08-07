import type { Vector3i } from "@worldlens/shared";
import { Tristate } from "../../util/Tristate.js";
import { Mask } from "./Mask.js";

/** upstream: map/mask/BoxMask.java */
export class BoxMask implements Mask {
    private readonly min: Vector3i;
    private readonly max: Vector3i;

    /** upstream: the lombok {@code @RequiredArgsConstructor} over {@code min, max} */
    constructor(min: Vector3i, max: Vector3i) {
        this.min = min;
        this.max = max;
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
            return this.testXZ(a, c) && b >= this.min.getY() && b <= this.max.getY();

        const minX = a;
        const minY = b;
        const minZ = c;

        if (
            minX >= this.min.getX() &&
            maxX <= this.max.getX() &&
            minZ >= this.min.getZ() &&
            maxZ <= this.max.getZ() &&
            minY >= this.min.getY() &&
            maxY <= this.max.getY()
        )
            return Tristate.TRUE;

        if (
            maxX < this.min.getX() ||
            minX > this.max.getX() ||
            maxZ < this.min.getZ() ||
            minZ > this.max.getZ() ||
            maxY < this.min.getY() ||
            minY > this.max.getY()
        )
            return Tristate.FALSE;

        return Tristate.UNDEFINED;
    }

    testXZ(x: number, z: number): boolean {
        return (
            x >= this.min.getX() &&
            x <= this.max.getX() &&
            z >= this.min.getZ() &&
            z <= this.max.getZ()
        );
    }

    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
        return (
            this.test(minX, this.min.getY(), minZ, maxX, this.max.getY(), maxZ) ===
            Tristate.UNDEFINED
        );
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

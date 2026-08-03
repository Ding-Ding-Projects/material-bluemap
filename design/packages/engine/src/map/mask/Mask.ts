import { Tristate } from "../../util/Tristate.js";

/**
 * Phase C placeholder — replaced by the full port of map/mask/Mask.java (which adds
 * the {@code submask}/{@code inverted} default-implementations and the concrete
 * combining/area masks). Declared here is the surface the world/block layer
 * (ExtendedBlock / MaskArea) consumes, plus the NONE/ALL constants.
 */
export interface Mask {
    /**
     * Returns {@code true} if the mask applies at the given point and {@code false} if not.
     */
    test(x: number, y: number, z: number): boolean;

    /**
     * Returns {@link Tristate#TRUE} if the entire region tests to {@code true},
     * {@link Tristate#FALSE} if the entire region tests to {@code false} and
     * {@link Tristate#UNDEFINED} if unknown or mixed.
     */
    test(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Tristate;

    /**
     * Returns {@code true} if the given xz-region is an edge of this mask
     * (used to determine the resulting TileState after rendering).
     */
    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean;

    /**
     * Returns a mask-instance for the given area. The returned mask is only guaranteed
     * to be equal to this mask in the defined area.
     */
    submask(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Mask;
}

/**
 * Constant-result mask (upstream: the {@code Mask.NONE} anonymous class, and
 * {@code ALL = NONE.inverted()}).
 */
class ConstantMask implements Mask {
    constructor(private readonly value: boolean) {}

    test(x: number, y: number, z: number): boolean;
    test(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Tristate;
    test(...args: number[]): boolean | Tristate {
        return args.length === 3 ? this.value : Tristate.valueOf(this.value);
    }

    isEdge(_minX: number, _minZ: number, _maxX: number, _maxZ: number): boolean {
        return false;
    }

    submask(
        _minX: number,
        _minY: number,
        _minZ: number,
        _maxX: number,
        _maxY: number,
        _maxZ: number,
    ): Mask {
        return this;
    }
}

export const Mask = {
    NONE: new ConstantMask(false) as Mask,
    ALL: new ConstantMask(true) as Mask,
};

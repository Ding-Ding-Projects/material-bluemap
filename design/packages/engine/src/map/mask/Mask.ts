import { Tristate } from "../../util/Tristate.js";

/**
 * upstream: map/mask/Mask.java
 *
 * The two `test` forms are one overloaded name upstream; TypeScript expresses that as two
 * call-signatures plus one implementation signature, so every implementation below (and in
 * the sibling files) carries the same three-line shape.
 *
 * Upstream's two interface-defaults (`submask` and `inverted`) become required members
 * here, delegating to the module-level {@link Mask.submask} / {@link Mask.inverted}
 * helpers that hold the default bodies — the same const-object-static shape the port
 * already uses for `BlockColorCalculator`'s 2-arg default.
 */
export interface Mask {
    /**
     * Returns {@code true} if the mask applies at the given point and {@code false} if not.
     */
    test(x: number, y: number, z: number): boolean;

    /**
     * Returns {@link Tristate#TRUE} if the entire region tests to {@code true},
     * {@link Tristate#FALSE} if the entire region tests to {@code false} and
     * {@link Tristate#UNDEFINED} or if unknown or part of it tests to true and other parts
     * test to false.<br>
     * <br>
     * This is used to improve performance so {@link #test(int, int, int)} does not always
     * have to be repeatedly called for every single block while rendering.<br>
     * <br>
     * It is valid to approximate this. E.g.: if a precise collision-check is too complex or
     * expensive, a simple bounding-box check - where the collisions return UNDEFINED and
     * non-collisions return FALSE - could be enough.
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
     * This is used to determine the resulting {@code TileState} after rendering.
     * If this returns {@code true} the tile will be marked as a "map-edge".
     * The tile will be updated if this function evaluates differently on the next test.<br>
     * <br>
     * Implementations should in most cases ignore the masks y and only return {@code true}
     * for the edge of the mask if it were "projected" onto the xz-plane.
     */
    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean;

    /**
     * Returns a mask-instance for the given area. The returned mask is only guaranteed to be
     * equal to this mask in the defined area. That way it might be optimized and do checks
     * more performantly.
     */
    submask(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Mask;

    /**
     * Returns an inverted view of this mask
     */
    inverted(): Mask;
}

/** upstream: the {@code Mask.NONE} anonymous class */
class NoneMask implements Mask {
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
        _a: number,
        _b: number,
        _c: number,
        maxX?: number,
        _maxY?: number,
        _maxZ?: number,
    ): boolean | Tristate {
        if (maxX === undefined) return false;
        return Tristate.FALSE;
    }

    isEdge(_minX: number, _minZ: number, _maxX: number, _maxZ: number): boolean {
        return false;
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

/** upstream: the anonymous class returned by the {@code inverted()} interface-default */
class InvertedMask implements Mask {
    constructor(private readonly delegate: Mask) {}

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
            return !this.delegate.test(a, b, c);
        return this.delegate.test(a, b, c, maxX, maxY, maxZ).negated();
    }

    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
        return this.delegate.isEdge(minX, minZ, maxX, maxZ);
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
        return this.delegate;
    }
}

const NONE: Mask = new NoneMask();
// upstream: `Mask ALL = NONE.inverted()`. It is spelled out here because the default body
// that `inverted()` delegates to lives on the `Mask` const below, which is still in its
// temporal dead zone at this point.
const ALL: Mask = new InvertedMask(NONE);

export const Mask = {
    NONE,
    ALL,

    /**
     * upstream: the {@code default Mask submask(...)} interface-body — exposed as a static
     * so every implementation can delegate to it, since TypeScript interfaces carry no
     * implementations.
     */
    submask(
        mask: Mask,
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Mask {
        const test = mask.test(minX, minY, minZ, maxX, maxY, maxZ);
        if (test === Tristate.TRUE) return ALL;
        if (test === Tristate.FALSE) return NONE;
        return mask;
    },

    /** upstream: the {@code default Mask inverted()} interface-body */
    inverted(mask: Mask): Mask {
        return new InvertedMask(mask);
    },
};

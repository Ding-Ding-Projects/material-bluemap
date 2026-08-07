/**
 * Pure geometry over a render mask: footprints, bounds and an honest cost estimate.
 *
 * This is the "what does this drawing cost" half of the render-mask drawing surface. It
 * never touches Vue, the DOM or an IPC channel — every function takes the same
 * `MaskConfig`/`MaskConfig[]` shape the config schema already defines and returns plain
 * numbers, so it is testable without a canvas and reusable by whatever actually paints one.
 *
 * ## Why this is not exact for a combined mask
 *
 * `CombinedMask` (see `packages/engine/src/map/mask/CombinedMask.ts`, mirroring upstream's
 * `common/.../map/mask/CombinedMask.java`) evaluates its shapes last-to-first, so the real
 * rendered area of more than one shape — especially once a `subtract` shape is in the list —
 * depends on exactly where they overlap. Recomputing that exactly means testing every block,
 * which is not a cost estimate, it is most of a render.
 *
 * So the estimate here is honest rather than exact wherever exactness is expensive:
 *
 *  - a single, unbounded-free additive shape (the overwhelmingly common case a drawing
 *    surface produces) gets its **exact** analytic area;
 *  - anything with more than one additive shape, or any subtract shape, gets the **sum of
 *    the additive shapes' own footprints** as an explicit upper bound — real overlap or
 *    subtraction only ever makes the true rendered area smaller, never larger, so the bound
 *    never understates what a render will cost;
 *  - a shape that is unbounded on some axis (the box/circle/ellipse defaults BlueMap itself
 *    ships) reports no numeric estimate at all rather than inventing one.
 *
 * `MaskCostEstimate.exact` says which case applied, so a caller can render "≈" instead of
 * silently presenting an upper bound as a real number.
 */

import type { BlurMask, BoxMask, CircleMask, EllipseMask, MaskConfig, PolygonMask } from "@worldlens/config";
import { JAVA_DOUBLE_MAX, JAVA_INT_MAX, JAVA_INT_MIN } from "./fieldValue.js";

/** Blocks along one side of a chunk. Minecraft's own constant, not a BlueMap choice. */
export const BLOCKS_PER_CHUNK_SIDE = 16;
/** Chunks along one side of an anvil region file. Minecraft's own constant. */
export const CHUNKS_PER_REGION_SIDE = 32;
/** Blocks along one side of a region: {@link BLOCKS_PER_CHUNK_SIDE} × {@link CHUNKS_PER_REGION_SIDE}. */
export const BLOCKS_PER_REGION_SIDE = BLOCKS_PER_CHUNK_SIDE * CHUNKS_PER_REGION_SIDE;

/** An axis-aligned bound on the X/Z plane, in blocks, both ends inclusive. */
export interface BoundsXZ {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

function isUnboundedNumber(value: number): boolean {
    return value === JAVA_INT_MIN || value === JAVA_INT_MAX || value === JAVA_DOUBLE_MAX || !Number.isFinite(value);
}

/** The box's own X/Z bound, or `null` when either axis is unbounded. */
export function boxBoundsXZ(shape: BoxMask): BoundsXZ | null {
    if (isUnboundedNumber(shape["min-x"]) || isUnboundedNumber(shape["max-x"])) return null;
    if (isUnboundedNumber(shape["min-z"]) || isUnboundedNumber(shape["max-z"])) return null;
    return { minX: shape["min-x"], maxX: shape["max-x"], minZ: shape["min-z"], maxZ: shape["max-z"] };
}

/** The circle's bounding square, or `null` when its radius is the unbounded default. */
export function circleBoundsXZ(shape: CircleMask): BoundsXZ | null {
    if (isUnboundedNumber(shape.radius) || shape.radius <= 0) return null;
    return {
        minX: shape["center-x"] - shape.radius,
        maxX: shape["center-x"] + shape.radius,
        minZ: shape["center-z"] - shape.radius,
        maxZ: shape["center-z"] + shape.radius,
    };
}

/** The ellipse's bounding rectangle, or `null` when a radius is the unbounded default. */
export function ellipseBoundsXZ(shape: EllipseMask): BoundsXZ | null {
    if (isUnboundedNumber(shape["radius-x"]) || shape["radius-x"] <= 0) return null;
    if (isUnboundedNumber(shape["radius-z"]) || shape["radius-z"] <= 0) return null;
    return {
        minX: shape["center-x"] - shape["radius-x"],
        maxX: shape["center-x"] + shape["radius-x"],
        minZ: shape["center-z"] - shape["radius-z"],
        maxZ: shape["center-z"] + shape["radius-z"],
    };
}

/** The polygon's own bounding rectangle, or `null` when it has fewer than 3 points. */
export function polygonBoundsXZ(shape: PolygonMask): BoundsXZ | null {
    if (shape.shape.length < 3) return null;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const point of shape.shape) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
    }
    return { minX, maxX, minZ, maxZ };
}

/** A blur's own bound is the union of whatever it nests — the blur only softens the edge. */
export function blurBoundsXZ(shape: BlurMask): BoundsXZ | null {
    return unionBoundsXZ(shape.masks.filter((nested) => !nested.subtract).map(shapeBoundsXZ));
}

/** The X/Z bound of any one shape, dispatched by its `type`. */
export function shapeBoundsXZ(shape: MaskConfig): BoundsXZ | null {
    switch (shape.type) {
        case "bluemap:box":
            return boxBoundsXZ(shape);
        case "bluemap:circle":
            return circleBoundsXZ(shape);
        case "bluemap:ellipse":
            return ellipseBoundsXZ(shape);
        case "bluemap:polygon":
            return polygonBoundsXZ(shape);
        case "bluemap:blur":
            return blurBoundsXZ(shape);
    }
}

/** The union of a list of bounds, `null`-safe: an unbounded or empty member makes the whole union `null`. */
export function unionBoundsXZ(bounds: readonly (BoundsXZ | null)[]): BoundsXZ | null {
    if (bounds.length === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const bound of bounds) {
        if (bound === null) return null;
        minX = Math.min(minX, bound.minX);
        maxX = Math.max(maxX, bound.maxX);
        minZ = Math.min(minZ, bound.minZ);
        maxZ = Math.max(maxZ, bound.maxZ);
    }
    return { minX, maxX, minZ, maxZ };
}

/** The additive shapes' combined X/Z bound — the extent a drawing surface should frame. */
export function combinedBoundsXZ(masks: readonly MaskConfig[]): BoundsXZ | null {
    const additive = masks.filter((shape) => !shape.subtract);
    if (additive.length === 0) return null;
    return unionBoundsXZ(additive.map(shapeBoundsXZ));
}

/** The exact footprint area of one box, in square blocks, or `null` if unbounded. */
export function boxFootprintAreaBlocks(shape: BoxMask): number | null {
    const bounds = boxBoundsXZ(shape);
    if (bounds === null) return null;
    return Math.max(0, bounds.maxX - bounds.minX + 1) * Math.max(0, bounds.maxZ - bounds.minZ + 1);
}

/** The exact footprint area of one circle, in square blocks, or `null` if unbounded. */
export function circleFootprintAreaBlocks(shape: CircleMask): number | null {
    if (isUnboundedNumber(shape.radius) || shape.radius <= 0) return null;
    return Math.PI * shape.radius * shape.radius;
}

/** The exact footprint area of one ellipse, in square blocks, or `null` if unbounded. */
export function ellipseFootprintAreaBlocks(shape: EllipseMask): number | null {
    if (isUnboundedNumber(shape["radius-x"]) || shape["radius-x"] <= 0) return null;
    if (isUnboundedNumber(shape["radius-z"]) || shape["radius-z"] <= 0) return null;
    return Math.PI * shape["radius-x"] * shape["radius-z"];
}

/**
 * The exact footprint area of one polygon by the shoelace formula, in square blocks.
 *
 * `null` when there are fewer than 3 points, mirroring the engine's own refusal
 * (`PolygonMaskConfig.java` needs at least 3, exactly as `mask.ts`'s own advisory note says).
 */
export function polygonFootprintAreaBlocks(shape: PolygonMask): number | null {
    const points = shape.shape;
    if (points.length < 3) return null;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        sum += a.x * b.z - b.x * a.z;
    }
    return Math.abs(sum) / 2;
}

/** A blur's own footprint is approximated as whatever it nests — the blur only softens edges. */
export function blurFootprintAreaBlocks(shape: BlurMask): number | null {
    return sumAdditiveFootprints(shape.masks);
}

/** The footprint area of any one shape, in square blocks, dispatched by its `type`. */
export function shapeFootprintAreaBlocks(shape: MaskConfig): number | null {
    switch (shape.type) {
        case "bluemap:box":
            return boxFootprintAreaBlocks(shape);
        case "bluemap:circle":
            return circleFootprintAreaBlocks(shape);
        case "bluemap:ellipse":
            return ellipseFootprintAreaBlocks(shape);
        case "bluemap:polygon":
            return polygonFootprintAreaBlocks(shape);
        case "bluemap:blur":
            return blurFootprintAreaBlocks(shape);
    }
}

function sumAdditiveFootprints(masks: readonly MaskConfig[]): number | null {
    const additive = masks.filter((shape) => !shape.subtract);
    if (additive.length === 0) return null;
    let total = 0;
    for (const shape of additive) {
        const area = shapeFootprintAreaBlocks(shape);
        if (area === null) return null;
        total += area;
    }
    return total;
}

export type MaskCostBasis =
    /** No shapes at all: BlueMap renders the whole world, so there is nothing to size. */
    | "whole-world"
    /** Exactly one additive, bounded shape and no subtraction: the number is the real area. */
    | "exact"
    /** More than one additive shape, or any subtraction: the number is an upper bound. */
    | "upper-bound"
    /** At least one additive shape is unbounded on some axis: no number can be given at all. */
    | "unbounded";

export interface MaskCostEstimate {
    readonly basis: MaskCostBasis;
    /** Whether {@link areaBlocks} is the real rendered area rather than an upper bound. */
    readonly exact: boolean;
    readonly areaBlocks: number | null;
    readonly areaChunks: number | null;
    readonly areaRegions: number | null;
    readonly extent: BoundsXZ | null;
}

function blocksToChunks(blocks: number): number {
    return blocks / (BLOCKS_PER_CHUNK_SIDE * BLOCKS_PER_CHUNK_SIDE);
}

function blocksToRegions(blocks: number): number {
    return blocks / (BLOCKS_PER_REGION_SIDE * BLOCKS_PER_REGION_SIDE);
}

/**
 * The honest cost estimate for a whole render-mask list, in blocks, chunks and regions.
 *
 * See the module doc for exactly what "honest" means here: exact for the common single-shape
 * case, an explicit upper bound otherwise, and `null` numbers rather than an invented one
 * when a shape is unbounded.
 */
export function estimateRenderCost(masks: readonly MaskConfig[]): MaskCostEstimate {
    const extent = combinedBoundsXZ(masks);

    if (masks.length === 0) {
        return { basis: "whole-world", exact: true, areaBlocks: null, areaChunks: null, areaRegions: null, extent: null };
    }

    const additive = masks.filter((shape) => !shape.subtract);
    const hasSubtract = masks.some((shape) => shape.subtract);

    if (additive.length === 1 && !hasSubtract) {
        const area = shapeFootprintAreaBlocks(additive[0]!);
        if (area === null) {
            return { basis: "unbounded", exact: false, areaBlocks: null, areaChunks: null, areaRegions: null, extent };
        }
        return { basis: "exact", exact: true, areaBlocks: area, areaChunks: blocksToChunks(area), areaRegions: blocksToRegions(area), extent };
    }

    const upperBound = sumAdditiveFootprints(additive);
    if (upperBound === null) {
        return { basis: "unbounded", exact: false, areaBlocks: null, areaChunks: null, areaRegions: null, extent };
    }
    return {
        basis: "upper-bound",
        exact: false,
        areaBlocks: upperBound,
        areaChunks: blocksToChunks(upperBound),
        areaRegions: blocksToRegions(upperBound),
        extent,
    };
}

/**
 * The render mask's drawing surface, as pure geometry and state.
 *
 * `ConfigMaskField.vue` lets somebody type a shape's numbers. Almost nobody arrives
 * already knowing the block coordinates of the area they care about -- they know what it
 * looks like: the village, the base, the bit near spawn. This module is the other half:
 * a shape somebody can see and drag, with the numbers derived from the drawing rather
 * than the other way round.
 *
 * Everything here is framework-free on purpose. `MaskDrawingCanvas.vue` turns pointer
 * drags and key presses into calls to these functions and nothing else, which is what
 * lets every rule below -- snapping, undo, the area readout, the three presets -- be
 * proven with plain data in a test file, with no SVG, no `getBoundingClientRect`, and no
 * jsdom pointer-event guesswork standing between the assertion and the bug.
 *
 * ## The four shapes, and no others
 *
 * `bluemap:box`, `bluemap:circle`, `bluemap:ellipse` and `bluemap:polygon` are the shapes
 * BlueMap's mask registry accepts on the X/Z plane (`packages/config/src/schema/mask.ts`).
 * `bluemap:blur` is not drawn here: it is a modifier that wraps a nested list of these
 * four, which is exactly what `ConfigMaskField.vue` already renders recursively. Offering
 * a fifth drawable shape, or silently flattening one of these to a box, is the one outcome
 * the design brief calls out by name as worse than not having a canvas at all -- so this
 * module has exactly the four `DrawableShape` variants and every function here is total
 * over just those four.
 *
 * ## Height is not drawn
 *
 * Every shape also carries `minY`/`maxY`, because every real mask shape does. They are
 * carried through untouched by every geometry function in this file: a top-down canvas
 * has no honest gesture for "how tall", so the height range stays a pair of plain numbers
 * edited the way `ConfigMaskField.vue` already edits them. Drawing changes the footprint;
 * typing still owns the vertical extent.
 *
 * ## Round-tripping the config record
 *
 * {@link fromMaskRecord} and {@link toMaskRecord} are the seam to
 * `packages/config/src/schema/mask.ts`'s field names (`min-x`, `center-z`, `radius-x`,
 * `shape`, ...), so a drawn shape is a value `ConfigMaskField.vue` can write back into the
 * same record it already edits, and an existing typed mask opens on the canvas exactly as
 * it was typed. BlueMap's own unbounded sentinels (`Integer.MIN_VALUE`/`MAX_VALUE`,
 * `Double.MAX_VALUE`) round-trip on the axis nobody dragged; the moment a corner is
 * dragged, that axis gets the real number the drag produced, because a canvas cannot draw
 * "unlimited" -- typing `-2147483648` by hand remains the way to leave an axis unbounded.
 */

import type { MaskConfig, PlainValue } from "@material-bluemap/config";
import { JAVA_DOUBLE_MAX, JAVA_INT_MAX, JAVA_INT_MIN, isUnboundedSentinel } from "./fieldValue.js";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

// JAVA_INT_MIN, JAVA_INT_MAX and JAVA_DOUBLE_MAX come from `fieldValue.ts`, the file every
// other numeric control in this directory already reads them from, and are re-exported
// below so a caller of this module never has to import both files for one constant.
export { JAVA_DOUBLE_MAX, JAVA_INT_MAX, JAVA_INT_MIN };

/** A chunk's width, in blocks. Mirrors `CHUNK_BLOCKS` in `render-actions/src/bluemap.ts`. */
export const CHUNK_BLOCKS = 16;

/** A region file's width, in blocks (32 chunks). Mirrors `REGION_BLOCKS` there too. */
export const REGION_BLOCKS = CHUNK_BLOCKS * 32;

/** How many blocks make up one chunk column's footprint (16 x 16). */
export const BLOCKS_PER_CHUNK = CHUNK_BLOCKS * CHUNK_BLOCKS;

/** How many blocks make up one region's footprint (512 x 512). */
export const BLOCKS_PER_REGION = REGION_BLOCKS * REGION_BLOCKS;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export interface Point {
    readonly x: number;
    readonly z: number;
}

interface HeightRange {
    readonly minY: number;
    readonly maxY: number;
}

export interface BoxShape extends HeightRange {
    readonly kind: "box";
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

export interface CircleShape extends HeightRange {
    readonly kind: "circle";
    readonly centerX: number;
    readonly centerZ: number;
    readonly radius: number;
}

export interface EllipseShape extends HeightRange {
    readonly kind: "ellipse";
    readonly centerX: number;
    readonly centerZ: number;
    readonly radiusX: number;
    readonly radiusZ: number;
}

export interface PolygonShape extends HeightRange {
    readonly kind: "polygon";
    readonly points: readonly Point[];
}

export type DrawableShape = BoxShape | CircleShape | EllipseShape | PolygonShape;
export type ShapeKind = DrawableShape["kind"];

/** The smallest a drawn dimension is allowed to shrink to: one block, one block of radius. */
const MIN_EXTENT = 1;

/** A polygon below this many points is not a shape any renderer can close. */
export const MIN_POLYGON_POINTS = 3;

/* -------------------------------------------------------------------------- */
/* Snapping                                                                    */
/* -------------------------------------------------------------------------- */

export type SnapMode = "off" | "chunk" | "region";

function snapSize(mode: SnapMode): number {
    if (mode === "region") return REGION_BLOCKS;
    if (mode === "chunk") return CHUNK_BLOCKS;
    return 1;
}

/** Snaps a free point (a polygon vertex, a circle's center) to the nearest grid intersection. */
export function snapPoint(value: number, mode: SnapMode): number {
    const size = snapSize(mode);
    return Math.round(value / size) * size;
}

/**
 * Snaps a box's minimum edge DOWN to the grid, so the box only ever grows to cover a
 * boundary. Off the grid there is no boundary to grow to, so this just rounds to the
 * nearest whole block -- a plain drag still produces integer coordinates, without the
 * shape silently expanding when snapping is switched off.
 */
export function snapMin(value: number, mode: SnapMode): number {
    if (mode === "off") return Math.round(value);
    const size = snapSize(mode);
    return Math.floor(value / size) * size;
}

/** Snaps a box's inclusive maximum edge to `boundary - 1`, so the span is a whole number of cells. */
export function snapMax(value: number, mode: SnapMode): number {
    if (mode === "off") return Math.round(value);
    const size = snapSize(mode);
    return Math.ceil((value + 1) / size) * size - 1;
}

/** Snaps a radius to the nearest grid size, never below one block. */
export function snapRadius(value: number, mode: SnapMode): number {
    const size = snapSize(mode);
    return Math.max(MIN_EXTENT, Math.round(value / size) * size);
}

/** Applies the active snap mode to every coordinate of a shape. `"off"` still rounds to whole blocks. */
export function snapShape(shape: DrawableShape, mode: SnapMode): DrawableShape {
    switch (shape.kind) {
        case "box":
            return normalizeBox({
                ...shape,
                minX: snapMin(shape.minX, mode),
                maxX: snapMax(shape.maxX, mode),
                minZ: snapMin(shape.minZ, mode),
                maxZ: snapMax(shape.maxZ, mode),
            });
        case "circle":
            return {
                ...shape,
                centerX: snapPoint(shape.centerX, mode),
                centerZ: snapPoint(shape.centerZ, mode),
                radius: snapRadius(shape.radius, mode),
            };
        case "ellipse":
            return {
                ...shape,
                centerX: snapPoint(shape.centerX, mode),
                centerZ: snapPoint(shape.centerZ, mode),
                radiusX: snapRadius(shape.radiusX, mode),
                radiusZ: snapRadius(shape.radiusZ, mode),
            };
        case "polygon":
            return {
                ...shape,
                points: shape.points.map((point) => ({
                    x: snapPoint(point.x, mode),
                    z: snapPoint(point.z, mode),
                })),
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/** Keeps a box's min at or below its max on each axis, however the corner was dragged past it. */
function normalizeBox(shape: BoxShape): BoxShape {
    const minX = Math.min(shape.minX, shape.maxX);
    const maxX = Math.max(shape.minX, shape.maxX);
    const minZ = Math.min(shape.minZ, shape.maxZ);
    const maxZ = Math.max(shape.minZ, shape.maxZ);
    return { ...shape, minX, maxX, minZ, maxZ };
}

/* -------------------------------------------------------------------------- */
/* Editing: box                                                                */
/* -------------------------------------------------------------------------- */

export type BoxEdge = "minX" | "maxX" | "minZ" | "maxZ";
export type BoxCorner = "nw" | "ne" | "sw" | "se";

const CORNER_EDGES: Record<BoxCorner, readonly [BoxEdge, BoxEdge]> = {
    // North is -Z, west is -X, matching the block-coordinate convention the whole app uses.
    nw: ["minX", "minZ"],
    ne: ["maxX", "minZ"],
    sw: ["minX", "maxZ"],
    se: ["maxX", "maxZ"],
};

/** Moves one edge of a box by `delta` blocks, keeping the box at least one block wide. */
export function moveBoxEdge(shape: BoxShape, edge: BoxEdge, delta: number): BoxShape {
    const next = { ...shape, [edge]: shape[edge] + delta };
    return normalizeBox(clampBoxSpan(next));
}

/** Moves both edges of a corner at once, for a diagonal drag or a diagonal keyboard nudge. */
export function moveBoxCorner(
    shape: BoxShape,
    corner: BoxCorner,
    dx: number,
    dz: number,
): BoxShape {
    const [xEdge, zEdge] = CORNER_EDGES[corner];
    const next: BoxShape = { ...shape, [xEdge]: shape[xEdge] + dx, [zEdge]: shape[zEdge] + dz };
    return normalizeBox(clampBoxSpan(next));
}

/** Slides the whole box, both axes, without changing its size. */
export function moveBox(shape: BoxShape, dx: number, dz: number): BoxShape {
    return {
        ...shape,
        minX: shape.minX + dx,
        maxX: shape.maxX + dx,
        minZ: shape.minZ + dz,
        maxZ: shape.maxZ + dz,
    };
}

function clampBoxSpan(shape: BoxShape): BoxShape {
    // Only pull the edge that shrank back out, so a drag that only touched maxX cannot
    // silently move minX too.
    const { minX, minZ } = shape;
    let { maxX, maxZ } = shape;
    if (maxX - minX < MIN_EXTENT - 1) maxX = minX + MIN_EXTENT - 1;
    if (maxZ - minZ < MIN_EXTENT - 1) maxZ = minZ + MIN_EXTENT - 1;
    return { ...shape, minX, maxX, minZ, maxZ };
}

/* -------------------------------------------------------------------------- */
/* Editing: circle and ellipse                                                */
/* -------------------------------------------------------------------------- */

export function moveCircleCenter(shape: CircleShape, dx: number, dz: number): CircleShape {
    return { ...shape, centerX: shape.centerX + dx, centerZ: shape.centerZ + dz };
}

export function resizeCircle(shape: CircleShape, delta: number): CircleShape {
    return { ...shape, radius: Math.max(MIN_EXTENT, shape.radius + delta) };
}

export function moveEllipseCenter(shape: EllipseShape, dx: number, dz: number): EllipseShape {
    return { ...shape, centerX: shape.centerX + dx, centerZ: shape.centerZ + dz };
}

export function resizeEllipseX(shape: EllipseShape, delta: number): EllipseShape {
    return { ...shape, radiusX: Math.max(MIN_EXTENT, shape.radiusX + delta) };
}

export function resizeEllipseZ(shape: EllipseShape, delta: number): EllipseShape {
    return { ...shape, radiusZ: Math.max(MIN_EXTENT, shape.radiusZ + delta) };
}

/* -------------------------------------------------------------------------- */
/* Editing: polygon                                                           */
/* -------------------------------------------------------------------------- */

export function movePolygonPoint(
    shape: PolygonShape,
    index: number,
    dx: number,
    dz: number,
): PolygonShape {
    if (index < 0 || index >= shape.points.length) return shape;
    const points = shape.points.map((point, candidate) =>
        candidate === index ? { x: point.x + dx, z: point.z + dz } : point,
    );
    return { ...shape, points };
}

/** Inserts a new vertex after `afterIndex` (or at the end when omitted). */
export function addPolygonPoint(
    shape: PolygonShape,
    point: Point,
    afterIndex?: number,
): PolygonShape {
    const at = afterIndex === undefined ? shape.points.length : afterIndex + 1;
    const points = [...shape.points.slice(0, at), point, ...shape.points.slice(at)];
    return { ...shape, points };
}

/** Removes a vertex. Refused below {@link MIN_POLYGON_POINTS}: a two-point polygon is a line. */
export function removePolygonPoint(shape: PolygonShape, index: number): PolygonShape {
    if (shape.points.length <= MIN_POLYGON_POINTS) return shape;
    return { ...shape, points: shape.points.filter((_, candidate) => candidate !== index) };
}

export function movePolygon(shape: PolygonShape, dx: number, dz: number): PolygonShape {
    return {
        ...shape,
        points: shape.points.map((point) => ({ x: point.x + dx, z: point.z + dz })),
    };
}

/* -------------------------------------------------------------------------- */
/* Keyboard nudging                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How many blocks one key press moves a handle.
 *
 * The small step is always a single block -- the one unit a mask genuinely cares about.
 * The large step scales with the active snap grid, so "the big jump" always means "the
 * next boundary up" rather than an arbitrary fixed number: off a snap grid it is one
 * chunk, snapped to chunks it is one region, snapped to regions it is four regions.
 */
export function nudgeStep(mode: SnapMode, big: boolean): number {
    if (mode === "region") return big ? REGION_BLOCKS * 4 : REGION_BLOCKS;
    if (mode === "chunk") return big ? REGION_BLOCKS : CHUNK_BLOCKS;
    return big ? CHUNK_BLOCKS : MIN_EXTENT;
}

/* -------------------------------------------------------------------------- */
/* Area, in real units, honestly labelled                                     */
/* -------------------------------------------------------------------------- */

export interface AreaEstimate {
    /**
     * Footprint area, in blocks. Exact for a box; the geometric area for the other three.
     * `null` exactly when {@link unbounded} is `true` -- an axis left at BlueMap's own
     * sentinel has no real number to give, and inventing one from a 4-billion-block
     * sentinel would be a lie with the decimal point moved, not an estimate.
     */
    readonly blocks: number | null;
    /** How many 16x16 chunk columns the footprint touches, or `null` when unbounded. */
    readonly chunks: number | null;
    /** How many 512x512 regions the footprint touches, or `null` when unbounded. */
    readonly regions: number | null;
    /**
     * `true` only for a box, whose footprint is exactly the blocks it covers. A circle,
     * ellipse or polygon's `blocks` is the shape's real geometric area; the render engine
     * tests it one block at a time, so the true rendered block count can differ from this
     * by the shape's boundary blocks -- close, but this is the estimate the design brief
     * asks to be labelled as one.
     */
    readonly exact: boolean;
    /** At least one axis is still at BlueMap's "no limit" sentinel: no number is given at all. */
    readonly unbounded: boolean;
}

const UNBOUNDED_AREA: AreaEstimate = {
    blocks: null,
    chunks: null,
    regions: null,
    exact: false,
    unbounded: true,
};

/** Counts the whole-cell span a `[min, max]` inclusive range touches, on a `size`-block grid. */
function cellSpan(min: number, max: number, size: number): number {
    const from = Math.floor(min / size);
    const to = Math.floor(max / size);
    return to - from + 1;
}

export function estimateArea(shape: DrawableShape): AreaEstimate {
    switch (shape.kind) {
        case "box": {
            if (
                isUnboundedSentinel(shape.minX) ||
                isUnboundedSentinel(shape.maxX) ||
                isUnboundedSentinel(shape.minZ) ||
                isUnboundedSentinel(shape.maxZ)
            ) {
                return UNBOUNDED_AREA;
            }
            const blocks = (shape.maxX - shape.minX + 1) * (shape.maxZ - shape.minZ + 1);
            const chunks =
                cellSpan(shape.minX, shape.maxX, CHUNK_BLOCKS) *
                cellSpan(shape.minZ, shape.maxZ, CHUNK_BLOCKS);
            const regions =
                cellSpan(shape.minX, shape.maxX, REGION_BLOCKS) *
                cellSpan(shape.minZ, shape.maxZ, REGION_BLOCKS);
            return { blocks, chunks, regions, exact: true, unbounded: false };
        }
        case "circle": {
            if (isUnboundedSentinel(shape.radius) || shape.radius <= 0) return UNBOUNDED_AREA;
            const blocks = Math.PI * shape.radius * shape.radius;
            return areaCells(blocks);
        }
        case "ellipse": {
            if (
                isUnboundedSentinel(shape.radiusX) ||
                isUnboundedSentinel(shape.radiusZ) ||
                shape.radiusX <= 0 ||
                shape.radiusZ <= 0
            )
                return UNBOUNDED_AREA;
            const blocks = Math.PI * shape.radiusX * shape.radiusZ;
            return areaCells(blocks);
        }
        case "polygon": {
            // A polygon's vertices are always finite numbers by construction -- there is no
            // "unbounded polygon" sentinel the way there is for a box or a circle.
            const blocks = Math.abs(shoelaceArea(shape.points));
            return areaCells(blocks);
        }
    }
}

function areaCells(blocks: number): AreaEstimate {
    return {
        blocks: Math.round(blocks),
        chunks: Math.max(1, Math.round(blocks / BLOCKS_PER_CHUNK)),
        regions: Math.max(1, Math.round(blocks / BLOCKS_PER_REGION)),
        exact: false,
        unbounded: false,
    };
}

/** The shoelace formula: exact area of a simple polygon from its vertices. */
function shoelaceArea(points: readonly Point[]): number {
    let sum = 0;
    for (let index = 0; index < points.length; index++) {
        const current = points[index] as Point;
        const next = points[(index + 1) % points.length] as Point;
        sum += current.x * next.z - next.x * current.z;
    }
    return sum / 2;
}

/* -------------------------------------------------------------------------- */
/* World orientation: what the app can honestly say about the world           */
/* -------------------------------------------------------------------------- */

export interface WorldExtent {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/**
 * What is known about the world this mask belongs to, gathered as cheaply as the app can
 * manage -- a region-file bounding box and (when the build can read it) the spawn point.
 * Both are optional and both carry a reason when absent, because a canvas that pretends
 * to know the world's shape when it does not is worse than one that says so.
 */
export interface WorldOrientation {
    /** The block extent measured from the region files actually on disk, or `null`. */
    readonly extent: WorldExtent | null;
    /** Said plainly when `extent` is `null`, e.g. "no world folder is open yet". */
    readonly extentUnavailableReason: string | null;
    readonly spawn: Point | null;
    readonly spawnUnavailableReason: string | null;
    /** How many `.mca` files the extent was measured from, when it was measured. */
    readonly regionCount: number | null;
}

/** The honest starting point: nothing known yet, e.g. before a world is chosen. */
export const UNKNOWN_WORLD: WorldOrientation = {
    extent: null,
    extentUnavailableReason:
        "No world is open, so the extent of its region files is not known yet.",
    spawn: null,
    spawnUnavailableReason: "No world is open, so its spawn point is not known yet.",
    regionCount: null,
};

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export interface Preset {
    readonly shape: DrawableShape;
    /** Exactly what this preset set, in real numbers -- never invented ones. */
    readonly description: string;
}

const UNBOUNDED_HEIGHT: HeightRange = { minY: JAVA_INT_MIN, maxY: JAVA_INT_MAX };

/**
 * The whole world: a box with every axis left at BlueMap's own "no limit" sentinel.
 *
 * This is not a guess at the world's size -- it is the literal value an empty mask list
 * already means (`CombinedMask.layers.isEmpty()` renders everything), spelled out as one
 * explicit unbounded box so "reset" and "whole world" are the same real value whether or
 * not a world has ever been measured.
 *
 * Always a box, regardless of the shape being edited when it is applied. Every other
 * preset below deliberately stays inside the current shape's own kind -- swapping a
 * circle for a box because someone asked to move it near spawn would be a surprise -- but
 * "whole world" and "reset" are a genuine start-over, and a box is the only shape whose
 * unbounded form is a literal file default rather than an equivalent stand-in. A circle's
 * own unbounded radius (`Double.MAX_VALUE`) means the same thing and stays available by
 * typing it into the radius field directly.
 */
export function wholeWorldPreset(): Preset {
    return {
        shape: {
            kind: "box",
            minX: JAVA_INT_MIN,
            maxX: JAVA_INT_MAX,
            minZ: JAVA_INT_MIN,
            maxZ: JAVA_INT_MAX,
            ...UNBOUNDED_HEIGHT,
        },
        description:
            "Every axis set to BlueMap's own unlimited sentinel -- the same as having no mask at all.",
    };
}

/**
 * The measured extent of the region files actually on disk, when it is known, expressed as
 * whichever shape kind is currently being edited.
 *
 * A box gets the extent exactly; a circle or ellipse gets the smallest one centered on the
 * extent that still covers every corner (a circle cannot follow a rectangle's corners, so
 * the description says so); a polygon gets the extent's own four corners, which is exact.
 * `null` when the extent has not been measured, with the reason attached so the caller can
 * show it rather than silently disabling the preset.
 */
export function existingRegionsPreset(
    world: WorldOrientation,
    kind: ShapeKind = "box",
): Preset | null {
    if (world.extent === null) return null;
    const { minX, maxX, minZ, maxZ } = world.extent;
    const regionNote =
        world.regionCount === null
            ? ""
            : ` across ${world.regionCount} region file${world.regionCount === 1 ? "" : "s"}`;
    const extentFacts = `The measured extent of the region files on disk${regionNote}: X ${minX}..${maxX}, Z ${minZ}..${maxZ}.`;
    const centerX = Math.round((minX + maxX) / 2);
    const centerZ = Math.round((minZ + maxZ) / 2);

    switch (kind) {
        case "box":
            return {
                shape: { kind: "box", minX, maxX, minZ, maxZ, ...UNBOUNDED_HEIGHT },
                description: extentFacts,
            };
        case "circle": {
            const radius = Math.max(
                MIN_EXTENT,
                Math.round(Math.hypot(maxX - minX, maxZ - minZ) / 2),
            );
            return {
                shape: { kind: "circle", centerX, centerZ, radius, ...UNBOUNDED_HEIGHT },
                description: `${extentFacts} Drawn as a ${radius}-block-radius circle centered on that extent, since a circle cannot follow a rectangle's own corners.`,
            };
        }
        case "ellipse": {
            const radiusX = Math.max(MIN_EXTENT, Math.round((maxX - minX) / 2));
            const radiusZ = Math.max(MIN_EXTENT, Math.round((maxZ - minZ) / 2));
            return {
                shape: { kind: "ellipse", centerX, centerZ, radiusX, radiusZ, ...UNBOUNDED_HEIGHT },
                description: `${extentFacts} Drawn as an ellipse matching that extent's own width and depth.`,
            };
        }
        case "polygon":
            return {
                shape: {
                    kind: "polygon",
                    points: [
                        { x: minX, z: minZ },
                        { x: maxX, z: minZ },
                        { x: maxX, z: maxZ },
                        { x: minX, z: maxZ },
                    ],
                    ...UNBOUNDED_HEIGHT,
                },
                description: `${extentFacts} Drawn as the extent's own four corners.`,
            };
    }
}

/** Default radius (or half-span) for the "around spawn" preset: 8 chunks, a generous starter area. */
export const DEFAULT_SPAWN_RADIUS = 128;

/**
 * A shape around spawn, when spawn is known; otherwise around the middle of the measured
 * extent; otherwise around the map origin. Every fallback is a real derived value and the
 * description always says which one was actually used. Stays inside whichever shape kind
 * is currently being edited -- a box gets a square of the same half-span, an ellipse gets
 * equal X/Z radii, and a polygon gets a small square outline.
 */
export function aroundSpawnPreset(
    world: WorldOrientation,
    kind: ShapeKind = "circle",
    radius: number = DEFAULT_SPAWN_RADIUS,
): Preset {
    const anchor =
        world.spawn ??
        (world.extent === null
            ? null
            : {
                  x: Math.round((world.extent.minX + world.extent.maxX) / 2),
                  z: Math.round((world.extent.minZ + world.extent.maxZ) / 2),
              });
    const point = anchor ?? { x: 0, z: 0 };
    const anchorNote =
        world.spawn !== null
            ? `the world's real spawn point (${point.x}, ${point.z})`
            : world.extent !== null
              ? `the middle of the measured world extent instead (spawn is not known in this build): (${point.x}, ${point.z})`
              : `the map origin (spawn and the world's extent are both unknown in this build): (${point.x}, ${point.z})`;

    switch (kind) {
        case "circle":
            return {
                shape: {
                    kind: "circle",
                    centerX: point.x,
                    centerZ: point.z,
                    radius,
                    ...UNBOUNDED_HEIGHT,
                },
                description: `A ${radius}-block circle around ${anchorNote}.`,
            };
        case "ellipse":
            return {
                shape: {
                    kind: "ellipse",
                    centerX: point.x,
                    centerZ: point.z,
                    radiusX: radius,
                    radiusZ: radius,
                    ...UNBOUNDED_HEIGHT,
                },
                description: `A ${radius}-block ellipse (equal on both axes) around ${anchorNote}.`,
            };
        case "box":
            return {
                shape: {
                    kind: "box",
                    minX: point.x - radius,
                    maxX: point.x + radius,
                    minZ: point.z - radius,
                    maxZ: point.z + radius,
                    ...UNBOUNDED_HEIGHT,
                },
                description: `A ${radius * 2}-block-wide box around ${anchorNote}.`,
            };
        case "polygon":
            return {
                shape: {
                    kind: "polygon",
                    points: [
                        { x: point.x - radius, z: point.z - radius },
                        { x: point.x + radius, z: point.z - radius },
                        { x: point.x + radius, z: point.z + radius },
                        { x: point.x - radius, z: point.z + radius },
                    ],
                    ...UNBOUNDED_HEIGHT,
                },
                description: `A ${radius * 2}-block-wide square outline around ${anchorNote}.`,
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Default shape for a freshly added shape of a given kind                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_SPAN = 64;

/** A sensible starting shape when a new one of `kind` is drawn, anchored on whatever of the world is known. */
export function defaultShapeFor(kind: ShapeKind, world: WorldOrientation): DrawableShape {
    const anchor =
        world.spawn ??
        (world.extent === null
            ? { x: 0, z: 0 }
            : {
                  x: Math.round((world.extent.minX + world.extent.maxX) / 2),
                  z: Math.round((world.extent.minZ + world.extent.maxZ) / 2),
              });

    switch (kind) {
        case "box":
            return {
                kind: "box",
                minX: anchor.x - DEFAULT_SPAN,
                maxX: anchor.x + DEFAULT_SPAN,
                minZ: anchor.z - DEFAULT_SPAN,
                maxZ: anchor.z + DEFAULT_SPAN,
                ...UNBOUNDED_HEIGHT,
            };
        case "circle":
            return {
                kind: "circle",
                centerX: anchor.x,
                centerZ: anchor.z,
                radius: DEFAULT_SPAN,
                ...UNBOUNDED_HEIGHT,
            };
        case "ellipse":
            return {
                kind: "ellipse",
                centerX: anchor.x,
                centerZ: anchor.z,
                radiusX: DEFAULT_SPAN,
                radiusZ: DEFAULT_SPAN,
                ...UNBOUNDED_HEIGHT,
            };
        case "polygon":
            return {
                kind: "polygon",
                points: [
                    { x: anchor.x - DEFAULT_SPAN, z: anchor.z - DEFAULT_SPAN },
                    { x: anchor.x + DEFAULT_SPAN, z: anchor.z - DEFAULT_SPAN },
                    { x: anchor.x + DEFAULT_SPAN, z: anchor.z + DEFAULT_SPAN },
                    { x: anchor.x - DEFAULT_SPAN, z: anchor.z + DEFAULT_SPAN },
                ],
                ...UNBOUNDED_HEIGHT,
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Undo / redo                                                                 */
/* -------------------------------------------------------------------------- */

export interface History<T> {
    readonly past: readonly T[];
    readonly present: T;
    readonly future: readonly T[];
}

/** How many past states are kept. Generous for a drawing session; not unbounded memory. */
const MAX_HISTORY = 200;

export function initHistory<T>(present: T): History<T> {
    return { past: [], present, future: [] };
}

/** Records a new present, discarding any redo branch -- the ordinary "you did a new thing" case. */
export function pushHistory<T>(history: History<T>, next: T): History<T> {
    const past = [...history.past, history.present].slice(-MAX_HISTORY);
    return { past, present: next, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
    return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
    return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
    if (history.past.length === 0) return history;
    const present = history.past[history.past.length - 1] as T;
    const past = history.past.slice(0, -1);
    return { past, present, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
    if (history.future.length === 0) return history;
    const present = history.future[0] as T;
    const future = history.future.slice(1);
    return { past: [...history.past, history.present], present, future };
}

/* -------------------------------------------------------------------------- */
/* Round-tripping the mask config record                                      */
/* -------------------------------------------------------------------------- */

type PlainRecord = Record<string, unknown>;

function num(record: PlainRecord, key: string, fallback: number): number {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Reads a `render-mask` shape record (as `ConfigMaskField.vue` holds it) into a drawable shape. */
export function fromMaskRecord(record: PlainRecord, kind: ShapeKind): DrawableShape {
    const minY = num(record, "min-y", JAVA_INT_MIN);
    const maxY = num(record, "max-y", JAVA_INT_MAX);

    switch (kind) {
        case "box":
            return {
                kind: "box",
                minX: num(record, "min-x", JAVA_INT_MIN),
                maxX: num(record, "max-x", JAVA_INT_MAX),
                minZ: num(record, "min-z", JAVA_INT_MIN),
                maxZ: num(record, "max-z", JAVA_INT_MAX),
                minY,
                maxY,
            };
        case "circle":
            return {
                kind: "circle",
                centerX: num(record, "center-x", 0),
                centerZ: num(record, "center-z", 0),
                radius: num(record, "radius", JAVA_DOUBLE_MAX),
                minY,
                maxY,
            };
        case "ellipse":
            return {
                kind: "ellipse",
                centerX: num(record, "center-x", 0),
                centerZ: num(record, "center-z", 0),
                radiusX: num(record, "radius-x", JAVA_DOUBLE_MAX),
                radiusZ: num(record, "radius-z", JAVA_DOUBLE_MAX),
                minY,
                maxY,
            };
        case "polygon": {
            const raw = record["shape"];
            const points: Point[] = Array.isArray(raw)
                ? raw
                      .filter(
                          (entry): entry is PlainRecord =>
                              typeof entry === "object" && entry !== null,
                      )
                      .map((entry) => ({ x: num(entry, "x", 0), z: num(entry, "z", 0) }))
                : [];
            return { kind: "polygon", points, minY, maxY };
        }
    }
}

/** Writes a drawable shape back into the `render-mask` field names `ConfigMaskField.vue` expects. */
export function toMaskRecord(shape: DrawableShape): Record<string, PlainValue> {
    const height = { "min-y": shape.minY, "max-y": shape.maxY };
    switch (shape.kind) {
        case "box":
            return {
                "min-x": shape.minX,
                "max-x": shape.maxX,
                "min-z": shape.minZ,
                "max-z": shape.maxZ,
                ...height,
            };
        case "circle":
            return {
                "center-x": shape.centerX,
                "center-z": shape.centerZ,
                radius: shape.radius,
                ...height,
            };
        case "ellipse":
            return {
                "center-x": shape.centerX,
                "center-z": shape.centerZ,
                "radius-x": shape.radiusX,
                "radius-z": shape.radiusZ,
                ...height,
            };
        case "polygon":
            return { shape: shape.points.map((point) => ({ x: point.x, z: point.z })), ...height };
    }
}

/* -------------------------------------------------------------------------- */
/* Cloud/Actions render parity                                                */
/* -------------------------------------------------------------------------- */

/**
 * The name is retained for the drawing surface's existing contract. Every schema-valid
 * shape now survives the cloud/Actions path exactly, including subtractive layers; the CLI
 * ports BlueMap's concrete MaskConfig constructors rather than special-casing a box.
 */
export interface SingleShapeCloudFidelity {
    /** Always true for a schema-valid shape. */
    readonly honored: boolean;
    /** Named, not guessed. `null` exactly when `honored` is `true`. */
    readonly unsupportedReason: string | null;
}

export function cloudFidelityForSingleShape(
    _kind: ShapeKind,
    _subtract: boolean,
): SingleShapeCloudFidelity {
    return { honored: true, unsupportedReason: null };
}

/**
 * Whether the **whole** render-mask list reaches the cloud/Actions path exactly. The UI cannot
 * import the Electron main-process fidelity service or the CLI, so this small boundary contract
 * is tested against the same empty, multi-layer, subtractive, and recursive-shape cases.
 */
export interface MaskListCloudFidelity {
    /** Always true for a schema-valid render-mask list. */
    readonly honored: boolean;
    /** Named, not guessed. `null` exactly when `honored` is `true`. */
    readonly unsupportedReason: string | null;
}

export function cloudFidelityForMask(_masks: readonly MaskConfig[]): MaskListCloudFidelity {
    return { honored: true, unsupportedReason: null };
}

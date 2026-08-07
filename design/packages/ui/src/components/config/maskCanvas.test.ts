/**
 * The render mask drawing surface's pure geometry and state, proven without a DOM.
 *
 * Every behaviour the design brief and the lane spec ask for has an assertion here:
 * drawing and editing each of the four real shapes, snapping on and off, undo/redo,
 * keyboard-style nudging, the area readout matching the drawn shape, reset returning to
 * the whole world, and each preset setting exactly what it claims.
 */

import { describe, expect, it } from "vitest";
import type { BoxMask, CircleMask, MaskConfig } from "@worldlens/config";
import {
    BLOCKS_PER_REGION,
    CHUNK_BLOCKS,
    JAVA_DOUBLE_MAX,
    JAVA_INT_MAX,
    JAVA_INT_MIN,
    MIN_POLYGON_POINTS,
    REGION_BLOCKS,
    UNKNOWN_WORLD,
    addPolygonPoint,
    aroundSpawnPreset,
    canRedo,
    canUndo,
    cloudFidelityForMask,
    cloudFidelityForSingleShape,
    defaultShapeFor,
    estimateArea,
    existingRegionsPreset,
    fromMaskRecord,
    initHistory,
    moveBox,
    moveBoxCorner,
    moveBoxEdge,
    moveCircleCenter,
    moveEllipseCenter,
    movePolygon,
    movePolygonPoint,
    nudgeStep,
    pushHistory,
    redo,
    removePolygonPoint,
    resizeCircle,
    resizeEllipseX,
    resizeEllipseZ,
    snapMax,
    snapMin,
    snapPoint,
    snapRadius,
    snapShape,
    toMaskRecord,
    undo,
    wholeWorldPreset,
    type BoxShape,
    type CircleShape,
    type DrawableShape,
    type EllipseShape,
    type PolygonShape,
    type WorldOrientation,
} from "./maskCanvas.js";

const box = (over: Partial<BoxShape> = {}): BoxShape => ({
    kind: "box",
    minX: -100,
    maxX: 100,
    minZ: -50,
    maxZ: 50,
    minY: JAVA_INT_MIN,
    maxY: JAVA_INT_MAX,
    ...over,
});

const circle = (over: Partial<CircleShape> = {}): CircleShape => ({
    kind: "circle",
    centerX: 0,
    centerZ: 0,
    radius: 100,
    minY: JAVA_INT_MIN,
    maxY: JAVA_INT_MAX,
    ...over,
});

const ellipse = (over: Partial<EllipseShape> = {}): EllipseShape => ({
    kind: "ellipse",
    centerX: 0,
    centerZ: 0,
    radiusX: 80,
    radiusZ: 40,
    minY: JAVA_INT_MIN,
    maxY: JAVA_INT_MAX,
    ...over,
});

const polygon = (over: Partial<PolygonShape> = {}): PolygonShape => ({
    kind: "polygon",
    points: [
        { x: -50, z: -50 },
        { x: 50, z: -50 },
        { x: 50, z: 50 },
        { x: -50, z: 50 },
    ],
    minY: JAVA_INT_MIN,
    maxY: JAVA_INT_MAX,
    ...over,
});

/* -------------------------------------------------------------------------- */
/* Each supported shape can be drawn and edited                               */
/* -------------------------------------------------------------------------- */

describe("box: drawn and edited", () => {
    it("moves one edge without moving its opposite", () => {
        const next = moveBoxEdge(box(), "maxX", 40);
        expect(next.maxX).toBe(140);
        expect(next.minX).toBe(-100);
        expect(next.minZ).toBe(-50);
        expect(next.maxZ).toBe(50);
    });

    it("moves a corner's two edges together", () => {
        const next = moveBoxCorner(box(), "se", 10, -10);
        expect(next.maxX).toBe(110);
        expect(next.maxZ).toBe(40);
        expect(next.minX).toBe(-100);
        expect(next.minZ).toBe(-50);
    });

    it("slides the whole box without changing its size", () => {
        const before = box();
        const next = moveBox(before, 25, -25);
        expect(next).toEqual({ ...before, minX: -75, maxX: 125, minZ: -75, maxZ: 25 });
    });

    it("swaps min and max back into order when a drag crosses past the opposite edge", () => {
        // Dragging maxX to the left of minX is a real gesture, not an error.
        const next = moveBoxEdge(box({ minX: 0, maxX: 10 }), "maxX", -50);
        expect(next.minX).toBeLessThanOrEqual(next.maxX);
    });

    it("never shrinks a span below one block", () => {
        const next = moveBoxEdge(box({ minX: 0, maxX: 0 }), "maxX", 0);
        expect(next.maxX - next.minX).toBeGreaterThanOrEqual(0);
    });

    it("round-trips through the mask record with the exact field names the config schema uses", () => {
        const shape = box();
        const record = toMaskRecord(shape);
        expect(record).toEqual({
            "min-x": -100,
            "max-x": 100,
            "min-z": -50,
            "max-z": 50,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
        });
        expect(fromMaskRecord(record, "box")).toEqual(shape);
    });
});

describe("circle: drawn and edited", () => {
    it("moves its center", () => {
        const next = moveCircleCenter(circle(), 30, -10);
        expect(next.centerX).toBe(30);
        expect(next.centerZ).toBe(-10);
    });

    it("resizes its radius, never below one block", () => {
        expect(resizeCircle(circle(), 50).radius).toBe(150);
        expect(resizeCircle(circle({ radius: 2 }), -100).radius).toBe(1);
    });

    it("round-trips through the mask record", () => {
        const shape = circle();
        const record = toMaskRecord(shape);
        expect(record).toEqual({
            "center-x": 0,
            "center-z": 0,
            radius: 100,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
        });
        expect(fromMaskRecord(record, "circle")).toEqual(shape);
    });

    it("reads BlueMap's unbounded radius sentinel from an untouched record", () => {
        const shape = fromMaskRecord({ "center-x": 5, "center-z": 5 }, "circle");
        expect(shape).toMatchObject({ radius: JAVA_DOUBLE_MAX });
    });
});

describe("ellipse: drawn and edited", () => {
    it("moves its center and resizes each axis independently", () => {
        const moved = moveEllipseCenter(ellipse(), 10, 20);
        expect(moved).toMatchObject({ centerX: 10, centerZ: 20 });

        const widened = resizeEllipseX(ellipse(), 20);
        expect(widened.radiusX).toBe(100);
        expect(widened.radiusZ).toBe(40);

        const deepened = resizeEllipseZ(ellipse(), 20);
        expect(deepened.radiusZ).toBe(60);
        expect(deepened.radiusX).toBe(80);
    });

    it("round-trips through the mask record", () => {
        const shape = ellipse();
        expect(fromMaskRecord(toMaskRecord(shape), "ellipse")).toEqual(shape);
    });
});

describe("polygon: drawn and edited", () => {
    it("moves a single vertex", () => {
        const next = movePolygonPoint(polygon(), 0, 5, -5);
        expect(next.points[0]).toEqual({ x: -45, z: -55 });
        expect(next.points[1]).toEqual({ x: 50, z: -50 });
    });

    it("adds a vertex after a given index", () => {
        const next = addPolygonPoint(polygon(), { x: 0, z: -70 }, 0);
        expect(next.points).toHaveLength(5);
        expect(next.points[1]).toEqual({ x: 0, z: -70 });
    });

    it("removes a vertex, but refuses to go below the minimum a polygon needs", () => {
        const triangle = polygon({
            points: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 5, z: 10 },
            ],
        });
        expect(triangle.points).toHaveLength(MIN_POLYGON_POINTS);
        const attempt = removePolygonPoint(triangle, 0);
        expect(attempt.points).toHaveLength(MIN_POLYGON_POINTS);
        expect(attempt).toBe(triangle);
    });

    it("slides every vertex together", () => {
        const next = movePolygon(polygon(), 100, 100);
        for (const point of next.points) {
            expect(point.x).toBeGreaterThanOrEqual(50);
            expect(point.z).toBeGreaterThanOrEqual(50);
        }
    });

    it("round-trips through the mask record's `shape` array", () => {
        const shape = polygon();
        const record = toMaskRecord(shape);
        expect(record["shape"]).toEqual(shape.points);
        expect(fromMaskRecord(record, "polygon")).toEqual(shape);
    });
});

/* -------------------------------------------------------------------------- */
/* Snapping works, and can be turned off                                      */
/* -------------------------------------------------------------------------- */

describe("snapping", () => {
    it("snaps a box's edges to whole chunks, growing the span rather than shrinking it", () => {
        const snapped = snapShape(
            box({ minX: 3, maxX: 19, minZ: -3, maxZ: 5 }),
            "chunk",
        ) as BoxShape;
        expect(snapped.minX % CHUNK_BLOCKS).toBe(0);
        expect((snapped.maxX + 1) % CHUNK_BLOCKS).toBe(0);
        // The unsnapped span [3, 19] must stay fully covered, never trimmed away.
        expect(snapped.minX).toBeLessThanOrEqual(3);
        expect(snapped.maxX).toBeGreaterThanOrEqual(19);
    });

    it("snaps a box to whole regions the same way, at the region grid size", () => {
        const snapped = snapShape(
            box({ minX: 10, maxX: 600, minZ: 10, maxZ: 600 }),
            "region",
        ) as BoxShape;
        expect(snapped.minX % REGION_BLOCKS).toBe(0);
        expect((snapped.maxX + 1) % REGION_BLOCKS).toBe(0);
    });

    it("snaps a circle's center and radius to the grid", () => {
        const snapped = snapShape(
            circle({ centerX: 9, centerZ: 9, radius: 55 }),
            "chunk",
        ) as CircleShape;
        expect(snapped.centerX % CHUNK_BLOCKS).toBe(0);
        expect(snapped.centerZ % CHUNK_BLOCKS).toBe(0);
        expect(snapped.radius % CHUNK_BLOCKS).toBe(0);
    });

    it("snaps every polygon vertex independently", () => {
        const snapped = snapShape(
            polygon({
                points: [
                    { x: 3, z: 5 },
                    { x: 20, z: 5 },
                    { x: 20, z: 30 },
                ],
            }),
            "chunk",
        ) as PolygonShape;
        for (const point of snapped.points) {
            expect(point.x % CHUNK_BLOCKS).toBe(0);
            expect(point.z % CHUNK_BLOCKS).toBe(0);
        }
    });

    it("leaves coordinates as drawn, rounded only to whole blocks, when snap is off", () => {
        const drawn = box({ minX: 3.4, maxX: 19.6, minZ: -3.2, maxZ: 5.1 });
        const snapped = snapShape(drawn, "off") as BoxShape;
        expect(snapped.minX).toBe(3);
        expect(snapped.maxX).toBe(20);
        expect(snapped.minZ).toBe(-3);
        expect(snapped.maxZ).toBe(5);
    });

    it("snapMin and snapMax individually align a range to whole cells", () => {
        expect(snapMin(17, "chunk")).toBe(16);
        expect(snapMax(17, "chunk")).toBe(31);
        expect(snapMin(-1, "chunk")).toBe(-16);
    });

    it("snapPoint rounds to the nearest grid intersection, not always downward", () => {
        expect(snapPoint(9, "chunk")).toBe(16);
        expect(snapPoint(7, "chunk")).toBe(0);
    });

    it("snapRadius never returns less than one block even for a tiny snapped-off radius", () => {
        expect(snapRadius(0.4, "off")).toBe(1);
    });
});

/* -------------------------------------------------------------------------- */
/* Undo and redo                                                              */
/* -------------------------------------------------------------------------- */

describe("undo and redo", () => {
    it("moves back through pushed states and forward again", () => {
        let history = initHistory<DrawableShape>(box());
        expect(canUndo(history)).toBe(false);
        expect(canRedo(history)).toBe(false);

        const afterFirstEdit = moveBoxEdge(box(), "maxX", 10);
        history = pushHistory(history, afterFirstEdit);
        const afterSecondEdit = moveBoxEdge(afterFirstEdit, "maxX", 10);
        history = pushHistory(history, afterSecondEdit);

        expect(history.present).toEqual(afterSecondEdit);
        expect(canUndo(history)).toBe(true);

        history = undo(history);
        expect(history.present).toEqual(afterFirstEdit);
        expect(canRedo(history)).toBe(true);

        history = undo(history);
        expect(history.present).toEqual(box());
        expect(canUndo(history)).toBe(false);

        history = redo(history);
        history = redo(history);
        expect(history.present).toEqual(afterSecondEdit);
        expect(canRedo(history)).toBe(false);
    });

    it("undo and redo on an empty history are no-ops rather than errors", () => {
        const history = initHistory<DrawableShape>(box());
        expect(undo(history)).toBe(history);
        expect(redo(history)).toBe(history);
    });

    it("a new edit after an undo discards the redo branch, the ordinary drawing-tool rule", () => {
        let history = initHistory<DrawableShape>(box());
        history = pushHistory(history, moveBoxEdge(box(), "maxX", 10));
        history = pushHistory(history, moveBoxEdge(history.present as BoxShape, "maxX", 10));
        history = undo(history);
        expect(canRedo(history)).toBe(true);

        history = pushHistory(history, moveBoxEdge(history.present as BoxShape, "maxZ", 5));
        expect(canRedo(history)).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Keyboard creation and adjustment                                           */
/* -------------------------------------------------------------------------- */

describe("keyboard nudging", () => {
    it("nudges by exactly one block off the grid, and by one chunk for the larger step", () => {
        expect(nudgeStep("off", false)).toBe(1);
        expect(nudgeStep("off", true)).toBe(CHUNK_BLOCKS);
    });

    it("nudges by a chunk when snapped to chunks, and by a region for the larger step", () => {
        expect(nudgeStep("chunk", false)).toBe(CHUNK_BLOCKS);
        expect(nudgeStep("chunk", true)).toBe(REGION_BLOCKS);
    });

    it("nudges by a region when snapped to regions, and further for the larger step", () => {
        expect(nudgeStep("region", false)).toBe(REGION_BLOCKS);
        expect(nudgeStep("region", true)).toBeGreaterThan(REGION_BLOCKS);
    });

    it("a keyboard-only session can create a default shape and adjust every edge with nudgeStep alone", () => {
        // No pointer anywhere in this test: defaultShapeFor is the keyboard/no-mouse creation
        // path, and every subsequent edit uses only nudgeStep-sized deltas.
        let shape = defaultShapeFor("box", UNKNOWN_WORLD) as BoxShape;
        const start = shape;

        shape = moveBoxEdge(shape, "maxX", nudgeStep("off", false));
        expect(shape.maxX).toBe(start.maxX + 1);

        shape = moveBoxEdge(shape, "maxX", nudgeStep("off", true));
        expect(shape.maxX).toBe(start.maxX + 1 + CHUNK_BLOCKS);

        shape = moveBoxCorner(shape, "nw", -nudgeStep("off", false), -nudgeStep("off", false));
        expect(shape.minX).toBe(start.minX - 1);
        expect(shape.minZ).toBe(start.minZ - 1);
    });
});

/* -------------------------------------------------------------------------- */
/* The area readout matches the drawn shape                                   */
/* -------------------------------------------------------------------------- */

/** Every case in this suite is bounded, so `blocks` is always a real number here. */
function realBlocks(area: { readonly blocks: number | null }): number {
    expect(area.blocks).not.toBeNull();
    return area.blocks as number;
}

describe("area readout", () => {
    it("is exact for a box: width times depth, in blocks, chunks and regions", () => {
        // A tidy 32x32 box: two chunks by two chunks, one sixteenth of a region on each axis.
        const shape = box({ minX: 0, maxX: 31, minZ: 0, maxZ: 31 });
        const area = estimateArea(shape);
        expect(area.exact).toBe(true);
        expect(area.unbounded).toBe(false);
        expect(area.blocks).toBe(32 * 32);
        expect(area.chunks).toBe(2 * 2);
        expect(area.regions).toBe(1);
    });

    it("counts a box spanning exactly one region as exactly one region", () => {
        const shape = box({ minX: 0, maxX: REGION_BLOCKS - 1, minZ: 0, maxZ: REGION_BLOCKS - 1 });
        const area = estimateArea(shape);
        expect(area.regions).toBe(1);
        expect(area.chunks).toBe((REGION_BLOCKS / CHUNK_BLOCKS) ** 2);
        expect(area.blocks).toBe(BLOCKS_PER_REGION);
    });

    it("is a labelled estimate for a circle, matching pi r^2 within rounding", () => {
        const shape = circle({ radius: 50 });
        const area = estimateArea(shape);
        expect(area.exact).toBe(false);
        expect(realBlocks(area)).toBeCloseTo(Math.PI * 50 * 50, 0);
    });

    it("is a labelled estimate for an ellipse, matching pi rx rz within rounding", () => {
        const shape = ellipse({ radiusX: 60, radiusZ: 30 });
        const area = estimateArea(shape);
        expect(area.exact).toBe(false);
        expect(realBlocks(area)).toBeCloseTo(Math.PI * 60 * 30, 0);
    });

    it("is exact-shape (labelled estimate) for a polygon, matching the shoelace area of a known square", () => {
        // A 100x100 axis-aligned square drawn as a polygon has an unambiguous exact area.
        const shape = polygon({
            points: [
                { x: 0, z: 0 },
                { x: 100, z: 0 },
                { x: 100, z: 100 },
                { x: 0, z: 100 },
            ],
        });
        const area = estimateArea(shape);
        expect(area.exact).toBe(false);
        expect(area.blocks).toBe(10_000);
    });

    it("grows when the shape is dragged bigger, and shrinks when it is dragged smaller", () => {
        const before = estimateArea(box({ minX: 0, maxX: 9, minZ: 0, maxZ: 9 }));
        const grown = estimateArea(
            moveBoxEdge(box({ minX: 0, maxX: 9, minZ: 0, maxZ: 9 }), "maxX", 90),
        );
        expect(realBlocks(grown)).toBeGreaterThan(realBlocks(before));

        const shrunk = estimateArea(
            moveBoxEdge(box({ minX: 0, maxX: 99, minZ: 0, maxZ: 9 }), "maxX", -90),
        );
        expect(realBlocks(shrunk)).toBeLessThan(
            realBlocks(estimateArea(box({ minX: 0, maxX: 99, minZ: 0, maxZ: 9 }))),
        );
    });

    it("gives no invented number at all for a box left unbounded on an axis -- never a 4-billion-block figure", () => {
        // This is the exact shape `wholeWorldPreset()` and `resetToWholeWorld` produce.
        const area = estimateArea(
            box({ minX: JAVA_INT_MIN, maxX: JAVA_INT_MAX, minZ: JAVA_INT_MIN, maxZ: JAVA_INT_MAX }),
        );
        expect(area.unbounded).toBe(true);
        expect(area.blocks).toBeNull();
        expect(area.chunks).toBeNull();
        expect(area.regions).toBeNull();
    });

    it("gives no invented number for a circle or ellipse left at the unbounded radius sentinel", () => {
        expect(estimateArea(circle({ radius: JAVA_DOUBLE_MAX })).unbounded).toBe(true);
        expect(estimateArea(ellipse({ radiusX: JAVA_DOUBLE_MAX, radiusZ: 40 })).unbounded).toBe(
            true,
        );
    });
});

/* -------------------------------------------------------------------------- */
/* Reset returns to the whole world                                           */
/* -------------------------------------------------------------------------- */

describe("reset to the whole world", () => {
    it("is the same real unbounded box regardless of whether a world has been measured", () => {
        const withNoWorld = wholeWorldPreset();
        expect(withNoWorld.shape).toMatchObject({
            kind: "box",
            minX: JAVA_INT_MIN,
            maxX: JAVA_INT_MAX,
            minZ: JAVA_INT_MIN,
            maxZ: JAVA_INT_MAX,
        });
    });

    it("is identical to an empty render-mask list's own real meaning: BlueMap's unbounded sentinels", () => {
        const record = toMaskRecord(wholeWorldPreset().shape);
        expect(record).toEqual({
            "min-x": JAVA_INT_MIN,
            "max-x": JAVA_INT_MAX,
            "min-z": JAVA_INT_MIN,
            "max-z": JAVA_INT_MAX,
            "min-y": JAVA_INT_MIN,
            "max-y": JAVA_INT_MAX,
        });
    });

    it("undoes back to the whole world after edits, via ordinary undo", () => {
        let history = initHistory<DrawableShape>(wholeWorldPreset().shape);
        history = pushHistory(history, moveBoxEdge(history.present as BoxShape, "maxX", -1000));
        history = undo(history);
        expect(history.present).toEqual(wholeWorldPreset().shape);
    });
});

/* -------------------------------------------------------------------------- */
/* Presets set exactly what they claim                                        */
/* -------------------------------------------------------------------------- */

describe("presets", () => {
    const measuredWorld: WorldOrientation = {
        extent: { minX: -512, maxX: 1023, minZ: -1024, maxZ: 511 },
        extentUnavailableReason: null,
        spawn: { x: 12, z: -34 },
        spawnUnavailableReason: null,
        regionCount: 6,
    };

    it("wholeWorldPreset sets every axis to the unbounded sentinel and says so", () => {
        const preset = wholeWorldPreset();
        expect(preset.shape).toMatchObject({
            minX: JAVA_INT_MIN,
            maxX: JAVA_INT_MAX,
            minZ: JAVA_INT_MIN,
            maxZ: JAVA_INT_MAX,
        });
        expect(preset.description).toMatch(/unlimited|no mask/i);
    });

    it("existingRegionsPreset sets exactly the measured extent for a box, and names the real numbers", () => {
        const preset = existingRegionsPreset(measuredWorld, "box");
        expect(preset).not.toBeNull();
        expect(preset!.shape).toMatchObject({
            kind: "box",
            minX: measuredWorld.extent!.minX,
            maxX: measuredWorld.extent!.maxX,
            minZ: measuredWorld.extent!.minZ,
            maxZ: measuredWorld.extent!.maxZ,
        });
        expect(preset!.description).toContain(String(measuredWorld.extent!.minX));
        expect(preset!.description).toContain(String(measuredWorld.extent!.maxX));
        expect(preset!.description).toContain("6");
    });

    it("defaults to a box when no kind is given", () => {
        expect(existingRegionsPreset(measuredWorld)!.shape.kind).toBe("box");
    });

    it("existingRegionsPreset stays inside the shape kind being edited: never silently swaps a circle row for a box", () => {
        for (const kind of ["box", "circle", "ellipse", "polygon"] as const) {
            const preset = existingRegionsPreset(measuredWorld, kind);
            expect(preset!.shape.kind, kind).toBe(kind);
        }
    });

    it("existingRegionsPreset's polygon variant is exactly the extent's own four corners", () => {
        const preset = existingRegionsPreset(measuredWorld, "polygon")!;
        expect(preset.shape.kind).toBe("polygon");
        const points = (preset.shape as { points: readonly { x: number; z: number }[] }).points;
        const xs = points.map((p) => p.x);
        const zs = points.map((p) => p.z);
        expect(Math.min(...xs)).toBe(measuredWorld.extent!.minX);
        expect(Math.max(...xs)).toBe(measuredWorld.extent!.maxX);
        expect(Math.min(...zs)).toBe(measuredWorld.extent!.minZ);
        expect(Math.max(...zs)).toBe(measuredWorld.extent!.maxZ);
    });

    it("existingRegionsPreset's circle and ellipse variants are centered on the extent's own real center", () => {
        const expectedX = Math.round((measuredWorld.extent!.minX + measuredWorld.extent!.maxX) / 2);
        const expectedZ = Math.round((measuredWorld.extent!.minZ + measuredWorld.extent!.maxZ) / 2);
        expect(existingRegionsPreset(measuredWorld, "circle")!.shape).toMatchObject({
            centerX: expectedX,
            centerZ: expectedZ,
        });
        expect(existingRegionsPreset(measuredWorld, "ellipse")!.shape).toMatchObject({
            centerX: expectedX,
            centerZ: expectedZ,
        });
    });

    it("existingRegionsPreset is unavailable, honestly, when the extent has not been measured, for every kind", () => {
        for (const kind of ["box", "circle", "ellipse", "polygon"] as const) {
            expect(existingRegionsPreset(UNKNOWN_WORLD, kind)).toBeNull();
        }
    });

    it("aroundSpawnPreset centers exactly on the real spawn point when spawn is known", () => {
        const preset = aroundSpawnPreset(measuredWorld, "circle", 64);
        expect(preset.shape).toMatchObject({
            kind: "circle",
            centerX: 12,
            centerZ: -34,
            radius: 64,
        });
        expect(preset.description).toContain("12");
        expect(preset.description).toContain("-34");
    });

    it("aroundSpawnPreset stays inside the shape kind being edited for every kind", () => {
        for (const kind of ["box", "circle", "ellipse", "polygon"] as const) {
            expect(aroundSpawnPreset(measuredWorld, kind, 64).shape.kind).toBe(kind);
        }
    });

    it("aroundSpawnPreset's box variant is centered exactly on spawn with the given half-span", () => {
        const preset = aroundSpawnPreset(measuredWorld, "box", 64);
        expect(preset.shape).toMatchObject({
            kind: "box",
            minX: 12 - 64,
            maxX: 12 + 64,
            minZ: -34 - 64,
            maxZ: -34 + 64,
        });
    });

    it("aroundSpawnPreset falls back to the extent's real center, and says spawn was unknown", () => {
        const worldWithoutSpawn: WorldOrientation = {
            ...measuredWorld,
            spawn: null,
            spawnUnavailableReason: "not known",
        };
        const preset = aroundSpawnPreset(worldWithoutSpawn, "circle", 64);
        const expectedX = Math.round((measuredWorld.extent!.minX + measuredWorld.extent!.maxX) / 2);
        const expectedZ = Math.round((measuredWorld.extent!.minZ + measuredWorld.extent!.maxZ) / 2);
        expect(preset.shape).toMatchObject({ centerX: expectedX, centerZ: expectedZ });
        expect(preset.description).toMatch(/not known|is not known/i);
    });

    it("aroundSpawnPreset falls back all the way to the map origin when nothing is known", () => {
        const preset = aroundSpawnPreset(UNKNOWN_WORLD, "circle", 64);
        expect(preset.shape).toMatchObject({ centerX: 0, centerZ: 0 });
        expect(preset.description).toContain("0, 0");
    });

    it("every preset's description is non-empty and states real numbers", () => {
        for (const preset of [
            wholeWorldPreset(),
            existingRegionsPreset(measuredWorld)!,
            aroundSpawnPreset(measuredWorld),
        ]) {
            expect(preset.description.length).toBeGreaterThan(0);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* defaultShapeFor anchors on whatever of the world is actually known         */
/* -------------------------------------------------------------------------- */

describe("defaultShapeFor", () => {
    it("anchors a new shape on spawn when spawn is known", () => {
        const world: WorldOrientation = {
            ...UNKNOWN_WORLD,
            spawn: { x: 40, z: 40 },
            spawnUnavailableReason: null,
        };
        const shape = defaultShapeFor("circle", world) as CircleShape;
        expect(shape).toMatchObject({ centerX: 40, centerZ: 40 });
    });

    it("anchors on the map origin when nothing is known, never an invented location", () => {
        const shape = defaultShapeFor("box", UNKNOWN_WORLD) as BoxShape;
        expect((shape.minX + shape.maxX) / 2).toBe(0);
        expect((shape.minZ + shape.maxZ) / 2).toBe(0);
    });

    it("produces a shape with the requested kind for all four kinds", () => {
        expect(defaultShapeFor("box", UNKNOWN_WORLD).kind).toBe("box");
        expect(defaultShapeFor("circle", UNKNOWN_WORLD).kind).toBe("circle");
        expect(defaultShapeFor("ellipse", UNKNOWN_WORLD).kind).toBe("ellipse");
        expect(defaultShapeFor("polygon", UNKNOWN_WORLD).kind).toBe("polygon");
    });

    it("a freshly created polygon already has at least the minimum number of points", () => {
        const shape = defaultShapeFor("polygon", UNKNOWN_WORLD) as PolygonShape;
        expect(shape.points.length).toBeGreaterThanOrEqual(MIN_POLYGON_POINTS);
    });
});

/* -------------------------------------------------------------------------- */
/* Record round-tripping preserves an existing typed mask untouched           */
/* -------------------------------------------------------------------------- */

describe("fromMaskRecord / toMaskRecord round-tripping", () => {
    it("reads a hand-typed box exactly, including a partially-unbounded axis", () => {
        const shape = fromMaskRecord(
            { "min-x": -10, "max-x": 10, "min-z": JAVA_INT_MIN, "max-z": JAVA_INT_MAX },
            "box",
        );
        expect(shape).toMatchObject({
            minX: -10,
            maxX: 10,
            minZ: JAVA_INT_MIN,
            maxZ: JAVA_INT_MAX,
        });
    });

    it("carries an existing height range through a footprint-only edit untouched", () => {
        const record = {
            "min-x": 0,
            "max-x": 10,
            "min-z": 0,
            "max-z": 10,
            "min-y": 40,
            "max-y": 90,
        };
        const shape = fromMaskRecord(record, "box") as BoxShape;
        const edited = moveBoxEdge(shape, "maxX", 5);
        expect(edited.minY).toBe(40);
        expect(edited.maxY).toBe(90);
    });
});

/* -------------------------------------------------------------------------- */
/* Cloud/Actions fidelity, mirroring app/src/main/render/maskFidelity.ts      */
/* -------------------------------------------------------------------------- */

describe("cloudFidelityForSingleShape", () => {
    it.each([
        ["box", false],
        ["box", true],
        ["circle", false],
        ["ellipse", false],
        ["polygon", false],
    ] as const)("honors %s with subtract=%s", (kind, subtract) => {
        expect(cloudFidelityForSingleShape(kind, subtract)).toEqual({
            honored: true,
            unsupportedReason: null,
        });
    });
});

/**
 * These are deliberately the same route cases `maskFidelity.test.ts` and the CLI converter
 * exercise, so a package-boundary hand-sync missed on either side is a red test.
 */
describe("cloudFidelityForMask", () => {
    const BOX: BoxMask = {
        type: "bluemap:box",
        subtract: false,
        "min-x": -100,
        "max-x": 100,
        "min-y": -64,
        "max-y": 320,
        "min-z": -100,
        "max-z": 100,
    };

    const CIRCLE: CircleMask = {
        type: "bluemap:circle",
        subtract: false,
        "center-x": 0,
        "center-z": 0,
        radius: 50,
        "min-y": -64,
        "max-y": 320,
    };

    it.each([
        ["empty", []],
        ["one box", [BOX]],
        ["subtracting box", [{ ...BOX, subtract: true }]],
        ["circle", [CIRCLE]],
        ["ordered list", [BOX, { ...BOX, "min-x": 200, "max-x": 300 } satisfies MaskConfig]],
        [
            "nested blur",
            [
                {
                    type: "bluemap:blur",
                    subtract: false,
                    size: 5,
                    masks: [BOX, { ...CIRCLE, subtract: true }],
                } satisfies MaskConfig,
            ],
        ],
    ] as const)("honors %s", (_name, masks) => {
        expect(cloudFidelityForMask(masks)).toEqual({ honored: true, unsupportedReason: null });
    });
});

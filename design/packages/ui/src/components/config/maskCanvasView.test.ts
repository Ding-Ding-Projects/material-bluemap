import { describe, expect, it } from "vitest";
import { fitView, panView, pixelDeltaToWorld, pointerToWorld, worldToPixel, zoomView, type PixelRect, type ViewState } from "./maskCanvasView.js";

const rect: PixelRect = { left: 100, top: 50, width: 400, height: 300 };
const view: ViewState = { centerX: 0, centerZ: 0, blocksPerPixel: 2 };

describe("pointerToWorld / worldToPixel", () => {
    it("maps the rect's own center to the view's center", () => {
        const point = pointerToWorld(100 + 200, 50 + 150, rect, view);
        expect(point).toEqual({ x: 0, z: 0 });
    });

    it("maps a pixel offset to a world offset scaled by blocksPerPixel", () => {
        const point = pointerToWorld(100 + 200 + 50, 50 + 150 + 25, rect, view);
        expect(point).toEqual({ x: 100, z: 50 });
    });

    it("is the exact inverse of worldToPixel", () => {
        const world = { x: 37, z: -84 };
        const pixel = worldToPixel(world, rect, view);
        const back = pointerToWorld(rect.left + pixel.x, rect.top + pixel.y, rect, view);
        expect(back.x).toBeCloseTo(world.x);
        expect(back.z).toBeCloseTo(world.z);
    });
});

describe("pixelDeltaToWorld", () => {
    it("scales a movementX/Y-style delta by the current zoom", () => {
        expect(pixelDeltaToWorld(10, -5, view)).toEqual({ x: 20, z: -10 });
    });
});

describe("zoomView", () => {
    it("zooms in with a factor below one and out with a factor above one", () => {
        expect(zoomView(view, 0.5).blocksPerPixel).toBeCloseTo(1);
        expect(zoomView(view, 2).blocksPerPixel).toBeCloseTo(4);
    });

    it("never zooms in or out past the clamped bounds", () => {
        expect(zoomView(view, 0.0000001).blocksPerPixel).toBeGreaterThan(0);
        expect(zoomView(view, 1_000_000).blocksPerPixel).toBeLessThan(Infinity);
    });
});

describe("panView", () => {
    it("moves the view center by a pixel delta at the current zoom", () => {
        const panned = panView(view, 10, 10);
        expect(panned.centerX).toBe(20);
        expect(panned.centerZ).toBe(20);
        expect(panned.blocksPerPixel).toBe(view.blocksPerPixel);
    });
});

describe("fitView", () => {
    it("centers on the bounding box's own center", () => {
        const fitted = fitView({ minX: -100, maxX: 300, minZ: 0, maxZ: 200 }, rect);
        expect(fitted.centerX).toBe(100);
        expect(fitted.centerZ).toBe(100);
    });

    it("chooses a scale that fits the whole box inside the rect, with room to spare", () => {
        const bounds = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };
        const fitted = fitView(bounds, rect);
        const pixelSpanX = (bounds.maxX - bounds.minX) / fitted.blocksPerPixel;
        expect(pixelSpanX).toBeLessThanOrEqual(rect.width);
    });

    it("never fails on a single-point box (a fresh shape with no span yet)", () => {
        const fitted = fitView({ minX: 5, maxX: 5, minZ: 5, maxZ: 5 }, rect);
        expect(Number.isFinite(fitted.blocksPerPixel)).toBe(true);
        expect(fitted.blocksPerPixel).toBeGreaterThan(0);
    });
});

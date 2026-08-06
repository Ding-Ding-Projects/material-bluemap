/**
 * Screen-pixel math for {@link MaskDrawingCanvas.vue}, kept apart from `maskCanvas.ts`.
 *
 * `maskCanvas.ts` is entirely about world coordinates: a shape, a drag delta, a snap
 * grid, none of it caring where on screen anything is drawn. This file is the one place
 * that translates between a pointer's pixel position and a world position, and it is kept
 * as small, pure functions of a `rect` and a `view` passed in -- never reading
 * `getBoundingClientRect()` itself -- so the mapping is exactly as testable as the rest of
 * the canvas, with a fake rectangle standing in for a real one.
 */

import type { Point } from "./maskCanvas.js";

/** Where the world is centred, and how many blocks one screen pixel covers. */
export interface ViewState {
    readonly centerX: number;
    readonly centerZ: number;
    /** Blocks per CSS pixel. Smaller is more zoomed in; this is clamped away from zero. */
    readonly blocksPerPixel: number;
}

/** The subset of `DOMRect` this needs, so a test can supply one without a live layout. */
export interface PixelRect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export const MIN_BLOCKS_PER_PIXEL = 0.05;
export const MAX_BLOCKS_PER_PIXEL = 512;

function clampScale(value: number): number {
    return Math.min(MAX_BLOCKS_PER_PIXEL, Math.max(MIN_BLOCKS_PER_PIXEL, value));
}

/** A pointer's `clientX`/`clientY`, translated into world X/Z. */
export function pointerToWorld(clientX: number, clientY: number, rect: PixelRect, view: ViewState): Point {
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    return { x: view.centerX + px * view.blocksPerPixel, z: view.centerZ + py * view.blocksPerPixel };
}

/** The inverse: a world point's position in CSS pixels, relative to the rect's own corner. */
export function worldToPixel(point: Point, rect: PixelRect, view: ViewState): { readonly x: number; readonly y: number } {
    return {
        x: rect.width / 2 + (point.x - view.centerX) / view.blocksPerPixel,
        y: rect.height / 2 + (point.z - view.centerZ) / view.blocksPerPixel,
    };
}

/** A pixel *delta* (e.g. `event.movementX/Y`) converted to a world delta, at the current zoom. */
export function pixelDeltaToWorld(dxPixels: number, dyPixels: number, view: ViewState): Point {
    return { x: dxPixels * view.blocksPerPixel, z: dyPixels * view.blocksPerPixel };
}

/** Zooms about the view's own center by a multiplicative factor (`<1` zooms in, `>1` zooms out). */
export function zoomView(view: ViewState, factor: number): ViewState {
    return { ...view, blocksPerPixel: clampScale(view.blocksPerPixel * factor) };
}

/** Pans the view by a pixel delta, at the current zoom. */
export function panView(view: ViewState, dxPixels: number, dyPixels: number): ViewState {
    const delta = pixelDeltaToWorld(dxPixels, dyPixels, view);
    return { ...view, centerX: view.centerX + delta.x, centerZ: view.centerZ + delta.z };
}

/** Fits a world-space bounding box into a pixel rect, with a fractional padding margin. */
export function fitView(
    bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
    rect: PixelRect,
    padding = 0.15,
): ViewState {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const scaleX = (spanX * (1 + padding)) / width;
    const scaleZ = (spanZ * (1 + padding)) / height;
    return { centerX, centerZ, blocksPerPixel: clampScale(Math.max(scaleX, scaleZ)) };
}

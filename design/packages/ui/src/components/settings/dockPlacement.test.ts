/**
 * Where a docked panel goes, and the promise it keeps while going there.
 *
 * The promise is the interesting part: a surface must never cover the control that opened
 * it. That failure is invisible in a screenshot taken on a wide display and obvious on a
 * narrow one, it is entirely arithmetic, and it is exactly what a unit test is for. The
 * rest of this file is persistence, which matters for a duller reason: a placement that
 * does not survive a restart is a preference the user has to set again every launch, and
 * one that survives a *reset* is a preference they cannot get rid of.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
    DOCK_PLACEMENTS,
    FLOATING_MARGIN,
    MINIMUM_FLOATING_SIZE,
    MINIMUM_THICKNESS,
    clearDockFloatingRects,
    clearDockPlacements,
    clearDockSizes,
    clampFloatingRect,
    clampThickness,
    dockAxis,
    dockStyle,
    floatingOffset,
    isDockPlacement,
    isDockedEdge,
    overlapArea,
    readDockFloatingRects,
    readDockPlacements,
    readDockSizes,
    resolveDockLayout,
    thicknessBounds,
    thicknessClearingOpener,
    withDockFloatingRect,
    withDockSize,
    withPlacement,
    withoutDockFloatingRect,
    withoutDockSizes,
    withoutPlacement,
    writeDockFloatingRects,
    writeDockPlacements,
    writeDockSizes,
    type DockStorage,
    type FloatingRect,
    type Rect,
} from "./dockPlacement.js";
import {
    customisedSurfaceCount,
    dockFloatingState,
    dockSizeState,
    floatingRectFor,
    hasStoredPlacement,
    placementFor,
    registerDockedSurface,
    reloadDockGeometry,
    reloadDockPlacements,
    resetAllDockPlacements,
    resetDockGeometry,
    resetDockPlacement,
    setDockFloatingRect,
    setDockPlacement,
    setDockThickness,
    thicknessFor,
    unregisterDockedSurface,
    dockedSurfaces,
} from "./useDockPlacement.js";

const VIEWPORT = { width: 1280, height: 800 };

/** A button in the top right, which is where this application's settings button is. */
const TOP_RIGHT_BUTTON: Rect = { left: 1200, top: 8, width: 40, height: 40 };

function memoryStorage(initial: Readonly<Record<string, string>> = {}): DockStorage {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
        removeItem: (key) => {
            values.delete(key);
        },
    };
}

describe("the placements themselves", () => {
    it("offers a floating panel and all four edges", () => {
        expect([...DOCK_PLACEMENTS]).toEqual(["floating", "left", "right", "top", "bottom"]);
    });

    it("recognises its own placements and nothing else", () => {
        for (const placement of DOCK_PLACEMENTS) expect(isDockPlacement(placement)).toBe(true);
        expect(isDockPlacement("centre")).toBe(false);
        expect(isDockPlacement(null)).toBe(false);
        expect(isDockedEdge("floating")).toBe(false);
        expect(isDockedEdge("bottom")).toBe(true);
        expect(dockAxis("left")).toBe("horizontal");
        expect(dockAxis("bottom")).toBe("vertical");
    });
});

/* -------------------------------------------------------------------------- */
/* Never covering the opener                                                  */
/* -------------------------------------------------------------------------- */

describe("clearing the control that opened the panel", () => {
    it("measures how much room each edge has beside the opener", () => {
        expect(thicknessClearingOpener("right", TOP_RIGHT_BUTTON, VIEWPORT)).toBe(40);
        expect(thicknessClearingOpener("left", TOP_RIGHT_BUTTON, VIEWPORT)).toBe(1200);
        expect(thicknessClearingOpener("top", TOP_RIGHT_BUTTON, VIEWPORT)).toBe(8);
        expect(thicknessClearingOpener("bottom", TOP_RIGHT_BUTTON, VIEWPORT)).toBe(752);
    });

    it("has nothing to clear when there is no opener", () => {
        expect(thicknessClearingOpener("right", null, VIEWPORT)).toBe(Number.POSITIVE_INFINITY);
    });

    it("takes its full width when the opener is nowhere near that edge", () => {
        const layout = resolveDockLayout({
            placement: "left",
            viewport: VIEWPORT,
            opener: TOP_RIGHT_BUTTON,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
        });
        expect(layout.placement).toBe("left");
        expect(layout.thickness).toBe(520);
        expect(layout.shrunkToClearOpener).toBe(false);
    });

    it("shrinks rather than overlapping when the opener is inside the panel's edge", () => {
        // A button 300px in from the right, and a panel that wants 520: it takes 300.
        const opener: Rect = { left: 940, top: 8, width: 40, height: 40 };
        const layout = resolveDockLayout({
            placement: "right",
            viewport: VIEWPORT,
            opener,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
        });
        expect(layout.placement).toBe("right");
        expect(layout.thickness).toBe(300);
        expect(layout.shrunkToClearOpener).toBe(true);
        // The panel's own left edge sits exactly at the opener's right edge, which is the
        // whole claim: touching, never overlapping.
        expect(VIEWPORT.width - layout.thickness).toBe(opener.left + opener.width);
    });

    it("falls back to floating, and says so, when the edge cannot hold a usable panel", () => {
        const layout = resolveDockLayout({
            placement: "right",
            viewport: VIEWPORT,
            opener: TOP_RIGHT_BUTTON,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
        });
        // 40px of clearance is far below the minimum; docking there would either overlap
        // the button or produce a 40px panel, and both are worse than saying so.
        expect(MINIMUM_THICKNESS).toBeGreaterThan(40);
        expect(layout.placement).toBe("floating");
        expect(layout.fellBackToFloating).toBe(true);
        // The user's choice is kept, so the chooser still shows what they picked and the
        // panel returns to that edge as soon as the window can hold it.
        expect(layout.requested).toBe("right");
    });

    it("puts a floating panel in a corner that does not touch the opener", () => {
        const offset = floatingOffset({ width: 520, height: 640 }, VIEWPORT, TOP_RIGHT_BUTTON);
        expect(
            overlapArea({ ...offset, width: 520, height: 640 }, TOP_RIGHT_BUTTON),
        ).toBe(0);
    });

    it("keeps a floating panel inside the window at every corner", () => {
        for (const opener of [
            TOP_RIGHT_BUTTON,
            { left: 0, top: 0, width: 48, height: 48 },
            { left: 0, top: 752, width: 48, height: 48 },
            { left: 1232, top: 752, width: 48, height: 48 },
        ]) {
            const offset = floatingOffset({ width: 520, height: 640 }, VIEWPORT, opener);
            expect(offset.left).toBeGreaterThanOrEqual(FLOATING_MARGIN);
            expect(offset.top).toBeGreaterThanOrEqual(FLOATING_MARGIN);
            expect(offset.left + 520).toBeLessThanOrEqual(VIEWPORT.width);
            expect(offset.top + 640).toBeLessThanOrEqual(VIEWPORT.height);
        }
    });

    it("picks the same corner every time for the same window", () => {
        const first = floatingOffset({ width: 400, height: 400 }, VIEWPORT, TOP_RIGHT_BUTTON);
        for (let run = 0; run < 5; run++) {
            expect(floatingOffset({ width: 400, height: 400 }, VIEWPORT, TOP_RIGHT_BUTTON)).toEqual(first);
        }
    });

    /*
     * The narrow window and the 200% display scale are the same case: the viewport in CSS
     * pixels is small. A panel that is wider than the window at 100% is the whole window
     * at 200%, and the cap is what keeps it from overflowing rather than fitting.
     */
    it("never asks for more than the window has, at 800x600 and at 200% scale", () => {
        for (const viewport of [
            { width: 800, height: 600 },
            { width: 640, height: 400 },
        ]) {
            for (const placement of DOCK_PLACEMENTS) {
                const layout = resolveDockLayout({
                    placement,
                    viewport,
                    opener: null,
                    preferredThickness: 520,
                    preferredSize: { width: 720, height: 720 },
                });
                if (layout.placement === "floating") {
                    expect(layout.size?.width ?? 0).toBeLessThanOrEqual(viewport.width);
                    expect(layout.size?.height ?? 0).toBeLessThanOrEqual(viewport.height);
                    continue;
                }
                const extent = dockAxis(layout.placement) === "horizontal" ? viewport.width : viewport.height;
                expect(layout.thickness).toBeLessThanOrEqual(extent);
            }
        }
    });
});

describe("the style a layout becomes", () => {
    it("pins each edge to its own side", () => {
        const base = { viewport: VIEWPORT, opener: null, preferredThickness: 400, preferredSize: { width: 400, height: 400 } };
        expect(dockStyle(resolveDockLayout({ ...base, placement: "left" }))["left"]).toBe("0");
        expect(dockStyle(resolveDockLayout({ ...base, placement: "right" }))["right"]).toBe("0");
        expect(dockStyle(resolveDockLayout({ ...base, placement: "top" }))["height"]).toBe("400px");
        expect(dockStyle(resolveDockLayout({ ...base, placement: "bottom" }))["bottom"]).toBe("0");
    });

    it("caps every placement at the window, so nothing can overflow it", () => {
        const style = dockStyle(
            resolveDockLayout({
                placement: "right",
                viewport: VIEWPORT,
                opener: null,
                preferredThickness: 400,
                preferredSize: { width: 400, height: 400 },
            }),
        );
        expect(style["max-width"]).toBe("100vw");
    });
});

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

describe("remembering a placement", () => {
    it("round-trips a record", () => {
        const storage = memoryStorage();
        writeDockPlacements({ "app-settings": "bottom", "eula-viewer": "floating" }, storage);
        expect(readDockPlacements(storage)).toEqual({ "app-settings": "bottom", "eula-viewer": "floating" });
    });

    it("drops one unknown placement rather than the whole file", () => {
        const storage = memoryStorage({
            "material-bluemap-dock-placement": JSON.stringify({
                version: 1,
                surfaces: { "app-settings": "bottom", "old-panel": "diagonal" },
            }),
        });
        expect(readDockPlacements(storage)).toEqual({ "app-settings": "bottom" });
    });

    it("refuses junk, a missing key and a future schema alike", () => {
        expect(readDockPlacements(memoryStorage())).toEqual({});
        expect(readDockPlacements(memoryStorage({ "material-bluemap-dock-placement": "{" }))).toEqual({});
        expect(
            readDockPlacements(
                memoryStorage({
                    "material-bluemap-dock-placement": JSON.stringify({ version: 99, surfaces: { a: "left" } }),
                }),
            ),
        ).toEqual({});
    });

    it("says nothing and throws nothing where storage refuses", () => {
        const hostile: DockStorage = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("full");
            },
            removeItem: () => {
                throw new Error("blocked");
            },
        };
        expect(readDockPlacements(hostile)).toEqual({});
        expect(() => writeDockPlacements({ a: "left" }, hostile)).not.toThrow();
        expect(() => clearDockPlacements(hostile)).not.toThrow();
    });

    it("sets and clears one surface without touching another", () => {
        const record = withPlacement({ a: "left" }, "b", "top");
        expect(record).toEqual({ a: "left", b: "top" });
        expect(withoutPlacement(record, "b")).toEqual({ a: "left" });
    });
});

describe("the live placement state", () => {
    beforeEach(() => {
        resetAllDockPlacements();
        reloadDockPlacements();
    });

    it("gives a surface its own default until somebody chooses", () => {
        expect(placementFor("app-settings", "right")).toBe("right");
        expect(hasStoredPlacement("app-settings")).toBe(false);
    });

    it("remembers a choice per surface", () => {
        setDockPlacement("app-settings", "bottom");
        setDockPlacement("eula-viewer", "left");

        expect(placementFor("app-settings", "right")).toBe("bottom");
        expect(placementFor("eula-viewer", "bottom")).toBe("left");
        expect(customisedSurfaceCount()).toBe(2);
    });

    it("resets one surface and leaves the other where it was put", () => {
        setDockPlacement("app-settings", "bottom");
        setDockPlacement("eula-viewer", "left");

        resetDockPlacement("app-settings");

        expect(placementFor("app-settings", "right")).toBe("right");
        expect(placementFor("eula-viewer", "bottom")).toBe("left");
        expect(customisedSurfaceCount()).toBe(1);
    });

    it("resets every surface, including ones that are not open", () => {
        setDockPlacement("app-settings", "bottom");
        setDockPlacement("a-panel-nobody-has-open", "top");

        resetAllDockPlacements();

        expect(customisedSurfaceCount()).toBe(0);
        expect(placementFor("a-panel-nobody-has-open", "right")).toBe("right");
        // And it really is gone from storage, not merely from memory: a global reset that
        // came back on the next launch would be the most annoying bug in the feature.
        reloadDockPlacements();
        expect(customisedSurfaceCount()).toBe(0);
    });

    it("lists the surfaces that exist rather than the ones that used to", () => {
        const surfaces = dockedSurfaces();
        registerDockedSurface({ id: "app-settings", label: "Settings", defaultPlacement: "right" });
        registerDockedSurface({ id: "app-settings", label: "Settings again", defaultPlacement: "left" });
        expect(surfaces.value).toHaveLength(1);

        registerDockedSurface({ id: "eula-viewer", label: "The licence", defaultPlacement: "bottom" });
        expect(surfaces.value.map((entry) => entry.id)).toEqual(["app-settings", "eula-viewer"]);

        unregisterDockedSurface("app-settings");
        unregisterDockedSurface("eula-viewer");
        expect(surfaces.value).toHaveLength(0);
    });
});

/* -------------------------------------------------------------------------- */
/* Resizing a docked edge                                                     */
/* -------------------------------------------------------------------------- */

describe("clamping a docked edge's thickness", () => {
    it("keeps a requested thickness within the window on that axis", () => {
        expect(clampThickness(2000, "right", VIEWPORT, null)).toBe(VIEWPORT.width);
        expect(clampThickness(2000, "bottom", VIEWPORT, null)).toBe(VIEWPORT.height);
    });

    it("never goes below the minimum usable thickness when the window can hold it", () => {
        expect(clampThickness(1, "right", VIEWPORT, null)).toBe(MINIMUM_THICKNESS);
    });

    it("stops short of the opener, the same as the automatic layout does", () => {
        // A button 300px in from the right: clamping to a huge request still stops there,
        // not at the window's own edge.
        const opener: Rect = { left: 940, top: 8, width: 40, height: 40 };
        expect(clampThickness(2000, "right", VIEWPORT, opener)).toBe(300);
    });

    it("reports the same bounds a resize handle would show as its min and max", () => {
        const bounds = thicknessBounds("right", VIEWPORT, null);
        expect(bounds.min).toBe(MINIMUM_THICKNESS);
        expect(bounds.max).toBe(VIEWPORT.width);
    });

    it("threads a stored thickness into the automatic layout, still clamped by the opener", () => {
        const layout = resolveDockLayout({
            placement: "right",
            viewport: VIEWPORT,
            opener: null,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
            storedThickness: 700,
        });
        expect(layout.placement).toBe("right");
        expect(layout.thickness).toBe(700);
    });

    it("ignores a stored thickness from a since-shrunk window rather than trusting it blindly", () => {
        const layout = resolveDockLayout({
            placement: "right",
            viewport: { width: 500, height: 800 },
            opener: null,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
            storedThickness: 900,
        });
        expect(layout.thickness).toBeLessThanOrEqual(500);
    });
});

/* -------------------------------------------------------------------------- */
/* Dragging or stepping a floating panel                                      */
/* -------------------------------------------------------------------------- */

describe("clamping a floating panel's rectangle", () => {
    it("keeps a panel dragged off the top-left corner fully inside the window", () => {
        const clamped = clampFloatingRect({ top: -400, left: -400, width: 400, height: 300 }, VIEWPORT);
        expect(clamped.top).toBeGreaterThanOrEqual(FLOATING_MARGIN);
        expect(clamped.left).toBeGreaterThanOrEqual(FLOATING_MARGIN);
    });

    it("keeps a panel dragged off the bottom-right corner fully inside the window", () => {
        const clamped = clampFloatingRect({ top: 5000, left: 5000, width: 400, height: 300 }, VIEWPORT);
        expect(clamped.top + clamped.height).toBeLessThanOrEqual(VIEWPORT.height);
        expect(clamped.left + clamped.width).toBeLessThanOrEqual(VIEWPORT.width);
    });

    it("never lets a resize shrink a panel below the minimum usable size", () => {
        const clamped = clampFloatingRect({ top: 100, left: 100, width: 10, height: 10 }, VIEWPORT);
        expect(clamped.width).toBe(MINIMUM_FLOATING_SIZE);
        expect(clamped.height).toBe(MINIMUM_FLOATING_SIZE);
    });

    it("never lets a resize grow a panel past what the window, minus the margin, can hold", () => {
        const clamped = clampFloatingRect({ top: 100, left: 100, width: 5000, height: 5000 }, VIEWPORT);
        expect(clamped.width).toBe(VIEWPORT.width - FLOATING_MARGIN * 2);
        expect(clamped.height).toBe(VIEWPORT.height - FLOATING_MARGIN * 2);
    });

    it("re-clamps the position after a resize so growing never pushes the panel off-window", () => {
        // Parked hard against the right edge, then resized wider: the left edge has to give
        // way rather than the panel growing off the right side of the window.
        const clamped = clampFloatingRect({ top: 100, left: VIEWPORT.width - 420, width: 400, height: 300 }, VIEWPORT);
        expect(clamped.left + clamped.width).toBeLessThanOrEqual(VIEWPORT.width);
    });

    it("threads a stored floating rectangle into the automatic layout untouched, when it fits", () => {
        const stored: FloatingRect = { top: 40, left: 60, width: 480, height: 360 };
        const layout = resolveDockLayout({
            placement: "floating",
            viewport: VIEWPORT,
            opener: null,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
            storedFloatingRect: stored,
        });
        expect(layout.offset).toEqual({ top: 40, left: 60 });
        expect(layout.size).toEqual({ width: 480, height: 360 });
    });

    it("clamps a stored floating rectangle back into a since-shrunk window", () => {
        const stored: FloatingRect = { top: 40, left: 60, width: 1200, height: 900 };
        const layout = resolveDockLayout({
            placement: "floating",
            viewport: { width: 800, height: 600 },
            opener: null,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
            storedFloatingRect: stored,
        });
        expect(layout.size?.width ?? 0).toBeLessThanOrEqual(800);
        expect(layout.size?.height ?? 0).toBeLessThanOrEqual(600);
    });

    it("uses a stored floating rectangle even when a docked request falls back to floating", () => {
        const stored: FloatingRect = { top: 40, left: 60, width: 480, height: 360 };
        const layout = resolveDockLayout({
            placement: "right",
            viewport: VIEWPORT,
            opener: TOP_RIGHT_BUTTON,
            preferredThickness: 520,
            preferredSize: { width: 520, height: 640 },
            storedFloatingRect: stored,
        });
        expect(layout.fellBackToFloating).toBe(true);
        expect(layout.offset).toEqual({ top: 40, left: 60 });
    });
});

/* -------------------------------------------------------------------------- */
/* Size and floating-rectangle persistence                                    */
/* -------------------------------------------------------------------------- */

describe("remembering a docked edge's thickness", () => {
    it("round-trips a record, per surface and per edge", () => {
        const storage = memoryStorage();
        writeDockSizes({ "app-settings": { right: 600, bottom: 300 } }, storage);
        expect(readDockSizes(storage)).toEqual({ "app-settings": { right: 600, bottom: 300 } });
    });

    it("drops one unknown edge and one non-numeric value rather than the whole file", () => {
        const storage = memoryStorage({
            "material-bluemap-dock-size": JSON.stringify({
                version: 1,
                surfaces: { "app-settings": { right: 600, diagonal: 300, bottom: "wide" } },
            }),
        });
        expect(readDockSizes(storage)).toEqual({ "app-settings": { right: 600 } });
    });

    it("refuses junk, a missing key and a future schema alike", () => {
        expect(readDockSizes(memoryStorage())).toEqual({});
        expect(readDockSizes(memoryStorage({ "material-bluemap-dock-size": "{" }))).toEqual({});
        expect(
            readDockSizes(
                memoryStorage({
                    "material-bluemap-dock-size": JSON.stringify({ version: 99, surfaces: { a: { left: 300 } } }),
                }),
            ),
        ).toEqual({});
    });

    it("sets one surface's one edge without touching another", () => {
        const record = withDockSize({ a: { left: 300 } }, "a", "right", 400);
        expect(record).toEqual({ a: { left: 300, right: 400 } });
        expect(withoutDockSizes(record, "a")).toEqual({});
    });

    it("says nothing and throws nothing where storage refuses", () => {
        const hostile: DockStorage = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("full");
            },
            removeItem: () => {
                throw new Error("blocked");
            },
        };
        expect(readDockSizes(hostile)).toEqual({});
        expect(() => writeDockSizes({ a: { left: 300 } }, hostile)).not.toThrow();
        expect(() => clearDockSizes(hostile)).not.toThrow();
    });
});

describe("remembering a floating panel's rectangle", () => {
    const RECT: FloatingRect = { top: 40, left: 60, width: 480, height: 360 };

    it("round-trips a record", () => {
        const storage = memoryStorage();
        writeDockFloatingRects({ "app-settings": RECT }, storage);
        expect(readDockFloatingRects(storage)).toEqual({ "app-settings": RECT });
    });

    it("drops a malformed rectangle rather than the whole file", () => {
        const storage = memoryStorage({
            "material-bluemap-dock-floating": JSON.stringify({
                version: 1,
                surfaces: { "app-settings": RECT, "eula-viewer": { top: 0, left: 0, width: "wide" } },
            }),
        });
        expect(readDockFloatingRects(storage)).toEqual({ "app-settings": RECT });
    });

    it("refuses junk, a missing key and a future schema alike", () => {
        expect(readDockFloatingRects(memoryStorage())).toEqual({});
        expect(readDockFloatingRects(memoryStorage({ "material-bluemap-dock-floating": "{" }))).toEqual({});
        expect(
            readDockFloatingRects(
                memoryStorage({
                    "material-bluemap-dock-floating": JSON.stringify({ version: 99, surfaces: { a: RECT } }),
                }),
            ),
        ).toEqual({});
    });

    it("sets and clears one surface without touching another", () => {
        const record = withDockFloatingRect({ a: RECT }, "b", { top: 1, left: 2, width: 3, height: 4 });
        expect(record).toEqual({ a: RECT, b: { top: 1, left: 2, width: 3, height: 4 } });
        expect(withoutDockFloatingRect(record, "b")).toEqual({ a: RECT });
    });

    it("says nothing and throws nothing where storage refuses", () => {
        const hostile: DockStorage = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("full");
            },
            removeItem: () => {
                throw new Error("blocked");
            },
        };
        expect(readDockFloatingRects(hostile)).toEqual({});
        expect(() => writeDockFloatingRects({ a: RECT }, hostile)).not.toThrow();
        expect(() => clearDockFloatingRects(hostile)).not.toThrow();
    });
});

/* -------------------------------------------------------------------------- */
/* The live geometry state, and reset                                         */
/* -------------------------------------------------------------------------- */

describe("the live size and floating-rectangle state", () => {
    beforeEach(() => {
        resetAllDockPlacements();
        reloadDockPlacements();
        reloadDockGeometry();
    });

    it("has nothing remembered until a resize or a drag happens", () => {
        expect(thicknessFor("app-settings", "right")).toBeNull();
        expect(floatingRectFor("app-settings")).toBeNull();
    });

    it("remembers a resized thickness per surface and per edge", () => {
        setDockThickness("app-settings", "right", 640);
        setDockThickness("app-settings", "bottom", 320);
        setDockThickness("eula-viewer", "right", 500);

        expect(thicknessFor("app-settings", "right")).toBe(640);
        expect(thicknessFor("app-settings", "bottom")).toBe(320);
        expect(thicknessFor("app-settings", "left")).toBeNull();
        expect(thicknessFor("eula-viewer", "right")).toBe(500);
    });

    it("remembers a dragged floating rectangle per surface", () => {
        const rect: FloatingRect = { top: 20, left: 30, width: 500, height: 400 };
        setDockFloatingRect("app-settings", rect);
        expect(floatingRectFor("app-settings")).toEqual(rect);
        expect(floatingRectFor("eula-viewer")).toBeNull();
    });

    it("reload is the same seam the placement record uses, so a round trip is provable there", () => {
        // `reloadDockGeometry` reads through the same `defaultStorage()` seam
        // `reloadDockPlacements` does, and this Node-environment test suite has no working
        // `localStorage` to round-trip through - exactly why `readDockSizes`/`writeDockSizes`
        // and `readDockFloatingRects`/`writeDockFloatingRects` are proven against an explicit
        // `memoryStorage()` above instead. What is provable here is that a reload with
        // nothing behind it produces the empty state rather than throwing.
        reloadDockGeometry();
        expect(thicknessFor("app-settings", "right")).toBeNull();
        expect(floatingRectFor("app-settings")).toBeNull();
    });

    it("forgets one surface's size and floating rectangle without touching another", () => {
        setDockThickness("app-settings", "right", 640);
        setDockFloatingRect("app-settings", { top: 20, left: 30, width: 500, height: 400 });
        setDockThickness("eula-viewer", "bottom", 300);

        resetDockGeometry("app-settings");

        expect(thicknessFor("app-settings", "right")).toBeNull();
        expect(floatingRectFor("app-settings")).toBeNull();
        expect(thicknessFor("eula-viewer", "bottom")).toBe(300);
    });

    it("clears size and floating position alongside placement when one surface is put back", () => {
        setDockPlacement("app-settings", "bottom");
        setDockThickness("app-settings", "bottom", 640);
        setDockFloatingRect("app-settings", { top: 20, left: 30, width: 500, height: 400 });

        resetDockPlacement("app-settings");

        expect(placementFor("app-settings", "right")).toBe("right");
        expect(thicknessFor("app-settings", "bottom")).toBeNull();
        expect(floatingRectFor("app-settings")).toBeNull();
    });

    it("clears every surface's size and floating position when every placement is put back", () => {
        setDockPlacement("app-settings", "bottom");
        setDockThickness("app-settings", "bottom", 640);
        setDockFloatingRect("eula-viewer", { top: 20, left: 30, width: 500, height: 400 });

        resetAllDockPlacements();

        expect(thicknessFor("app-settings", "bottom")).toBeNull();
        expect(floatingRectFor("eula-viewer")).toBeNull();
        // And it really is gone from storage, not merely from memory.
        reloadDockGeometry();
        expect(thicknessFor("app-settings", "bottom")).toBeNull();
        expect(floatingRectFor("eula-viewer")).toBeNull();
    });

    it("exposes the same records reactively, for a component to bind against", () => {
        setDockThickness("app-settings", "right", 640);
        setDockFloatingRect("eula-viewer", { top: 20, left: 30, width: 500, height: 400 });
        expect(dockSizeState().value["app-settings"]).toEqual({ right: 640 });
        expect(dockFloatingState().value["eula-viewer"]).toEqual({ top: 20, left: 30, width: 500, height: 400 });
    });
});

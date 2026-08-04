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
    MINIMUM_THICKNESS,
    clearDockPlacements,
    dockAxis,
    dockStyle,
    floatingOffset,
    isDockPlacement,
    isDockedEdge,
    overlapArea,
    readDockPlacements,
    resolveDockLayout,
    thicknessClearingOpener,
    withPlacement,
    withoutPlacement,
    writeDockPlacements,
    type DockStorage,
    type Rect,
} from "./dockPlacement.js";
import {
    customisedSurfaceCount,
    hasStoredPlacement,
    placementFor,
    registerDockedSurface,
    reloadDockPlacements,
    resetAllDockPlacements,
    resetDockPlacement,
    setDockPlacement,
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

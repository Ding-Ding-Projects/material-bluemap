import { afterEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { Marker } from "./Marker";

/** Installs a stub `window` with only the members `prefersReducedMotion` reads. */
const stubWindow = (value: unknown): void => {
    (globalThis as { window?: unknown }).window = value;
};

describe("Marker", () => {
    it("redirects position and visible to the reactive data object", () => {
        const marker = new Marker("test");

        expect(marker.isMarker).toBe(true);
        expect(marker.data.id).toBe("test");
        expect(marker.data.type).toBe("marker");
        expect(marker.data.sorting).toBe(0);
        expect(marker.data.listed).toBe(true);

        expect(marker.position).toBe(marker.data.position);

        marker.visible = false;
        expect(marker.data.visible).toBe(false);
        marker.data.visible = true;
        expect(marker.visible).toBe(true);
    });

    it("calculates the distance to the camera plane", () => {
        const camera = new PerspectiveCamera();
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        expect(Marker.calculateDistanceToCameraPlane(new Vector3(0, 0, 0), camera)).toBeCloseTo(10);
        expect(Marker.calculateDistanceToCameraPlane(new Vector3(5, 3, 0), camera)).toBeCloseTo(10);
        expect(Marker.calculateDistanceToCameraPlane(new Vector3(0, 0, 5), camera)).toBeCloseTo(5);
    });

    it("fades opacity between min and max fade-distances", () => {
        const camera = new PerspectiveCamera();
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld();

        const opacityAt = (distance: number, min: number, max: number) =>
            Marker.calculateDistanceOpacity(new Vector3(0, 0, -distance), camera, min, max);

        // closer than the min fade-distance the marker is invisible
        expect(opacityAt(5, 10, 1000)).toBe(0);
        // fully visible in between
        expect(opacityAt(500, 10, 1000)).toBe(1);
        // beyond 1.5x the max fade-distance the marker is invisible
        expect(opacityAt(1600, 10, 1000)).toBe(0);
    });

    describe("prefersReducedMotion", () => {
        afterEach(() => {
            delete (globalThis as { window?: unknown }).window;
        });

        it("is false where there is no window or no matchMedia", () => {
            expect(Marker.prefersReducedMotion()).toBe(false);

            stubWindow({});
            expect(Marker.prefersReducedMotion()).toBe(false);
        });

        it("reports what the media query says", () => {
            const asked: string[] = [];
            stubWindow({
                matchMedia: (query: string) => {
                    asked.push(query);
                    return { matches: true };
                },
            });
            expect(Marker.prefersReducedMotion()).toBe(true);
            expect(asked).toEqual(["(prefers-reduced-motion: reduce)"]);

            stubWindow({ matchMedia: () => ({ matches: false }) });
            expect(Marker.prefersReducedMotion()).toBe(false);
        });
    });

    describe("isFocusNavigationEvent", () => {
        // The node test environment has no DOM event constructors; the helper reads exactly
        // these two members, so an event-shaped literal exercises it faithfully.
        const evt = (type: string, key?: string) => ({ type, key }) as unknown as Event;

        it("exempts only the keys that move focus, so a popup survives being tabbed into", () => {
            expect(Marker.isFocusNavigationEvent(evt("keydown", "Tab"))).toBe(true);
            expect(Marker.isFocusNavigationEvent(evt("keydown", "Shift"))).toBe(true);
        });

        it("still dismisses on every other key", () => {
            for (const key of ["Escape", "a", "Enter", "ArrowLeft", " "]) {
                expect(Marker.isFocusNavigationEvent(evt("keydown", key))).toBe(false);
            }
        });

        it("never exempts a pointer event, whatever key it claims to carry", () => {
            expect(Marker.isFocusNavigationEvent(evt("mousewheel", "Tab"))).toBe(false);
            expect(Marker.isFocusNavigationEvent(evt("mousedown"))).toBe(false);
            expect(Marker.isFocusNavigationEvent(evt("touchstart"))).toBe(false);
            // keyup is not what the popups listen for either
            expect(Marker.isFocusNavigationEvent(evt("keyup", "Tab"))).toBe(false);
        });
    });
});

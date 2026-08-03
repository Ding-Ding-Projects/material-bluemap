import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { Marker } from "./Marker";

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
});

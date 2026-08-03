import { describe, expect, it } from "vitest";
import { MathUtils, Matrix4, PerspectiveCamera } from "three";
import { CombinedCamera } from "./CombinedCamera";

function maxElementDiff(a: Matrix4, b: Matrix4): number {
    let max = 0;
    for (let i = 0; i < 16; i++) {
        max = Math.max(max, Math.abs(a.elements[i]! - b.elements[i]!));
    }
    return max;
}

describe("CombinedCamera", () => {
    it("matches a PerspectiveCamera at ortho=0", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 0);
        const reference = new PerspectiveCamera(75, 1.5, 0.1, 1000);
        reference.updateProjectionMatrix();

        expect(maxElementDiff(camera.projectionMatrix, reference.projectionMatrix)).toBeLessThan(
            1e-10,
        );
    });

    it("matches an orthographic projection at ortho=1", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 1);
        camera.distance = 10;
        camera.updateProjectionMatrix();

        const orthoTop = (10 * Math.tan(MathUtils.DEG2RAD * 0.5 * 75)) / camera.zoom;
        const orthoHeight = 2 * orthoTop;
        const orthoWidth = 1.5 * orthoHeight;
        const orthoLeft = -0.5 * orthoWidth;
        const reference = new Matrix4().makeOrthographic(
            orthoLeft,
            orthoLeft + orthoWidth,
            orthoTop,
            orthoTop - orthoHeight,
            0.1,
            1000,
        );

        expect(maxElementDiff(camera.projectionMatrix, reference)).toBeLessThan(1e-10);
    });

    it("redirects parent properties into the reactive data object", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 0);

        camera.fov = 60;
        expect(camera.fov).toBe(60);
        expect(camera.data.fov).toBe(60);

        camera.aspect = 2;
        expect(camera.data.aspect).toBe(2);

        camera.near = 1;
        camera.far = 500;
        camera.zoom = 2;
        expect(camera.data.near).toBe(1);
        expect(camera.data.far).toBe(500);
        expect(camera.data.zoom).toBe(2);
    });

    it("only flags needsUpdate when a property actually changes", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 0);
        camera.updateProjectionMatrix();
        expect(camera.needsUpdate).toBe(false);

        camera.fov = 75; // unchanged
        expect(camera.needsUpdate).toBe(false);

        camera.fov = 60;
        expect(camera.needsUpdate).toBe(true);

        camera.updateProjectionMatrix();
        expect(camera.needsUpdate).toBe(false);

        camera.ortho = 0; // unchanged
        expect(camera.needsUpdate).toBe(false);
        camera.ortho = 0.5;
        expect(camera.needsUpdate).toBe(true);
    });

    it("skips recomputation while needsUpdate is false", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 0);
        camera.updateProjectionMatrix();
        const before = camera.projectionMatrix.clone();

        camera.data.fov = 30; // bypasses the setter, needsUpdate stays false
        camera.updateProjectionMatrix();

        expect(maxElementDiff(camera.projectionMatrix, before)).toBe(0);
    });

    it("reports its camera type based on the ortho value", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 0);
        expect(camera.isPerspectiveCamera).toBe(true);
        expect(camera.isOrthographicCamera).toBe(false);
        expect(camera.type).toBe("PerspectiveCamera");

        camera.ortho = 1;
        expect(camera.isPerspectiveCamera as boolean).toBe(false);
        expect(camera.isOrthographicCamera).toBe(true);
        expect(camera.type).toBe("OrthographicCamera");

        camera.ortho = 0.5; // still < 1
        expect(camera.isPerspectiveCamera).toBe(true);
    });

    it("ignores writes to the type and camera-kind flags", () => {
        const camera = new CombinedCamera(75, 1.5, 0.1, 1000, 0);

        (camera as { type: string }).type = "SomethingElse";
        expect(camera.type).toBe("PerspectiveCamera");

        (camera as { isPerspectiveCamera: boolean }).isPerspectiveCamera = false;
        expect(camera.isPerspectiveCamera).toBe(true);
    });
});

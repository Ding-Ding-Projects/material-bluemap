// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import { CSS2DObject, CSS2DRenderer, clampRectToBounds } from "./CSS2DRenderer.js";
import type { BoundsRect } from "./CSS2DRenderer.js";
import { htmlToElement } from "./Utils.js";

describe("clampRectToBounds", () => {
    it("leaves an element that already fits completely untouched", () => {
        expect(clampRectToBounds({ x: 10, y: 20, width: 50, height: 30 }, 200, 100)).toEqual({
            x: 10,
            y: 20,
        });
    });

    it("pulls an element back onto the left/top edge instead of letting it go negative", () => {
        expect(clampRectToBounds({ x: -15, y: -5, width: 50, height: 30 }, 200, 100)).toEqual({
            x: 0,
            y: 0,
        });
    });

    it("pulls an element back so it stops flush with the right/bottom edge", () => {
        expect(clampRectToBounds({ x: 180, y: 90, width: 50, height: 30 }, 200, 100)).toEqual({
            x: 150, // 200 - 50
            y: 70, // 100 - 30
        });
    });

    it("clamps both axes independently when a corner overflows both edges at once", () => {
        expect(clampRectToBounds({ x: -10, y: 85, width: 40, height: 30 }, 200, 100)).toEqual({
            x: 0,
            y: 70,
        });
    });

    it("pins an oversized element to the near edge rather than centering it or leaving both sides hanging off", () => {
        expect(clampRectToBounds({ x: -50, y: 10, width: 300, height: 20 }, 200, 100)).toEqual({
            x: 0,
            y: 10,
        });
    });

    it("leaves an element exactly flush with an edge unmoved (no off-by-one jitter)", () => {
        expect(clampRectToBounds({ x: 150, y: 70, width: 50, height: 30 }, 200, 100)).toEqual({
            x: 150,
            y: 70,
        });
        expect(clampRectToBounds({ x: 0, y: 0, width: 50, height: 30 }, 200, 100)).toEqual({
            x: 0,
            y: 0,
        });
    });

    it("does not move anything against an unmeasured (zero-size) container", () => {
        expect(clampRectToBounds({ x: -50, y: -50, width: 30, height: 30 }, 0, 0)).toEqual({
            x: -50,
            y: -50,
        });
    });
});

describe("CSS2DRenderer keepInBounds wiring", () => {
    const render = (
        object: CSS2DObject,
        measured?: {
            container: BoundsRect;
            element: BoundsRect;
        },
    ) => {
        const renderer = new CSS2DRenderer();
        renderer.setSize(800, 600);

        if (measured) {
            renderer.domElement.getBoundingClientRect = () => DOMRect.fromRect(measured.container);
            object.element.getBoundingClientRect = () => DOMRect.fromRect(measured.element);
        }

        const scene = new Scene();
        scene.add(object);

        const camera = new PerspectiveCamera();
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        renderer.render(scene, camera);
        return renderer;
    };

    it("defaults to no clamping, so an ordinary marker's rendering is unaffected", () => {
        const object = new CSS2DObject(htmlToElement("<div>ordinary marker</div>"));
        object.position.set(0, 0, 0);

        expect(object.keepInBounds).toBeUndefined();

        const renderer = render(object);

        expect(object.element.style.transform).toContain("translate(");
        expect(object.element.parentNode).toBe(renderer.domElement);
    });

    it("runs the opt-in clamp without throwing and keeps the element attached", () => {
        // jsdom performs no real layout - every element's getBoundingClientRect() comes back
        // all zeros, so the container here is reported as zero-sized and
        // clampRectToBounds's own "unmeasured container" branch is what fires. That proves
        // this wiring calls through safely, not that a real browser's pixel clamp is
        // correct; the arithmetic itself is proven above, against plain numbers, where a
        // broken clamp actually has something to disagree with.
        const object = new CSS2DObject(htmlToElement("<div>popup</div>"));
        object.keepInBounds = true;
        object.position.set(0, 0, 0);

        const renderer = render(object);

        expect(object.element.style.transform).toContain("translate(");
        expect(object.element.parentNode).toBe(renderer.domElement);
    });

    it("applies the measured right/bottom correction to the rendered transform", () => {
        const object = new CSS2DObject(htmlToElement("<div>popup</div>"));
        object.keepInBounds = true;
        object.position.set(0, 0, 0);

        const renderer = render(object, {
            container: { x: 20, y: 30, width: 800, height: 600 },
            element: { x: 780, y: 590, width: 100, height: 80 },
        });

        // The scene origin starts at translate(400px,300px). Relative to the container,
        // the measured popup begins at (760,560), so it overflows by 60px right and 40px
        // bottom. The renderer must apply exactly that correction to the real transform.
        expect(object.element.style.transform).toBe("translate(340px,260px)");
        expect(object.element.parentNode).toBe(renderer.domElement);
    });
});

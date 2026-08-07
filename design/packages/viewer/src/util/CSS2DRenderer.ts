/**
 * @author mrdoob / http://mrdoob.com/
 *
 * adapted for bluemap's purposes
 */

import { Matrix4, Object3D, Vector2, Vector3 } from "three";
import type { Camera, Scene } from "three";
import { dispatchEvent } from "./Utils";

export interface MapInteractionData {
    doubleTap: boolean;
}

export interface BoundsRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The smallest shift that keeps a rendered element's box inside a same-origin container box,
 * without moving it at all when it already fits.
 *
 * {@link CSS2DObject.keepInBounds} objects are anchored to a point in the 3D scene; that
 * point can legitimately land anywhere on screen, including right against an edge. Without
 * this, an element positioned there renders partly outside the CSS2D layer and is silently
 * deleted by that layer's own `overflow: hidden` - see the constructor below. This does not
 * change *where* the anchor points to, only where the (already fully-sized) element is drawn
 * relative to it, the same way a well-behaved popover clamps against a viewport edge.
 *
 * An element wider or taller than the container cannot fully fit on that axis either way; it
 * is pinned to the container's near edge (0) rather than centered or left overflowing on
 * both sides. A container that has not been measured yet (zero or negative size) gives no
 * useful bound to clamp against, so the element is left exactly where it was rather than
 * being forced into the corner.
 */
export function clampRectToBounds(
    rect: BoundsRect,
    containerWidth: number,
    containerHeight: number,
): { x: number; y: number } {
    if (containerWidth <= 0 || containerHeight <= 0) {
        return { x: rect.x, y: rect.y };
    }

    const clampAxis = (position: number, size: number, containerSize: number): number => {
        if (size >= containerSize) return 0;
        if (position < 0) return 0;
        if (position + size > containerSize) return containerSize - size;
        return position;
    };

    return {
        x: clampAxis(rect.x, rect.width, containerWidth),
        y: clampAxis(rect.y, rect.height, containerHeight),
    };
}

class CSS2DObject extends Object3D {
    element: HTMLDivElement;
    anchor: Vector2;
    events: EventTarget | null;
    declare disableDepthTest?: boolean;
    /**
     * Opt-in: keeps this object's rendered box fully inside the CSS2D layer instead of
     * letting the layer's `overflow: hidden` silently delete whatever crosses its edge.
     * Off by default, so every existing marker (POI labels, player nametags, HTML markers)
     * renders exactly as before - see {@link clampRectToBounds}. `PopupMarker` turns this on
     * because it is interactive, author-read content the user directly asked to see (a
     * clicked block's coordinates), not a passive label.
     */
    declare keepInBounds?: boolean;

    constructor(element: Element) {
        super();

        this.element = document.createElement("div");
        const parent = element.parentNode!;
        parent.replaceChild(this.element, element);
        this.element.appendChild(element);

        this.element.style.position = "absolute";

        this.anchor = new Vector2();

        this.events = null;

        this.addEventListener("removed", () => {
            this.traverse(function (object) {
                const element = (object as Object3D & { element?: unknown }).element;

                if (element instanceof Element && element.parentNode !== null) {
                    element.parentNode.removeChild(element);
                }
            });
        });

        let lastClick = -1;
        const handleClick = (event: Event) => {
            let doubleTap = false;

            const now = Date.now();
            if (now - lastClick < 500) {
                doubleTap = true;
            }

            lastClick = now;

            const data: MapInteractionData = { doubleTap: doubleTap };

            if (
                (
                    this as unknown as {
                        onClick(event: { event: Event; data: MapInteractionData }): boolean;
                    }
                ).onClick({ event: event, data: data })
            ) {
                event.preventDefault();
                event.stopPropagation();
            } else {
                // fire event
                dispatchEvent(this.events, "bluemapMapInteraction", {
                    data: data,
                    object: this,
                });
            }
        };

        this.element.addEventListener("click", handleClick);
        this.element.addEventListener("touch", handleClick);
    }
}

//

class CSS2DRenderer {
    domElement: HTMLDivElement;
    events: EventTarget | null;

    getSize: () => { width: number; height: number };
    setSize: (width: number, height: number) => void;
    render: (scene: Scene, camera: Camera) => void;

    constructor(events: EventTarget | null = null) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const _this = this;

        let _width: number, _height: number;
        let _widthHalf: number, _heightHalf: number;

        const vector = new Vector3();
        const viewMatrix = new Matrix4();
        const viewProjectionMatrix = new Matrix4();

        const cache = {
            objects: new WeakMap<CSS2DObject, { distanceToCameraSquared: number }>(),
        };

        const domElement = document.createElement("div");
        domElement.style.overflow = "hidden";

        this.domElement = domElement;

        this.events = events;

        this.getSize = function () {
            return {
                width: _width,
                height: _height,
            };
        };

        this.setSize = function (width, height) {
            _width = width;
            _height = height;

            _widthHalf = _width / 2;
            _heightHalf = _height / 2;

            domElement.style.width = width + "px";
            domElement.style.height = height + "px";
        };

        const renderObject = function (
            object: Object3D,
            scene: Scene,
            camera: Camera,
            parentVisible: boolean,
        ) {
            if (object instanceof CSS2DObject) {
                object.events = _this.events;

                (
                    object.onBeforeRender as unknown as (
                        renderer: CSS2DRenderer,
                        scene: Scene,
                        camera: Camera,
                    ) => void
                )(_this, scene, camera);

                vector.setFromMatrixPosition(object.matrixWorld);
                vector.applyMatrix4(viewProjectionMatrix);

                const element = object.element;
                let translateX = vector.x * _widthHalf + _widthHalf - object.anchor.x;
                let translateY = -vector.y * _heightHalf + _heightHalf - object.anchor.y;

                const elementStyle = element.style as CSSStyleDeclaration &
                    Record<"WebkitTransform" | "MozTransform" | "oTransform", string>;
                const applyTransform = () => {
                    const style = "translate(" + translateX + "px," + translateY + "px)";
                    elementStyle.WebkitTransform = style;
                    elementStyle.MozTransform = style;
                    elementStyle.oTransform = style;
                    elementStyle.transform = style;
                };
                applyTransform();

                element.style.display =
                    parentVisible &&
                    object.visible &&
                    vector.z >= -1 &&
                    vector.z <= 1 &&
                    element.style.opacity !== "0"
                        ? ""
                        : "none";

                if (element.parentNode !== domElement) {
                    domElement.appendChild(element);
                }

                // Only for the rare opt-in object, and only once it is actually going to be
                // shown: measuring forces a synchronous layout, which is not something every
                // marker on the map should pay for every frame.
                if (object.keepInBounds && element.style.display !== "none") {
                    const containerRect = domElement.getBoundingClientRect();
                    const elementRect = element.getBoundingClientRect();
                    const offsetX = elementRect.left - containerRect.left;
                    const offsetY = elementRect.top - containerRect.top;

                    const corrected = clampRectToBounds(
                        { x: offsetX, y: offsetY, width: elementRect.width, height: elementRect.height },
                        containerRect.width,
                        containerRect.height,
                    );

                    const correctionX = corrected.x - offsetX;
                    const correctionY = corrected.y - offsetY;
                    if (correctionX !== 0 || correctionY !== 0) {
                        translateX += correctionX;
                        translateY += correctionY;
                        applyTransform();
                    }
                }

                const objectData = {
                    distanceToCameraSquared: getDistanceToSquared(camera, object),
                };

                cache.objects.set(object, objectData);

                (
                    object.onAfterRender as unknown as (
                        renderer: CSS2DRenderer,
                        scene: Scene,
                        camera: Camera,
                    ) => void
                )(_this, scene, camera);
            }

            for (let i = 0, l = object.children.length; i < l; i++) {
                renderObject(object.children[i]!, scene, camera, parentVisible && object.visible);
            }
        };

        const getDistanceToSquared = (function () {
            const a = new Vector3();
            const b = new Vector3();

            return function (object1: Object3D, object2: Object3D) {
                a.setFromMatrixPosition(object1.matrixWorld);
                b.setFromMatrixPosition(object2.matrixWorld);

                return a.distanceToSquared(b);
            };
        })();

        const filterAndFlatten = function (scene: Scene) {
            const result: CSS2DObject[] = [];

            scene.traverse(function (object) {
                if (object instanceof CSS2DObject) result.push(object);
            });

            return result;
        };

        const zOrder = function (scene: Scene) {
            const sorted = filterAndFlatten(scene).sort(function (a, b) {
                const distanceA = cache.objects.get(a)!.distanceToCameraSquared;
                const distanceB = cache.objects.get(b)!.distanceToCameraSquared;

                return distanceA - distanceB;
            });

            const zMax = sorted.length;

            for (let i = 0, l = sorted.length; i < l; i++) {
                const o = sorted[i]!;
                o.element.style.zIndex = String(o.disableDepthTest ? zMax + 1 : zMax - i);
            }
        };

        this.render = function (scene, camera) {
            if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
            if (camera.parent === null) camera.updateMatrixWorld();

            viewMatrix.copy(camera.matrixWorldInverse);
            viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, viewMatrix);

            renderObject(scene, scene, camera, true);
            zOrder(scene);
        };
    }
}

export { CSS2DObject, CSS2DRenderer };

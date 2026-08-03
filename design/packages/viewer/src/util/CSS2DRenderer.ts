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

class CSS2DObject extends Object3D {
    element: HTMLDivElement;
    anchor: Vector2;
    events: EventTarget | null;
    declare disableDepthTest?: boolean;

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
                const style =
                    "translate(" +
                    (vector.x * _widthHalf + _widthHalf - object.anchor.x) +
                    "px," +
                    (-vector.y * _heightHalf + _heightHalf - object.anchor.y) +
                    "px)";

                const elementStyle = element.style as CSSStyleDeclaration &
                    Record<"WebkitTransform" | "MozTransform" | "oTransform", string>;
                elementStyle.WebkitTransform = style;
                elementStyle.MozTransform = style;
                elementStyle.oTransform = style;
                elementStyle.transform = style;

                element.style.display =
                    parentVisible &&
                    object.visible &&
                    vector.z >= -1 &&
                    vector.z <= 1 &&
                    element.style.opacity !== "0"
                        ? ""
                        : "none";

                const objectData = {
                    distanceToCameraSquared: getDistanceToSquared(camera, object),
                };

                cache.objects.set(object, objectData);

                if (element.parentNode !== domElement) {
                    domElement.appendChild(element);
                }

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

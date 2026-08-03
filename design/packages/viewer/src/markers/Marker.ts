import { MathUtils, Object3D, Vector3 } from "three";
import type { Camera } from "three";
import { makeReactive } from "../util/reactivity";

export interface MarkerData {
    id: string;
    type: string;
    sorting: number;
    listed: boolean;
    position: Vector3;
    visible: boolean;
}

export class Marker extends Object3D {
    declare readonly isMarker: boolean;

    data: MarkerData;

    constructor(markerId: string) {
        super();
        Object.defineProperty(this, "isMarker", { value: true });

        this.data = makeReactive({
            id: markerId,
            type: "marker",
            sorting: 0,
            listed: true,
            position: this.position,
            visible: this.visible,
        });

        // redirect parent properties
        Object.defineProperty(this, "position", {
            get(this: Marker) {
                return this.data.position;
            },
            set(this: Marker, value: Vector3) {
                this.data.position = value;
            },
        });
        Object.defineProperty(this, "visible", {
            get(this: Marker) {
                return this.data.visible;
            },
            set(this: Marker, value: boolean) {
                this.data.visible = value;
            },
        });
    }

    dispose(): void {}

    /**
     * Updates this marker from the provided data object, usually parsed form json from a markers.json
     */
    updateFromData(_markerData: object): void {}

    // -- helper methods --

    static _posRelativeToCamera = new Vector3();
    static _cameraDirection = new Vector3();

    /**
     * @returns opacity between 0 and 1
     */
    static calculateDistanceOpacity(
        position: Vector3,
        camera: Camera,
        fadeDistanceMin: number,
        fadeDistanceMax: number,
    ): number {
        const distance = Marker.calculateDistanceToCameraPlane(position, camera);
        const minDelta = (distance - fadeDistanceMin) / fadeDistanceMin;
        const maxDelta = (distance - fadeDistanceMax) / (fadeDistanceMax * 0.5);
        return Math.min(MathUtils.clamp(minDelta, 0, 1), 1 - MathUtils.clamp(maxDelta + 1, 0, 1));
    }

    static calculateDistanceToCameraPlane(position: Vector3, camera: Camera): number {
        Marker._posRelativeToCamera.subVectors(position, camera.position);
        camera.getWorldDirection(Marker._cameraDirection);
        return Marker._posRelativeToCamera.dot(Marker._cameraDirection);
    }

    /**
     * Whether the user has asked for reduced motion. The marker popups fade in and out from
     * javascript rather than from a CSS transition, so the media query has to be read here
     * too; the stylesheet handles the transitions it owns.
     *
     * Guarded for non-browser hosts: this package's unit tests run under node, where there
     * is no `window` at all.
     */
    static prefersReducedMotion(): boolean {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /**
     * Whether an event only moves keyboard focus.
     *
     * Popups close on any interaction that happens outside them, keydown included. Taken
     * literally that makes them unreachable by keyboard: pressing Tab to move focus into a
     * popup dismisses it before the focus lands, so a copy-to-clipboard control inside one
     * can only ever be used with a mouse. Focus navigation is therefore exempt, and every
     * other key still dismisses.
     */
    static isFocusNavigationEvent(evt: Event): boolean {
        if (evt.type !== "keydown") return false;
        const key = (evt as KeyboardEvent).key;
        return key === "Tab" || key === "Shift";
    }
}

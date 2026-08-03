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
}

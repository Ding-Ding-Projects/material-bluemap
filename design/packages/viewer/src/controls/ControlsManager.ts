import { MathUtils, Vector3 } from "three";
import type { Vector2 } from "three";
import { dispatchEvent } from "../util/Utils";
import { Map } from "../map/Map";
import { makeReactive } from "../util/reactivity";
import type { MapViewer } from "../MapViewer";
import type { CombinedCamera, CombinedCameraData } from "../util/CombinedCamera";

export interface ControlsLike {
    data?: object;
    start?(controls: ControlsManager): void;
    stop?(): void;
    update(deltaTime: number, map: Map): void;
}

export interface ControlsManagerData {
    mapViewer: MapViewer["data"] | null;
    camera: CombinedCameraData | null;
    controls: object | null;
    position: Vector3;
    rotation: number;
    angle: number;
    tilt: number;
}

export class ControlsManager {
    declare readonly isControlsManager: true;

    data: ControlsManagerData;

    lastPosition: Vector3;
    lastRotation: number;
    lastAngle: number;
    lastDistance: number;
    lastOrtho: number;
    lastTilt: number;

    lastMapUpdatePosition: Vector3 | null;
    lastMapUpdateDistance: number | null;

    averageDeltaTime: number;

    _controls: ControlsLike | null;
    _mapViewer!: MapViewer;
    _camera!: CombinedCamera;

    constructor(mapViewer: MapViewer, camera: CombinedCamera) {
        Object.defineProperty(this, "isControlsManager", { value: true });

        this.data = makeReactive<ControlsManagerData>({
            mapViewer: null,
            camera: null,
            controls: null,
            position: new Vector3(0, 0, 0),
            rotation: 0,
            angle: 0,
            tilt: 0,
        });

        this.mapViewer = mapViewer;
        this.camera = camera;

        this.lastPosition = this.position.clone();
        this.lastRotation = this.rotation;
        this.lastAngle = this.angle;
        this.lastDistance = this.distance;
        this.lastOrtho = this.ortho;
        this.lastTilt = this.tilt;

        this.lastMapUpdatePosition = null;
        this.lastMapUpdateDistance = null;

        this.averageDeltaTime = 16;

        this._controls = null;

        // start
        this.distance = 300;
        this.position.set(0, 0, 0);
        this.rotation = 0;
        this.angle = 0;
        this.tilt = 0;
        this.ortho = 0;

        this.updateCamera();
    }

    update(deltaTime: number, map: Map): void {
        if (deltaTime > 50) deltaTime = 50; // assume min 20 UPS
        this.averageDeltaTime = this.averageDeltaTime * 0.9 + deltaTime * 0.1; // average delta-time to avoid choppy controls on lag-spikes

        if (this._controls) this._controls.update(this.averageDeltaTime, map);

        this.updateCamera();
    }

    updateCamera(): void {
        const valueChanged = this.isValueChanged();

        if (valueChanged) {
            this.resetValueChanged();

            // wrap rotation
            while (this.rotation >= Math.PI) this.rotation -= Math.PI * 2;
            while (this.rotation <= -Math.PI) this.rotation += Math.PI * 2;

            // prevent problems with the rotation when the angle is 0 (top-down) or distance is 0 (first-person)
            let rotatableAngle = this.angle;
            if (Math.abs(rotatableAngle) <= 0.0001) rotatableAngle = 0.0001;
            else if (Math.abs(rotatableAngle) - Math.PI <= 0.0001)
                rotatableAngle = rotatableAngle - 0.0001;
            let rotatableDistance = this.distance;
            if (Math.abs(rotatableDistance) <= 0.0001) rotatableDistance = 0.0001;

            // fix distance for orthogonal-camera
            if (this.ortho > 0) {
                rotatableDistance = MathUtils.lerp(
                    rotatableDistance,
                    Math.max(rotatableDistance, 300),
                    Math.pow(this.ortho, 8),
                );
            }

            // calculate rotationVector
            const rotationVector = new Vector3(
                Math.sin(this.rotation),
                0,
                -Math.cos(this.rotation),
            ); // 0 is towards north
            const angleRotationAxis = new Vector3(0, 1, 0).cross(rotationVector);
            rotationVector.applyAxisAngle(angleRotationAxis, Math.PI / 2 - rotatableAngle);
            rotationVector.multiplyScalar(rotatableDistance);

            // position camera
            this.camera.rotation.set(0, 0, 0);
            this.camera.position.copy(this.position).sub(rotationVector);
            this.camera.lookAt(this.position);
            this.camera.rotateZ(this.tilt + rotatableAngle < 0 ? Math.PI : 0);

            // optimize far/near planes
            if (this.ortho <= 0) {
                let near = MathUtils.clamp(rotatableDistance / 1000, 0.01, 1);
                const far = MathUtils.clamp(
                    rotatableDistance * 2,
                    Math.max(near + 1, 2000),
                    rotatableDistance + 5000,
                );
                if (far - near > 10000) near = far - 10000;
                this.camera.near = near;
                this.camera.far = far;
            } else if (this.angle === 0) {
                this.camera.near = 1;
                this.camera.far = rotatableDistance + 300;
            } else {
                this.camera.near = 1;
                this.camera.far = 100000;
            }

            // event
            dispatchEvent(this.mapViewer.events, "bluemapCameraMoved", {
                controlsManager: this,
                camera: this.camera,
            });
        }

        // if the position changed, update map to show new position
        if (this.mapViewer.map) {
            let triggerDistance = 1;
            if (valueChanged) {
                if (this.distance > 300) {
                    triggerDistance = this.mapViewer.data.loadedLowresViewDistance * 0.5;
                } else {
                    triggerDistance = this.mapViewer.data.loadedHiresViewDistance * 0.5;
                }
            }

            if (
                this.lastMapUpdatePosition === null ||
                this.lastMapUpdateDistance === null ||
                Math.abs(this.lastMapUpdatePosition.x - this.position.x) >= triggerDistance ||
                Math.abs(this.lastMapUpdatePosition.z - this.position.z) >= triggerDistance ||
                (this.distance < 1000 && this.lastMapUpdateDistance >= 1000)
            ) {
                this.lastMapUpdatePosition = this.position.clone();
                this.lastMapUpdateDistance = this.distance;
                this.mapViewer.loadMapArea(this.position.x, this.position.z);
            }
        }
    }

    /**
     * Triggers an interaction on the screen (map), e.g. a mouse-click
     * @param screenPosition - Clicked position on the screen (usually event.x, event.y)
     * @param data - Custom event data that will be added to the interaction-event
     */
    handleMapInteraction(screenPosition: Vector2, data: object = {}): void {
        this.mapViewer.handleMapInteraction(screenPosition, data);
    }

    isValueChanged(): boolean {
        return !(
            this.data.position.equals(this.lastPosition) &&
            this.data.rotation === this.lastRotation &&
            this.data.angle === this.lastAngle &&
            this.distance === this.lastDistance &&
            this.ortho === this.lastOrtho &&
            this.data.tilt === this.lastTilt
        );
    }

    resetValueChanged(): void {
        this.lastPosition.copy(this.data.position);
        this.lastRotation = this.data.rotation;
        this.lastAngle = this.data.angle;
        this.lastDistance = this.distance;
        this.lastOrtho = this.ortho;
        this.lastTilt = this.data.tilt;
    }

    get ortho(): number {
        return this.camera.ortho;
    }

    set ortho(ortho: number) {
        this.camera.ortho = ortho;
    }

    get distance(): number {
        return this.camera.distance;
    }

    set distance(distance: number) {
        this.camera.distance = distance;
    }

    set controls(controls: ControlsLike | null) {
        if (this._controls && this._controls.stop) this._controls.stop();

        this._controls = controls;
        if (controls) this.data.controls = controls.data || null;

        if (this._controls && this._controls.start) this._controls.start(this);
    }

    get controls(): ControlsLike | null {
        return this._controls;
    }

    get mapViewer(): MapViewer {
        return this._mapViewer;
    }

    set mapViewer(value: MapViewer) {
        this._mapViewer = value;
        this.data.mapViewer = value.data;
    }

    get camera(): CombinedCamera {
        return this._camera;
    }

    set camera(value: CombinedCamera) {
        this._camera = value;
        this.data.camera = value.data;
    }

    get position(): Vector3 {
        return this.data.position;
    }

    set position(value: Vector3) {
        this.data.position = value;
    }

    get rotation(): number {
        return this.data.rotation;
    }

    set rotation(value: number) {
        this.data.rotation = value;
    }

    get angle(): number {
        return this.data.angle;
    }

    set angle(value: number) {
        this.data.angle = value;
    }

    get tilt(): number {
        return this.data.tilt;
    }

    set tilt(value: number) {
        this.data.tilt = value;
    }
}

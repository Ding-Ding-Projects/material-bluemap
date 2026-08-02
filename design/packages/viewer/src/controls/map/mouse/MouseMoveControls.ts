import { MathUtils, Vector2 } from "three";
import { VEC2_ZERO } from "../../../util/Utils";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class MouseMoveControls {
    static tempVec2_1 = new Vector2();

    target: Element;
    manager: ControlsManager | null;

    moving: boolean;
    lastPosition: Vector2;
    deltaPosition: Vector2;

    speed: number;
    stiffness: number;

    pixelToSpeedMultiplierX: number;
    pixelToSpeedMultiplierY: number;

    constructor(target: Element, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.moving = false;
        this.lastPosition = new Vector2();
        this.deltaPosition = new Vector2();

        this.speed = speed;
        this.stiffness = stiffness;

        this.pixelToSpeedMultiplierX = 0;
        this.pixelToSpeedMultiplierY = 0;
        this.updatePixelToSpeedMultiplier();
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.target.addEventListener("mousedown", this.onMouseDown as EventListener);
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);

        window.addEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    stop(): void {
        this.target.removeEventListener("mousedown", this.onMouseDown as EventListener);
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);

        window.removeEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaPosition.x === 0 && this.deltaPosition.y === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        const directionDelta = MouseMoveControls.tempVec2_1.copy(this.deltaPosition);
        directionDelta.rotateAround(VEC2_ZERO, this.manager!.rotation);

        this.manager!.position.x +=
            directionDelta.x *
            smoothing *
            this.manager!.distance *
            this.speed *
            this.pixelToSpeedMultiplierX;
        this.manager!.position.z +=
            directionDelta.y *
            smoothing *
            this.manager!.distance *
            this.speed *
            this.pixelToSpeedMultiplierY;

        this.deltaPosition.multiplyScalar(1 - smoothing);
        if (this.deltaPosition.lengthSq() < 0.0001) {
            this.deltaPosition.set(0, 0);
        }
    }

    reset(): void {
        this.deltaPosition.set(0, 0);
    }

    private onMouseDown = (evt: MouseEvent) => {
        if ((evt.buttons !== undefined ? evt.buttons === 1 : evt.button === 0) && !evt.altKey) {
            this.moving = true;
            this.deltaPosition.set(0, 0);
            this.lastPosition.set(evt.x, evt.y);
        }
    };

    private onMouseMove = (evt: MouseEvent) => {
        const position = MouseMoveControls.tempVec2_1.set(evt.x, evt.y);

        if (this.moving) {
            this.deltaPosition.sub(position).add(this.lastPosition);
        }

        this.lastPosition.copy(position);
    };

    private onMouseUp = (evt: MouseEvent) => {
        if (evt.button === 0) this.moving = false;
    };

    updatePixelToSpeedMultiplier = () => {
        this.pixelToSpeedMultiplierX =
            (1 / this.target.clientWidth) * (this.target.clientWidth / this.target.clientHeight);
        this.pixelToSpeedMultiplierY = 1 / this.target.clientHeight;
    };
}

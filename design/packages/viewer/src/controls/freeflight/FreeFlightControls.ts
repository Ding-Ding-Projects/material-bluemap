import { MathUtils, Vector2, Vector3 } from "three";
import Hammer from "hammerjs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- unused imports kept from upstream
import { animate, EasingFunctions } from "../../util/Utils";
import { KeyMoveControls } from "./keyboard/KeyMoveControls";
import { MouseRotateControls } from "./mouse/MouseRotateControls";
import { MouseAngleControls } from "./mouse/MouseAngleControls";
import { KeyHeightControls } from "./keyboard/KeyHeightControls";
import { TouchPanControls } from "./touch/TouchPanControls";
import { makeReactive } from "../../util/reactivity";
import { DEG2RAD } from "three/src/math/MathUtils";
import type { ControlsManager } from "../ControlsManager";
import type { Map } from "../../map/Map";

const { DIRECTION_ALL, Manager, Pan } = Hammer;

export interface FollowingPlayerData {
    position: Vector3;
    rotation: { pitch: number; yaw: number };
}

interface PlayerMarkerLike {
    isPlayerMarker?: boolean;
    data: FollowingPlayerData;
}

export interface FreeFlightControlsData {
    followingPlayer: FollowingPlayerData | null;
}

export class FreeFlightControls {
    static _beforeMoveTemp = new Vector3();

    target: Element;
    manager: ControlsManager | null;

    data: FreeFlightControlsData;

    hammer: HammerManager;

    keyMove: KeyMoveControls;
    keyHeight: KeyHeightControls;
    mouseRotate: MouseRotateControls;
    mouseAngle: MouseAngleControls;
    touchPan: TouchPanControls;

    started: boolean;

    clickStart: Vector2;
    moveSpeed: number;

    animationTargetHeight: number;

    constructor(target: Element) {
        this.target = target;
        this.manager = null;

        this.data = makeReactive<FreeFlightControlsData>({
            followingPlayer: null,
        });

        this.hammer = new Manager(this.target);
        this.initializeHammer();

        this.keyMove = new KeyMoveControls(this.target, 0.5, 0.1);
        this.keyHeight = new KeyHeightControls(this.target, 0.5, 0.2);
        this.mouseRotate = new MouseRotateControls(this.target, 1.5, -2, -1.5, 0.5);
        this.mouseAngle = new MouseAngleControls(this.target, 1.5, -2, -1.5, 0.5);
        this.touchPan = new TouchPanControls(this.target, this.hammer, 5, 0.15);

        this.started = false;

        this.clickStart = new Vector2();
        this.moveSpeed = 0.5;

        this.animationTargetHeight = 0;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.keyMove.start(manager);
        this.keyHeight.start(manager);
        this.mouseRotate.start(manager);
        this.mouseAngle.start(manager);
        this.touchPan.start(manager);

        this.target.addEventListener("contextmenu", this.onContextMenu);
        this.target.addEventListener("mousedown", this.onMouseDown as EventListener);
        this.target.addEventListener("mouseup", this.onMouseUp as EventListener);
        this.target.addEventListener("wheel", this.onWheel as EventListener, { passive: false });
    }

    stop(): void {
        this.keyMove.stop();
        this.keyHeight.stop();
        this.mouseRotate.stop();
        this.mouseAngle.stop();
        this.touchPan.stop();

        this.target.removeEventListener("contextmenu", this.onContextMenu);
        this.target.removeEventListener("mousedown", this.onMouseDown as EventListener);
        this.target.removeEventListener("mouseup", this.onMouseUp as EventListener);
        this.target.removeEventListener("wheel", this.onWheel as EventListener);
    }

    update(delta: number, map: Map): void {
        FreeFlightControls._beforeMoveTemp.copy(this.manager!.position);
        const beforeMoveRot = this.manager!.rotation;
        const beforeMoveAngle = this.manager!.angle;

        this.keyMove.update(delta, map);
        this.keyHeight.update(delta, map);
        this.mouseRotate.update(delta, map);
        this.mouseAngle.update(delta, map);
        this.touchPan.update(delta, map);

        // if moved, stop following the marker and give back control
        if (
            this.data.followingPlayer &&
            (!FreeFlightControls._beforeMoveTemp.equals(this.manager!.position) ||
                beforeMoveRot !== this.manager!.rotation ||
                beforeMoveAngle !== this.manager!.angle)
        ) {
            this.stopFollowingPlayerMarker();
        }

        // follow player marker
        if (this.data.followingPlayer) {
            this.manager!.position.copy(this.data.followingPlayer.position);
            this.manager!.rotation = (this.data.followingPlayer.rotation.yaw - 180) * DEG2RAD;
            this.manager!.angle = -(this.data.followingPlayer.rotation.pitch - 90) * DEG2RAD;
        }

        this.manager!.angle = MathUtils.clamp(this.manager!.angle, 0, Math.PI);
        this.manager!.distance = 0;
        this.manager!.ortho = 0;
    }

    initializeHammer(): void {
        const touchMove = new Pan({
            event: "move",
            pointers: 1,
            direction: DIRECTION_ALL,
            threshold: 0,
        });
        this.hammer.add(touchMove);
    }

    onContextMenu = (evt: Event) => {
        evt.preventDefault();
    };

    onMouseDown = (evt: MouseEvent) => {
        this.clickStart.set(evt.x, evt.y);
    };

    onMouseUp = (evt: MouseEvent) => {
        if (Math.abs(this.clickStart.x - evt.x) > 5) return;
        if (Math.abs(this.clickStart.y - evt.y) > 5) return;

        document.body.requestFullscreen().finally(() => {
            // try with unadjustedMovement first and fall back without it if not supported
            this.target
                .requestPointerLock({
                    unadjustedMovement: true,
                })
                .catch((err) => {
                    if (err.name === "NotSupportedError") {
                        return this.target.requestPointerLock();
                    } else {
                        throw err;
                    }
                });
        });
    };

    followPlayerMarker(marker: object): void {
        if ((marker as PlayerMarkerLike).isPlayerMarker) marker = (marker as PlayerMarkerLike).data;
        this.data.followingPlayer = marker as FollowingPlayerData;
        this.keyMove.deltaPosition.set(0, 0);
    }

    stopFollowingPlayerMarker(): void {
        this.data.followingPlayer = null;
    }

    onWheel = (evt: WheelEvent) => {
        evt.preventDefault();

        let delta = evt.deltaY;
        if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) delta *= 0.01;
        if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 0.33;

        this.moveSpeed *= Math.pow(1.5, -delta * 0.25);
        this.moveSpeed = MathUtils.clamp(this.moveSpeed, 0.05, 5);

        this.keyMove.speed = this.moveSpeed;
        this.keyHeight.speed = this.moveSpeed;
    };
}

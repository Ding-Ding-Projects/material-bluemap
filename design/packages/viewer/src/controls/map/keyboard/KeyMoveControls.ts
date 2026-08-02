import { MathUtils, Vector2 } from "three";
import { VEC2_ZERO } from "../../../util/Utils";
import { KeyCombination } from "../../KeyCombination";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class KeyMoveControls {
    static KEYS = {
        LEFT: [new KeyCombination("ArrowLeft"), new KeyCombination("KeyA")],
        UP: [new KeyCombination("ArrowUp"), new KeyCombination("KeyW")],
        RIGHT: [new KeyCombination("ArrowRight"), new KeyCombination("KeyD")],
        DOWN: [new KeyCombination("ArrowDown"), new KeyCombination("KeyS")],
    };

    static temp_v2 = new Vector2();

    target: EventTarget;
    manager: ControlsManager | null;

    deltaPosition: Vector2;

    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;

    speed: number;
    stiffness: number;

    constructor(target: EventTarget, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.deltaPosition = new Vector2();

        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;

        this.speed = speed;
        this.stiffness = stiffness;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("blur", this.onStop);
    }

    stop(): void {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("blur", this.onStop);
    }

    update(delta: number, _map: Map): void {
        if (this.up) this.deltaPosition.y -= 1;
        if (this.down) this.deltaPosition.y += 1;
        if (this.left) this.deltaPosition.x -= 1;
        if (this.right) this.deltaPosition.x += 1;

        if (this.deltaPosition.x === 0 && this.deltaPosition.y === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        const rotatedDelta = KeyMoveControls.temp_v2.copy(this.deltaPosition);
        rotatedDelta.rotateAround(VEC2_ZERO, this.manager!.rotation);

        this.manager!.position.x +=
            rotatedDelta.x * smoothing * this.manager!.distance * this.speed * delta * 0.06;
        this.manager!.position.z +=
            rotatedDelta.y * smoothing * this.manager!.distance * this.speed * delta * 0.06;

        this.deltaPosition.multiplyScalar(1 - smoothing);
        if (this.deltaPosition.lengthSq() < 0.0001) {
            this.deltaPosition.set(0, 0);
        }
    }

    onKeyDown = (evt: KeyboardEvent) => {
        if (KeyCombination.oneDown(evt, ...KeyMoveControls.KEYS.UP)) {
            this.up = true;
            evt.preventDefault();
        }
        if (KeyCombination.oneDown(evt, ...KeyMoveControls.KEYS.DOWN)) {
            this.down = true;
            evt.preventDefault();
        }
        if (KeyCombination.oneDown(evt, ...KeyMoveControls.KEYS.LEFT)) {
            this.left = true;
            evt.preventDefault();
        }
        if (KeyCombination.oneDown(evt, ...KeyMoveControls.KEYS.RIGHT)) {
            this.right = true;
            evt.preventDefault();
        }
    };

    onKeyUp = (evt: KeyboardEvent) => {
        if (KeyCombination.oneUp(evt, ...KeyMoveControls.KEYS.UP)) {
            this.up = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyMoveControls.KEYS.DOWN)) {
            this.down = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyMoveControls.KEYS.LEFT)) {
            this.left = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyMoveControls.KEYS.RIGHT)) {
            this.right = false;
        }
    };

    onStop = (_evt: FocusEvent) => {
        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;
    };
}

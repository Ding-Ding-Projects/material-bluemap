import { MathUtils } from "three";
import { KeyCombination } from "../../KeyCombination";
import { MapControls } from "../MapControls";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class KeyZoomControls {
    static KEYS = {
        IN: [new KeyCombination("NumpadAdd"), new KeyCombination("Insert")],
        OUT: [new KeyCombination("NumpadSubtract"), new KeyCombination("Home")],
    };

    target: EventTarget;
    manager: ControlsManager | null;

    deltaZoom: number;

    in: boolean;
    out: boolean;

    speed: number;
    stiffness: number;

    constructor(target: EventTarget, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.deltaZoom = 0;

        this.in = false;
        this.out = false;

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
        if (this.in) this.deltaZoom -= 1;
        if (this.out) this.deltaZoom += 1;

        if (this.deltaZoom === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.distance *= Math.pow(
            1.5,
            this.deltaZoom * smoothing * this.speed * delta * 0.06,
        );
        this.manager!.angle = Math.min(
            this.manager!.angle,
            MapControls.getMaxPerspectiveAngleForDistance(this.manager!.distance),
        );

        this.deltaZoom *= 1 - smoothing;
        if (Math.abs(this.deltaZoom) < 0.0001) {
            this.deltaZoom = 0;
        }
    }

    onKeyDown = (evt: KeyboardEvent) => {
        if (KeyCombination.oneDown(evt, ...KeyZoomControls.KEYS.IN)) {
            this.in = true;
            evt.preventDefault();
        }
        if (KeyCombination.oneDown(evt, ...KeyZoomControls.KEYS.OUT)) {
            this.out = true;
            evt.preventDefault();
        }
    };

    onKeyUp = (evt: KeyboardEvent) => {
        if (KeyCombination.oneUp(evt, ...KeyZoomControls.KEYS.IN)) {
            this.in = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyZoomControls.KEYS.OUT)) {
            this.out = false;
        }
    };

    onStop = (_evt: FocusEvent) => {
        this.in = false;
        this.out = false;
    };
}

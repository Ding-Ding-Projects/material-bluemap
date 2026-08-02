// eslint-disable-next-line @typescript-eslint/no-unused-vars -- unused `Vector2` import kept from upstream
import { MathUtils, Vector2 } from "three";
import { MapControls } from "./MapControls";
import type { ControlsManager } from "../ControlsManager";
import type { Map } from "../../map/Map";

export class MapHeightControls {
    manager: ControlsManager | null;

    cameraHeightStiffness: number;
    targetHeightStiffness: number;

    targetHeight: number;
    cameraHeight: number;

    minCameraHeight: number;
    distanceTagretHeight: number;

    constructor(cameraHeightStiffness: number, targetHeightStiffness: number) {
        this.manager = null;

        this.cameraHeightStiffness = cameraHeightStiffness;
        this.targetHeightStiffness = targetHeightStiffness;

        this.targetHeight = 0;
        this.cameraHeight = 0;

        this.minCameraHeight = 0;
        this.distanceTagretHeight = 0;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;
    }

    stop(): void {}

    update(delta: number, map: Map): void {
        // adjust target height
        this.updateHeights(delta, map);
        this.manager!.position.y = Math.max(this.manager!.position.y, this.getSuggestedHeight());
    }

    updateHeights(delta: number, map: Map): void {
        //target height
        let targetSmoothing = this.targetHeightStiffness / (16.666 / delta);
        targetSmoothing = MathUtils.clamp(targetSmoothing, 0, 1);

        const targetTerrainHeight =
            (map.terrainHeightAt(this.manager!.position.x, this.manager!.position.z) as number) +
                3 || 0;

        const targetDelta = targetTerrainHeight - this.targetHeight;
        this.targetHeight += targetDelta * targetSmoothing;
        if (Math.abs(targetDelta) < 0.001) this.targetHeight = targetTerrainHeight;

        // camera height
        this.minCameraHeight = 0;
        const maxAngle = MapControls.getMaxPerspectiveAngleForDistance(this.manager!.distance);
        if (maxAngle >= 0.1) {
            let cameraSmoothing = this.cameraHeightStiffness / (16.666 / delta);
            cameraSmoothing = MathUtils.clamp(cameraSmoothing, 0, 1);

            const cameraTerrainHeight =
                (map.terrainHeightAt(
                    this.manager!.camera.position.x,
                    this.manager!.camera.position.z,
                ) as number) || 0;

            const cameraDelta = cameraTerrainHeight - this.cameraHeight;
            this.cameraHeight += cameraDelta * cameraSmoothing;
            if (Math.abs(cameraDelta) < 0.001) this.cameraHeight = cameraTerrainHeight;

            const maxAngleHeight = Math.cos(maxAngle) * this.manager!.distance;
            this.minCameraHeight = this.cameraHeight - maxAngleHeight + 1;
        }

        // adjust targetHeight by distance
        this.distanceTagretHeight = MathUtils.lerp(
            this.targetHeight,
            0,
            Math.min(this.manager!.distance / 500, 1),
        );
    }

    getSuggestedHeight(): number {
        return Math.max(this.distanceTagretHeight, this.minCameraHeight);
    }
}

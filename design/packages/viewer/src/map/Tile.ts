import type { Mesh, ShaderMaterial } from "three";
import type { TileLoader } from "./TileLoader";
import type { LowresTileLoader } from "./LowresTileLoader";

export class Tile {
    declare readonly isTile: boolean;

    model: Mesh | null;

    onLoad: (tile: Tile) => void;
    onUnload: (tile: Tile) => void;

    x: number;
    z: number;

    unloaded: boolean;
    loading: boolean;

    constructor(
        x: number,
        z: number,
        onLoad: (tile: Tile) => void,
        onUnload: (tile: Tile) => void,
    ) {
        Object.defineProperty(this, "isTile", { value: true });

        this.model = null;

        this.onLoad = onLoad;
        this.onUnload = onUnload;

        this.x = x;
        this.z = z;

        this.unloaded = true;
        this.loading = false;
    }

    load(tileLoader: TileLoader | LowresTileLoader, force: boolean = false): Promise<void> {
        if (this.loading) return Promise.reject("tile is already loading!");
        this.loading = true;

        this.unloaded = false;
        return tileLoader
            .load(this.x, this.z, () => this.unloaded, force)
            .then(
                (model) => {
                    if (this.unloaded) {
                        Tile.disposeModel(model);
                        return;
                    }

                    this.unload();
                    this.unloaded = false;

                    this.model = model;
                    this.onLoad(this);
                },
                () => {
                    this.unload();
                },
            )
            .finally(() => {
                this.loading = false;
            });
    }

    unload(): void {
        this.unloaded = true;
        if (this.model) {
            this.onUnload(this);

            Tile.disposeModel(this.model);

            this.model = null;
        }
    }

    static disposeModel(model: Mesh): void {
        if (model.userData?.tileType === "hires") {
            model.geometry.dispose();
        } else if (model.userData?.tileType === "lowres") {
            (model.material as ShaderMaterial).uniforms.textureImage!.value.dispose();
            (model.material as ShaderMaterial).dispose();
        }
    }

    get loaded(): boolean {
        return !!this.model;
    }
}

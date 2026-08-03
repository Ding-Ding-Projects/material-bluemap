import { Registry, type Key, type Keyed } from "@material-bluemap/shared";
import type { DataPack } from "../resources/pack/datapack/DataPack.js";
import type { World } from "./World.js";
import { worldDataPacks, type WorldLoader } from "./WorldLoader.js";

export interface WorldLoaderType extends Keyed, WorldLoader {}

/** upstream: WorldLoaderType.Impl — delegates all WorldLoader methods to the given loader */
class Impl implements WorldLoaderType {
    constructor(
        private readonly key: Key,
        private readonly loader: WorldLoader,
    ) {}

    getKey(): Key {
        return this.key;
    }

    loadWorld(path: string, dimension: Key, dimensionType: Key | null, dataPack: DataPack): Promise<World> {
        return this.loader.loadWorld(path, dimension, dimensionType, dataPack);
    }

    worldDataPacks(path: string, dimension: Key): Promise<string[]> {
        return worldDataPacks(this.loader, path, dimension);
    }
}

export const WorldLoaderType = {
    /**
     * upstream additionally defines here:
     * <code>ANVIL = new Impl(Key.bluemap("anvil"), MCAWorld::load)</code>
     * and seeds the REGISTRY with it. The anvil loader implementation lives in the
     * mca package (world/mca/MCAWorld); it registers itself into this REGISTRY when
     * loaded, keeping this module free of a runtime dependency on it.
     */
    REGISTRY: new Registry<WorldLoaderType>(),

    Impl,
};

import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Key } from "@worldlens/shared";
import type { DataPack } from "../resources/pack/datapack/DataPack.js";
import type { World } from "./World.js";

export interface WorldLoader {
    /**
     * Loads the world (one dimension of a level) from a Path, a dimension-key, an optional dimension-type key and a DataPack.<br>
     * The Path is deserialized directly from the map-config and could either be directly the location of the world-data (world-folder)
     * or it could be the path to another config-file that is providing more information on how to load this world for the WorldLoader.<br>
     * It is up to the implementation of the WorldLoader how to interpret the path.
     */
    loadWorld(path: string, dimension: Key, dimensionType: Key | null, dataPack: DataPack): Promise<World>;

    /**
     * Returns a list of DataPacks that should be loaded additionally when loading the provided Path / dimension.
     * (upstream interface-default: lists the world's "datapacks" folder — use the
     * exported {@link worldDataPacks} helper to invoke this with the default applied)
     */
    worldDataPacks?(path: string, dimension: Key): Promise<string[]>;
}

/**
 * Invokes {@link WorldLoader#worldDataPacks}, falling back to the upstream
 * interface-default of listing the world's "datapacks" folder.
 */
export async function worldDataPacks(loader: WorldLoader, path: string, dimension: Key): Promise<string[]> {
    if (loader.worldDataPacks !== undefined) return loader.worldDataPacks(path, dimension);

    const worldPacksFolder = resolve(path, "datapacks");

    // Files.isDirectory(worldPacksFolder)
    let isDirectory: boolean;
    try {
        isDirectory = (await stat(worldPacksFolder)).isDirectory();
    } catch {
        isDirectory = false;
    }
    if (!isDirectory) return [];

    const entries = await readdir(worldPacksFolder);
    return entries.map((name) => resolve(worldPacksFolder, name));
}

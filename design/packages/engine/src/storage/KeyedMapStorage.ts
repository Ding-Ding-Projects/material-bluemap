import { Key } from "@worldlens/shared";
import { Compression } from "./compression/Compression.js";
import type { GridStorage } from "./GridStorage.js";
import type { ItemStorage } from "./ItemStorage.js";
import { MapStorage, type DoublePredicate } from "./MapStorage.js";

/**
 * upstream: storage/KeyedMapStorage.java
 *
 * A {@link MapStorage} whose sub-storages are addressed by a {@link Key}, so an
 * implementation only has to supply {@link grid} and {@link item}.
 */
export abstract class KeyedMapStorage implements MapStorage {
    private static readonly HIRES_TILES_KEY: Key = Key.bluemap("hires");
    private static readonly TILE_STATE_KEY: Key = Key.bluemap("tile-state");
    private static readonly CHUNK_STATE_KEY: Key = Key.bluemap("chunk-state");
    private static readonly REGION_STATE_KEY: Key = Key.bluemap("region-state");
    private static readonly SETTINGS_KEY: Key = Key.bluemap("settings");
    private static readonly TEXTURES_KEY: Key = Key.bluemap("textures");
    private static readonly MARKERS_KEY: Key = Key.bluemap("markers");
    private static readonly PLAYERS_KEY: Key = Key.bluemap("players");

    private readonly compression: Compression;

    constructor(compression: Compression) {
        this.compression = compression;
    }

    hiresTiles(): GridStorage {
        return this.grid(KeyedMapStorage.HIRES_TILES_KEY, this.compression);
    }

    lowresTiles(lod: number): GridStorage {
        return this.grid(Key.bluemap("lowres/" + lod), Compression.NONE);
    }

    tileState(): GridStorage {
        return this.grid(KeyedMapStorage.TILE_STATE_KEY, Compression.GZIP);
    }

    chunkState(): GridStorage {
        return this.grid(KeyedMapStorage.CHUNK_STATE_KEY, Compression.GZIP);
    }

    regionState(): GridStorage {
        return this.grid(KeyedMapStorage.REGION_STATE_KEY, Compression.GZIP);
    }

    asset(name: string): ItemStorage {
        return this.item(
            Key.bluemap("asset/" + MapStorage.escapeAssetName(name)),
            Compression.NONE,
        );
    }

    settings(): ItemStorage {
        return this.item(KeyedMapStorage.SETTINGS_KEY, Compression.NONE);
    }

    textures(): ItemStorage {
        return this.item(KeyedMapStorage.TEXTURES_KEY, this.compression);
    }

    markers(): ItemStorage {
        return this.item(KeyedMapStorage.MARKERS_KEY, Compression.NONE);
    }

    players(): ItemStorage {
        return this.item(KeyedMapStorage.PLAYERS_KEY, Compression.NONE);
    }

    /**
     * Returns a {@link GridStorage} for the given {@link Key}.<br>
     * The compressionHint can be used if a new {@link GridStorage} needs to be created, but is not guaranteed.
     */
    abstract grid(key: Key, compressionHint: Compression): GridStorage;

    /**
     * Returns a {@link ItemStorage} for the given {@link Key}.<br>
     * The compressionHint can be used if a new {@link ItemStorage} needs to be created, but is not guaranteed.
     */
    abstract item(key: Key, compressionHint: Compression): ItemStorage;

    abstract delete(onProgress?: DoublePredicate): Promise<void>;

    abstract exists(): Promise<boolean>;

    abstract isClosed(): boolean;
}

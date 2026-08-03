import type { GridStorage } from "./GridStorage.js";
import type { ItemStorage } from "./ItemStorage.js";

/**
 * upstream: storage/MapStorage.java
 *
 * A function that takes in a progress-percentage and returns true if the deletion should
 * continue or false if it should be aborted (upstream: {@code java.util.function.DoublePredicate}).
 */
export type DoublePredicate = (progress: number) => boolean;

export interface MapStorage {
    /**
     * Returns the {@link GridStorage} holding the maps hires-tiles
     */
    hiresTiles(): GridStorage;

    /**
     * Returns the {@link GridStorage} holding the maps lowres-tiles of the given lod level
     */
    lowresTiles(lod: number): GridStorage;

    /**
     * Returns a {@link GridStorage} for the tile-state (meta-) data of this map
     */
    tileState(): GridStorage;

    /**
     * Returns a {@link GridStorage} for the chunk-state (meta-) data of this map
     */
    chunkState(): GridStorage;

    /**
     * Returns a {@link GridStorage} for the region-state (meta-) data of this map
     */
    regionState(): GridStorage;

    /**
     * Returns a {@link ItemStorage} for a map asset with the given name
     */
    asset(name: string): ItemStorage;

    /**
     * Returns a {@link ItemStorage} for the settings (settings.json) of this map
     */
    settings(): ItemStorage;

    /**
     * Returns a {@link ItemStorage} for the texture-data (textures.json) of this map
     */
    textures(): ItemStorage;

    /**
     * Returns a {@link ItemStorage} for the marker-data (live/markers.json) of this map
     */
    markers(): ItemStorage;

    /**
     * Returns a {@link ItemStorage} for the player-data (live/players.json) of this map
     */
    players(): ItemStorage;

    /**
     * Deletes the entire map from the storage.
     * @param onProgress a function that takes in a progress-percentage and returns true
     *                   if the deletion should continue or false if it should be aborted.
     *                   No guarantees are made on how often (if at all) this method is actually being called and if the
     *                   progress is actually aborted when false is returned.
     *                   Omitting it deletes everything (upstream's {@code delete()} default).
     */
    delete(onProgress?: DoublePredicate): Promise<void>;

    /**
     * Tests whether this map currently exists on the storage or not
     */
    exists(): Promise<boolean>;

    /**
     * Checks if this storage is closed
     */
    isClosed(): boolean;
}

export const MapStorage = {
    /** upstream: {@code static String escapeAssetName(String name)} */
    escapeAssetName(name: string): string {
        return (
            name
                // java's \w is ascii-only, exactly as javascript's is
                .replace(/[^\w\d.\-_/]/g, "_")
                // java's String#replace(CharSequence, CharSequence) replaces every
                // non-overlapping occurrence, left to right
                .replace(/\.\./g, "_.")
        );
    },
};

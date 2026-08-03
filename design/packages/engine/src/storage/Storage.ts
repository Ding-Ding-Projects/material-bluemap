import type { MapStorage } from "./MapStorage.js";

/**
 * upstream: storage/Storage.java
 *
 * Upstream extends {@code Closeable}; the port declares {@link close} directly.
 */
export interface Storage {
    /**
     * Does everything necessary to initialize this storage.
     * (E.g. create tables on a database if they don't exist or upgrade older data).
     */
    initialize(): Promise<void>;

    /**
     * Returns the {@link MapStorage} for the given mapId.<br>
     * <br>
     * If this method is invoked multiple times with the same <code>mapId</code>, it is important that the returned MapStorage should at least
     * be equal (<code>equals() == true</code>) to the previously returned storages!
     */
    map(mapId: string): MapStorage;

    /**
     * Fetches and returns all map-id's in this storage
     *
     * (Upstream returns a lazy {@code Stream<String>}; the port collects it.)
     */
    mapIds(): Promise<string[]>;

    /**
     * Checks if this storage is closed
     */
    isClosed(): boolean;

    close(): Promise<void>;
}

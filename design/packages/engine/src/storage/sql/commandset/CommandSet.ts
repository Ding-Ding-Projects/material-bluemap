import type { Key } from "@material-bluemap/shared";
import type { Compression } from "../../compression/Compression.js";

/** upstream: {@code CommandSet.TilePosition} (a record) */
export interface TilePosition {
    readonly x: number;
    readonly z: number;
}

/**
 * upstream: storage/sql/commandset/CommandSet.java
 *
 * Every method here is the port of one abstract upstream method — same name, same
 * parameters (minus the `IOException` upstream declares and this port expresses as a
 * rejected promise instead). `AbstractCommandSet` implements the orchestration once;
 * the three dialect subclasses only supply the SQL text.
 */
export interface CommandSet {
    initializeTables(): Promise<void>;

    writeItem(mapId: string, key: Key, compression: Compression, bytes: Uint8Array): Promise<void>;
    readItem(mapId: string, key: Key, compression: Compression): Promise<Buffer | null>;
    deleteItem(mapId: string, key: Key): Promise<void>;
    hasItem(mapId: string, key: Key, compression: Compression): Promise<boolean>;

    writeGridItem(
        mapId: string,
        key: Key,
        x: number,
        z: number,
        compression: Compression,
        bytes: Uint8Array,
    ): Promise<void>;
    readGridItem(
        mapId: string,
        key: Key,
        x: number,
        z: number,
        compression: Compression,
    ): Promise<Buffer | null>;
    deleteGridItem(mapId: string, key: Key, x: number, z: number): Promise<void>;
    hasGridItem(
        mapId: string,
        key: Key,
        x: number,
        z: number,
        compression: Compression,
    ): Promise<boolean>;

    /** One page of grid items — the primitive `collectPages` (the `PageSpliterator` port) drains. */
    listGridItems(
        mapId: string,
        key: Key,
        compression: Compression,
        start: number,
        count: number,
    ): Promise<TilePosition[]>;

    countMapGridsItems(mapId: string): Promise<number>;
    /** Deletes up to `limit` grid rows for `mapId`; returns how many were actually deleted. */
    purgeMapGrids(mapId: string, limit: number): Promise<number>;
    purgeMap(mapId: string): Promise<void>;

    hasMap(mapId: string): Promise<boolean>;
    /** One page of map ids — the primitive `collectPages` drains. */
    listMapIds(start: number, count: number): Promise<string[]>;

    isClosed(): boolean;
    close(): Promise<void>;
}

import type { Key } from "@material-bluemap/shared";
import type { Compression } from "../compression/Compression.js";
import type { GridStorage } from "../GridStorage.js";
import type { ItemStorage } from "../ItemStorage.js";
import { KeyedMapStorage } from "../KeyedMapStorage.js";
import type { DoublePredicate } from "../MapStorage.js";
import type { CommandSet } from "./commandset/CommandSet.js";
import { SQLGridStorage } from "./SQLGridStorage.js";
import { SQLItemStorage } from "./SQLItemStorage.js";

/** upstream: the literal `1000` passed to `sql.purgeMapGrids(mapId, 1000)` in `delete` */
const DELETE_PAGE_SIZE = 1000;

/**
 * upstream: storage/sql/SQLMapStorage.java
 *
 * Upstream caches its per-key sub-storages in a caffeine `Cache<Key, ...>`; the port
 * uses a plain `Map` keyed by the key's formatted string, matching `FileMapStorage`'s
 * `lowresGridStorages` cache and every other per-key cache this port already carries.
 */
export class SQLMapStorage extends KeyedMapStorage {
    private readonly mapId: string;
    private readonly sql: CommandSet;

    private readonly itemStorages = new Map<string, ItemStorage>();
    private readonly gridStorages = new Map<string, GridStorage>();

    constructor(mapId: string, sql: CommandSet, compression: Compression) {
        super(compression);
        this.mapId = mapId;
        this.sql = sql;
    }

    item(key: Key, compression: Compression): ItemStorage {
        const formatted = key.getFormatted();
        let item = this.itemStorages.get(formatted);
        if (item === undefined) {
            item = new SQLItemStorage(this.sql, this.mapId, key, compression);
            this.itemStorages.set(formatted, item);
        }
        return item;
    }

    grid(key: Key, compression: Compression): GridStorage {
        const formatted = key.getFormatted();
        let grid = this.gridStorages.get(formatted);
        if (grid === undefined) {
            grid = new SQLGridStorage(this.sql, this.mapId, key, compression);
            this.gridStorages.set(formatted, grid);
        }
        return grid;
    }

    /**
     * upstream: deletes tiles in 1000-row steps to report progress, then purges the map
     * row itself (which cascades to every remaining item-storage row via the schema's
     * `ON DELETE CASCADE` foreign keys).
     */
    async delete(onProgress: DoublePredicate = () => true): Promise<void> {
        const tileCount = await this.sql.countMapGridsItems(this.mapId);
        if (tileCount > 0) {
            let totalDeleted = 0;
            let deleted: number;
            do {
                deleted = await this.sql.purgeMapGrids(this.mapId, DELETE_PAGE_SIZE);
                totalDeleted += deleted;

                if (!onProgress(totalDeleted / tileCount)) return;
            } while (deleted > 0 && totalDeleted < tileCount);
        }

        await this.sql.purgeMap(this.mapId);
    }

    async exists(): Promise<boolean> {
        return this.sql.hasMap(this.mapId);
    }

    isClosed(): boolean {
        return this.sql.isClosed();
    }
}

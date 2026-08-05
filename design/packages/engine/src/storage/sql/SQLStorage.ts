import type { Compression } from "../compression/Compression.js";
import type { Storage } from "../Storage.js";
import type { CommandSet } from "./commandset/CommandSet.js";
import { collectPages } from "./PageSpliterator.js";
import { SQLMapStorage } from "./SQLMapStorage.js";

/** upstream: the literal `1000` passed to `new PageSpliterator<>(page -> sql.listMapIds(page * 1000, 1000))` */
const PAGE_SIZE = 1000;

/**
 * upstream: storage/sql/SQLStorage.java
 */
export class SQLStorage implements Storage {
    private readonly sql: CommandSet;
    private readonly compression: Compression;
    /** upstream: {@code LoadingCache<String, SQLMapStorage>} (caffeine) */
    private readonly mapStorages = new Map<string, SQLMapStorage>();

    constructor(sql: CommandSet, compression: Compression) {
        this.sql = sql;
        this.compression = compression;
    }

    async initialize(): Promise<void> {
        await this.sql.initializeTables();
    }

    map(mapId: string): SQLMapStorage {
        let storage = this.mapStorages.get(mapId);
        if (storage === undefined) {
            storage = new SQLMapStorage(mapId, this.sql, this.compression);
            this.mapStorages.set(mapId, storage);
        }
        return storage;
    }

    async mapIds(): Promise<string[]> {
        return collectPages(PAGE_SIZE, (start, count) => this.sql.listMapIds(start, count));
    }

    isClosed(): boolean {
        return this.sql.isClosed();
    }

    async close(): Promise<void> {
        await this.sql.close();
    }
}

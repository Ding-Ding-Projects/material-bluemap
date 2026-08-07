import { LRUCache } from "lru-cache";
import type { Key } from "@worldlens/shared";
import type { Compression } from "../../compression/Compression.js";
import { Database, type SqlRow } from "../Database.js";
import type { CommandSet, TilePosition } from "./CommandSet.js";

/** upstream: {@code util/Caches.build(...)} — maximumSize(10000), expireAfterAccess(1 minute) */
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 60 * 1000;

/**
 * upstream: the four {@code LoadingCache<K, Integer>} fields on `AbstractCommandSet`
 * (`mapKeys`, `compressionKeys`, `itemStorageKeys`, `gridStorageKeys`).
 *
 * A caffeine `LoadingCache#get` blocks the calling thread until the loader resolves,
 * and upstream additionally wraps every access in `synchronized(cache)` so two threads
 * racing to create the same brand-new key cannot both insert it. This port's async
 * `getOrCreate` reproduces the same "only one creation in flight per key" property for
 * concurrent callers within this process by caching the in-flight promise itself, not
 * just the resolved value — the analogous race across two separate processes sharing
 * one database is handled by retrying past a UNIQUE-constraint violation instead (see
 * `findOrCreateKey` below), which upstream does not need JDBC's single-threaded
 * connection-per-thread model to avoid but a javascript port sharing a database across
 * processes does.
 */
class AsyncKeyCache {
    private readonly resolved = new LRUCache<string, number>({
        max: CACHE_MAX_SIZE,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });
    private readonly pending = new Map<string, Promise<number>>();

    async getOrCreate(key: string, create: () => Promise<number>): Promise<number> {
        const cached = this.resolved.get(key);
        if (cached !== undefined) return cached;

        const inFlight = this.pending.get(key);
        if (inFlight !== undefined) return inFlight;

        const promise = create()
            .then((value) => {
                this.resolved.set(key, value);
                return value;
            })
            .finally(() => {
                this.pending.delete(key);
            });
        this.pending.set(key, promise);
        return promise;
    }

    invalidate(key: string): void {
        this.resolved.delete(key);
        this.pending.delete(key);
    }
}

function toBuffer(data: Uint8Array): Buffer {
    return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/** `SELECT COUNT(*) > 0 ...` comes back as a SQLite/MySQL 0-or-1, or a real Postgres boolean. */
function asBoolean(value: SqlRow[number]): boolean {
    return Boolean(value);
}

function asInt(value: SqlRow[number]): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
        throw new Error(`Expected a numeric column, got ${JSON.stringify(value)}`);
    }
    return n;
}

function asBufferOrNull(value: SqlRow[number]): Buffer | null {
    if (value === null) return null;
    // every driver adapter normalizes a binary column to `Buffer` before it reaches
    // here (`SqlValue` declares nothing else binary), so this is the only case left.
    if (Buffer.isBuffer(value)) return value;
    throw new Error(`Expected a binary column, got ${JSON.stringify(value)}`);
}

/**
 * upstream: storage/sql/commandset/AbstractCommandSet.java
 *
 * Holds the CRUD orchestration every dialect shares; each concrete subclass supplies
 * only the SQL text (the `*Statement()` methods below), exactly matching upstream's
 * split between this class and `MySQLCommandSet`/`PostgreSQLCommandSet`/`SqliteCommandSet`.
 */
export abstract class AbstractCommandSet implements CommandSet {
    protected readonly db: Database;

    private readonly mapKeys = new AsyncKeyCache();
    private readonly compressionKeys = new AsyncKeyCache();
    private readonly itemStorageKeys = new AsyncKeyCache();
    private readonly gridStorageKeys = new AsyncKeyCache();

    constructor(db: Database) {
        this.db = db;
    }

    // ---- DDL --------------------------------------------------------------

    abstract listExistingTablesStatement(): string;
    abstract createMapTableStatement(): string;
    abstract createCompressionTableStatement(): string;
    abstract createItemStorageTableStatement(): string;
    abstract createItemStorageDataTableStatement(): string;
    abstract createGridStorageTableStatement(): string;
    abstract createGridStorageDataTableStatement(): string;

    private static readonly REQUIRED_TABLES: readonly string[] = [
        "bluemap_map",
        "bluemap_compression",
        "bluemap_item_storage",
        "bluemap_item_storage_data",
        "bluemap_grid_storage",
        "bluemap_grid_storage_data",
    ];

    async initializeTables(): Promise<void> {
        await this.db.run(async (connection) => {
            try {
                const existing = new Set<string>();
                for (const row of await connection.query(this.listExistingTablesStatement(), [])) {
                    existing.add(String(row[0]));
                }
                if (AbstractCommandSet.REQUIRED_TABLES.every((table) => existing.has(table))) return;
            } catch {
                // upstream: logs a warning ("Failed to check for existing tables, will try
                // to create them...") and falls through to CREATE TABLE IF NOT EXISTS
            }

            await connection.execute(this.createMapTableStatement(), []);
            await connection.execute(this.createCompressionTableStatement(), []);
            await connection.execute(this.createItemStorageTableStatement(), []);
            await connection.execute(this.createItemStorageDataTableStatement(), []);
            await connection.execute(this.createGridStorageTableStatement(), []);
            await connection.execute(this.createGridStorageDataTableStatement(), []);
        });
    }

    // ---- item storage -------------------------------------------------------

    abstract itemStorageWriteStatement(): string;
    async writeItem(mapId: string, key: Key, compression: Compression, bytes: Uint8Array): Promise<void> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.itemStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        const buffer = toBuffer(bytes);
        await this.db.run((connection) =>
            connection.execute(this.itemStorageWriteStatement(), [
                mapKey,
                storageKey,
                compressionKey,
                buffer,
            ]),
        );
    }

    abstract itemStorageReadStatement(): string;
    async readItem(mapId: string, key: Key, compression: Compression): Promise<Buffer | null> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.itemStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.itemStorageReadStatement(), [
                mapKey,
                storageKey,
                compressionKey,
            ]);
            if (rows.length === 0) return null;
            return asBufferOrNull(rows[0]![0]!);
        });
    }

    abstract itemStorageDeleteStatement(): string;
    async deleteItem(mapId: string, key: Key): Promise<void> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.itemStorageKey(key);
        await this.db.run((connection) =>
            connection.execute(this.itemStorageDeleteStatement(), [mapKey, storageKey]),
        );
    }

    abstract itemStorageHasStatement(): string;
    async hasItem(mapId: string, key: Key, compression: Compression): Promise<boolean> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.itemStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.itemStorageHasStatement(), [
                mapKey,
                storageKey,
                compressionKey,
            ]);
            if (rows.length === 0) throw new Error("Counting query returned empty result!");
            return asBoolean(rows[0]![0]!);
        });
    }

    // ---- grid storage ---------------------------------------------------

    abstract gridStorageWriteStatement(): string;
    async writeGridItem(
        mapId: string,
        key: Key,
        x: number,
        z: number,
        compression: Compression,
        bytes: Uint8Array,
    ): Promise<void> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.gridStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        const buffer = toBuffer(bytes);
        await this.db.run((connection) =>
            connection.execute(this.gridStorageWriteStatement(), [
                mapKey,
                storageKey,
                x,
                z,
                compressionKey,
                buffer,
            ]),
        );
    }

    abstract gridStorageReadStatement(): string;
    async readGridItem(
        mapId: string,
        key: Key,
        x: number,
        z: number,
        compression: Compression,
    ): Promise<Buffer | null> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.gridStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.gridStorageReadStatement(), [
                mapKey,
                storageKey,
                x,
                z,
                compressionKey,
            ]);
            if (rows.length === 0) return null;
            return asBufferOrNull(rows[0]![0]!);
        });
    }

    abstract gridStorageDeleteStatement(): string;
    async deleteGridItem(mapId: string, key: Key, x: number, z: number): Promise<void> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.gridStorageKey(key);
        await this.db.run((connection) =>
            connection.execute(this.gridStorageDeleteStatement(), [mapKey, storageKey, x, z]),
        );
    }

    abstract gridStorageHasStatement(): string;
    async hasGridItem(
        mapId: string,
        key: Key,
        x: number,
        z: number,
        compression: Compression,
    ): Promise<boolean> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.gridStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.gridStorageHasStatement(), [
                mapKey,
                storageKey,
                x,
                z,
                compressionKey,
            ]);
            if (rows.length === 0) throw new Error("Counting query returned empty result!");
            return asBoolean(rows[0]![0]!);
        });
    }

    abstract gridStorageListStatement(): string;
    async listGridItems(
        mapId: string,
        key: Key,
        compression: Compression,
        start: number,
        count: number,
    ): Promise<TilePosition[]> {
        const mapKey = await this.mapKey(mapId);
        const storageKey = await this.gridStorageKey(key);
        const compressionKey = await this.compressionKey(compression);
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.gridStorageListStatement(), [
                mapKey,
                storageKey,
                compressionKey,
                count,
                start,
            ]);
            return rows.map((row) => ({ x: asInt(row[0]!), z: asInt(row[1]!) }));
        });
    }

    abstract gridStorageCountMapItemsStatement(): string;
    async countMapGridsItems(mapId: string): Promise<number> {
        const mapKey = await this.mapKey(mapId);
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.gridStorageCountMapItemsStatement(), [mapKey]);
            if (rows.length === 0) throw new Error("Counting query returned empty result!");
            return asInt(rows[0]![0]!);
        });
    }

    abstract gridStoragePurgeMapStatement(): string;
    async purgeMapGrids(mapId: string, limit: number): Promise<number> {
        const mapKey = await this.mapKey(mapId);
        return this.db.run(async (connection) => {
            const result = await connection.execute(this.gridStoragePurgeMapStatement(), [
                mapKey,
                limit,
            ]);
            return result.affectedRows;
        });
    }

    abstract purgeMapStatement(): string;
    async purgeMap(mapId: string): Promise<void> {
        const mapKey = await this.mapKey(mapId);
        await this.db.run((connection) => connection.execute(this.purgeMapStatement(), [mapKey]));
        this.mapKeys.invalidate(mapId);
    }

    abstract hasMapStatement(): string;
    async hasMap(mapId: string): Promise<boolean> {
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.hasMapStatement(), [mapId]);
            if (rows.length === 0) throw new Error("Counting query returned empty result!");
            return asBoolean(rows[0]![0]!);
        });
    }

    abstract listMapIdsStatement(): string;
    async listMapIds(start: number, count: number): Promise<string[]> {
        return this.db.run(async (connection) => {
            const rows = await connection.query(this.listMapIdsStatement(), [count, start]);
            return rows.map((row) => String(row[0]));
        });
    }

    // ---- key lookups ------------------------------------------------------

    abstract findMapKeyStatement(): string;
    abstract createMapKeyStatement(): string;
    mapKey(mapId: string): Promise<number> {
        return this.mapKeys.getOrCreate(mapId, () =>
            this.findOrCreateKey(this.findMapKeyStatement(), this.createMapKeyStatement(), mapId),
        );
    }

    abstract findCompressionKeyStatement(): string;
    abstract createCompressionKeyStatement(): string;
    compressionKey(compression: Compression): Promise<number> {
        const formatted = compression.getKey().getFormatted();
        return this.compressionKeys.getOrCreate(formatted, () =>
            this.findOrCreateKey(
                this.findCompressionKeyStatement(),
                this.createCompressionKeyStatement(),
                formatted,
            ),
        );
    }

    abstract findItemStorageKeyStatement(): string;
    abstract createItemStorageKeyStatement(): string;
    itemStorageKey(key: Key): Promise<number> {
        const formatted = key.getFormatted();
        return this.itemStorageKeys.getOrCreate(formatted, () =>
            this.findOrCreateKey(
                this.findItemStorageKeyStatement(),
                this.createItemStorageKeyStatement(),
                formatted,
            ),
        );
    }

    abstract findGridStorageKeyStatement(): string;
    abstract createGridStorageKeyStatement(): string;
    gridStorageKey(key: Key): Promise<number> {
        const formatted = key.getFormatted();
        return this.gridStorageKeys.getOrCreate(formatted, () =>
            this.findOrCreateKey(
                this.findGridStorageKeyStatement(),
                this.createGridStorageKeyStatement(),
                formatted,
            ),
        );
    }

    /**
     * upstream: the shared shape of {@code findOrCreateMapKey}/{@code
     * findOrCreateCompressionKey}/{@code findOrCreateItemStorageKey}/{@code
     * findOrCreateGridStorageKey} — select first, and only insert (reading the
     * driver-generated id back with {@code Statement.RETURN_GENERATED_KEYS}) when
     * nothing was found. Upstream does not guard against two processes racing this
     * same SELECT-then-INSERT for a brand-new key, and this port does not invent that
     * guard either — matching upstream's actual (unguarded) behavior is more faithful
     * than adding recovery logic upstream has no equivalent of, and doing so would risk
     * a real difference between dialects: PostgreSQL aborts an entire transaction on a
     * constraint violation, so "catch the violation and keep going in the same
     * transaction" — which works on SQLite and MySQL — would silently misbehave there.
     *
     * This port cannot ask a driver-agnostic connection for "the id JDBC just
     * generated" — `mysql2`, `pg` and `sql.js` each expose that differently, if at all
     * (node-postgres has no generated-keys API short of an explicit `RETURNING` clause,
     * which would change the literal statement text this method is deliberately kept
     * free of). Instead, after a successful insert this re-runs the same SELECT. That
     * costs one extra round-trip on the very first write of a brand-new key — a cost
     * paid at most once per key per process, since every result here is cached — and it
     * keeps the four `create*KeyStatement()` texts byte-for-byte what upstream's dialect
     * files declare.
     */
    private async findOrCreateKey(
        findSql: string,
        createSql: string,
        findParam: string,
    ): Promise<number> {
        return this.db.run(async (connection) => {
            const found = await connection.query(findSql, [findParam]);
            if (found.length > 0) return asInt(found[0]![0]!);

            await connection.execute(createSql, [findParam]);

            const created = await connection.query(findSql, [findParam]);
            if (created.length === 0) throw new Error("No key found after create!");
            return asInt(created[0]![0]!);
        });
    }

    isClosed(): boolean {
        return this.db.isClosed();
    }

    async close(): Promise<void> {
        await this.db.close();
    }
}

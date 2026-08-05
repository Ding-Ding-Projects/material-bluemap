import { describe, expect, it } from "vitest";
import type { Database } from "../Database.js";
import { PostgreSQLCommandSet } from "./PostgreSQLCommandSet.js";

/**
 * Statement-text contract test, transcribed from
 * `vendor/BlueMap/core/.../storage/sql/commandset/PostgreSQLCommandSet.java`. See
 * `SqliteCommandSet.test.ts` for why whitespace is normalized before comparing.
 *
 * The `?` placeholders below are exactly what upstream's Java writes — JDBC's
 * `PreparedStatement` accepts `?` for every dialect it supports, PostgreSQL included.
 * node-postgres does not, so the port's driver adapter
 * (`../drivers/PostgresDriver.ts`) translates `?` to `$1, $2, ...` at the connection
 * boundary rather than changing this text; see `toPostgresPlaceholders`'s own test for
 * that translation.
 *
 * This dialect's SQL text is never run against a real PostgreSQL server on this
 * machine — see `../drivers/PostgresDriver.test.ts` for what *is* exercised.
 */
function norm(sql: string): string {
    return sql.trim().replace(/\s+/g, " ");
}

const sql = new PostgreSQLCommandSet({} as Database);

const EXPECTED: Record<string, string> = {
    listExistingTablesStatement: "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema()",
    createMapTableStatement:
        "CREATE TABLE IF NOT EXISTS bluemap_map ( id SMALLSERIAL PRIMARY KEY, map_id VARCHAR(190) UNIQUE NOT NULL )",
    createCompressionTableStatement:
        "CREATE TABLE IF NOT EXISTS bluemap_compression ( id SMALLSERIAL PRIMARY KEY, key VARCHAR(190) UNIQUE NOT NULL )",
    createItemStorageTableStatement:
        "CREATE TABLE IF NOT EXISTS bluemap_item_storage ( id SERIAL PRIMARY KEY, key VARCHAR(190) UNIQUE NOT NULL )",
    createItemStorageDataTableStatement:
        "CREATE TABLE IF NOT EXISTS bluemap_item_storage_data ( map SMALLINT NOT NULL REFERENCES bluemap_map (id) ON UPDATE RESTRICT ON DELETE CASCADE, storage INT NOT NULL REFERENCES bluemap_item_storage (id) ON UPDATE RESTRICT ON DELETE CASCADE, compression SMALLINT NOT NULL REFERENCES bluemap_compression (id) ON UPDATE RESTRICT ON DELETE CASCADE, data BYTEA NOT NULL, PRIMARY KEY (map, storage) )",
    createGridStorageTableStatement:
        "CREATE TABLE IF NOT EXISTS bluemap_grid_storage ( id SMALLSERIAL PRIMARY KEY, key VARCHAR(190) UNIQUE NOT NULL )",
    createGridStorageDataTableStatement:
        "CREATE TABLE IF NOT EXISTS bluemap_grid_storage_data ( map SMALLINT NOT NULL REFERENCES bluemap_map (id) ON UPDATE RESTRICT ON DELETE CASCADE, storage SMALLINT NOT NULL REFERENCES bluemap_grid_storage (id) ON UPDATE RESTRICT ON DELETE CASCADE, x INT NOT NULL, z INT NOT NULL, compression SMALLINT NOT NULL REFERENCES bluemap_compression (id) ON UPDATE RESTRICT ON DELETE CASCADE, data BYTEA NOT NULL, PRIMARY KEY (map, storage, x, z) )",
    itemStorageWriteStatement:
        "INSERT INTO bluemap_item_storage_data (map, storage, compression, data) VALUES (?, ?, ?, ?) ON CONFLICT (map, storage) DO UPDATE SET compression = excluded.compression, data = excluded.data",
    itemStorageReadStatement:
        "SELECT data FROM bluemap_item_storage_data WHERE map = ? AND storage = ? AND compression = ?",
    itemStorageDeleteStatement: "DELETE FROM bluemap_item_storage_data WHERE map = ? AND storage = ?",
    itemStorageHasStatement:
        "SELECT COUNT(*) > 0 FROM bluemap_item_storage_data WHERE map = ? AND storage = ? AND compression = ?",
    gridStorageWriteStatement:
        "INSERT INTO bluemap_grid_storage_data (map, storage, x, z, compression, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (map, storage, x, z) DO UPDATE SET compression = excluded.compression, data = excluded.data",
    gridStorageReadStatement:
        "SELECT data FROM bluemap_grid_storage_data WHERE map = ? AND storage = ? AND x = ? AND z = ? AND compression = ?",
    gridStorageDeleteStatement:
        "DELETE FROM bluemap_grid_storage_data WHERE map = ? AND storage = ? AND x = ? AND z = ?",
    gridStorageHasStatement:
        "SELECT COUNT(*) > 0 FROM bluemap_grid_storage_data WHERE map = ? AND storage = ? AND x = ? AND z = ? AND compression = ?",
    gridStorageListStatement:
        "SELECT x, z FROM bluemap_grid_storage_data WHERE map = ? AND storage = ? AND compression = ? LIMIT ? OFFSET ?",
    gridStorageCountMapItemsStatement: "SELECT COUNT(*) FROM bluemap_grid_storage_data WHERE map = ?",
    gridStoragePurgeMapStatement:
        "DELETE FROM bluemap_grid_storage_data WHERE CTID IN ( SELECT CTID FROM bluemap_grid_storage_data t WHERE t.map = ? LIMIT ? )",
    purgeMapStatement: "DELETE FROM bluemap_map WHERE id = ?",
    hasMapStatement: "SELECT COUNT(*) > 0 FROM bluemap_map m WHERE m.map_id = ?",
    listMapIdsStatement: "SELECT map_id FROM bluemap_map m LIMIT ? OFFSET ?",
    findMapKeyStatement: "SELECT id FROM bluemap_map WHERE map_id = ?",
    createMapKeyStatement: "INSERT INTO bluemap_map (map_id) VALUES (?)",
    findCompressionKeyStatement: "SELECT id FROM bluemap_compression WHERE key = ?",
    createCompressionKeyStatement: "INSERT INTO bluemap_compression (key) VALUES (?)",
    findItemStorageKeyStatement: "SELECT id FROM bluemap_item_storage WHERE key = ?",
    createItemStorageKeyStatement: "INSERT INTO bluemap_item_storage (key) VALUES (?)",
    findGridStorageKeyStatement: "SELECT id FROM bluemap_grid_storage WHERE key = ?",
    createGridStorageKeyStatement: "INSERT INTO bluemap_grid_storage (key) VALUES (?)",
};

describe("PostgreSQLCommandSet — matches upstream PostgreSQLCommandSet.java statement-for-statement", () => {
    for (const [method, expected] of Object.entries(EXPECTED)) {
        it(method, () => {
            const actual = (sql[method as keyof PostgreSQLCommandSet] as () => string).call(sql);
            expect(norm(actual)).toBe(expected);
        });
    }

    it("covers every statement method with an expectation", () => {
        const methods = Object.getOwnPropertyNames(PostgreSQLCommandSet.prototype).filter((name) =>
            name.endsWith("Statement"),
        );
        expect(methods.sort()).toEqual(Object.keys(EXPECTED).sort());
    });
});

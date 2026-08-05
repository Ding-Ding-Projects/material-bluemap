import { describe, expect, it } from "vitest";
import type { Database } from "../Database.js";
import { SqliteCommandSet } from "./SqliteCommandSet.js";

/**
 * Statement-text contract test — issue #32's "the table schema must match upstream's
 * exactly" requirement, checked mechanically rather than by eyeballing a diff.
 *
 * Each expected string below is transcribed from
 * `vendor/BlueMap/core/.../storage/sql/commandset/SqliteCommandSet.java`, one method at
 * a time. Whitespace is normalized on both sides before comparing (this port's template
 * literals are indented to match this file, not Java's text-block dedent rules), so the
 * comparison is over SQL tokens — keywords, identifiers, quoting, clause order — the
 * part that actually has to agree for a database file to mean the same thing to both
 * engines.
 */
function norm(sql: string): string {
    return sql.trim().replace(/\s+/g, " ");
}

const sql = new SqliteCommandSet({} as Database);

const EXPECTED: Record<string, string> = {
    listExistingTablesStatement: "SELECT `name` FROM `sqlite_master` WHERE `type` = 'table'",
    createMapTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_map` ( `id` INTEGER PRIMARY KEY AUTOINCREMENT, `map_id` TEXT UNIQUE NOT NULL ) STRICT",
    createCompressionTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_compression` ( `id` INTEGER PRIMARY KEY AUTOINCREMENT, `key` TEXT UNIQUE NOT NULL ) STRICT",
    createItemStorageTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_item_storage` ( `id` INTEGER PRIMARY KEY AUTOINCREMENT, `key` TEXT UNIQUE NOT NULL ) STRICT",
    createItemStorageDataTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_item_storage_data` ( `map` INTEGER NOT NULL, `storage` INTEGER NOT NULL, `compression` INTEGER NOT NULL, `data` BLOB NOT NULL, PRIMARY KEY (`map`, `storage`), CONSTRAINT `fk_bluemap_item_map` FOREIGN KEY (`map`) REFERENCES `bluemap_map` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_item` FOREIGN KEY (`storage`) REFERENCES `bluemap_item_storage` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_item_compression` FOREIGN KEY (`compression`) REFERENCES `bluemap_compression` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE ) STRICT",
    createGridStorageTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_grid_storage` ( `id` INTEGER PRIMARY KEY AUTOINCREMENT, `key` TEXT UNIQUE NOT NULL ) STRICT",
    createGridStorageDataTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_grid_storage_data` ( `map` INTEGER NOT NULL, `storage` INTEGER NOT NULL, `x` INTEGER NOT NULL, `z` INTEGER NOT NULL, `compression` INTEGER NOT NULL, `data` BLOB NOT NULL, PRIMARY KEY (`map`, `storage`, `x`, `z`), CONSTRAINT `fk_bluemap_grid_map` FOREIGN KEY (`map`) REFERENCES `bluemap_map` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_grid` FOREIGN KEY (`storage`) REFERENCES `bluemap_grid_storage` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_grid_compression` FOREIGN KEY (`compression`) REFERENCES `bluemap_compression` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE ) STRICT",
    itemStorageWriteStatement:
        "REPLACE INTO `bluemap_item_storage_data` (`map`, `storage`, `compression`, `data`) VALUES (?, ?, ?, ?)",
    itemStorageReadStatement:
        "SELECT `data` FROM `bluemap_item_storage_data` WHERE `map` = ? AND `storage` = ? AND `compression` = ?",
    itemStorageDeleteStatement: "DELETE FROM `bluemap_item_storage_data` WHERE `map` = ? AND `storage` = ?",
    itemStorageHasStatement:
        "SELECT COUNT(*) > 0 FROM `bluemap_item_storage_data` WHERE `map` = ? AND `storage` = ? AND `compression` = ?",
    gridStorageWriteStatement:
        "REPLACE INTO `bluemap_grid_storage_data` (`map`, `storage`, `x`, `z`, `compression`, `data`) VALUES (?, ?, ?, ?, ?, ?)",
    gridStorageReadStatement:
        "SELECT `data` FROM `bluemap_grid_storage_data` WHERE `map` = ? AND `storage` = ? AND `x` = ? AND `z` = ? AND `compression` = ?",
    gridStorageDeleteStatement:
        "DELETE FROM `bluemap_grid_storage_data` WHERE `map` = ? AND `storage` = ? AND `x` = ? AND `z` = ?",
    gridStorageHasStatement:
        "SELECT COUNT(*) > 0 FROM `bluemap_grid_storage_data` WHERE `map` = ? AND `storage` = ? AND `x` = ? AND `z` = ? AND `compression` = ?",
    gridStorageListStatement:
        "SELECT `x`, `z` FROM `bluemap_grid_storage_data` WHERE `map` = ? AND `storage` = ? AND `compression` = ? LIMIT ? OFFSET ?",
    gridStorageCountMapItemsStatement: "SELECT COUNT(*) FROM `bluemap_grid_storage_data` WHERE `map` = ?",
    gridStoragePurgeMapStatement:
        "DELETE FROM `bluemap_grid_storage_data` WHERE ROWID IN ( SELECT t.ROWID FROM `bluemap_grid_storage_data` t WHERE t.`map` = ? LIMIT ? )",
    purgeMapStatement: "DELETE FROM `bluemap_map` WHERE `id` = ?",
    hasMapStatement: "SELECT COUNT(*) > 0 FROM `bluemap_map` m WHERE m.`map_id` = ?",
    listMapIdsStatement: "SELECT `map_id` FROM `bluemap_map` m LIMIT ? OFFSET ?",
    findMapKeyStatement: "SELECT `id` FROM `bluemap_map` WHERE map_id = ?",
    createMapKeyStatement: "INSERT INTO `bluemap_map` (`map_id`) VALUES (?)",
    findCompressionKeyStatement: "SELECT `id` FROM `bluemap_compression` WHERE `key` = ?",
    createCompressionKeyStatement: "INSERT INTO `bluemap_compression` (`key`) VALUES (?)",
    findItemStorageKeyStatement: "SELECT `id` FROM `bluemap_item_storage` WHERE `key` = ?",
    createItemStorageKeyStatement: "INSERT INTO `bluemap_item_storage` (`key`) VALUES (?)",
    findGridStorageKeyStatement: "SELECT `id` FROM `bluemap_grid_storage` WHERE `key` = ?",
    createGridStorageKeyStatement: "INSERT INTO `bluemap_grid_storage` (`key`) VALUES (?)",
};

describe("SqliteCommandSet — matches upstream SqliteCommandSet.java statement-for-statement", () => {
    for (const [method, expected] of Object.entries(EXPECTED)) {
        it(method, () => {
            const actual = (sql[method as keyof SqliteCommandSet] as () => string).call(sql);
            expect(norm(actual)).toBe(expected);
        });
    }

    it("covers every statement method with an expectation", () => {
        const methods = Object.getOwnPropertyNames(SqliteCommandSet.prototype).filter(
            (name) => name.endsWith("Statement"),
        );
        expect(methods.sort()).toEqual(Object.keys(EXPECTED).sort());
    });
});

import { describe, expect, it } from "vitest";
import type { Database } from "../Database.js";
import { MySQLCommandSet } from "./MySQLCommandSet.js";

/**
 * Statement-text contract test, transcribed from
 * `vendor/BlueMap/core/.../storage/sql/commandset/MySQLCommandSet.java`. See
 * `SqliteCommandSet.test.ts` for why whitespace is normalized before comparing.
 *
 * This dialect's SQL text is never run against a real MySQL/MariaDB server on this
 * machine — see `../drivers/MySqlDriver.test.ts` for what *is* exercised (connection
 * URL parsing, the driver-adapter's error mapping) and the port's handoff notes for what
 * remains unverified against a real server.
 */
function norm(sql: string): string {
    return sql.trim().replace(/\s+/g, " ");
}

const sql = new MySQLCommandSet({} as Database);

const EXPECTED: Record<string, string> = {
    listExistingTablesStatement:
        "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    createMapTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_map` ( `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, `map_id` VARCHAR(190) NOT NULL, PRIMARY KEY (`id`), UNIQUE INDEX `map_id` (`map_id`) ) COLLATE 'utf8mb4_bin'",
    createCompressionTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_compression` ( `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, `key` VARCHAR(190) NOT NULL, PRIMARY KEY (`id`), UNIQUE INDEX `key` (`key`) ) COLLATE 'utf8mb4_bin'",
    createItemStorageTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_item_storage` ( `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `key` VARCHAR(190) NOT NULL, PRIMARY KEY (`id`), UNIQUE INDEX `key` (`key`) ) COLLATE 'utf8mb4_bin'",
    createItemStorageDataTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_item_storage_data` ( `map` SMALLINT UNSIGNED NOT NULL, `storage` INT UNSIGNED NOT NULL, `compression` SMALLINT UNSIGNED NOT NULL, `data` LONGBLOB NOT NULL, PRIMARY KEY (`map`, `storage`), CONSTRAINT `fk_bluemap_item_map` FOREIGN KEY (`map`) REFERENCES `bluemap_map` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_item` FOREIGN KEY (`storage`) REFERENCES `bluemap_item_storage` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_item_compression` FOREIGN KEY (`compression`) REFERENCES `bluemap_compression` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE ) COLLATE 'utf8mb4_bin'",
    createGridStorageTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_grid_storage` ( `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, `key` VARCHAR(190) NOT NULL, PRIMARY KEY (`id`), UNIQUE INDEX `key` (`key`) ) COLLATE 'utf8mb4_bin'",
    createGridStorageDataTableStatement:
        "CREATE TABLE IF NOT EXISTS `bluemap_grid_storage_data` ( `map` SMALLINT UNSIGNED NOT NULL, `storage` SMALLINT UNSIGNED NOT NULL, `x` INT NOT NULL, `z` INT NOT NULL, `compression` SMALLINT UNSIGNED NOT NULL, `data` LONGBLOB NOT NULL, PRIMARY KEY (`map`, `storage`, `x`, `z`), CONSTRAINT `fk_bluemap_grid_map` FOREIGN KEY (`map`) REFERENCES `bluemap_map` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_grid` FOREIGN KEY (`storage`) REFERENCES `bluemap_grid_storage` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE, CONSTRAINT `fk_bluemap_grid_compression` FOREIGN KEY (`compression`) REFERENCES `bluemap_compression` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE ) COLLATE 'utf8mb4_bin'",
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
    gridStoragePurgeMapStatement: "DELETE FROM `bluemap_grid_storage_data` WHERE `map` = ? LIMIT ?",
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

describe("MySQLCommandSet — matches upstream MySQLCommandSet.java statement-for-statement", () => {
    for (const [method, expected] of Object.entries(EXPECTED)) {
        it(method, () => {
            const actual = (sql[method as keyof MySQLCommandSet] as () => string).call(sql);
            expect(norm(actual)).toBe(expected);
        });
    }

    it("covers every statement method with an expectation", () => {
        const methods = Object.getOwnPropertyNames(MySQLCommandSet.prototype).filter((name) =>
            name.endsWith("Statement"),
        );
        expect(methods.sort()).toEqual(Object.keys(EXPECTED).sort());
    });
});

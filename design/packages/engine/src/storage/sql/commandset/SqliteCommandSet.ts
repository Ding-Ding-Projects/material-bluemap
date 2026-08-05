import { AbstractCommandSet } from "./AbstractCommandSet.js";

/**
 * upstream: storage/sql/commandset/SqliteCommandSet.java
 *
 * Every statement below is transcribed verbatim (table/column names, backtick quoting,
 * `STRICT` tables) from the upstream Java text blocks — this is the "table schema must
 * match upstream's exactly" half of issue #32, checked by reading the source rather than
 * inferred.
 */
export class SqliteCommandSet extends AbstractCommandSet {
    listExistingTablesStatement(): string {
        return `
        SELECT \`name\`
        FROM \`sqlite_master\`
        WHERE \`type\` = 'table'
        `;
    }

    createMapTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_map\` (
         \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,
         \`map_id\` TEXT UNIQUE NOT NULL
        ) STRICT
        `;
    }

    createCompressionTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_compression\` (
         \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,
         \`key\` TEXT UNIQUE NOT NULL
        ) STRICT
        `;
    }

    createItemStorageTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_item_storage\` (
         \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,
         \`key\` TEXT UNIQUE NOT NULL
        ) STRICT
        `;
    }

    createItemStorageDataTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_item_storage_data\` (
         \`map\` INTEGER NOT NULL,
         \`storage\` INTEGER NOT NULL,
         \`compression\` INTEGER NOT NULL,
         \`data\` BLOB NOT NULL,
         PRIMARY KEY (\`map\`, \`storage\`),
         CONSTRAINT \`fk_bluemap_item_map\`
          FOREIGN KEY (\`map\`)
          REFERENCES \`bluemap_map\` (\`id\`)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         CONSTRAINT \`fk_bluemap_item\`
          FOREIGN KEY (\`storage\`)
          REFERENCES \`bluemap_item_storage\` (\`id\`)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         CONSTRAINT \`fk_bluemap_item_compression\`
          FOREIGN KEY (\`compression\`)
          REFERENCES \`bluemap_compression\` (\`id\`)
          ON UPDATE RESTRICT
          ON DELETE CASCADE
        ) STRICT
        `;
    }

    createGridStorageTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_grid_storage\` (
         \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,
         \`key\` TEXT UNIQUE NOT NULL
        ) STRICT
        `;
    }

    createGridStorageDataTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_grid_storage_data\` (
         \`map\` INTEGER NOT NULL,
         \`storage\` INTEGER NOT NULL,
         \`x\` INTEGER NOT NULL,
         \`z\` INTEGER NOT NULL,
         \`compression\` INTEGER NOT NULL,
         \`data\` BLOB NOT NULL,
         PRIMARY KEY (\`map\`, \`storage\`, \`x\`, \`z\`),
         CONSTRAINT \`fk_bluemap_grid_map\`
          FOREIGN KEY (\`map\`)
          REFERENCES \`bluemap_map\` (\`id\`)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         CONSTRAINT \`fk_bluemap_grid\`
          FOREIGN KEY (\`storage\`)
          REFERENCES \`bluemap_grid_storage\` (\`id\`)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         CONSTRAINT \`fk_bluemap_grid_compression\`
          FOREIGN KEY (\`compression\`)
          REFERENCES \`bluemap_compression\` (\`id\`)
          ON UPDATE RESTRICT
          ON DELETE CASCADE
        ) STRICT
        `;
    }

    itemStorageWriteStatement(): string {
        return `
        REPLACE
        INTO \`bluemap_item_storage_data\` (\`map\`, \`storage\`, \`compression\`, \`data\`)
        VALUES (?, ?, ?, ?)
        `;
    }

    itemStorageReadStatement(): string {
        return `
        SELECT \`data\`
        FROM \`bluemap_item_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        AND \`compression\` = ?
        `;
    }

    itemStorageDeleteStatement(): string {
        return `
        DELETE
        FROM \`bluemap_item_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        `;
    }

    itemStorageHasStatement(): string {
        return `
        SELECT COUNT(*) > 0
        FROM \`bluemap_item_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        AND \`compression\` = ?
        `;
    }

    gridStorageWriteStatement(): string {
        return `
        REPLACE
        INTO \`bluemap_grid_storage_data\` (\`map\`, \`storage\`, \`x\`, \`z\`, \`compression\`, \`data\`)
        VALUES (?, ?, ?, ?, ?, ?)
        `;
    }

    gridStorageReadStatement(): string {
        return `
        SELECT \`data\`
        FROM \`bluemap_grid_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        AND \`x\` = ?
        AND \`z\` = ?
        AND \`compression\` = ?
        `;
    }

    gridStorageDeleteStatement(): string {
        return `
        DELETE
        FROM \`bluemap_grid_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        AND \`x\` = ?
        AND \`z\` = ?
        `;
    }

    gridStorageHasStatement(): string {
        return `
        SELECT COUNT(*) > 0
        FROM \`bluemap_grid_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        AND \`x\` = ?
        AND \`z\` = ?
        AND \`compression\` = ?
        `;
    }

    gridStorageListStatement(): string {
        return `
        SELECT \`x\`, \`z\`
        FROM \`bluemap_grid_storage_data\`
        WHERE \`map\` = ?
        AND \`storage\` = ?
        AND \`compression\` = ?
        LIMIT ? OFFSET ?
        `;
    }

    gridStorageCountMapItemsStatement(): string {
        return `
        SELECT COUNT(*)
        FROM \`bluemap_grid_storage_data\`
        WHERE \`map\` = ?
        `;
    }

    gridStoragePurgeMapStatement(): string {
        return `
        DELETE
        FROM \`bluemap_grid_storage_data\`
        WHERE ROWID IN (
         SELECT t.ROWID
         FROM \`bluemap_grid_storage_data\` t
         WHERE t.\`map\` = ?
         LIMIT ?
        )
        `;
    }

    purgeMapStatement(): string {
        return `
        DELETE
        FROM \`bluemap_map\`
        WHERE \`id\` = ?
        `;
    }

    hasMapStatement(): string {
        return `
        SELECT COUNT(*) > 0
        FROM \`bluemap_map\` m
        WHERE m.\`map_id\` = ?
        `;
    }

    listMapIdsStatement(): string {
        return `
        SELECT \`map_id\`
        FROM \`bluemap_map\` m
        LIMIT ? OFFSET ?
        `;
    }

    findMapKeyStatement(): string {
        return `
        SELECT \`id\`
        FROM \`bluemap_map\`
        WHERE map_id = ?
        `;
    }

    createMapKeyStatement(): string {
        return `
        INSERT
        INTO \`bluemap_map\` (\`map_id\`)
        VALUES (?)
        `;
    }

    findCompressionKeyStatement(): string {
        return `
        SELECT \`id\`
        FROM \`bluemap_compression\`
        WHERE \`key\` = ?
        `;
    }

    createCompressionKeyStatement(): string {
        return `
        INSERT
        INTO \`bluemap_compression\` (\`key\`)
        VALUES (?)
        `;
    }

    findItemStorageKeyStatement(): string {
        return `
        SELECT \`id\`
        FROM \`bluemap_item_storage\`
        WHERE \`key\` = ?
        `;
    }

    createItemStorageKeyStatement(): string {
        return `
        INSERT
        INTO \`bluemap_item_storage\` (\`key\`)
        VALUES (?)
        `;
    }

    findGridStorageKeyStatement(): string {
        return `
        SELECT \`id\`
        FROM \`bluemap_grid_storage\`
        WHERE \`key\` = ?
        `;
    }

    createGridStorageKeyStatement(): string {
        return `
        INSERT
        INTO \`bluemap_grid_storage\` (\`key\`)
        VALUES (?)
        `;
    }
}

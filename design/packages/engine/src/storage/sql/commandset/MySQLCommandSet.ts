import { AbstractCommandSet } from "./AbstractCommandSet.js";

/**
 * upstream: storage/sql/commandset/MySQLCommandSet.java
 *
 * Also the command set upstream's `Dialect.MARIADB` uses (`MYSQL` and `MARIADB` share
 * one `Impl(..., MySQLCommandSet::new)` in `Dialect.java`) — this port's dialect
 * registry (`../Dialect.ts`) mirrors that sharing exactly, so a MariaDB connection URL
 * gets this same class.
 *
 * Every statement below is transcribed verbatim from the upstream Java text blocks.
 */
export class MySQLCommandSet extends AbstractCommandSet {
    listExistingTablesStatement(): string {
        return `
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_type = 'BASE TABLE'
        `;
    }

    createMapTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_map\` (
         \`id\` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
         \`map_id\` VARCHAR(190) NOT NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`map_id\` (\`map_id\`)
        ) COLLATE 'utf8mb4_bin'
        `;
    }

    createCompressionTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_compression\` (
         \`id\` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
         \`key\` VARCHAR(190) NOT NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`key\` (\`key\`)
        ) COLLATE 'utf8mb4_bin'
        `;
    }

    createItemStorageTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_item_storage\` (
         \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
         \`key\` VARCHAR(190) NOT NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`key\` (\`key\`)
        ) COLLATE 'utf8mb4_bin'
        `;
    }

    createItemStorageDataTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_item_storage_data\` (
         \`map\` SMALLINT UNSIGNED NOT NULL,
         \`storage\` INT UNSIGNED NOT NULL,
         \`compression\` SMALLINT UNSIGNED NOT NULL,
         \`data\` LONGBLOB NOT NULL,
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
        ) COLLATE 'utf8mb4_bin'
        `;
    }

    createGridStorageTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_grid_storage\` (
         \`id\` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
         \`key\` VARCHAR(190) NOT NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`key\` (\`key\`)
        ) COLLATE 'utf8mb4_bin'
        `;
    }

    createGridStorageDataTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS \`bluemap_grid_storage_data\` (
         \`map\` SMALLINT UNSIGNED NOT NULL,
         \`storage\` SMALLINT UNSIGNED NOT NULL,
         \`x\` INT NOT NULL,
         \`z\` INT NOT NULL,
         \`compression\` SMALLINT UNSIGNED NOT NULL,
         \`data\` LONGBLOB NOT NULL,
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
        ) COLLATE 'utf8mb4_bin'
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
        WHERE \`map\` = ?
        LIMIT ?
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

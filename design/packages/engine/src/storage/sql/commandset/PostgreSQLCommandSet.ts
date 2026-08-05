import { AbstractCommandSet } from "./AbstractCommandSet.js";

/**
 * upstream: storage/sql/commandset/PostgreSQLCommandSet.java
 *
 * Every statement below is transcribed verbatim from the upstream Java text blocks
 * (unquoted, lower-case identifiers — Postgres folds unquoted identifiers to lower case
 * anyway, and upstream does not quote them here, unlike the MySQL/SQLite dialects).
 */
export class PostgreSQLCommandSet extends AbstractCommandSet {
    listExistingTablesStatement(): string {
        return `
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = current_schema()
        `;
    }

    createMapTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS bluemap_map (
         id SMALLSERIAL PRIMARY KEY,
         map_id VARCHAR(190) UNIQUE NOT NULL
        )
        `;
    }

    createCompressionTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS bluemap_compression (
         id SMALLSERIAL PRIMARY KEY,
         key VARCHAR(190) UNIQUE NOT NULL
        )
        `;
    }

    createItemStorageTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS bluemap_item_storage (
         id SERIAL PRIMARY KEY,
         key VARCHAR(190) UNIQUE NOT NULL
        )
        `;
    }

    createItemStorageDataTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS bluemap_item_storage_data (
         map SMALLINT NOT NULL
          REFERENCES bluemap_map (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         storage INT NOT NULL
          REFERENCES bluemap_item_storage (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         compression SMALLINT NOT NULL
          REFERENCES bluemap_compression (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         data BYTEA NOT NULL,
         PRIMARY KEY (map, storage)
        )
        `;
    }

    createGridStorageTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS bluemap_grid_storage (
         id SMALLSERIAL PRIMARY KEY,
         key VARCHAR(190) UNIQUE NOT NULL
        )
        `;
    }

    createGridStorageDataTableStatement(): string {
        return `
        CREATE TABLE IF NOT EXISTS bluemap_grid_storage_data (
         map SMALLINT NOT NULL
          REFERENCES bluemap_map (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         storage SMALLINT NOT NULL
          REFERENCES bluemap_grid_storage (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         x INT NOT NULL,
         z INT NOT NULL,
         compression SMALLINT NOT NULL
          REFERENCES bluemap_compression (id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
         data BYTEA NOT NULL,
         PRIMARY KEY (map, storage, x, z)
        )
        `;
    }

    itemStorageWriteStatement(): string {
        return `
        INSERT
        INTO bluemap_item_storage_data (map, storage, compression, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (map, storage)
         DO UPDATE SET
          compression = excluded.compression,
          data = excluded.data
        `;
    }

    itemStorageReadStatement(): string {
        return `
        SELECT data
        FROM bluemap_item_storage_data
        WHERE map = ?
        AND storage = ?
        AND compression = ?
        `;
    }

    itemStorageDeleteStatement(): string {
        return `
        DELETE
        FROM bluemap_item_storage_data
        WHERE map = ?
        AND storage = ?
        `;
    }

    itemStorageHasStatement(): string {
        return `
        SELECT COUNT(*) > 0
        FROM bluemap_item_storage_data
        WHERE map = ?
        AND storage = ?
        AND compression = ?
        `;
    }

    gridStorageWriteStatement(): string {
        return `
        INSERT
        INTO bluemap_grid_storage_data (map, storage, x, z, compression, data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (map, storage, x, z)
         DO UPDATE SET
          compression = excluded.compression,
          data = excluded.data
        `;
    }

    gridStorageReadStatement(): string {
        return `
        SELECT data
        FROM bluemap_grid_storage_data
        WHERE map = ?
        AND storage = ?
        AND x = ?
        AND z = ?
        AND compression = ?
        `;
    }

    gridStorageDeleteStatement(): string {
        return `
        DELETE
        FROM bluemap_grid_storage_data
        WHERE map = ?
        AND storage = ?
        AND x = ?
        AND z = ?
        `;
    }

    gridStorageHasStatement(): string {
        return `
        SELECT COUNT(*) > 0
        FROM bluemap_grid_storage_data
        WHERE map = ?
        AND storage = ?
        AND x = ?
        AND z = ?
        AND compression = ?
        `;
    }

    gridStorageListStatement(): string {
        return `
        SELECT x, z
        FROM bluemap_grid_storage_data
        WHERE map = ?
        AND storage = ?
        AND compression = ?
        LIMIT ? OFFSET ?
        `;
    }

    gridStorageCountMapItemsStatement(): string {
        return `
        SELECT COUNT(*)
        FROM bluemap_grid_storage_data
        WHERE map = ?
        `;
    }

    gridStoragePurgeMapStatement(): string {
        return `
        DELETE
        FROM bluemap_grid_storage_data
        WHERE CTID IN (
         SELECT CTID
         FROM bluemap_grid_storage_data t
         WHERE t.map = ?
         LIMIT ?
        )
        `;
    }

    purgeMapStatement(): string {
        return `
        DELETE
        FROM bluemap_map
        WHERE id = ?
        `;
    }

    hasMapStatement(): string {
        return `
        SELECT COUNT(*) > 0
        FROM bluemap_map m
        WHERE m.map_id = ?
        `;
    }

    listMapIdsStatement(): string {
        return `
        SELECT map_id
        FROM bluemap_map m
        LIMIT ? OFFSET ?
        `;
    }

    findMapKeyStatement(): string {
        return `
        SELECT id
        FROM bluemap_map
        WHERE map_id = ?
        `;
    }

    createMapKeyStatement(): string {
        return `
        INSERT
        INTO bluemap_map (map_id)
        VALUES (?)
        `;
    }

    findCompressionKeyStatement(): string {
        return `
        SELECT id
        FROM bluemap_compression
        WHERE key = ?
        `;
    }

    createCompressionKeyStatement(): string {
        return `
        INSERT
        INTO bluemap_compression (key)
        VALUES (?)
        `;
    }

    findItemStorageKeyStatement(): string {
        return `
        SELECT id
        FROM bluemap_item_storage
        WHERE key = ?
        `;
    }

    createItemStorageKeyStatement(): string {
        return `
        INSERT
        INTO bluemap_item_storage (key)
        VALUES (?)
        `;
    }

    findGridStorageKeyStatement(): string {
        return `
        SELECT id
        FROM bluemap_grid_storage
        WHERE key = ?
        `;
    }

    createGridStorageKeyStatement(): string {
        return `
        INSERT
        INTO bluemap_grid_storage (key)
        VALUES (?)
        `;
    }
}

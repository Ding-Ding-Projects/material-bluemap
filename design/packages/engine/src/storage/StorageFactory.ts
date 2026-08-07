/**
 * Turns a parsed `storages/<id>.conf` — `@worldlens/config`'s
 * `FileStorageConfig` or `SqlStorageConfig` — into a real, working {@link Storage}.
 *
 * There is no upstream file this ports: upstream's Java config layer (`FileConfig`/
 * `SQLConfig` in `common/config/storage/`) builds its storages directly, in the same
 * language as the storage classes themselves. This port's config schema
 * (`@worldlens/config`) and its storage implementations live in separate
 * packages for reasons that have nothing to do with storage, so *something* has to be
 * the seam between "the config a person edited" and "the storage the engine actually
 * talks to" — this module is that seam, and per issue #32 it is also the fix: before
 * this existed, `design/packages/engine/src/storage/` only had a `file/`
 * implementation, so a config that read `storage-type: sql` had nowhere to go.
 */
import type { FileStorageConfig, SqlStorageConfig } from "@worldlens/config";
import { Key } from "@worldlens/shared";
import { Compression } from "./compression/Compression.js";
import { FileStorage } from "./file/FileStorage.js";
import type { Storage } from "./Storage.js";
import { Database } from "./sql/Database.js";
import { resolveDialect } from "./sql/Dialect.js";
import { SQLStorage } from "./sql/SQLStorage.js";

/** Thrown for a config value this factory cannot turn into a working storage. */
export class InvalidStorageConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidStorageConfigError";
    }
}

function resolveCompression(key: string): Compression {
    const compression = Compression.REGISTRY.get(Key.parse(key, Key.BLUEMAP_NAMESPACE));
    if (compression === null) {
        const known = Compression.REGISTRY.values()
            .map((c) => c.getKey().getFormatted())
            .join(", ");
        throw new InvalidStorageConfigError(`Unknown compression '${key}'. Known compressions: ${known}.`);
    }
    return compression;
}

/** `config["storage-type"]` distinguishes the two schemas, but so does their own shape. */
function isSqlStorageConfig(
    config: FileStorageConfig | SqlStorageConfig,
): config is SqlStorageConfig {
    return "connection-url" in config;
}

/** upstream: `FileConfig#createStorage()` */
export function fileStorageFromConfig(config: FileStorageConfig): FileStorage {
    return new FileStorage(config.root, resolveCompression(config.compression), config.atomic);
}

/**
 * upstream: `SQLConfig#createStorage()`
 *
 * Two upstream fields have no equivalent here and are refused rather than silently
 * dropped: `driver-jar` and `driver-class` name a custom JDBC driver to load from a
 * `.jar` at runtime, which only means something on a JVM classpath. This port always
 * uses its own built-in driver for whichever dialect the connection URL (or the
 * explicit `dialect` field) names — see `Dialect.ts` — so a config that set either
 * field would have its choice silently ignored if this let it through quietly. It does
 * not: the config is rejected by name, so a person who set a custom driver jar
 * expecting it to be used finds out immediately rather than discovering months later
 * that it never was.
 */
export async function sqlStorageFromConfig(config: SqlStorageConfig): Promise<SQLStorage> {
    if (config["driver-jar"] !== null || config["driver-class"] !== null) {
        throw new InvalidStorageConfigError(
            "This engine cannot load a custom JDBC driver jar (the 'driver-jar'/'driver-class' " +
                "settings). It always uses its own built-in driver for the connection URL's " +
                "dialect. Remove 'driver-jar' and 'driver-class' from this storage's config.",
        );
    }

    const dialect = resolveDialect(config.dialect, config["connection-url"]);
    const driverAdapter = await dialect.createDriverAdapter({
        connectionUrl: config["connection-url"],
        connectionProperties: config["connection-properties"],
        maxConnections: config["max-connections"],
    });
    const database = new Database(driverAdapter);
    const commandSet = dialect.createCommandSet(database);
    return new SQLStorage(commandSet, resolveCompression(config.compression));
}

/**
 * The single place a `storages/<id>.conf` becomes a `Storage` — the "storage factory"
 * issue #32 asks to be wired to the ported SQL storage, so that choosing SQL in a
 * config resolves to a real, working storage rather than an unimplemented path.
 */
export async function storageFromConfig(config: FileStorageConfig | SqlStorageConfig): Promise<Storage> {
    if (isSqlStorageConfig(config)) return sqlStorageFromConfig(config);
    return fileStorageFromConfig(config);
}

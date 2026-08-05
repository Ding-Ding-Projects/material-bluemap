import { Key } from "@material-bluemap/shared";
import type { SqlDriverAdapter } from "./Database.js";
import type { CommandSet } from "./commandset/CommandSet.js";
import { MySQLCommandSet } from "./commandset/MySQLCommandSet.js";
import { PostgreSQLCommandSet } from "./commandset/PostgreSQLCommandSet.js";
import { SqliteCommandSet } from "./commandset/SqliteCommandSet.js";
import { createMySqlDriverAdapter } from "./drivers/MySqlDriver.js";
import { createPostgresDriverAdapter } from "./drivers/PostgresDriver.js";
import { createSqliteDriverAdapter } from "./drivers/SqliteDriver.js";
import type { Database } from "./Database.js";

/**
 * What a `Database`/driver adapter for a dialect is built from — the port's equivalent
 * of `SQLConfig`'s `connectionUrl`/`connectionProperties`/`maxConnections` fields.
 */
export interface SqlConnectionOptions {
    /** The raw `jdbc:<dialect>://...` connection URL, exactly as the config file wrote it. */
    readonly connectionUrl: string;
    /** upstream: additional (driver-specific) properties — usually `user`/`password`. */
    readonly connectionProperties: Readonly<Record<string, string>>;
    /** A negative number means "use the driver's own default", matching upstream's -1. */
    readonly maxConnections: number;
}

/**
 * upstream: `common/config/storage/Dialect.java`
 *
 * Upstream's four registered dialects each pair a Key, a `jdbc:` protocol prefix used to
 * auto-detect the dialect from a bare connection URL, and a `CommandSet` constructor —
 * `MYSQL` and `MARIADB` deliberately share `MySQLCommandSet::new`, since MariaDB's wire
 * protocol and SQL dialect are MySQL's.
 *
 * This port's version of a "dialect" additionally has to know how to build the right
 * driver adapter, because unlike JDBC (one `Driver` interface, many implementations)
 * there is no single javascript client library that speaks MySQL, PostgreSQL and SQLite
 * — `createDriverAdapter` is this class's answer to that, and has no upstream
 * counterpart (upstream's generic `Database` class works unchanged for every dialect).
 */
export interface Dialect {
    readonly key: Key;
    /** The package a person needs installed to actually use this dialect. */
    readonly packageName: string;
    supports(connectionUrl: string): boolean;
    createCommandSet(db: Database): CommandSet;
    createDriverAdapter(options: SqlConnectionOptions): Promise<SqlDriverAdapter>;
}

class DialectImpl implements Dialect {
    readonly key: Key;
    readonly packageName: string;
    private readonly protocol: string;
    private readonly commandSetFactory: (db: Database) => CommandSet;
    private readonly driverAdapterFactory: (options: SqlConnectionOptions) => Promise<SqlDriverAdapter>;

    constructor(
        key: Key,
        protocol: string,
        packageName: string,
        commandSetFactory: (db: Database) => CommandSet,
        driverAdapterFactory: (options: SqlConnectionOptions) => Promise<SqlDriverAdapter>,
    ) {
        this.key = key;
        this.protocol = protocol;
        this.packageName = packageName;
        this.commandSetFactory = commandSetFactory;
        this.driverAdapterFactory = driverAdapterFactory;
    }

    supports(connectionUrl: string): boolean {
        return connectionUrl.startsWith(this.protocol);
    }

    createCommandSet(db: Database): CommandSet {
        return this.commandSetFactory(db);
    }

    createDriverAdapter(options: SqlConnectionOptions): Promise<SqlDriverAdapter> {
        return this.driverAdapterFactory(options);
    }
}

export const MYSQL: Dialect = new DialectImpl(
    Key.bluemap("mysql"),
    "jdbc:mysql:",
    "mysql2",
    (db) => new MySQLCommandSet(db),
    createMySqlDriverAdapter,
);

export const MARIADB: Dialect = new DialectImpl(
    Key.bluemap("mariadb"),
    "jdbc:mariadb:",
    "mysql2",
    // upstream: `Dialect.MARIADB` also constructs `MySQLCommandSet` — MariaDB speaks
    // MySQL's wire protocol and SQL dialect, so it needs no command set of its own.
    (db) => new MySQLCommandSet(db),
    createMySqlDriverAdapter,
);

export const POSTGRESQL: Dialect = new DialectImpl(
    Key.bluemap("postgresql"),
    "jdbc:postgresql:",
    "pg",
    (db) => new PostgreSQLCommandSet(db),
    createPostgresDriverAdapter,
);

export const SQLITE: Dialect = new DialectImpl(
    Key.bluemap("sqlite"),
    "jdbc:sqlite:",
    "sql.js",
    (db) => new SqliteCommandSet(db),
    createSqliteDriverAdapter,
);

/** upstream: `Dialect.REGISTRY` */
export const DIALECT_REGISTRY: readonly Dialect[] = [MYSQL, MARIADB, POSTGRESQL, SQLITE];

/** Thrown by {@link resolveDialect} — the port's `ConfigurationException` equivalent. */
export class UnknownDialectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnknownDialectError";
    }
}

/**
 * upstream: `SQLConfig#getDialect()`
 *
 * `explicitKey` is the config's `dialect` field. Left unset (`null`), upstream picks
 * the first registered dialect whose protocol prefix the connection URL starts with,
 * and refuses to start if none matches — both behaviors, including the exact refusal
 * condition, are reproduced here.
 */
export function resolveDialect(explicitKey: string | null, connectionUrl: string): Dialect {
    if (explicitKey !== null) {
        const parsed = Key.parse(explicitKey, Key.BLUEMAP_NAMESPACE).getFormatted();
        const found = DIALECT_REGISTRY.find((dialect) => dialect.key.getFormatted() === parsed);
        if (found === undefined) {
            const known = DIALECT_REGISTRY.map((dialect) => dialect.key.getFormatted()).join(", ");
            throw new UnknownDialectError(`Unknown SQL dialect '${explicitKey}'. Known dialects: ${known}.`);
        }
        return found;
    }

    const found = DIALECT_REGISTRY.find((dialect) => dialect.supports(connectionUrl));
    if (found === undefined) {
        throw new UnknownDialectError(
            "Could not find any sql-dialect that is matching the given connection-url. " +
                "Please check your 'connection-url' setting in your configuration and make " +
                "sure it is in the correct format.",
        );
    }
    return found;
}

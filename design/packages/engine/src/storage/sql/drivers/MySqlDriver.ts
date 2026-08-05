import {
    SqlRecoverableError,
    SqlUniqueViolationError,
    type SqlConnectionHandle,
    type SqlDriverAdapter,
    type SqlExecuteResult,
    type SqlParam,
    type SqlRow,
} from "../Database.js";
import type { SqlConnectionOptions } from "../Dialect.js";
import { loadOptionalModule } from "./loadOptionalModule.js";

type Mysql2Module = typeof import("mysql2/promise");
type Mysql2Pool = ReturnType<Mysql2Module["createPool"]>;
type Mysql2PoolConnection = Awaited<ReturnType<Mysql2Pool["getConnection"]>>;

/** mysql2 error codes this port treats as transient (worth the one extra `Database.run` attempt). */
const RECOVERABLE_CODES = new Set(["PROTOCOL_CONNECTION_LOST", "ECONNRESET", "ETIMEDOUT"]);

/**
 * Exported for its own test (`MySqlDriver.test.ts`): a reachable server is not always
 * available where this runs, so the classification is checked directly there against
 * synthetic errors carrying the exact codes mysql2 documents for a duplicate-key error
 * and a dropped connection. `SqlStorage.realServer.test.ts` is the opt-in file that
 * exercises this port against a real MySQL/MariaDB server when one is configured.
 */
export function mapMySqlError(ex: unknown): Error {
    if (ex instanceof Error) {
        const code = (ex as Error & { code?: string }).code;
        if (code === "ER_DUP_ENTRY") return new SqlUniqueViolationError(ex.message, { cause: ex });
        if (code !== undefined && RECOVERABLE_CODES.has(code)) {
            return new SqlRecoverableError(ex.message, { cause: ex });
        }
        return ex;
    }
    return new Error(String(ex));
}

function toBindValue(value: SqlParam): number | string | Buffer | null {
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
}

/**
 * `jdbc:mysql://host:port/database?opt=val` (or `jdbc:mariadb:...`, which parses
 * identically) into the plain connection config `mysql2.createPool` accepts.
 *
 * There is no JDBC-URL parser in `mysql2` — it has its own, differently-shaped
 * connection-string grammar — so this reads the URL by hand rather than assuming the
 * two happen to agree.
 */
export function parseMySqlConnectionOptions(
    options: SqlConnectionOptions,
): Record<string, unknown> {
    const withoutJdbc = options.connectionUrl.replace(/^jdbc:(mysql|mariadb):/, "");
    const normalized = withoutJdbc.startsWith("//") ? `mysql:${withoutJdbc}` : `mysql://${withoutJdbc}`;
    const url = new URL(normalized);

    const config: Record<string, unknown> = {
        host: url.hostname || "localhost",
        port: url.port !== "" ? Number(url.port) : 3306,
        rowsAsArray: true,
        waitForConnections: true,
        connectionLimit: options.maxConnections > 0 ? options.maxConnections : 10,
    };
    const database = url.pathname.replace(/^\//, "");
    if (database !== "") config["database"] = database;
    if (url.username !== "") config["user"] = decodeURIComponent(url.username);
    if (url.password !== "") config["password"] = decodeURIComponent(url.password);

    // JDBC-only query flags (e.g. `permitMysqlScheme`) mean nothing to mysql2; they pass
    // through as inert extra keys rather than being specially recognized or stripped.
    for (const [key, value] of url.searchParams) config[key] = value;

    // `connection-properties` is upstream's documented place for user/password, so it
    // takes precedence over anything embedded in the URL.
    Object.assign(config, options.connectionProperties);

    return config;
}

/**
 * Uses `connection.query()` (mysql2's client-side value escaping, sent as plain SQL
 * text) rather than `connection.execute()` (mysql2's server-side prepared statement,
 * MySQL's binary protocol) for *every* statement, including plain `INSERT`/`SELECT ...
 * WHERE`.
 *
 * Found against a real server, not assumed: a real MySQL 8.4.6 container rejects any
 * `execute()`-bound statement whose `LIMIT`/`OFFSET` clause is itself a `?` parameter —
 * `AbstractCommandSet`'s paginated `listMapGrids`/`listMapIds`/`purgeMapGrids`
 * statements all have exactly this shape — with `ER_WRONG_ARGUMENTS` / "Incorrect
 * arguments to mysqld_stmt_execute", regardless of the bound value's JS type. A real
 * MariaDB 11.4.7 container, same driver, same SQL text, does not hit this; it is a real
 * behavioral difference between the two servers' prepared-statement handling, not a
 * port bug or a MariaDB-only workaround. `query()` still escapes every bound value
 * (numbers, strings, booleans, `Buffer`/BLOB) exactly as `execute()` would — proven
 * byte-identical against a real server in `SqlStorage.realServer.test.ts` — so this
 * loses none of the SQL-injection safety `execute()` provided; it only stops relying on
 * MySQL's server-side prepare, which is the thing that turned out not to accept these
 * statements.
 */
class MySqlDriverAdapter implements SqlDriverAdapter {
    private readonly pool: Mysql2Pool;

    constructor(pool: Mysql2Pool) {
        this.pool = pool;
    }

    async getConnection(): Promise<SqlConnectionHandle> {
        let connection: Mysql2PoolConnection;
        try {
            connection = await this.pool.getConnection();
        } catch (ex) {
            throw mapMySqlError(ex);
        }
        await connection.beginTransaction();

        return {
            query: async (sql, params) => {
                try {
                    const [rows] = await connection.query(sql, params.map(toBindValue));
                    return rows as unknown as SqlRow[];
                } catch (ex) {
                    throw mapMySqlError(ex);
                }
            },
            execute: async (sql, params): Promise<SqlExecuteResult> => {
                try {
                    const [result] = await connection.query(sql, params.map(toBindValue));
                    return { affectedRows: (result as { affectedRows: number }).affectedRows };
                } catch (ex) {
                    throw mapMySqlError(ex);
                }
            },
            commit: async () => {
                await connection.commit();
            },
            rollback: async () => {
                await connection.rollback();
            },
            release: () => {
                connection.release();
                return Promise.resolve();
            },
        };
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}

export async function createMySqlDriverAdapter(options: SqlConnectionOptions): Promise<SqlDriverAdapter> {
    const mysql2 = await loadOptionalModule<Mysql2Module>("mysql2/promise", "mysql2", "MySQL/MariaDB");
    const pool = mysql2.createPool(parseMySqlConnectionOptions(options));
    return new MySqlDriverAdapter(pool);
}

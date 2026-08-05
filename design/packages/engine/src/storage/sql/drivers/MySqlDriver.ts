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

function mapMySqlError(ex: unknown): Error {
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
                    const [rows] = await connection.execute(sql, params.map(toBindValue));
                    return rows as unknown as SqlRow[];
                } catch (ex) {
                    throw mapMySqlError(ex);
                }
            },
            execute: async (sql, params): Promise<SqlExecuteResult> => {
                try {
                    const [result] = await connection.execute(sql, params.map(toBindValue));
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

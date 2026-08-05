/**
 * upstream: storage/sql/Database.java
 *
 * Upstream wraps a JDBC {@code DataSource} — a commons-dbcp2 connection pool sitting on
 * top of whichever JDBC driver the dialect picked — and runs every action inside
 * {@code autoCommit=false}, committing on success and retrying once more (two attempts
 * total) when a {@code SQLRecoverableException} is thrown.
 *
 * There is no JDBC in JavaScript: MySQL, PostgreSQL and SQLite each need a completely
 * different client library with a completely different connection API, so this port
 * defines a small driver-agnostic connection contract ({@link SqlConnectionHandle}) that
 * each dialect's driver adapter (`drivers/*.ts`) implements against its own library, and
 * reproduces the same run/commit/retry shape on top of that contract instead of on top
 * of JDBC.
 */

/** A bound parameter value. `Buffer`/`Uint8Array` covers every BLOB/BYTEA column. */
export type SqlParam = string | number | boolean | Buffer | Uint8Array | null;

/**
 * One returned column value.
 *
 * Rows are positional arrays rather than named objects, mirroring upstream's
 * {@code ResultSet#getInt(1)}/{@code getBytes(1)} 1-indexed-by-position access
 * (0-indexed here) — every dialect adapter normalizes its library's row shape to this
 * before `AbstractCommandSet` ever sees it, so the CRUD orchestration is dialect-blind.
 */
export type SqlValue = string | number | boolean | Buffer | null;

export type SqlRow = readonly SqlValue[];

export interface SqlExecuteResult {
    /** Rows affected by an INSERT/UPDATE/DELETE — upstream's {@code executeUpdate} return value. */
    readonly affectedRows: number;
}

/**
 * One checked-out connection, mid-transaction (`autoCommit=false`, matching upstream).
 *
 * `query`/`execute` both take a parameterized statement; `query` is for a statement that
 * returns rows (SELECT), `execute` is for one that does not (INSERT/UPDATE/DELETE/DDL).
 */
export interface SqlConnectionHandle {
    query(sql: string, params: readonly SqlParam[]): Promise<SqlRow[]>;
    execute(sql: string, params: readonly SqlParam[]): Promise<SqlExecuteResult>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    /** Returns the connection to its pool (or otherwise releases it). Always called. */
    release(): Promise<void>;
}

/** What a dialect's driver module builds: a way to check out connections, and to close them all. */
export interface SqlDriverAdapter {
    getConnection(): Promise<SqlConnectionHandle>;
    close(): Promise<void>;
}

/**
 * Thrown by a driver adapter for an error its underlying library flags as transient
 * (a dropped connection, a timeout) — the port's equivalent of a JDBC
 * {@code SQLRecoverableException}, which is what upstream's {@code Database.run} retries.
 */
export class SqlRecoverableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SqlRecoverableError";
    }
}

/**
 * Thrown by a driver adapter when a write violates a UNIQUE constraint — used by
 * `AbstractCommandSet`'s find-or-create key lookups to detect a concurrent create and
 * fall back to re-selecting rather than treating it as a hard failure.
 */
export class SqlUniqueViolationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "SqlUniqueViolationError";
    }
}

/**
 * Thrown when an SQL storage is configured for a dialect whose driver package is not
 * installed. Upstream's drivers are JDBC jars a server operator drops into a folder;
 * this port's equivalent is an optional npm dependency, loaded through a dynamic
 * `import()` precisely so a person who never touches SQL storage never pays for three
 * database client libraries in their bundle. Per issue #32's explicit requirement, this
 * is the error that reaches them instead of a raw "Cannot find module" stack trace.
 */
export class MissingSqlDriverError extends Error {
    constructor(packageName: string, dialectLabel: string, options?: ErrorOptions) {
        super(
            `The '${dialectLabel}' SQL storage needs the '${packageName}' package, which is not ` +
                `installed. Install it (e.g. 'pnpm add ${packageName}') and try again.`,
            options,
        );
        this.name = "MissingSqlDriverError";
    }
}

/** Upstream tries the action twice in total before giving up on a recoverable error. */
const MAX_ATTEMPTS = 2;

/**
 * upstream: {@code Database#run(ConnectionFunction)} / {@code Database#run(ConnectionConsumer)}
 *
 * The port collapses upstream's two overloads (one for actions with a result, one for
 * side-effecting ones) into a single generic method — javascript has no meaningful
 * distinction between "returns Void" and "returns nothing" the way the two upstream
 * functional interfaces do.
 */
export class Database {
    private readonly driver: SqlDriverAdapter;
    #closed = false;

    constructor(driver: SqlDriverAdapter) {
        this.driver = driver;
    }

    /**
     * Checks out a connection, runs `action`, commits on success, rolls back and
     * releases on any failure. A {@link SqlRecoverableError} is retried once more
     * (two attempts total, exactly as upstream); any other error is rethrown immediately.
     */
    async run<R>(action: (connection: SqlConnectionHandle) => Promise<R>): Promise<R> {
        let lastRecoverable: unknown;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const connection = await this.driver.getConnection();
            try {
                const result = await action(connection);
                await connection.commit();
                return result;
            } catch (ex) {
                try {
                    await connection.rollback();
                } catch {
                    // best-effort: upstream's try-with-resources closes (and the pool
                    // rolls back on return) even when the rollback itself would fail
                }

                if (ex instanceof SqlRecoverableError) {
                    lastRecoverable = ex;
                    continue;
                }
                throw ex;
            } finally {
                await connection.release();
            }
        }

        throw lastRecoverable instanceof Error
            ? lastRecoverable
            : new Error("SQL action failed after retrying a recoverable error");
    }

    isClosed(): boolean {
        return this.#closed;
    }

    async close(): Promise<void> {
        this.#closed = true;
        await this.driver.close();
    }
}

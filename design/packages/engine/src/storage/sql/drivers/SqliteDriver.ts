import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicMove, createDirectories } from "../../../util/FileHelper.js";
import { fileExists } from "../../file/FileItemStorage.js";
import {
    SqlUniqueViolationError,
    type SqlConnectionHandle,
    type SqlDriverAdapter,
    type SqlExecuteResult,
    type SqlParam,
    type SqlRow,
} from "../Database.js";
import type { SqlConnectionOptions } from "../Dialect.js";
import { loadOptionalModule } from "./loadOptionalModule.js";

type SqlJsModule = typeof import("sql.js");
type SqlJsStatic = Awaited<ReturnType<SqlJsModule["default"]>>;
type SqlJsDb = InstanceType<SqlJsStatic["Database"]>;

const TEMP_SUFFIX = ".filepart";

/**
 * `jdbc:sqlite:<path>` — an empty path or the literal `:memory:` both mean "no file,
 * in-memory only", matching how the real SQLite JDBC driver treats those two forms.
 */
export function parseSqlitePath(connectionUrl: string): string | null {
    const prefix = "jdbc:sqlite:";
    const rest = connectionUrl.startsWith(prefix) ? connectionUrl.slice(prefix.length) : connectionUrl;
    if (rest === "" || rest === ":memory:") return null;
    return rest;
}

function toBindValue(value: SqlParam): number | string | Uint8Array | null {
    if (value instanceof Uint8Array) return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
}

function mapSqliteError(ex: unknown): Error {
    if (ex instanceof Error && /UNIQUE constraint failed/i.test(ex.message)) {
        return new SqlUniqueViolationError(ex.message, { cause: ex });
    }
    return ex instanceof Error ? ex : new Error(String(ex));
}

/**
 * There is exactly one sql.js `Database` per adapter — sql.js is an in-process embedded
 * engine, not a network client, so there is nothing to pool the way `mysql2`/`pg` pool
 * real server connections. Overlapping `getConnection()` callers are serialized through
 * a promise-chain queue instead, so two `BEGIN`s never interleave; this is the honest
 * javascript shape of what a single-file SQLite database already enforces at the OS
 * file-lock level for the real upstream JDBC driver.
 */
class SqliteDriverAdapter implements SqlDriverAdapter {
    private readonly db: SqlJsDb;
    private readonly filePath: string | null;
    private dirty = false;
    private queue: Promise<void> = Promise.resolve();
    private closed = false;

    private constructor(db: SqlJsDb, filePath: string | null) {
        this.db = db;
        this.filePath = filePath;
    }

    static async open(filePath: string | null): Promise<SqliteDriverAdapter> {
        const sqlJsModule = await loadOptionalModule<SqlJsModule>("sql.js", "sql.js", "SQLite");
        const initSqlJs = sqlJsModule.default;
        const SQL = await initSqlJs();

        let bytes: Uint8Array | undefined;
        if (filePath !== null && (await fileExists(filePath))) {
            bytes = await readFile(filePath);
        }
        const db = new SQL.Database(bytes);
        return new SqliteDriverAdapter(db, filePath);
    }

    async getConnection(): Promise<SqlConnectionHandle> {
        // Wait for whichever transaction is currently using the one shared database,
        // then claim the slot for this one until it releases.
        let releaseSlot!: () => void;
        const previous = this.queue;
        this.queue = new Promise<void>((resolveSlot) => {
            releaseSlot = resolveSlot;
        });
        await previous;

        this.db.run("BEGIN");

        let released = false;
        const releaseOnce = (): void => {
            if (released) return;
            released = true;
            releaseSlot();
        };

        return {
            query: (sql, params) => Promise.resolve(this.runQuery(sql, params)),
            execute: (sql, params) => Promise.resolve(this.runExecute(sql, params)),
            commit: () => this.commit(),
            rollback: () => {
                this.db.run("ROLLBACK");
                return Promise.resolve();
            },
            release: () => {
                releaseOnce();
                return Promise.resolve();
            },
        };
    }

    private runQuery(sql: string, params: readonly SqlParam[]): SqlRow[] {
        const stmt = this.db.prepare(sql);
        try {
            stmt.bind(params.map(toBindValue));
            const rows: SqlRow[] = [];
            while (stmt.step()) {
                const row = stmt
                    .get()
                    .map((value) => (value instanceof Uint8Array ? Buffer.from(value) : value));
                rows.push(row as SqlRow);
            }
            return rows;
        } catch (ex) {
            throw mapSqliteError(ex);
        } finally {
            stmt.free();
        }
    }

    private runExecute(sql: string, params: readonly SqlParam[]): SqlExecuteResult {
        try {
            this.db.run(sql, params.map(toBindValue));
        } catch (ex) {
            throw mapSqliteError(ex);
        }
        this.dirty = true;
        return { affectedRows: this.db.getRowsModified() };
    }

    private async commit(): Promise<void> {
        this.db.run("COMMIT");
        if (this.dirty) {
            await this.persist();
            this.dirty = false;
        }
    }

    /** Writes the whole database out to `filePath`, atomically (`FileItemStorage`'s own pattern). */
    private async persist(): Promise<void> {
        if (this.filePath === null) return; // `:memory:` — nothing to persist
        const folder = dirname(this.filePath);
        await createDirectories(folder);
        const partFile = this.filePath + TEMP_SUFFIX;
        await writeFile(partFile, this.db.export());
        await atomicMove(partFile, this.filePath);
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        await this.queue;
        if (this.dirty) await this.persist();
        this.db.close();
    }
}

export async function createSqliteDriverAdapter(options: SqlConnectionOptions): Promise<SqlDriverAdapter> {
    const filePath = parseSqlitePath(options.connectionUrl);
    return SqliteDriverAdapter.open(filePath);
}

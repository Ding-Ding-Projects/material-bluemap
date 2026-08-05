import { describe, expect, it } from "vitest";
import { SqlRecoverableError, SqlUniqueViolationError } from "../Database.js";
import type { SqlConnectionOptions } from "../Dialect.js";
import {
    createPostgresDriverAdapter,
    mapPostgresError,
    parsePostgresConnectionOptions,
    toPostgresPlaceholders,
} from "./PostgresDriver.js";

/**
 * No real PostgreSQL server is available on this machine — see `MySqlDriver.test.ts`
 * for the same caveat applied to MySQL/MariaDB, and the port's handoff notes for what
 * that does and does not mean for confidence in this dialect.
 */

function options(overrides: Partial<SqlConnectionOptions> = {}): SqlConnectionOptions {
    return {
        connectionUrl: "jdbc:postgresql://localhost:5432/bluemap",
        connectionProperties: {},
        maxConnections: -1,
        ...overrides,
    };
}

describe("toPostgresPlaceholders", () => {
    it("numbers each ? sequentially from $1", () => {
        expect(toPostgresPlaceholders("SELECT ? , ? , ?")).toBe("SELECT $1 , $2 , $3");
    });

    it("leaves a statement with no placeholders untouched", () => {
        expect(toPostgresPlaceholders("SELECT COUNT(*) FROM bluemap_map")).toBe(
            "SELECT COUNT(*) FROM bluemap_map",
        );
    });

    it("translates every real statement PostgreSQLCommandSet emits without breaking on repeats", () => {
        // gridStorageListStatement has five placeholders — the case most likely to
        // reveal an off-by-one in the counter
        const sql = "WHERE map = ? AND storage = ? AND compression = ? LIMIT ? OFFSET ?";
        expect(toPostgresPlaceholders(sql)).toBe(
            "WHERE map = $1 AND storage = $2 AND compression = $3 LIMIT $4 OFFSET $5",
        );
    });
});

describe("parsePostgresConnectionOptions", () => {
    it("strips the jdbc: prefix and passes the rest through as pg's own connection string", () => {
        const config = parsePostgresConnectionOptions(options());
        expect(config["connectionString"]).toBe("postgresql://localhost:5432/bluemap");
    });

    it("a non-positive max-connections falls back to a sane pool size rather than 0", () => {
        expect(parsePostgresConnectionOptions(options({ maxConnections: -1 }))["max"]).toBe(10);
        expect(parsePostgresConnectionOptions(options({ maxConnections: 0 }))["max"]).toBe(10);
        expect(parsePostgresConnectionOptions(options({ maxConnections: 7 }))["max"]).toBe(7);
    });

    it("connection-properties (e.g. user/password) merge on top of the connection string", () => {
        const config = parsePostgresConnectionOptions(
            options({ connectionProperties: { user: "alice", password: "swordfish" } }),
        );
        expect(config["user"]).toBe("alice");
        expect(config["password"]).toBe("swordfish");
        expect(config["connectionString"]).toBe("postgresql://localhost:5432/bluemap");
    });
});

describe("mapPostgresError", () => {
    it("classifies SQLSTATE 23505 as a unique-violation", () => {
        const raw = Object.assign(new Error('duplicate key value violates unique constraint "key"'), {
            code: "23505",
        });
        const mapped = mapPostgresError(raw);
        expect(mapped).toBeInstanceOf(SqlUniqueViolationError);
        expect(mapped.cause).toBe(raw);
    });

    it("classifies an admin-shutdown SQLSTATE as recoverable", () => {
        const raw = Object.assign(new Error("terminating connection due to administrator command"), {
            code: "57P01",
        });
        expect(mapPostgresError(raw)).toBeInstanceOf(SqlRecoverableError);
    });

    it("classifies a dropped socket as recoverable", () => {
        const raw = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
        expect(mapPostgresError(raw)).toBeInstanceOf(SqlRecoverableError);
    });

    it("passes an unrecognized SQLSTATE through unchanged", () => {
        const raw = Object.assign(new Error("syntax error"), { code: "42601" });
        expect(mapPostgresError(raw)).toBe(raw);
    });
});

describe("createPostgresDriverAdapter", () => {
    it("constructs (loads pg, builds a lazy pool) without needing a reachable server", async () => {
        const adapter = await createPostgresDriverAdapter(
            options({ connectionUrl: "jdbc:postgresql://127.0.0.1:1/no-such-database" }),
        );
        // `new pg.Pool(...)` never opens a socket until a client is actually
        // checked out, so closing immediately proves construction and teardown both
        // work without ever reaching out to a server.
        await adapter.close();
    });
});

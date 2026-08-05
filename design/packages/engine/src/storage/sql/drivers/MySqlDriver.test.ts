import { describe, expect, it } from "vitest";
import { SqlRecoverableError, SqlUniqueViolationError } from "../Database.js";
import type { SqlConnectionOptions } from "../Dialect.js";
import { createMySqlDriverAdapter, mapMySqlError, parseMySqlConnectionOptions } from "./MySqlDriver.js";

/**
 * No real MySQL/MariaDB server is available on this machine, so this file proves the
 * driver adapter's own logic — URL parsing and error classification — directly, and
 * proves the adapter can be *constructed* (which loads the real `mysql2` package and
 * builds a real connection pool, without opening a socket — `mysql2.createPool` is
 * lazy) without a server. What it does not and cannot prove: that a real MySQL server
 * accepts the statements this port sends it, or that `mapMySqlError`'s codes are what a
 * real server-triggered error actually carries. Both are stated here rather than
 * implied by a green test run.
 */

function options(overrides: Partial<SqlConnectionOptions> = {}): SqlConnectionOptions {
    return {
        connectionUrl: "jdbc:mysql://localhost:3306/bluemap?permitMysqlScheme",
        connectionProperties: {},
        maxConnections: -1,
        ...overrides,
    };
}

describe("parseMySqlConnectionOptions", () => {
    it("reads host, port and database from a jdbc:mysql: URL", () => {
        const config = parseMySqlConnectionOptions(options());
        expect(config["host"]).toBe("localhost");
        expect(config["port"]).toBe(3306);
        expect(config["database"]).toBe("bluemap");
        expect(config["rowsAsArray"]).toBe(true);
    });

    it("parses jdbc:mariadb: identically to jdbc:mysql:", () => {
        const config = parseMySqlConnectionOptions(
            options({ connectionUrl: "jdbc:mariadb://db.example.com:3307/mydb" }),
        );
        expect(config["host"]).toBe("db.example.com");
        expect(config["port"]).toBe(3307);
        expect(config["database"]).toBe("mydb");
    });

    it("defaults the port to 3306 when the URL does not name one", () => {
        const config = parseMySqlConnectionOptions(options({ connectionUrl: "jdbc:mysql://localhost/bluemap" }));
        expect(config["port"]).toBe(3306);
    });

    it("passes JDBC-only query flags through as inert extra keys rather than stripping them", () => {
        const config = parseMySqlConnectionOptions(options());
        expect(config["permitMysqlScheme"]).toBe("");
    });

    it("reads user/password embedded in the URL", () => {
        const config = parseMySqlConnectionOptions(
            options({ connectionUrl: "jdbc:mysql://bob:secret@localhost:3306/bluemap" }),
        );
        expect(config["user"]).toBe("bob");
        expect(config["password"]).toBe("secret");
    });

    it("connection-properties overrides whatever the URL embedded", () => {
        const config = parseMySqlConnectionOptions(
            options({
                connectionUrl: "jdbc:mysql://bob:secret@localhost:3306/bluemap",
                connectionProperties: { user: "alice", password: "swordfish" },
            }),
        );
        expect(config["user"]).toBe("alice");
        expect(config["password"]).toBe("swordfish");
    });

    it("a non-positive max-connections falls back to a sane pool size rather than 0", () => {
        expect(parseMySqlConnectionOptions(options({ maxConnections: -1 }))["connectionLimit"]).toBe(10);
        expect(parseMySqlConnectionOptions(options({ maxConnections: 0 }))["connectionLimit"]).toBe(10);
        expect(parseMySqlConnectionOptions(options({ maxConnections: 25 }))["connectionLimit"]).toBe(25);
    });
});

describe("mapMySqlError", () => {
    it("classifies ER_DUP_ENTRY as a unique-violation", () => {
        const raw = Object.assign(new Error("Duplicate entry 'x' for key 'key'"), { code: "ER_DUP_ENTRY" });
        const mapped = mapMySqlError(raw);
        expect(mapped).toBeInstanceOf(SqlUniqueViolationError);
        expect(mapped.cause).toBe(raw);
    });

    it("classifies a dropped connection as recoverable", () => {
        const raw = Object.assign(new Error("connection lost"), { code: "PROTOCOL_CONNECTION_LOST" });
        const mapped = mapMySqlError(raw);
        expect(mapped).toBeInstanceOf(SqlRecoverableError);
    });

    it("passes an unrecognized error through unchanged", () => {
        const raw = Object.assign(new Error("syntax error"), { code: "ER_PARSE_ERROR" });
        expect(mapMySqlError(raw)).toBe(raw);
    });

    it("wraps a non-Error throw", () => {
        const mapped = mapMySqlError("not an error object");
        expect(mapped).toBeInstanceOf(Error);
        expect(mapped.message).toContain("not an error object");
    });
});

describe("createMySqlDriverAdapter", () => {
    it("constructs (loads mysql2, builds a lazy pool) without needing a reachable server", async () => {
        const adapter = await createMySqlDriverAdapter(
            options({ connectionUrl: "jdbc:mysql://127.0.0.1:1/no-such-database" }),
        );
        // `mysql2.createPool` never opens a socket until a connection is actually
        // requested, so closing immediately proves construction and teardown both
        // work without ever reaching out to a server.
        await adapter.close();
    });
});

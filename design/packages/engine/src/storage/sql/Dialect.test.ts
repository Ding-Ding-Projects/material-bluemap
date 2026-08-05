import { describe, expect, it } from "vitest";
import { MARIADB, MYSQL, POSTGRESQL, resolveDialect, SQLITE, UnknownDialectError } from "./Dialect.js";
import { MySQLCommandSet } from "./commandset/MySQLCommandSet.js";
import { PostgreSQLCommandSet } from "./commandset/PostgreSQLCommandSet.js";
import { SqliteCommandSet } from "./commandset/SqliteCommandSet.js";
import type { Database } from "./Database.js";

/**
 * upstream: `common/config/storage/Dialect.java` + `SQLConfig#getDialect()`.
 *
 * `resolveDialect` reproduces both: auto-detecting a dialect from the connection URL's
 * `jdbc:` prefix when no explicit `dialect` is configured, and refusing to start (the
 * exact upstream refusal condition) when nothing matches.
 */
describe("resolveDialect — auto-detection from the connection-url prefix", () => {
    it.each([
        ["jdbc:mysql://localhost/bluemap", "bluemap:mysql"],
        ["jdbc:mariadb://localhost/bluemap", "bluemap:mariadb"],
        ["jdbc:postgresql://localhost/bluemap", "bluemap:postgresql"],
        ["jdbc:sqlite:/var/lib/bluemap.db", "bluemap:sqlite"],
        ["jdbc:sqlite::memory:", "bluemap:sqlite"],
    ])("%s -> %s", (url, expectedKey) => {
        expect(resolveDialect(null, url).key.getFormatted()).toBe(expectedKey);
    });

    it("refuses a connection-url whose prefix matches no known dialect", () => {
        expect(() => resolveDialect(null, "jdbc:oracle:thin:@localhost:1521:xe")).toThrow(UnknownDialectError);
    });
});

describe("resolveDialect — an explicit dialect key overrides auto-detection", () => {
    it("accepts the bare (unnamespaced) spelling, exactly like every other namespaced key in this config", () => {
        expect(resolveDialect("sqlite", "jdbc:mysql://localhost/bluemap").key.getFormatted()).toBe(
            "bluemap:sqlite",
        );
    });

    it("accepts the fully-namespaced spelling", () => {
        expect(resolveDialect("bluemap:postgresql", "jdbc:mysql://localhost/bluemap").key.getFormatted()).toBe(
            "bluemap:postgresql",
        );
    });

    it("refuses an unknown dialect key, naming what it does know", () => {
        expect(() => resolveDialect("oracle", "jdbc:mysql://localhost/bluemap")).toThrow(UnknownDialectError);
        try {
            resolveDialect("oracle", "jdbc:mysql://localhost/bluemap");
            expect.unreachable();
        } catch (ex) {
            expect((ex as Error).message).toContain("oracle");
            expect((ex as Error).message).toContain("bluemap:sqlite");
        }
    });
});

describe("dialect -> CommandSet wiring", () => {
    it("MYSQL and MARIADB both construct MySQLCommandSet, matching Dialect.java sharing one Impl", () => {
        expect(MYSQL.createCommandSet({} as Database)).toBeInstanceOf(MySQLCommandSet);
        expect(MARIADB.createCommandSet({} as Database)).toBeInstanceOf(MySQLCommandSet);
    });

    it("POSTGRESQL constructs PostgreSQLCommandSet", () => {
        expect(POSTGRESQL.createCommandSet({} as Database)).toBeInstanceOf(PostgreSQLCommandSet);
    });

    it("SQLITE constructs SqliteCommandSet", () => {
        expect(SQLITE.createCommandSet({} as Database)).toBeInstanceOf(SqliteCommandSet);
    });

    it("every dialect names the package a person needs to install to use it", () => {
        expect(MYSQL.packageName).toBe("mysql2");
        expect(MARIADB.packageName).toBe("mysql2");
        expect(POSTGRESQL.packageName).toBe("pg");
        expect(SQLITE.packageName).toBe("sql.js");
    });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StorageDeleteTask } from "../../map/rendermanager/StorageDeleteTask.js";
import { ORACLE_MODEL_BUILDERS } from "../../map/hires/prbmOracleFixture.js";
import { writeTileModelToPRBM } from "../../map/hires/PRBMWriter.js";
import { Compression } from "../compression/Compression.js";
import { FileMapStorage } from "../file/FileMapStorage.js";
import { Database, type SqlDriverAdapter } from "./Database.js";
import { MARIADB, MYSQL, POSTGRESQL, type Dialect } from "./Dialect.js";
import { SQLStorage } from "./SQLStorage.js";

/**
 * Issue #32's stated remaining gap: "MySQL/PostgreSQL unproven against a real server."
 * Every other item in the port (interfaces, statement-for-statement contract tests,
 * SQLite functional coverage, byte-fidelity against `FileMapStorage`, optional-driver
 * error messages) is proven elsewhere in this directory — see `SqlStorage.sqlite.test.ts`
 * and `SqlStorage.byteFidelity.test.ts`. This file is the one place that talks to real
 * MySQL, MariaDB and PostgreSQL servers over a real TCP connection through the same
 * `mysql2`/`pg` drivers the port ships.
 *
 * ## Why this is opt-in and loudly skipped by default
 *
 * A real server is infrastructure, not something `vitest` can fabricate, so each dialect
 * here is gated on its own connection-URL environment variable:
 *
 *   - `MBM_TEST_MYSQL_URL`      e.g. `jdbc:mysql://root:<password>@127.0.0.1:33061/bluemap_test`
 *   - `MBM_TEST_MARIADB_URL`    e.g. `jdbc:mariadb://root:<password>@127.0.0.1:33062/bluemap_test`
 *   - `MBM_TEST_POSTGRES_URL`   e.g. `jdbc:postgresql://postgres:<password>@127.0.0.1:54329/bluemap_test`
 *
 * When a variable is unset, that dialect's suite is replaced with a single passing test
 * that says so by name — the same "loud skip" pattern `javaRoundTrip.test.ts` and
 * `vendorGate.ts` already use elsewhere in this repository — so a run that never touched
 * a real server cannot be mistaken, from a wall of green, for one that did.
 *
 * ## How the proof for issue #32 was actually produced
 *
 * Three throwaway, official, exact-tag-pinned Docker containers, each on a distinct high
 * local port with a freshly generated password passed only through an environment
 * variable, torn down again once the run finished:
 *
 * ```sh
 * docker run -d --name mbm-test-mysql    -e MYSQL_ROOT_PASSWORD=<throwaway>    -e MYSQL_DATABASE=bluemap_test    -p 127.0.0.1:33061:3306 mysql:8.4.6
 * docker run -d --name mbm-test-mariadb  -e MARIADB_ROOT_PASSWORD=<throwaway>  -e MARIADB_DATABASE=bluemap_test  -p 127.0.0.1:33062:3306 mariadb:11.4.7
 * docker run -d --name mbm-test-postgres -e POSTGRES_PASSWORD=<throwaway>      -e POSTGRES_DB=bluemap_test       -p 127.0.0.1:54329:5432 postgres:17.6
 * ```
 *
 * ## What this does not prove
 *
 * Cross-compatibility with upstream's real Java engine reading/writing the same
 * database — that needs a JVM run, is named separately in issue #32's own acceptance
 * checklist, and is out of scope for this file. See `ROADMAP.md`'s Phase H section and
 * `docs/deviations.md`'s `storage/sql` section for exactly what remains open.
 */

interface RealServerTarget {
    readonly label: string;
    readonly dialect: Dialect;
    readonly urlEnvVar: string;
}

const REAL_SERVER_TARGETS: readonly RealServerTarget[] = [
    { label: "MySQL", dialect: MYSQL, urlEnvVar: "MBM_TEST_MYSQL_URL" },
    { label: "MariaDB", dialect: MARIADB, urlEnvVar: "MBM_TEST_MARIADB_URL" },
    { label: "PostgreSQL", dialect: POSTGRESQL, urlEnvVar: "MBM_TEST_POSTGRES_URL" },
];

/**
 * Drops every table this port's schema owns, children (foreign-key referencing tables)
 * before parents, so each test starts from a genuinely empty schema on a server whose
 * data otherwise persists between tests — unlike the sqlite suite's fresh `:memory:` per
 * test, a real server's tables have to be cleared by hand.
 */
async function dropAllTables(database: Database): Promise<void> {
    const childrenFirst = [
        "bluemap_item_storage_data",
        "bluemap_grid_storage_data",
        "bluemap_map",
        "bluemap_compression",
        "bluemap_item_storage",
        "bluemap_grid_storage",
    ];
    await database.run(async (connection) => {
        for (const table of childrenFirst) {
            await connection.execute(`DROP TABLE IF EXISTS ${table}`, []);
        }
    });
}

for (const target of REAL_SERVER_TARGETS) {
    const url = process.env[target.urlEnvVar];

    if (url === undefined || url.trim() === "") {
        describe(`SQLStorage (${target.label} dialect) — real server`, () => {
            it(`is skipped because ${target.urlEnvVar} is not set`, () => {
                // Recorded as a passing test rather than silence, so a run that never
                // touched a real ${target.label} server cannot be mistaken for one that
                // did. Set ${target.urlEnvVar} to a real jdbc:-style connection url
                // (e.g. from a throwaway Docker container) to exercise this dialect.
                expect(url === undefined || url.trim() === "").toBe(true);
            });
        });
        continue;
    }

    describe(`SQLStorage (${target.label} dialect) — a real server`, () => {
        let driverAdapter: SqlDriverAdapter;
        let root: string;

        beforeAll(async () => {
            driverAdapter = await target.dialect.createDriverAdapter({
                connectionUrl: url,
                connectionProperties: {},
                maxConnections: -1,
            });
        });

        afterAll(async () => {
            // Closed exactly once here, never via `storage.close()` inside a test: every
            // test below shares this one connection pool (opening a fresh pool per test
            // against a real TCP server would be needlessly slow), so closing it early
            // would break every test that runs after the one that closed it.
            await driverAdapter.close();
        });

        beforeAll(async () => {
            root = await mkdtemp(join(tmpdir(), "bluemap-sql-real-"));
        });

        afterAll(async () => {
            await rm(root, { recursive: true, force: true });
        });

        /**
         * A fresh `Database`/`CommandSet` pair per call (sharing the one driver pool),
         * over a schema just dropped and recreated — the find-or-create key caches live
         * on the `CommandSet` instance, so reusing one across tests would risk serving a
         * cached id from a table this helper just dropped out from under it.
         */
        async function openStorage(compression = Compression.GZIP): Promise<SQLStorage> {
            const database = new Database(driverAdapter);
            await dropAllTables(database);
            const commandSet = target.dialect.createCommandSet(database);
            const storage = new SQLStorage(commandSet, compression);
            await storage.initialize();
            return storage;
        }

        it("creates its schema on a bare database and round-trips an item and a grid tile", async () => {
            const storage = await openStorage();
            const map = storage.map("overworld");

            expect(await map.exists()).toBe(false);
            await map.settings().write(Buffer.from('{"real":"server"}'));
            expect(await map.exists()).toBe(true);
            expect((await (await map.settings().read())!.decompress()).toString("utf8")).toBe(
                '{"real":"server"}',
            );

            await map.hiresTiles().write(4, -9, Buffer.from("a real tile"));
            const tile = await map.hiresTiles().read(4, -9);
            expect((await tile!.decompress()).toString("utf8")).toBe("a real tile");
        });

        it(
            "every oracle-built hires tile is byte-identical to FileMapStorage's own compressed and decompressed bytes",
            async () => {
                const storage = await openStorage(Compression.GZIP);
                const sqlMap = storage.map("overworld");
                const fileStorage = new FileMapStorage(join(root, "overworld"), Compression.GZIP, false);

                let x = 0;
                for (const [name, build] of Object.entries(ORACLE_MODEL_BUILDERS)) {
                    const raw = writeTileModelToPRBM(build());
                    const z = 0;

                    await fileStorage.hiresTiles().write(x, z, raw);
                    await sqlMap.hiresTiles().write(x, z, raw);

                    const fileRead = await fileStorage.hiresTiles().read(x, z);
                    const sqlRead = await sqlMap.hiresTiles().read(x, z);
                    expect(fileRead, `file storage has no tile for '${name}'`).not.toBeNull();
                    expect(sqlRead, `${target.label}: sql storage has no tile for '${name}'`).not.toBeNull();

                    const fileCompressed = fileRead!.getBuffer();
                    const sqlCompressed = sqlRead!.getBuffer();
                    expect(
                        sqlCompressed.equals(fileCompressed),
                        `${target.label}, '${name}': stored gzip bytes differ from file-stored gzip bytes`,
                    ).toBe(true);

                    const fileDecompressed = await fileRead!.decompress();
                    const sqlDecompressed = await sqlRead!.decompress();
                    expect(
                        Buffer.from(fileDecompressed).equals(Buffer.from(raw)),
                        `${target.label}, '${name}': file round-trip`,
                    ).toBe(true);
                    expect(
                        Buffer.from(sqlDecompressed).equals(Buffer.from(raw)),
                        `${target.label}, '${name}': sql round-trip`,
                    ).toBe(true);

                    x++;
                }
            },
            30_000,
        );

        it("carries the render-state grids independently of the map's tile compression", async () => {
            const storage = await openStorage(Compression.ZSTD);
            const map = storage.map("overworld");

            await map.tileState().write(1, 1, Buffer.from("tile-state"));
            await map.chunkState().write(2, 2, Buffer.from("chunk-state"));
            await map.regionState().write(3, 3, Buffer.from("region-state"));

            const tileState = await map.tileState().read(1, 1);
            const chunkState = await map.chunkState().read(2, 2);
            const regionState = await map.regionState().read(3, 3);
            expect(tileState!.getCompression()).toBe(Compression.GZIP);
            expect(chunkState!.getCompression()).toBe(Compression.GZIP);
            expect(regionState!.getCompression()).toBe(Compression.GZIP);
            expect((await tileState!.decompress()).toString("utf8")).toBe("tile-state");
            expect((await chunkState!.decompress()).toString("utf8")).toBe("chunk-state");
            expect((await regionState!.decompress()).toString("utf8")).toBe("region-state");

            // hires tiles and the render-state grids are addressed by distinct keys, so
            // writing one does not collide with the others at the same (x, z)
            await map.hiresTiles().write(1, 1, Buffer.from("hires-not-tile-state"));
            expect((await (await map.tileState().read(1, 1))!.decompress()).toString("utf8")).toBe(
                "tile-state",
            );
        });

        it(
            "deletes a whole map, purging past a single page, and reports monotonic progress reaching 1",
            async () => {
                const storage = await openStorage();
                const map = storage.map("bigmap");

                const COUNT = 1250; // > one 1000-row purge page
                for (let i = 0; i < COUNT; i++) {
                    await map.hiresTiles().write(i, 0, Buffer.from(String(i)));
                }
                expect(await map.exists()).toBe(true);

                const progress: number[] = [];
                await map.delete((value) => {
                    progress.push(value);
                    return true;
                });

                expect(progress.length).toBeGreaterThan(1); // more than one 1000-row purge round happened
                expect(progress[progress.length - 1]).toBe(1);
                expect(await map.exists()).toBe(false);
                expect((await map.hiresTiles().stream()).length).toBe(0);
            },
            120_000,
        );

        it("wires into StorageDeleteTask exactly as the sqlite suite proves for the same interface", async () => {
            const storage = await openStorage();
            const map = storage.map("overworld");
            await map.hiresTiles().write(0, 0, Buffer.from("a"));
            await map.settings().write(Buffer.from("{}"));
            expect(await map.exists()).toBe(true);

            const task = new StorageDeleteTask(map, "overworld");
            expect(task.hasMoreWork()).toBe(true);
            await task.doWork();

            expect(task.hasMoreWork()).toBe(false);
            expect(task.estimateProgress()).toBe(1);
            expect(await map.exists()).toBe(false);
        });

        it(
            "upstream's own find-or-create key resolution recreates a deleted map's row on the next access — not a port deviation",
            async () => {
                const storage = await openStorage();
                const map = storage.map("ephemeral");
                await map.hiresTiles().write(0, 0, Buffer.from("x"));
                await map.delete();
                expect(await map.exists()).toBe(false);

                // any subsequent grid/item access recreates the map row as a side effect —
                // checked directly against AbstractCommandSet.java's findOrCreateMapKey,
                // see SqlStorage.sqlite.test.ts's identical test for the full explanation
                expect(await map.hiresTiles().exists(0, 0)).toBe(false);
                expect(await map.exists()).toBe(true);
            },
        );

        it(
            "paginates grid tiles past a single page (>1000 rows) without losing or duplicating any",
            async () => {
                const storage = await openStorage();
                const grid = storage.map("bigmap").hiresTiles();

                const COUNT = 1250; // > one 1000-row PageSpliterator page
                for (let i = 0; i < COUNT; i++) {
                    await grid.write(i, -i, Buffer.from(`tile-${i}`));
                }

                const cells = await grid.stream();
                expect(cells).toHaveLength(COUNT);
                const seen = new Set(cells.map((c) => `${c.getX()},${c.getZ()}`));
                expect(seen.size).toBe(COUNT);
                for (let i = 0; i < COUNT; i++) expect(seen.has(`${i},${-i}`)).toBe(true);

                // spot-check a tile from the second page actually round-trips its bytes
                const midCell = cells.find((c) => c.getX() === 1100)!;
                expect((await (await midCell.read())!.decompress()).toString("utf8")).toBe("tile-1100");
            },
            120_000,
        );
    });
}

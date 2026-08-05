import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ORACLE_MODEL_BUILDERS } from "../../map/hires/prbmOracleFixture.js";
import { writeTileModelToPRBM } from "../../map/hires/PRBMWriter.js";
import { Compression } from "../compression/Compression.js";
import { FileMapStorage } from "../file/FileMapStorage.js";
import { SQLITE } from "./Dialect.js";
import { Database } from "./Database.js";
import { SQLStorage } from "./SQLStorage.js";

/**
 * Issue #32, requirement 3: "hires .prbm gz bytes byte-identical through a round trip".
 *
 * The tiles here are not sample bytes invented for the test — they are real hires-tile
 * output from the port's own mesher (`writeTileModelToPRBM`, over the exact model
 * builders `PRBMWriter.test.ts` checks against the real Java writer's byte-for-byte
 * output). The same raw bytes are written through `FileMapStorage` and through
 * `SQLStorage` (sqlite dialect), each compressing independently with the same
 * `Compression.GZIP`. Node's `zlib.gzip` embeds no timestamp (verified empirically —
 * two independent calls over identical input produce identical bytes, MTIME field
 * fixed at zero), so this is a genuine byte-for-byte comparison, not one that happens
 * to pass because nobody looked at whether gzip's header could vary.
 */

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-byte-fidelity-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function openSqlStorage(): Promise<SQLStorage> {
    const driverAdapter = await SQLITE.createDriverAdapter({
        connectionUrl: "jdbc:sqlite::memory:",
        connectionProperties: {},
        maxConnections: -1,
    });
    const database = new Database(driverAdapter);
    const commandSet = SQLITE.createCommandSet(database);
    const storage = new SQLStorage(commandSet, Compression.GZIP);
    await storage.initialize();
    return storage;
}

describe("SQL storage vs file storage — byte-identical hires tiles", () => {
    it("every oracle-built hires tile round-trips to byte-identical compressed and decompressed bytes", async () => {
        const fileStorage = new FileMapStorage(join(root, "overworld"), Compression.GZIP, false);
        const sqlStorage = await openSqlStorage();
        const sqlMap = sqlStorage.map("overworld");

        let x = 0;
        for (const [name, build] of Object.entries(ORACLE_MODEL_BUILDERS)) {
            const raw = writeTileModelToPRBM(build());
            const z = 0;

            await fileStorage.hiresTiles().write(x, z, raw);
            await sqlMap.hiresTiles().write(x, z, raw);

            const fileRead = await fileStorage.hiresTiles().read(x, z);
            const sqlRead = await sqlMap.hiresTiles().read(x, z);
            expect(fileRead, `file storage has no tile for '${name}'`).not.toBeNull();
            expect(sqlRead, `sql storage has no tile for '${name}'`).not.toBeNull();

            // the raw, still-compressed bytes actually stored — this is the literal
            // .prbm.gz payload a viewer downloads, byte for byte
            const fileCompressed = fileRead!.getBuffer();
            const sqlCompressed = sqlRead!.getBuffer();
            expect(
                sqlCompressed.equals(fileCompressed),
                `'${name}': sql-stored gzip bytes differ from file-stored gzip bytes`,
            ).toBe(true);

            // and both decompress back to exactly the mesher's raw output
            const fileDecompressed = await fileRead!.decompress();
            const sqlDecompressed = await sqlRead!.decompress();
            expect(Buffer.from(fileDecompressed).equals(Buffer.from(raw)), `'${name}': file round-trip`).toBe(
                true,
            );
            expect(Buffer.from(sqlDecompressed).equals(Buffer.from(raw)), `'${name}': sql round-trip`).toBe(true);

            x++;
        }

        await sqlStorage.close();
    });

    it("a real hires tile is byte-identical end to end through SQLStorage.map(...).hiresTiles(), not only the lower-level grid", async () => {
        const build = ORACLE_MODEL_BUILDERS["mergeSort40"]!;
        const raw = writeTileModelToPRBM(build());

        const fileStorage = new FileMapStorage(join(root, "overworld"), Compression.GZIP, true);
        const sqlStorage = await openSqlStorage();

        await fileStorage.hiresTiles().write(5, -5, raw);
        await sqlStorage.map("overworld").hiresTiles().write(5, -5, raw);

        const fileBytes = (await fileStorage.hiresTiles().read(5, -5))!.getBuffer();
        const sqlBytes = (await sqlStorage.map("overworld").hiresTiles().read(5, -5))!.getBuffer();
        expect(sqlBytes.equals(fileBytes)).toBe(true);

        await sqlStorage.close();
    });
});

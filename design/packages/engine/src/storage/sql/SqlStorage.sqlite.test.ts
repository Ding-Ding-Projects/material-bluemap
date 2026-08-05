import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageDeleteTask } from "../../map/rendermanager/StorageDeleteTask.js";
import { Compression } from "../compression/Compression.js";
import { Database, MissingSqlDriverError } from "./Database.js";
import { SQLITE } from "./Dialect.js";
import { loadOptionalModule } from "./drivers/loadOptionalModule.js";
import { SQLStorage } from "./SQLStorage.js";

/**
 * Functional coverage for the ported SQL storage, run against a real `sql.js` SQLite
 * engine — real SQL executed against a real (WASM) SQLite, not a hand-rolled fake. See
 * the handoff notes for exactly what this does and does not prove about MySQL and
 * PostgreSQL, which have no equivalent locally-runnable engine.
 */

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-sql-storage-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function openStorage(connectionUrl: string, compression = Compression.GZIP): Promise<SQLStorage> {
    const driverAdapter = await SQLITE.createDriverAdapter({
        connectionUrl,
        connectionProperties: {},
        maxConnections: -1,
    });
    const database = new Database(driverAdapter);
    const commandSet = SQLITE.createCommandSet(database);
    const storage = new SQLStorage(commandSet, compression);
    await storage.initialize();
    return storage;
}

describe("SQLStorage (sqlite dialect) — a real SQLite engine, in-memory", () => {
    it("initializes idempotently — calling initialize() twice does not fail or lose data", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        await storage.map("overworld").settings().write(Buffer.from("{}"));
        await storage.initialize();
        expect(await storage.map("overworld").settings().read().then((r) => r?.decompress())).toEqual(
            Buffer.from("{}"),
        );
        await storage.close();
    });

    it("round-trips item storage: write, read, exists, delete", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const item = storage.map("overworld").settings();

        expect(await item.exists()).toBe(false);
        expect(await item.read()).toBeNull();

        await item.write(Buffer.from("hello sql storage"));
        expect(await item.exists()).toBe(true);
        const read = await item.read();
        expect(read).not.toBeNull();
        expect((await read!.decompress()).toString("utf8")).toBe("hello sql storage");

        await item.write(Buffer.from("overwritten"));
        expect((await (await item.read())!.decompress()).toString("utf8")).toBe("overwritten");

        await item.delete();
        expect(await item.exists()).toBe(false);
        expect(await item.read()).toBeNull();
        // deleting again is a no-op, not an error
        await item.delete();

        await storage.close();
    });

    it("round-trips grid storage: write, read, exists, delete, stream", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const grid = storage.map("overworld").hiresTiles();

        expect(await grid.exists(3, -7)).toBe(false);
        await grid.write(3, -7, Buffer.from("tile a"));
        await grid.write(0, 0, Buffer.from("tile b"));
        expect(await grid.exists(3, -7)).toBe(true);

        const read = await grid.read(3, -7);
        expect((await read!.decompress()).toString("utf8")).toBe("tile a");

        const cells = await grid.stream();
        expect(cells.map((c) => `${c.getX()},${c.getZ()}`).sort()).toEqual(["0,0", "3,-7"]);
        const found = cells.find((c) => c.getX() === 3)!;
        expect((await (await found.read())!.decompress()).toString("utf8")).toBe("tile a");

        await grid.delete(3, -7);
        expect(await grid.exists(3, -7)).toBe(false);
        expect((await grid.stream()).map((c) => c.getX())).toEqual([0]);

        await storage.close();
    });

    it("compresses what it writes, exactly like FileItemStorage/FileGridStorage do", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:", Compression.GZIP);
        const item = storage.map("overworld").textures();
        await item.write(Buffer.from("compress me please"));
        const read = await item.read();
        expect(read!.getCompression()).toBe(Compression.GZIP);
        // the raw (still-compressed) bytes really are gzip
        expect(read!.getBuffer()[0]).toBe(0x1f);
        expect(read!.getBuffer()[1]).toBe(0x8b);
        expect((await read!.decompress()).toString("utf8")).toBe("compress me please");
        await storage.close();
    });

    it("hasMap / mapIds / map existence", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        expect(await storage.map("overworld").exists()).toBe(false);
        expect(await storage.mapIds()).toEqual([]);

        await storage.map("overworld").settings().write(Buffer.from("{}"));
        await storage.map("nether").settings().write(Buffer.from("{}"));

        expect(await storage.map("overworld").exists()).toBe(true);
        expect((await storage.mapIds()).sort()).toEqual(["nether", "overworld"]);

        await storage.close();
    });

    it("hands out the same MapStorage instance for the same map id (upstream's LoadingCache identity)", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const overworld = storage.map("overworld");
        expect(storage.map("overworld")).toBe(overworld);
        expect(storage.map("nether")).not.toBe(overworld);
        await storage.close();
    });

    it("hands out the same GridStorage/ItemStorage instance for the same key, per SQLMapStorage", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("overworld");
        expect(map.lowresTiles(2)).toBe(map.lowresTiles(2));
        expect(map.lowresTiles(2)).not.toBe(map.lowresTiles(3));
        expect(map.settings()).toBe(map.settings());
        await storage.close();
    });

    it("escapes an asset name exactly like MapStorage.escapeAssetName", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("overworld");
        await map.asset("playerheads/../secret").write(Buffer.from("x"));
        // stored under the escaped key — read back through the same escaped call
        expect(await map.asset("playerheads/../secret").exists()).toBe(true);
        // a *different* raw name that escapes to the same string finds the same item
        // (this is exactly what escapeAssetName is for: collapsing traversal attempts)
        expect(await map.asset("playerheads/_./secret").exists()).toBe(true);
        await storage.close();
    });

    it("deletes a whole map and reports monotonic progress reaching 1, then purges the map row", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("overworld");

        for (let x = 0; x < 5; x++) {
            for (let z = 0; z < 5; z++) {
                await map.hiresTiles().write(x, z, Buffer.from(`${x},${z}`));
            }
        }
        await map.settings().write(Buffer.from("{}"));
        expect(await map.exists()).toBe(true);

        const progress: number[] = [];
        await map.delete((value) => {
            progress.push(value);
            return true;
        });

        expect(await map.exists()).toBe(false);
        expect(progress.length).toBeGreaterThan(0);
        expect(progress[progress.length - 1]).toBe(1);
        expect((await map.hiresTiles().stream()).length).toBe(0);

        await storage.close();
    });

    it("deleting an absent map is a no-op", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        await storage.map("absent").delete();
        await storage.close();
    });

    it("aborting delete midway (onProgress returns false) stops further purging", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("overworld");
        for (let i = 0; i < 5; i++) await map.hiresTiles().write(i, 0, Buffer.from(String(i)));

        let calls = 0;
        await map.delete(() => {
            calls++;
            return false; // abort on the very first progress callback
        });
        expect(calls).toBe(1);
        // the map row itself is untouched because delete() returned before purgeMap()
        expect(await map.exists()).toBe(true);

        await storage.close();
    });

    it("wires into StorageDeleteTask exactly like FileMapStorage does", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("overworld");
        await map.hiresTiles().write(0, 0, Buffer.from("a"));
        await map.settings().write(Buffer.from("{}"));
        expect(await map.exists()).toBe(true);

        const task = new StorageDeleteTask(map, "overworld");
        expect(task.hasMoreWork()).toBe(true);
        expect(task.getMapId()).toBe("overworld");
        expect(task.getStorage()).toBe(map);

        await task.doWork();

        expect(task.hasMoreWork()).toBe(false);
        expect(task.estimateProgress()).toBe(1);
        expect(await map.exists()).toBe(false);

        await storage.close();
    });

    it("paginates grid items past a single page (>1000 rows) without losing or duplicating any", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const grid = storage.map("bigmap").hiresTiles();

        const COUNT = 1250; // > one 1000-row page
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

        await storage.close();
    }, 30_000);

    it("paginates map ids past a single page (>1000 maps)", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const COUNT = 1100;
        for (let i = 0; i < COUNT; i++) {
            await storage.map(`map-${i}`).settings().write(Buffer.from("{}"));
        }

        const ids = await storage.mapIds();
        expect(ids).toHaveLength(COUNT);
        expect(new Set(ids).size).toBe(COUNT);

        await storage.close();
    }, 30_000);

    it("purges more grid rows than one 1000-row purge page", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("bigmap");
        const COUNT = 1500;
        for (let i = 0; i < COUNT; i++) await map.hiresTiles().write(i, 0, Buffer.from(String(i)));

        const progress: number[] = [];
        await map.delete((value) => {
            progress.push(value);
            return true;
        });

        // more than one purge round happened (each round purges at most 1000 rows)
        expect(progress.length).toBeGreaterThan(1);
        expect(progress[progress.length - 1]).toBe(1);
        // Checked before any further grid/item read on this map: every such read
        // resolves `mapKey(mapId)` first, which is a *find-or-create* lookup (see the
        // dedicated test below) and would recreate the very row this is checking is
        // gone if it ran first.
        expect(await map.exists()).toBe(false);

        await storage.close();
    }, 30_000);

    it("upstream's own find-or-create key resolution recreates a deleted map's row on the next access — not a port deviation", async () => {
        // `AbstractCommandSet.findOrCreateMapKey` (and this port's `mapKey`) has no
        // concept of "this map existed and was deleted" versus "this map never
        // existed" — every grid/item operation resolves a map's key by inserting one
        // if none is found. Deleting a map's *contents* does not stop the next write
        // (or, as here, the next *read*) from silently recreating an empty map row.
        // This is upstream's actual behavior, checked directly against the Java
        // source (`AbstractCommandSet.java`'s `findOrCreateMapKey`) rather than
        // invented — a person relying on "delete, then never touch this map id
        // again" gets exactly upstream's semantics from this port too.
        const storage = await openStorage("jdbc:sqlite::memory:");
        const map = storage.map("ephemeral");
        await map.hiresTiles().write(0, 0, Buffer.from("x"));
        await map.delete();
        expect(await map.exists()).toBe(false);

        // any subsequent grid/item access — even a read of an id that plainly is not
        // there — recreates the map row as a side effect
        expect(await map.hiresTiles().exists(0, 0)).toBe(false);
        expect(await map.exists()).toBe(true);

        await storage.close();
    });

    it("addresses sub-storages by upstream's keys and compressions, exactly like KeyedMapStorage", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:", Compression.ZSTD);
        const map = storage.map("overworld");

        // KeyedMapStorage.grid/item is exercised indirectly; this asserts the SQL storage
        // actually reaches the same keys FileMapStorage's equivalent test checks for.
        await map.hiresTiles().write(0, 0, Buffer.from("x"));
        await map.textures().write(Buffer.from("y"));

        const readTextures = await map.textures().read();
        expect(readTextures!.getCompression()).toBe(Compression.ZSTD);

        const readHires = await map.hiresTiles().read(0, 0);
        expect(readHires!.getCompression()).toBe(Compression.ZSTD);

        await storage.close();
    });

    it("carries the render-state grids (tileState/chunkState/regionState) — always gzip, regardless of the map's tile compression", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:", Compression.ZSTD);
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

        // the three render-state grids and the hires grid are addressed by distinct
        // keys, so writing to one does not collide with the others at the same (x, z)
        await map.hiresTiles().write(1, 1, Buffer.from("hires-not-tile-state"));
        expect((await (await map.tileState().read(1, 1))!.decompress()).toString("utf8")).toBe("tile-state");

        await storage.close();
    });

    it("carries markers/players/settings — always uncompressed, per KeyedMapStorage", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:", Compression.ZSTD);
        const map = storage.map("overworld");

        await map.markers().write(Buffer.from('{"markerSets":{}}'));
        await map.players().write(Buffer.from("[]"));

        expect((await map.markers().read())!.getCompression()).toBe(Compression.NONE);
        expect((await map.players().read())!.getCompression()).toBe(Compression.NONE);
        expect((await (await map.markers().read())!.decompress()).toString("utf8")).toBe('{"markerSets":{}}');

        await storage.close();
    });
});

describe("SQLStorage (sqlite dialect) — real file persistence", () => {
    it("persists to disk and survives being reopened from a fresh SQLStorage/driver", async () => {
        const file = join(root, "bluemap.sqlite");
        const url = `jdbc:sqlite:${file}`;

        const first = await openStorage(url);
        await first.map("overworld").settings().write(Buffer.from("{}"));
        await first.map("overworld").hiresTiles().write(2, -3, Buffer.from("persisted tile"));
        await first.close();

        const second = await openStorage(url);
        expect(await second.map("overworld").exists()).toBe(true);
        expect(await second.map("overworld").settings().exists()).toBe(true);
        const tile = await second.map("overworld").hiresTiles().read(2, -3);
        expect((await tile!.decompress()).toString("utf8")).toBe("persisted tile");
        await second.close();
    });

    it("does not write a file for an in-memory (:memory:) connection url", async () => {
        const storage = await openStorage("jdbc:sqlite::memory:");
        await storage.map("overworld").settings().write(Buffer.from("{}"));
        await storage.close();
        // nothing was ever written under `root`, since the file-less driver never
        // resolves a path to persist to
        const { readdir } = await import("node:fs/promises");
        expect(await readdir(root)).toEqual([]);
    });
});

describe("MissingSqlDriverError — the message issue #32 explicitly requires", () => {
    it("names the missing package rather than surfacing a raw module-resolution stack trace", async () => {
        await expect(
            loadOptionalModule("a-package-that-does-not-exist-in-this-repo", "a-package-that-does-not-exist-in-this-repo", "Test dialect"),
        ).rejects.toThrow(MissingSqlDriverError);

        try {
            await loadOptionalModule("a-package-that-does-not-exist-in-this-repo", "a-package-that-does-not-exist-in-this-repo", "Test dialect");
            expect.unreachable();
        } catch (ex) {
            expect(ex).toBeInstanceOf(MissingSqlDriverError);
            expect((ex as Error).message).toContain("a-package-that-does-not-exist-in-this-repo");
            expect((ex as Error).message).toContain("Test dialect");
            expect((ex as Error).message).not.toContain("ERR_MODULE_NOT_FOUND");
        }
    });
});

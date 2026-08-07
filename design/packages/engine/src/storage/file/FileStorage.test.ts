import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Key } from "@worldlens/shared";
import { Compression } from "../compression/Compression.js";
import { GridStorageCell } from "../GridStorage.js";
import { KeyedMapStorage } from "../KeyedMapStorage.js";
import { MapStorage } from "../MapStorage.js";
import { FileGridStorage } from "./FileGridStorage.js";
import { FileItemStorage } from "./FileItemStorage.js";
import { FileMapStorage } from "./FileMapStorage.js";
import { FileStorage } from "./FileStorage.js";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-storage-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("MapStorage.escapeAssetName", () => {
    it("keeps word characters, dots, dashes, underscores and slashes", () => {
        expect(MapStorage.escapeAssetName("playerheads/abc-123_x.png")).toBe(
            "playerheads/abc-123_x.png",
        );
    });

    it("replaces every other character with an underscore", () => {
        expect(MapStorage.escapeAssetName("a b:c*d?e")).toBe("a_b_c_d_e");
    });

    it("defuses a parent-directory traversal", () => {
        // upstream: replaceAll(...) then replace("..", "_.")
        expect(MapStorage.escapeAssetName("../../etc/passwd")).toBe("_./_./etc/passwd");
    });

    it("replaces every non-overlapping '..', left to right, exactly as java's String#replace", () => {
        expect(MapStorage.escapeAssetName("...")).toBe("_..");
        expect(MapStorage.escapeAssetName("....")).toBe("_._.");
    });
});

describe("FileItemStorage", () => {
    it("round-trips uncompressed data", async () => {
        const item = new FileItemStorage(join(root, "a", "b", "item.bin"), Compression.NONE, false);
        expect(await item.exists()).toBe(false);
        expect(await item.read()).toBeNull();

        await item.write(Buffer.from("hello"));

        expect(await item.exists()).toBe(true);
        const read = await item.read();
        expect(read).not.toBeNull();
        expect((await read!.decompress()).toString("utf8")).toBe("hello");
    });

    it("compresses what it writes, so the file on disk is gzip", async () => {
        const file = join(root, "item.gz");
        const item = new FileItemStorage(file, Compression.GZIP, false);
        await item.write(Buffer.from("compress me"));

        const raw = await readFile(file);
        expect(raw[0]).toBe(0x1f);
        expect(raw[1]).toBe(0x8b);
        expect(gunzipSync(raw).toString("utf8")).toBe("compress me");

        const read = await item.read();
        expect((await read!.decompress()).toString("utf8")).toBe("compress me");
    });

    it("leaves no .filepart behind when writing atomically", async () => {
        const file = join(root, "atomic.bin");
        const item = new FileItemStorage(file, Compression.NONE, true);
        await item.write(Buffer.from("atomic"));

        expect((await readFile(file)).toString("utf8")).toBe("atomic");
        await expect(readFile(file + ".filepart")).rejects.toThrow();
    });

    it("overwrites an existing item", async () => {
        const item = new FileItemStorage(join(root, "item.bin"), Compression.NONE, false);
        await item.write(Buffer.from("first"));
        await item.write(Buffer.from("2nd"));
        const read = await item.read();
        expect((await read!.decompress()).toString("utf8")).toBe("2nd");
    });

    it("deletes", async () => {
        const item = new FileItemStorage(join(root, "item.bin"), Compression.NONE, false);
        await item.write(Buffer.from("x"));
        await item.delete();
        expect(await item.exists()).toBe(false);
        // deleting again is not an error (upstream: `if (Files.exists(file))`)
        await item.delete();
    });
});

describe("FileGridStorage", () => {
    it("splits the position after every digit, exactly as upstream's getItemPath", () => {
        const grid = new FileGridStorage(root, ".prbm.gz", Compression.GZIP, false);
        expect(grid.getItemPath(0, 0)).toBe(join(root, "x0", "z0.prbm.gz"));
        expect(grid.getItemPath(123, -45)).toBe(join(root, "x1", "2", "3", "z-4", "5.prbm.gz"));
    });

    it("round-trips a cell and finds it again in stream()", async () => {
        const grid = new FileGridStorage(root, ".prbm.gz", Compression.GZIP, false);
        expect(await grid.exists(3, -7)).toBe(false);

        await grid.write(3, -7, Buffer.from("tile"));
        await grid.write(0, 0, Buffer.from("origin"));

        expect(await grid.exists(3, -7)).toBe(true);
        const read = await grid.read(3, -7);
        expect((await read!.decompress()).toString("utf8")).toBe("tile");

        const cells = await grid.stream();
        expect(cells.map((cell) => `${cell.getX()},${cell.getZ()}`).sort()).toEqual([
            "0,0",
            "3,-7",
        ]);
        const found = cells.find((cell) => cell.getX() === 3)!;
        expect((await (await found.read())!.decompress()).toString("utf8")).toBe("tile");
    });

    it("ignores files whose name is not a tile-position or has the wrong suffix", async () => {
        const grid = new FileGridStorage(root, ".prbm.gz", Compression.GZIP, false);
        await grid.write(1, 1, Buffer.from("kept"));
        await mkdir(join(root, "x1"), { recursive: true });
        await writeFile(join(root, "x1", "z1.png"), "wrong suffix");
        await writeFile(join(root, "notes.txt"), "not a tile");

        const cells = await grid.stream();
        expect(cells).toHaveLength(1);
        expect(cells[0]!.getX()).toBe(1);
        expect(cells[0]!.getZ()).toBe(1);
    });

    it("streams nothing for a directory that does not exist", async () => {
        const grid = new FileGridStorage(join(root, "absent"), ".dat", Compression.NONE, false);
        expect(await grid.stream()).toEqual([]);
    });

    it("cell() delegates every operation to the grid", async () => {
        const grid = new FileGridStorage(root, ".dat", Compression.NONE, false);
        const cell = new GridStorageCell(grid, 2, 5);
        await cell.write(Buffer.from("via cell"));
        expect(await grid.exists(2, 5)).toBe(true);
        expect((await (await cell.read())!.decompress()).toString("utf8")).toBe("via cell");
        await cell.delete();
        expect(await grid.exists(2, 5)).toBe(false);
        expect(cell.isClosed()).toBe(false);
    });
});

describe("FileMapStorage", () => {
    it("puts each sub-storage where the webapp looks for it", () => {
        const map = new FileMapStorage(join(root, "overworld"), Compression.GZIP, false);
        const mapRoot = join(root, "overworld");

        expect((map.hiresTiles() as FileGridStorage).getItemPath(0, 0)).toBe(
            join(mapRoot, "tiles", "0", "x0", "z0.prbm.gz"),
        );
        expect((map.lowresTiles(1) as FileGridStorage).getItemPath(-1, 2)).toBe(
            join(mapRoot, "tiles", "1", "x-1", "z2.png"),
        );
        expect((map.tileState() as FileGridStorage).getItemPath(0, 0)).toBe(
            join(mapRoot, "rstate", "x0", "z0.tiles.dat"),
        );
        expect((map.chunkState() as FileGridStorage).getItemPath(0, 0)).toBe(
            join(mapRoot, "rstate", "x0", "z0.chunks.dat"),
        );
        expect((map.regionState() as FileGridStorage).getItemPath(0, 0)).toBe(
            join(mapRoot, "rstate", "regions", "x0", "z0.regions.dat"),
        );
        expect((map.settings() as FileItemStorage).getFile()).toBe(join(mapRoot, "settings.json"));
        expect((map.textures() as FileItemStorage).getFile()).toBe(
            join(mapRoot, "textures.json.gz"),
        );
        expect((map.markers() as FileItemStorage).getFile()).toBe(
            join(mapRoot, "live", "markers.json"),
        );
        expect((map.players() as FileItemStorage).getFile()).toBe(
            join(mapRoot, "live", "players.json"),
        );
    });

    it("returns the same lowres storage instance for the same lod", () => {
        const map = new FileMapStorage(join(root, "m"), Compression.GZIP, false);
        expect(map.lowresTiles(2)).toBe(map.lowresTiles(2));
        expect(map.lowresTiles(2)).not.toBe(map.lowresTiles(3));
    });

    it("escapes an asset name into the assets folder", () => {
        const map = new FileMapStorage(join(root, "m"), Compression.NONE, false);
        expect(map.getAssetPath("playerheads/../secret")).toBe(
            join(root, "m", "assets", "playerheads", "_.", "secret"),
        );
    });

    it("deletes the whole map and reports progress", async () => {
        const mapRoot = join(root, "m");
        const map = new FileMapStorage(mapRoot, Compression.NONE, false);
        expect(await map.exists()).toBe(false);

        await map.hiresTiles().write(0, 0, Buffer.from("a"));
        await map.hiresTiles().write(5, 5, Buffer.from("b"));
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
    });

    it("deleting an absent map is a no-op", async () => {
        const map = new FileMapStorage(join(root, "absent"), Compression.NONE, false);
        await map.delete();
    });
});

describe("FileStorage", () => {
    it("hands out one storage per map id, rooted at <root>/<id>", async () => {
        const storage = new FileStorage(root, Compression.GZIP, false);
        await storage.initialize();

        const overworld = storage.map("overworld");
        expect(storage.map("overworld")).toBe(overworld);
        expect(overworld.getRoot()).toBe(join(root, "overworld"));
        expect(storage.isClosed()).toBe(false);
        await storage.close();
    });

    it("lists the map ids it holds, and nothing when the root does not exist", async () => {
        const missing = new FileStorage(join(root, "absent"), Compression.GZIP, false);
        expect(await missing.mapIds()).toEqual([]);

        const storage = new FileStorage(root, Compression.GZIP, false);
        await storage.map("overworld").settings().write(Buffer.from("{}"));
        await storage.map("nether").settings().write(Buffer.from("{}"));
        await writeFile(join(root, "a-file-not-a-map"), "x");

        expect((await storage.mapIds()).sort()).toEqual(["nether", "overworld"]);
    });
});

describe("KeyedMapStorage", () => {
    it("addresses its sub-storages by upstream's keys and compressions", () => {
        const grids: [string, string][] = [];
        const items: [string, string][] = [];

        class RecordingStorage extends KeyedMapStorage {
            override grid(key: Key, compressionHint: Compression) {
                grids.push([key.getFormatted(), compressionHint.getId()]);
                return null as never;
            }
            override item(key: Key, compressionHint: Compression) {
                items.push([key.getFormatted(), compressionHint.getId()]);
                return null as never;
            }
            override async delete(): Promise<void> {}
            override async exists(): Promise<boolean> {
                return true;
            }
            override isClosed(): boolean {
                return false;
            }
        }

        const storage = new RecordingStorage(Compression.ZSTD);
        storage.hiresTiles();
        storage.lowresTiles(2);
        storage.tileState();
        storage.chunkState();
        storage.regionState();
        storage.settings();
        storage.textures();
        storage.markers();
        storage.players();
        storage.asset("web/../thing.png");

        expect(grids).toEqual([
            ["bluemap:hires", "zstd"],
            ["bluemap:lowres/2", "none"],
            ["bluemap:tile-state", "gzip"],
            ["bluemap:chunk-state", "gzip"],
            ["bluemap:region-state", "gzip"],
        ]);
        expect(items).toEqual([
            ["bluemap:settings", "none"],
            ["bluemap:textures", "zstd"],
            ["bluemap:markers", "none"],
            ["bluemap:players", "none"],
            ["bluemap:asset/web/_./thing.png", "none"],
        ]);
    });
});

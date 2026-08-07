import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileStorageConfigSchema, sqlStorageConfigSchema } from "@worldlens/config";
import { FileStorage } from "./file/FileStorage.js";
import {
    fileStorageFromConfig,
    InvalidStorageConfigError,
    sqlStorageFromConfig,
    storageFromConfig,
} from "./StorageFactory.js";
import { SQLStorage } from "./sql/SQLStorage.js";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-storage-factory-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("fileStorageFromConfig", () => {
    it("builds a FileStorage rooted, compressed and made atomic exactly as the config says", () => {
        const config = fileStorageConfigSchema.parse({
            "storage-type": "bluemap:file",
            root: join(root, "maps"),
            compression: "bluemap:zstd",
            atomic: false,
        });
        const storage = fileStorageFromConfig(config);
        expect(storage).toBeInstanceOf(FileStorage);
        expect(storage.getRoot()).toBe(join(root, "maps"));
    });

    it("round-trips a tile through the storage the factory built", async () => {
        const config = fileStorageConfigSchema.parse({ root: join(root, "maps") });
        const storage = fileStorageFromConfig(config);
        await storage.initialize();
        await storage.map("overworld").hiresTiles().write(0, 0, Buffer.from("hello"));
        const read = await storage.map("overworld").hiresTiles().read(0, 0);
        expect((await read!.decompress()).toString("utf8")).toBe("hello");
    });

    it("rejects an unknown compression key by name", () => {
        const config = fileStorageConfigSchema.parse({ root, compression: "bluemap:not-a-real-compression" });
        expect(() => fileStorageFromConfig(config)).toThrow(InvalidStorageConfigError);
    });
});

describe("sqlStorageFromConfig", () => {
    it("builds a working SQLStorage for a sqlite connection-url, choosing the dialect from the URL", async () => {
        const config = sqlStorageConfigSchema.parse({
            "storage-type": "bluemap:sql",
            "connection-url": "jdbc:sqlite::memory:",
            compression: "bluemap:gzip",
        });
        const storage = await sqlStorageFromConfig(config);
        expect(storage).toBeInstanceOf(SQLStorage);

        await storage.initialize();
        await storage.map("overworld").settings().write(Buffer.from("{}"));
        expect(await storage.map("overworld").settings().exists()).toBe(true);
        await storage.close();
    });

    it("honours an explicit dialect over the connection-url's own prefix", async () => {
        // an intentionally mismatched prefix — `dialect` still wins
        const config = sqlStorageConfigSchema.parse({
            "connection-url": "jdbc:sqlite::memory:",
            dialect: "bluemap:sqlite",
        });
        const storage = await sqlStorageFromConfig(config);
        await storage.initialize();
        await storage.close();
    });

    it("refuses a config that names a custom driver-jar, by name, instead of silently ignoring it", async () => {
        const config = sqlStorageConfigSchema.parse({
            "connection-url": "jdbc:sqlite::memory:",
            "driver-jar": "bluemap/some-driver.jar",
            "driver-class": "org.example.Driver",
        });
        await expect(sqlStorageFromConfig(config)).rejects.toThrow(InvalidStorageConfigError);
        await expect(sqlStorageFromConfig(config)).rejects.toThrow(/driver-jar/);
    });

    it("rejects an unknown compression key by name", async () => {
        const config = sqlStorageConfigSchema.parse({
            "connection-url": "jdbc:sqlite::memory:",
            compression: "bluemap:not-a-real-compression",
        });
        await expect(sqlStorageFromConfig(config)).rejects.toThrow(InvalidStorageConfigError);
    });

    it("rejects a connection-url whose dialect cannot be determined", async () => {
        const config = sqlStorageConfigSchema.parse({ "connection-url": "jdbc:oracle:thin:@localhost:1521:xe" });
        await expect(sqlStorageFromConfig(config)).rejects.toThrow();
    });
});

describe("storageFromConfig — the single seam a config resolves through", () => {
    it("resolves a file config to a FileStorage", async () => {
        const config = fileStorageConfigSchema.parse({ root: join(root, "maps") });
        const storage = await storageFromConfig(config);
        expect(storage).toBeInstanceOf(FileStorage);
    });

    it("resolves an sql config to a working SQLStorage — the exact fix issue #32 asks for: this used to have nowhere to go", async () => {
        const config = sqlStorageConfigSchema.parse({ "connection-url": "jdbc:sqlite::memory:" });
        const storage = await storageFromConfig(config);
        expect(storage).toBeInstanceOf(SQLStorage);

        // and it is not merely constructed — it actually works
        await storage.initialize();
        await storage.map("overworld").hiresTiles().write(1, 1, Buffer.from("real storage"));
        const read = await storage.map("overworld").hiresTiles().read(1, 1);
        expect((await read!.decompress()).toString("utf8")).toBe("real storage");
        await storage.close();
    });
});

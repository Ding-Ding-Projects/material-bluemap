import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapConfig, DEFAULT_CONFIG_FOLDER } from "../src/config.js";
import { createLogger } from "../src/logger.js";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-cli-config-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("config: bootstrapConfig against a fresh (empty) folder", () => {
    it("writes upstream's own defaults for every file, and DEFAULT_CONFIG_FOLDER matches BlueMapCLI's field default", async () => {
        expect(DEFAULT_CONFIG_FOLDER).toBe("config");
        const configFolder = join(root, "config");
        const logger = createLogger();

        const loaded = await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        expect(existsSync(join(configFolder, "core.conf"))).toBe(true);
        expect(existsSync(join(configFolder, "webapp.conf"))).toBe(true);
        expect(existsSync(join(configFolder, "webserver.conf"))).toBe(true);
        expect(existsSync(join(configFolder, "storages", "file.conf"))).toBe(true);
        expect(existsSync(join(configFolder, "storages", "sql.conf"))).toBe(true);
        // plugin.conf is never written: BlueMapCLI.main() builds usePluginConfig(false)
        expect(existsSync(join(configFolder, "plugin.conf"))).toBe(false);

        // upstream's own real defaults, transcribed in BlueMapConfigManager (data folder
        // "data"/webroot "web", since BlueMapCLI.main() overrides the class defaults)
        expect(loaded.core["accept-download"]).toBe(false);
        expect(loaded.core.data).toBe("data");
        expect(loaded.webapp.webroot).toBe("web");
        expect(loaded.webserver.port).toBe(8100);

        // the three default maps, with the default world folder "world" upstream's own
        // autoConfigWorlds-less CLI path writes. File stems (and so the map ids) are
        // lowercase — "overworld.conf" etc — the same as BlueMapConfigManager's own
        // MAPS_CONFIG_FOLDER_NAME + "/overworld"; only the map's *display name* field
        // inside each file is capitalised ("Overworld").
        expect([...loaded.maps.keys()].sort()).toEqual(["end", "nether", "overworld"]);
        for (const map of loaded.maps.values()) expect(map.world).toBe("world");
        expect(loaded.maps.get("overworld")?.name).toBe("Overworld");

        // both default storages, correctly typed — this is the direct regression test for
        // the bug the manual smoke test caught: the generated sql.conf's storage-type is
        // the SHORT form "sql", not "bluemap:sql", and comparing it as a raw string instead
        // of a parsed Key silently treated it as a second file storage, reading it through
        // fileStorageDescriptor twice and never reaching the real SQL descriptor at all.
        expect(loaded.storages.get("file")?.kind).toBe("file");
        expect(loaded.storages.get("sql")?.kind).toBe("sql");

        expect(loaded.packsFolder).toBe(join(configFolder, "packs"));
        expect(existsSync(loaded.packsFolder)).toBe(true);
    });

    it("is idempotent: bootstrapping the same folder twice does not rewrite untouched files", async () => {
        const configFolder = join(root, "config");
        const logger = createLogger();
        await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        const before = await readFile(join(configFolder, "core.conf"), "utf-8");
        // hand-edit something a re-bootstrap must not clobber
        await writeFile(join(configFolder, "core.conf"), before.replace("accept-download: false", "accept-download: true"));

        const loaded = await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });
        expect(loaded.core["accept-download"]).toBe(true);
    });

    it("writes the three default maps only when maps/ does not exist yet, never per-file", async () => {
        const configFolder = join(root, "config");
        const logger = createLogger();
        await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        // delete one of the three generated maps by hand, the way a user tidying up would
        await rm(join(configFolder, "maps", "nether.conf"));
        const loaded = await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        // upstream only regenerates the defaults when the whole maps/ folder is missing,
        // never to backfill one deleted file — so this stays at two, not three
        expect([...loaded.maps.keys()].sort()).toEqual(["end", "overworld"]);
    });
});

describe("config: honest failures", () => {
    it("throws naming the exact file when a config file is not valid HOCON", async () => {
        const configFolder = join(root, "config");
        const logger = createLogger();
        await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        await writeFile(join(configFolder, "core.conf"), "this is { not valid hocon");

        await expect(bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger })).rejects.toThrow(/core\.conf/);
    });

    it("throws naming the exact file when a map config uses a legacy key", async () => {
        const configFolder = join(root, "config");
        const logger = createLogger();
        await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        // "min-x" et al. used to be top-level map-config keys and now live nested under
        // render-mask; mapConfigDescriptor's own legacyKeys list refuses them outright,
        // exactly the "honest config load failure" issue #42 asks for.
        const mapsFolder = join(configFolder, "maps");
        const broken = (await readFile(join(mapsFolder, "overworld.conf"), "utf-8")) + "\nmin-x: 0\n";
        await writeFile(join(mapsFolder, "overworld.conf"), broken);

        await expect(bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger })).rejects.toThrow(/overworld\.conf/);
    });

    it("throws naming two ambiguous map-config file names, exactly as BlueMapConfigManager does", async () => {
        const configFolder = join(root, "config");
        const logger = createLogger();
        await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        // "test@map.conf" and "test!map.conf" both sanitise (upstream: \W -> _, one
        // character at a time) to the same id, "test_map" — independent of the three
        // defaults already on disk, so this is a genuine, self-contained collision.
        const mapBody = 'world: "world"\ndimension: "minecraft:overworld"\n';
        await writeFile(join(configFolder, "maps", "test@map.conf"), mapBody);
        await writeFile(join(configFolder, "maps", "test!map.conf"), mapBody);

        await expect(bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger })).rejects.toThrow(/ambiguous/);
    });
});

describe("config: reading an already-populated folder", () => {
    it("reads a hand-written config folder without writing anything new", async () => {
        const configFolder = join(root, "config");
        await mkdir(join(configFolder, "storages"), { recursive: true });
        await mkdir(join(configFolder, "maps"), { recursive: true });
        await writeFile(join(configFolder, "core.conf"), 'accept-download: true\ndata: "custom-data"\n');
        await writeFile(join(configFolder, "webapp.conf"), 'webroot: "custom-web"\n');
        await writeFile(join(configFolder, "webserver.conf"), "port: 9999\n");
        await writeFile(join(configFolder, "storages", "file.conf"), 'storage-type: "bluemap:file"\nroot: "custom-web/maps"\n');
        await writeFile(join(configFolder, "maps", "myworld.conf"), 'world: "myworld"\ndimension: "minecraft:overworld"\nstorage: "file"\n');

        const logger = createLogger();
        const loaded = await bootstrapConfig({ configFolder, appVersion: "0.0.0-test", logger });

        expect(loaded.core["accept-download"]).toBe(true);
        expect(loaded.core.data).toBe("custom-data");
        expect(loaded.webapp.webroot).toBe("custom-web");
        expect(loaded.webserver.port).toBe(9999);
        expect([...loaded.maps.keys()]).toEqual(["myworld"]);
        expect(loaded.storages.size).toBe(1);
        // the SQL default is never invented for a folder that only ever had a file.conf
        expect(loaded.storages.get("sql")).toBeUndefined();
    });
});

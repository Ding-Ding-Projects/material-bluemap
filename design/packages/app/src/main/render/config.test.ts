import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    InvalidRenderRequestError,
    defaultRenderThreads,
    hoconString,
    isValidMapId,
    validateMaps,
    writeRenderConfig,
} from "./config.js";
import type { RenderMapRequest } from "./config.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-config-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function options(
    maps: RenderMapRequest[] = [{ id: "overworld", world: "C:\\worlds\\My World" }],
) {
    return {
        configDir: join(root, "config"),
        dataDir: join(root, "data"),
        webRoot: join(root, "web"),
        maps,
        acceptDownload: true,
    };
}

describe("hoconString", () => {
    /**
     * HOCON quoted strings are JSON strings, so a Windows path has to be escaped or the
     * parser sees `\U` and gives up. This was checked against the real parser, not
     * assumed: a config written this way rendered 144 hires tiles and put its data
     * directory exactly where the escaped path said.
     */
    it("escapes a Windows path so the HOCON parser reads it back unchanged", () => {
        expect(hoconString("C:\\Users\\me\\saves\\world")).toBe(
            '"C:\\\\Users\\\\me\\\\saves\\\\world"',
        );
        expect(JSON.parse(hoconString("C:\\Users\\me"))).toBe("C:\\Users\\me");
    });

    it("escapes quotes, which a folder name may legally contain on POSIX", () => {
        expect(JSON.parse(hoconString('my "world"'))).toBe('my "world"');
    });
});

describe("isValidMapId", () => {
    it("accepts the ids upstream's own configs use", () => {
        for (const id of ["overworld", "nether", "the-end", "my_world_2"]) {
            expect(isValidMapId(id)).toBe(true);
        }
    });

    it("rejects anything that could address a directory it should not", () => {
        // A map id becomes a folder name under the storage root and a segment of the
        // URL the viewer requests, so these are the two places it must not escape.
        for (const id of ["..", "../escape", "a/b", "a\\b", "", "Overworld", " lead", "a b"]) {
            expect(isValidMapId(id)).toBe(false);
        }
    });
});

describe("validateMaps", () => {
    it("needs at least one map", () => {
        expect(() => validateMaps([])).toThrow(InvalidRenderRequestError);
    });

    it("refuses two maps with the same id", () => {
        expect(() =>
            validateMaps([
                { id: "overworld", world: "/a" },
                { id: "overworld", world: "/b" },
            ]),
        ).toThrow(/share the id/);
    });

    it("refuses a map with no world", () => {
        expect(() => validateMaps([{ id: "overworld", world: "   " }])).toThrow(/no world folder/);
    });
});

describe("writeRenderConfig", () => {
    it("writes the whole set the CLI reads, with every path absolute", async () => {
        const written = await writeRenderConfig(options());

        expect(written.files).toEqual([
            join(root, "config", "core.conf"),
            join(root, "config", "webapp.conf"),
            join(root, "config", "webserver.conf"),
            join(root, "config", "storages", "file.conf"),
            join(root, "config", "maps", "overworld.conf"),
        ]);
        expect(written.storageRoot).toBe(join(root, "web", "maps"));
        expect(written.mapIds).toEqual(["overworld"]);

        const core = await readFile(join(root, "config", "core.conf"), "utf8");
        expect(core).toContain("accept-download: true");
        expect(core).toContain(`data: ${hoconString(join(root, "data"))}`);
        expect(core).toContain(`file: ${hoconString(join(root, "data", "logs", "cli.log"))}`);

        const storage = await readFile(join(root, "config", "storages", "file.conf"), "utf8");
        expect(storage).toContain("storage-type: file");
        expect(storage).toContain(`root: ${hoconString(join(root, "web", "maps"))}`);
        // The layout on disk depends on this: hires tiles land as `<tile>.prbm.gz`,
        // which is exactly what the viewer asks for when it decompresses client-side.
        expect(storage).toContain("compression: gzip");

        // The directories the engine writes into exist before it is launched, so a
        // first render does not fail on a missing parent.
        expect(existsSync(join(root, "web", "maps"))).toBe(true);
        expect(existsSync(join(root, "data"))).toBe(true);
    });

    it("turns the CLI's own web server off", async () => {
        await writeRenderConfig(options());
        const webserver = await readFile(join(root, "config", "webserver.conf"), "utf8");
        // The app serves rendered maps through its own embedded server, behind the auth
        // token the renderer already carries. A second listener on 8100 would put an
        // unauthenticated copy of somebody's map on the network for the whole render.
        expect(webserver).toContain("enabled: false");
    });

    it("leaves metrics off unless a caller asks for them", async () => {
        const off = await writeRenderConfig(options());
        expect(await readFile(join(off.configDir, "core.conf"), "utf8")).toContain("metrics: false");

        await rm(join(root, "config"), { recursive: true, force: true });
        const on = await writeRenderConfig({ ...options(), metrics: true });
        expect(await readFile(join(on.configDir, "core.conf"), "utf8")).toContain("metrics: true");
    });

    it("writes one config per map and keeps the declaration order", async () => {
        await writeRenderConfig(
            options([
                { id: "overworld", world: "/worlds/w" },
                { id: "nether", world: "/worlds/w" },
            ]),
        );

        const overworld = await readFile(join(root, "config", "maps", "overworld.conf"), "utf8");
        const nether = await readFile(join(root, "config", "maps", "nether.conf"), "utf8");
        expect(overworld).toContain("sorting: 0");
        expect(nether).toContain("sorting: 1");
        expect(overworld).toContain('dimension: "minecraft:overworld"');
    });

    it("writes the optional map settings only when they were given", async () => {
        await writeRenderConfig(
            options([
                {
                    id: "nether",
                    world: "/worlds/w",
                    name: "The Nether",
                    dimension: "minecraft:the_nether",
                    startPos: { x: 121, z: -40 },
                },
            ]),
        );
        const conf = await readFile(join(root, "config", "maps", "nether.conf"), "utf8");
        expect(conf).toContain('name: "The Nether"');
        expect(conf).toContain('dimension: "minecraft:the_nether"');
        expect(conf).toContain("start-pos: { x: 121, z: -40 }");

        await rm(join(root, "config"), { recursive: true, force: true });
        await writeRenderConfig(options());
        const plain = await readFile(join(root, "config", "maps", "overworld.conf"), "utf8");
        expect(plain).not.toContain("start-pos");
        expect(plain).toContain('name: "overworld"');
    });

    it("refuses a bad request before writing anything", async () => {
        await expect(writeRenderConfig(options([{ id: "../out", world: "/w" }]))).rejects.toThrow(
            InvalidRenderRequestError,
        );
        expect(existsSync(join(root, "config"))).toBe(false);
    });
});

describe("defaultRenderThreads", () => {
    it("matches upstream: every core but two, never fewer than one", () => {
        expect(defaultRenderThreads(8)).toBe(6);
        expect(defaultRenderThreads(2)).toBe(1);
        expect(defaultRenderThreads(1)).toBe(1);
    });
});

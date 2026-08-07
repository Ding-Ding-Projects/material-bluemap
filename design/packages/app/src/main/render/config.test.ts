import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseHocon } from "@material-bluemap/shared";
import {
    InvalidRenderRequestError,
    MAX_MAP_CONFIG_LENGTH,
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
        expect(core).toContain("render-thread-priority: 5");

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

    it("writes a chosen render thread count and priority into the next JVM's core.conf", async () => {
        const written = await writeRenderConfig({
            ...options(),
            renderThreads: 4,
            renderThreadPriority: 10,
        });
        const core = await readFile(join(written.configDir, "core.conf"), "utf8");
        expect(core).toContain("render-thread-count: 4");
        expect(core).toContain("render-thread-priority: 10");
    });

    it("refuses an out-of-range thread priority before writing a config directory", async () => {
        await expect(
            writeRenderConfig({ ...options(), renderThreadPriority: 11 }),
        ).rejects.toThrow(/priority must be a whole number from 1 through 10/);
        expect(existsSync(join(root, "config"))).toBe(false);
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

/* -------------------------------------------------------------------------- */
/* A supplied map config body                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A body of the shape the wizard produces: the settings a person actually tuned,
 * plus the three keys the app owns, set deliberately *wrong* so that the override
 * is the thing being tested rather than an agreement between two copies of the
 * same value.
 */
const SUPPLIED = [
    "# The wizard wrote this. Every key below is one somebody chose.",
    'name: "Survival"',
    "sorting: 7",
    "ambient-light: 0.12",
    'sky-color: "#7dabff"',
    "render-edges: true",
    "min-inhabited-time: 0",
    "marker-sets {",
    '    spawn { label: "Spawn" }',
    "}",
    'world: "/somewhere/the/app/never/pointed/at"',
    'dimension: "minecraft:the_end"',
    'storage: "somebody-elses-storage"',
    "",
].join("\n");

async function readMapConf(id = "overworld"): Promise<string> {
    return await readFile(join(root, "config", "maps", `${id}.conf`), "utf8");
}

describe("a map config the caller supplied", () => {
    it("keeps every setting the body carried", async () => {
        await writeRenderConfig(
            options([{ id: "overworld", world: "/worlds/w", config: SUPPLIED }]),
        );

        const text = await readMapConf();
        // Read back through the same parser the viewer uses, because what matters is
        // what the file *means* to a HOCON reader, not which characters are in it.
        const parsed = parseHocon(text);
        expect(parsed["name"]).toBe("Survival");
        expect(parsed["sorting"]).toBe(7);
        expect(parsed["ambient-light"]).toBe(0.12);
        expect(parsed["sky-color"]).toBe("#7dabff");
        expect(parsed["render-edges"]).toBe(true);
        expect(parsed["min-inhabited-time"]).toBe(0);
        expect(parsed["marker-sets"]).toEqual({ spawn: { label: "Spawn" } });

        // Passed through as written, comments included, rather than round-tripped
        // through a parser that would drop them.
        expect(text).toContain("# The wizard wrote this.");
    });

    it("overrides the three keys the app owns, whatever the body said", async () => {
        await writeRenderConfig(
            options([
                {
                    id: "overworld",
                    world: "/worlds/w",
                    dimension: "minecraft:the_nether",
                    config: SUPPLIED,
                },
            ]),
        );

        const parsed = parseHocon(await readMapConf());
        // Not the body's `/somewhere/the/app/never/pointed/at`.
        expect(parsed["world"]).toBe("/worlds/w");
        // Not the body's `minecraft:the_end`: the dimension the request asked for.
        expect(parsed["dimension"]).toBe("minecraft:the_nether");
        // Not the body's storage. A render whose tiles land somewhere the app does
        // not serve is a render nobody can look at.
        expect(parsed["storage"]).toBe("file");
    });

    it("beats an object value and a dotted path, which is what makes the append safe", async () => {
        // HOCON's duplicate-key rule is later-wins except when *both* values are
        // objects. Every override written here is a quoted string, so neither of
        // these earlier forms survives it - the two cases that would break the
        // whole approach if they did.
        await writeRenderConfig(
            options([
                {
                    id: "overworld",
                    world: "/worlds/w",
                    config: [
                        "storage { storage-type: sql, dsn: \"jdbc:...\" }",
                        "world.some.nested.key: 1",
                        'dimension: "minecraft:the_end"',
                        "",
                    ].join("\n"),
                },
            ]),
        );

        const parsed = parseHocon(await readMapConf());
        expect(parsed["storage"]).toBe("file");
        expect(parsed["world"]).toBe("/worlds/w");
        expect(parsed["dimension"]).toBe("minecraft:overworld");
    });

    it("refuses a body that cannot be parsed, before writing anything", async () => {
        await expect(
            writeRenderConfig(
                options([{ id: "overworld", world: "/worlds/w", config: 'name: "unterminated\n' }]),
            ),
        ).rejects.toThrow(InvalidRenderRequestError);
        // Not one file, and not even the directory: a Java stack trace from the CLI
        // is not an error message anybody can act on, so this never reaches it.
        expect(existsSync(join(root, "config"))).toBe(false);
    });

    it("names the map, and points at the body's own line", async () => {
        // The overrides go after the body, so a problem inside it keeps the line
        // number the caller wrote it on rather than being shifted by however many
        // lines this module added.
        await expect(
            writeRenderConfig(
                options([
                    { id: "nether", world: "/worlds/w", config: 'a: 1\nb: "unterminated\nc: 3\n' },
                ]),
            ),
        ).rejects.toThrow(/map config for 'nether'.*line 2/s);
    });

    it("refuses an include, which would read another file off this machine", async () => {
        // Upstream's JVM parser supports `include`; this one does not, and that is
        // what stops a body from the renderer pulling an arbitrary file into the
        // settings a render is run from.
        for (const directive of [
            'include "other.conf"',
            'include file("/etc/passwd")',
            'include required(file("/etc/passwd"))',
            'include classpath("x.conf")',
            'include url("http://example.invalid/x.conf")',
        ]) {
            await expect(
                writeRenderConfig(
                    options([{ id: "overworld", world: "/worlds/w", config: `a: 1\n${directive}\n` }]),
                ),
            ).rejects.toThrow(/may not use 'include'/);
            expect(existsSync(join(root, "config"))).toBe(false);
        }
    });

    it("refuses a substitution, for the same reason the parser everywhere else does", async () => {
        await expect(
            writeRenderConfig(
                options([{ id: "overworld", world: "/worlds/w", config: "a: ${b}\n" }]),
            ),
        ).rejects.toThrow(/substitutions/);
    });

    it("refuses a braced document, which nothing can be appended to", async () => {
        await expect(
            writeRenderConfig(
                options([{ id: "overworld", world: "/worlds/w", config: '{ name: "x" }\n' }]),
            ),
        ).rejects.toThrow(/wraps its keys in braces/);
    });

    it("refuses an empty body rather than rendering a map that says nothing", async () => {
        await expect(
            writeRenderConfig(options([{ id: "overworld", world: "/worlds/w", config: "  \n\n" }])),
        ).rejects.toThrow(/is empty/);
    });

    it("refuses a body past the size limit before parsing it", async () => {
        const huge = `# ${"x".repeat(MAX_MAP_CONFIG_LENGTH)}`;
        await expect(
            writeRenderConfig(options([{ id: "overworld", world: "/worlds/w", config: huge }])),
        ).rejects.toThrow(/past the limit/);
    });

    it("refuses a body that is not text at all, which is what IPC can deliver", async () => {
        await expect(
            writeRenderConfig(
                options([
                    // The type says string; the wire says whatever the sender put on it.
                    { id: "overworld", world: "/worlds/w", config: 42 as unknown as string },
                ]),
            ),
        ).rejects.toThrow(/is not text/);
    });

    it("writes exactly what it always wrote when no body was supplied", async () => {
        await writeRenderConfig(options());
        // Byte for byte, so the six-key path cannot drift while the new one is added
        // beside it.
        expect(await readMapConf()).toBe(
            [
                "# Written by Material BlueMap for a single render. Edits here are overwritten.",
                'world: "C:\\\\worlds\\\\My World"',
                'dimension: "minecraft:overworld"',
                'name: "overworld"',
                "sorting: 0",
                'storage: "file"',
                "",
            ].join("\n"),
        );
    });

    it("checks the body during validation, so a render reports it as a bad request", () => {
        // `writeRenderConfig` calls this first, and so does the orchestrator - which
        // is what turns "that config will not parse" into an invalid-request failure
        // rather than into an unwritable-workspace one.
        expect(() =>
            validateMaps([{ id: "overworld", world: "/w", config: "a: [1, 2\n" }]),
        ).toThrow(InvalidRenderRequestError);
        expect(() =>
            validateMaps([{ id: "overworld", world: "/w", config: SUPPLIED }]),
        ).not.toThrow();
    });
});

describe("defaultRenderThreads", () => {
    it("matches upstream: every core but two, never fewer than one", () => {
        expect(defaultRenderThreads(8)).toBe(6);
        expect(defaultRenderThreads(2)).toBe(1);
        expect(defaultRenderThreads(1)).toBe(1);
    });
});

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    NOJEKYLL_FILE,
    PAGES_MAX_FILE_BYTES,
    prepareStaticHost,
    StaticHostError,
} from "./staticHost.js";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-static-host-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** A rendered map exactly as the engine leaves it: gzip on disk, viewer flag unset. */
async function renderedMap(options: { readonly ids?: readonly string[]; readonly settings?: object } = {}) {
    const ids = options.ids ?? ["overworld"];
    await writeFile(join(root, "index.html"), "<!doctype html>");
    await writeFile(
        join(root, "settings.json"),
        JSON.stringify({ version: "5.22", mapDataRoot: "maps", maps: ids, ...options.settings }),
    );
    for (const id of ids) {
        const mapRoot = join(root, "maps", id);
        await mkdir(join(mapRoot, "tiles", "0", "x0"), { recursive: true });
        await writeFile(join(mapRoot, "settings.json"), "{}");
        await writeFile(join(mapRoot, "textures.json.gz"), "gzip-bytes");
        await writeFile(join(mapRoot, "tiles", "0", "x0", "z0.prbm.gz"), "gzip-bytes");
    }
}

async function settingsOf(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(root, "settings.json"), "utf8")) as Record<string, unknown>;
}

describe("preparing a rendered map for a host that only serves files", () => {
    it("turns on client decompression, which is the whole reason this exists", async () => {
        // The engine writes 0.prbm.gz; the viewer asks for 0.prbm unless this is set. On a
        // static host nothing rewrites the one into the other, so without this every single
        // tile comes back 404 and the map loads to an empty sky.
        await renderedMap();

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.changedSettings).toBe(true);
        expect((await settingsOf()).clientDecompression).toBe(true);
        expect(report.servable).toBe(true);
    });

    it("leaves a map that was already set that way alone, and says so", async () => {
        await renderedMap({ settings: { clientDecompression: true } });

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.changedSettings).toBe(false);
        expect(report.notes.join(" ")).toContain("already");
    });

    it("writes .nojekyll, because Jekyll silently eats underscore names", async () => {
        await renderedMap();

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.addedNoJekyll).toBe(true);
        await expect(stat(join(root, NOJEKYLL_FILE))).resolves.toBeDefined();
    });

    it("changes nothing at all when only asked what it would do", async () => {
        await renderedMap();

        const report = await prepareStaticHost({ webRoot: root, write: false });

        expect(report.changedSettings).toBe(false);
        expect((await settingsOf()).clientDecompression).toBeUndefined();
        await expect(stat(join(root, NOJEKYLL_FILE))).rejects.toThrow();
        // It still has to say what it found, or a preview is worthless.
        expect(report.notes.join(" ")).toContain("would be set");
    });
});

describe("checking the flag against the files that are actually there", () => {
    it("refuses a map whose textures were never gzipped", async () => {
        // A map rendered with compression off has textures.json, not textures.json.gz.
        // Flipping the flag on that map points the viewer at a file nobody wrote - just as
        // broken as the problem the flag fixes, and far harder to diagnose.
        await renderedMap();
        await rm(join(root, "maps", "overworld", "textures.json.gz"));
        await writeFile(join(root, "maps", "overworld", "textures.json"), "{}");

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.servable).toBe(false);
        expect(report.maps[0]?.missing).toContain("maps/overworld/textures.json.gz");
        expect(report.notes.join(" ")).toContain("loads and then shows nothing");
    });

    it("names every map that is short of files, not just the first", async () => {
        await renderedMap({ ids: ["overworld", "nether", "end"] });
        await rm(join(root, "maps", "nether", "tiles"), { recursive: true });
        await rm(join(root, "maps", "end", "settings.json"));

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.servable).toBe(false);
        expect(report.maps.find((map) => map.id === "nether")?.missing).toContain("maps/nether/tiles/");
        expect(report.maps.find((map) => map.id === "end")?.missing).toContain("maps/end/settings.json");
        expect(report.maps.find((map) => map.id === "overworld")?.missing).toEqual([]);
    });

    it("does not call a site with no maps servable", async () => {
        await renderedMap({ ids: [] });

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.servable).toBe(false);
        expect(report.notes.join(" ")).toContain("nothing here for a visitor");
    });

    it("reads a map list written as objects as well as one written as ids", async () => {
        await renderedMap();
        await writeFile(
            join(root, "settings.json"),
            JSON.stringify({ maps: [{ id: "overworld", name: "Overworld" }] }),
        );

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.maps.map((map) => map.id)).toEqual(["overworld"]);
        expect(report.servable).toBe(true);
    });

    it("counts a map entry it cannot name rather than quietly checking nothing", async () => {
        await renderedMap();
        await writeFile(join(root, "settings.json"), JSON.stringify({ maps: ["overworld", 42] }));

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.notes.join(" ")).toContain("could not be named");
    });

    it("says when the map reads its tiles from somewhere else entirely", async () => {
        // Publishing these files would produce a site that loads and shows another
        // server's map, or nothing at all if that server is gone.
        await renderedMap({ settings: { mapDataRoot: "https://map.example.invalid/maps" } });

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.notes.join(" ")).toContain("will not publish the map");
    });
});

describe("what GitHub will and will not take", () => {
    it("measures the whole site rather than guessing from the map count", async () => {
        await renderedMap();

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.fileCount).toBeGreaterThan(4);
        expect(report.totalBytes).toBeGreaterThan(0);
        expect(report.overSoftLimit).toBe(false);
    });

    it("refuses a file over the hard per-file limit, which cannot be pushed at all", async () => {
        await renderedMap();
        // Sparse: the size is what matters and nobody wants 100 MB of zeroes on disk.
        const handle = await import("node:fs/promises").then(async (fs) => fs.open(join(root, "huge.bin"), "w"));
        await handle.truncate(PAGES_MAX_FILE_BYTES + 1);
        await handle.close();

        const report = await prepareStaticHost({ webRoot: root });

        expect(report.servable).toBe(false);
        expect(report.oversizedFiles[0]?.path).toBe("huge.bin");
        expect(report.notes.join(" ")).toContain("cannot be pushed at all");
    });
});

describe("refusing to work on something that is not a rendered map", () => {
    it("says what is missing rather than throwing a parser error", async () => {
        await expect(prepareStaticHost({ webRoot: root })).rejects.toBeInstanceOf(StaticHostError);
        await expect(prepareStaticHost({ webRoot: root })).rejects.toThrow("does not look like a rendered map");
    });

    it("names the file when settings.json is not JSON", async () => {
        await writeFile(join(root, "settings.json"), "{ not json");

        await expect(prepareStaticHost({ webRoot: root })).rejects.toThrow("could not be read");
    });
});

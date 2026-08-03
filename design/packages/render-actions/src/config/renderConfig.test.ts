import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planShards } from "../plan/plan.js";
import type { RegionMeasurement, WorldMeasurement } from "../world/measure.js";
import { quoteConfigString, renderMaskEntry, writeShardConfig } from "./renderConfig.js";

function world(size: number): WorldMeasurement {
    const regions: RegionMeasurement[] = [];
    for (let z = 0; z < size; z++)
        for (let x = 0; x < size; x++)
            regions.push({ fileName: "r." + x + "." + z + ".mca", x, z, chunkCount: 1024, bytes: 4_200_000 });

    return {
        regionDirectory: "/world/region",
        dimension: "minecraft:overworld",
        regions,
        regionBounds: { x: { min: 0, max: size - 1 }, z: { min: 0, max: size - 1 } },
        blockBounds: { x: { min: 0, max: size * 512 - 1 }, z: { min: 0, max: size * 512 - 1 } },
        chunkCount: regions.length * 1024,
        bytes: regions.length * 4_200_000,
        bytesPerChunk: 4104,
        regionGridFillRatio: 1,
    };
}

const layout = { lowresTileSize: 500, lodFactor: 5, lodCount: 3 };

describe("config string quoting", () => {
    it("escapes the backslashes in a windows path so hocon reads it back whole", () => {
        expect(quoteConfigString("C:\\a\\b")).toBe('"C:\\\\a\\\\b"');
        expect(quoteConfigString('say "hi"')).toBe('"say \\"hi\\""');
        expect(quoteConfigString("/home/runner/world")).toBe('"/home/runner/world"');
    });
});

describe("the render mask", () => {
    it("omits the sides a shard is unbounded on", () => {
        const entry = renderMaskEntry({
            x: { min: 514, max: null },
            z: { min: null, max: null },
        });
        expect(entry).toContain("min-x: 514");
        expect(entry).not.toContain("max-x");
        expect(entry).not.toContain("min-z");
    });

    it("produces no mask at all when the shard is unbounded on every side", () => {
        expect(
            renderMaskEntry({ x: { min: null, max: null }, z: { min: null, max: null } }),
        ).toBeNull();
    });
});

describe("writing a shard's config directory", () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "render-actions-config-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    async function writeFor(shardIndex: number | null, acceptDownload = true): Promise<string> {
        const plan = planShards(world(4), { mapId: "world", budgetSeconds: 120, ...layout });
        const written = await writeShardConfig({
            plan,
            shard: shardIndex === null ? null : plan.shards[shardIndex]!,
            worldDirectory: join(root, "world"),
            configDirectory: join(root, "config"),
            dataDirectory: join(root, "data"),
            storageRoot: join(root, "out", "maps"),
            webRoot: join(root, "out"),
            mapName: "Overworld",
            acceptDownload,
            renderThreadCount: 4,
        });
        expect(written.mapDirectory).toBe(join(root, "out", "maps", "world"));
        return await readFile(join(root, "config", "maps", "world.conf"), "utf8");
    }

    it("turns edges off, which is what makes a shard's tiles match an unsharded render", async () => {
        expect(await writeFor(1)).toContain("render-edges: false");
    });

    it("writes an aligned render-mask for a shard", async () => {
        const map = await writeFor(1);
        expect(map).toContain("render-mask: [");

        // every bound in the file has to sit on a hires tile edge, or the merge breaks
        const bounds = [...map.matchAll(/\b(?:min|max)-[xz]: (-?\d+)/g)].map((match) =>
            Number(match[1]),
        );
        expect(bounds.length).toBeGreaterThan(0);
        for (const bound of bounds) {
            const edge = map.includes("min-x: " + bound) || map.includes("min-z: " + bound)
                ? bound
                : bound + 1;
            expect((((edge - 2) % 32) + 32) % 32).toBe(0);
        }
    });

    it("writes no render-mask when a single job renders the whole world", async () => {
        const map = await writeFor(null);
        expect(map).not.toContain("render-mask: [");
        expect(map).toContain("No render-mask");
    });

    it("uses absolute paths, because the CLI resolves them against the working directory", async () => {
        const core = await readFileAfter(root, 1, "core.conf");
        expect(core).toContain(quoteConfigString(join(root, "data")));
        const storage = await readFileAfter(root, 1, join("storages", "file.conf"));
        expect(storage).toContain(quoteConfigString(join(root, "out", "maps")));
    });

    it("accepts the client download by default and explains why in the file", async () => {
        await writeFor(1);
        const core = await readFile(join(root, "config", "core.conf"), "utf8");
        expect(core).toContain("accept-download: true");
        expect(core).toContain("https://www.minecraft.net/eula");
        expect(core).toContain("BLUEMAP_ACCEPT_DOWNLOAD");
    });

    it("turns the download off when a fork has asked it to", async () => {
        await writeFor(1, false);
        expect(await readFile(join(root, "config", "core.conf"), "utf8")).toContain(
            "accept-download: false",
        );
    });

    async function readFileAfter(base: string, shardIndex: number, name: string): Promise<string> {
        await writeFor(shardIndex);
        return await readFile(join(base, "config", name), "utf8");
    }
});

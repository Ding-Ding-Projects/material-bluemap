import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sanitizeMapId } from "./bluemap.js";
import type { Args } from "./cli.js";
import { resolvePartialDirectories, resolveShardDirectories } from "./cli.js";
import { mergeShardMaps } from "./merge/mergeMap.js";
import { gridCellPath } from "./merge/gridPath.js";

/**
 * These two functions are the actual "wrapper" logic behind the `merge`, `verify` and
 * `merge-lowres` commands: given a raw `--map-id` and a parent directory holding one
 * subdirectory per shard or partial, find each one's map directory. Issue #47 was exactly
 * this lookup using the raw, hyphenated id while BlueMap wrote its output under the
 * sanitized, underscored one - a fully successful render then looked, to the merge, like
 * every shard produced an empty map directory.
 */

function emptyArgs(): Args {
    return { flags: new Map(), repeated: new Map(), booleans: new Set() };
}

const SETTINGS = JSON.stringify({
    name: "Staging",
    hires: { tileSize: [32, 32], scale: [1, 1], translate: [2, 2] },
    lowres: { tileSize: [500, 500], lodFactor: 5, lodCount: 3 },
});
const TEXTURES = gzipSync('[{"resourcePath":"bluemap:missing"}]');

async function write(path: string, contents: Buffer | string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
}

/** A minimal, believable shard map directory: enough for `mergeShardMaps` to accept it. */
async function buildShardOutput(mapDirectory: string, hiresCells: { x: number; z: number }[]): Promise<void> {
    await write(join(mapDirectory, "settings.json"), SETTINGS);
    await write(join(mapDirectory, "textures.json.gz"), TEXTURES);
    for (const cell of hiresCells)
        await write(
            join(mapDirectory, "tiles", "0", gridCellPath(cell, ".prbm.gz")),
            gzipSync(Buffer.from("not a real tile, but a real file")),
        );
}

describe("resolving shard and partial directories for a hyphenated map id", () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "render-actions-cli-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("still honors an explicit --shard-dir literally, without touching it", async () => {
        const literal = join(root, "wherever-i-said", "test-issue44-staging");
        const args = emptyArgs();
        args.repeated.set("shard-dir", [literal]);

        const resolved = await resolveShardDirectories(args, "test-issue44-staging");
        expect(resolved).toEqual([join(literal)]);
    });

    it("finds a hyphenated map id's real, underscored shard directories (issue #47)", async () => {
        const rawMapId = "test-issue44-staging";
        const sanitized = sanitizeMapId(rawMapId);
        expect(sanitized).toBe("test_issue44_staging");

        // Exactly what a downloaded shard artifact looks like: BlueMap wrote its tiles
        // under the sanitized id, never the literal hyphenated one.
        await buildShardOutput(join(root, "shards", "shard-0", sanitized), [{ x: 0, z: 0 }]);
        await buildShardOutput(join(root, "shards", "shard-1", sanitized), [{ x: 1, z: 0 }]);

        const args = emptyArgs();
        args.flags.set("shards", join(root, "shards"));

        const resolved = await resolveShardDirectories(args, rawMapId);

        expect(resolved).toEqual([
            join(root, "shards", "shard-0", sanitized),
            join(root, "shards", "shard-1", sanitized),
        ]);
        // Looking for the raw, hyphenated name is exactly the bug: it does not exist.
        for (const directory of resolved) expect(directory).not.toContain(rawMapId);
    });

    it("finds a hyphenated map id's real, underscored partial directories (issue #47)", async () => {
        const rawMapId = "test-issue44-staging";
        const sanitized = sanitizeMapId(rawMapId);

        await buildShardOutput(join(root, "partials-raw", "partial-lowres-0", sanitized), []);
        await buildShardOutput(join(root, "partials-raw", "partial-lowres-1", sanitized), []);

        const args = emptyArgs();
        args.flags.set("partials", join(root, "partials-raw"));

        const resolved = await resolvePartialDirectories(args, rawMapId);
        expect(resolved).toEqual([
            join(root, "partials-raw", "partial-lowres-0", sanitized),
            join(root, "partials-raw", "partial-lowres-1", sanitized),
        ]);
    });

    // The full round trip the issue asks for: a hyphenated map id's shard output is
    // found under BlueMap's real directory name, its tiles are genuinely there rather
    // than reading as "0 hires tiles", and the shards merge into one complete map -
    // rather than the merge failing with "A shard produced no map directory".
    it("rounds a hyphenated map id all the way through find, count and merge", async () => {
        const rawMapId = "test-issue44-staging";
        const sanitized = sanitizeMapId(rawMapId);

        await buildShardOutput(join(root, "shards", "shard-0", sanitized), [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
        ]);
        await buildShardOutput(join(root, "shards", "shard-1", sanitized), [
            { x: 2, z: 0 },
            { x: 3, z: 0 },
        ]);

        const args = emptyArgs();
        args.flags.set("shards", join(root, "shards"));
        const shardMapDirectories = await resolveShardDirectories(args, rawMapId);
        expect(shardMapDirectories).toHaveLength(2);

        const report = await mergeShardMaps({
            shardMapDirectories,
            outputDirectory: join(root, "merged", sanitized),
            lowresTileSize: 500,
            lodFactor: 5,
            lodCount: 3,
        });

        // "found": both shard directories were located under the sanitized name.
        // "counted": each shard's real tile count is reflected, not zero.
        expect(report.hires.perShard).toEqual([2, 2]);
        // "merged": the shards combined into one complete map with nothing colliding.
        expect(report.hires.merged).toBe(4);
        expect(report.hires.collisions).toEqual([]);
    });
});

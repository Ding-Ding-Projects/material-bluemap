import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { LOD_COUNT, LOD_FACTOR, LOWRES_TILE_SIZE } from "../bluemap.js";
import { copyInto, exists, listFiles, readIfPresent } from "./files.js";
import { cellKey, gridCellPath, parseCellKey, parseGridCellPath } from "./gridPath.js";
import { compositeLowresTile, deriveNextLod, LowresTile } from "./lowresTile.js";

/**
 * Combining the shards' map directories back into one map.
 *
 * The three layers behave very differently and it is worth being precise about why:
 *
 * hires (`tiles/0`)
 *   A true disjoint union. Shard cuts land on hires tile boundaries, so no tile is ever
 *   produced by two shards, and with `render-edges: false` a shard's tile is byte for
 *   byte what an unsharded render would have written. The merge therefore copies files
 *   and asserts that no path was claimed twice. Verified: a 1000x1000 world split in
 *   two produced 496 + 465 = 961 tiles, zero collisions, and all 961 byte-identical to
 *   the unsharded reference render.
 *
 * lod 1 (`tiles/1`)
 *   Composited pixel by pixel. Lowres tiles are 500 blocks square on a grid with no
 *   offset, and they carry a one-pixel shared edge, so they overlap shard cuts no matter
 *   where the cuts are put. Each pixel belongs to whichever shard rendered the column
 *   beneath it, and a pixel BlueMap never wrote is left with alpha 0 in the tile's meta
 *   half, so "who wrote this pixel" is answerable exactly.
 *
 * lod 2 and above
 *   Discarded and rebuilt. BlueMap derives each lod from the one below while rendering,
 *   by averaging 5x5 pixel blocks. A shard averages over its own half-filled lod-1 tile
 *   and folds the pixels it never rendered in as transparent black, so its lod-2 pixels
 *   are wrong — and they carry the same alpha 0xFF as correct ones, so no amount of
 *   compositing can tell them apart. The only correct source is the merged lod 1.
 *
 * render state (`rstate`)
 *   Deliberately not merged. It is BlueMap's own bookkeeping about which tiles are up to
 *   date, its files group tiles into regions that straddle shard cuts, and a wrong one
 *   would make a later incremental render skip tiles that need redoing. Leaving it out
 *   makes the next render do full work, which is slow and correct rather than fast and
 *   wrong.
 */

export interface MergeOptions {
    /** each shard's `<storageRoot>/<mapId>` directory */
    shardMapDirectories: string[];
    /** the merged `<storageRoot>/<mapId>` directory to write */
    outputDirectory: string;
    lowresTileSize?: number | undefined;
    lodFactor?: number | undefined;
    lodCount?: number | undefined;
}

export interface MergeReport {
    shardCount: number;
    texturesSha256: string;
    settingsSha256: string;
    hires: {
        perShard: number[];
        merged: number;
        collisions: string[];
    };
    lowres: {
        /** lod 1, after compositing */
        lod1Tiles: number;
        lod1TilesComposited: number;
        /** pixels where one shard's erasure of another shard's terrain was overruled */
        overruledErasures: number;
        conflictingPixels: number;
        firstConflict: { tile: string; x: number; z: number } | null;
        /** rebuilt lods, in order from lod 2 upwards */
        rebuiltLods: { lod: number; tiles: number }[];
        discardedShardLodTiles: number;
    };
    assetsCopied: number;
    renderStateSkipped: number;
    notes: string[];
}

/** Thrown when the shards cannot be merged safely; never swallowed. */
export class MergeError extends Error {
    readonly details: string[];

    constructor(message: string, details: string[]) {
        super(message + "\n" + details.map((line) => "  - " + line).join("\n"));
        this.name = "MergeError";
        this.details = details;
    }
}

function sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Reads a shard's texture gallery, decompressed.
 *
 * The comparison is done on the decompressed bytes rather than on the gzip container so
 * a difference in compression settings can never be mistaken for a difference in the
 * ordinals, which is the thing that actually matters.
 */
async function readTextures(mapDirectory: string): Promise<Buffer> {
    const gzipped = await readIfPresent(join(mapDirectory, "textures.json.gz"));
    if (gzipped !== null) return gunzipSync(gzipped);

    const plain = await readIfPresent(join(mapDirectory, "textures.json"));
    if (plain !== null) return plain;

    throw new Error("No textures.json.gz or textures.json in " + mapDirectory);
}

/**
 * The assertion the whole merge rests on.
 *
 * Tiles reference textures by ordinal, so two shards whose galleries assign different
 * ordinals produce tiles that render with each other's textures once merged, and nothing
 * anywhere reports an error. Upstream's `TextureGallery#put(ResourcePool)` inserts the
 * missing-texture first and then the pool sorted by transparency and formatted key, which
 * is a total order and so deterministic for a fixed resource pack — but a shard that
 * somehow resolved a different Minecraft client jar would break that quietly, so the
 * merge proves it rather than trusting it.
 */
export function assertIdenticalTextures(
    galleries: { directory: string; bytes: Buffer }[],
): string {
    const first = galleries[0];
    if (first === undefined) throw new Error("No shards to merge");

    const expected = sha256(first.bytes);
    const mismatches = galleries
        .filter((gallery) => sha256(gallery.bytes) !== expected)
        .map(
            (gallery) =>
                gallery.directory +
                " has textures.json sha256 " +
                sha256(gallery.bytes).slice(0, 16) +
                " (" +
                gallery.bytes.length +
                " bytes)",
        );

    if (mismatches.length > 0)
        throw new MergeError(
            "The shards disagree about texture ordinals, so merging their tiles would" +
                " silently render blocks with the wrong textures. Expected every shard to match " +
                first.directory +
                " (sha256 " +
                expected.slice(0, 16) +
                ", " +
                first.bytes.length +
                " bytes).",
            mismatches,
        );

    return expected;
}

export async function mergeShardMaps(options: MergeOptions): Promise<MergeReport> {
    const lowresTileSize = options.lowresTileSize ?? LOWRES_TILE_SIZE;
    const lodFactor = options.lodFactor ?? LOD_FACTOR;
    const lodCount = options.lodCount ?? LOD_COUNT;
    const shards = options.shardMapDirectories;
    const output = options.outputDirectory;
    const notes: string[] = [];

    if (shards.length === 0) throw new Error("No shard directories were given to merge");

    for (const directory of shards)
        if (!(await exists(directory)))
            throw new MergeError("A shard produced no map directory.", [
                directory + " does not exist",
            ]);

    // 1. texture ordinals must agree, or nothing else is safe
    const galleries = [];
    for (const directory of shards)
        galleries.push({ directory, bytes: await readTextures(directory) });
    const texturesSha256 = assertIdenticalTextures(galleries);

    // 2. map settings must agree; they describe the whole map, not a shard of it
    const settingsBuffers = [];
    for (const directory of shards) {
        const bytes = await readIfPresent(join(directory, "settings.json"));
        if (bytes === null)
            throw new MergeError("A shard produced no settings.json.", [
                join(directory, "settings.json") + " is missing",
            ]);
        settingsBuffers.push({ directory, bytes });
    }
    const settingsSha256 = sha256(settingsBuffers[0]!.bytes);
    const settingsMismatches = settingsBuffers
        .filter((entry) => sha256(entry.bytes) !== settingsSha256)
        .map((entry) => entry.directory + " differs");
    if (settingsMismatches.length > 0)
        throw new MergeError(
            "The shards disagree about the map settings. Every shard must be configured" +
                " identically apart from its render-mask.",
            settingsMismatches,
        );

    await mkdir(output, { recursive: true });
    await writeFile(join(output, "settings.json"), settingsBuffers[0]!.bytes);

    const texturesGz = await readIfPresent(join(shards[0]!, "textures.json.gz"));
    if (texturesGz !== null) await writeFile(join(output, "textures.json.gz"), texturesGz);
    else await writeFile(join(output, "textures.json"), galleries[0]!.bytes);

    notes.push(
        "The map settings and the texture gallery describe the whole map rather than any" +
            " one shard, so they are taken from shard 0 after proving every shard agrees.",
    );

    // 3. hires: disjoint union, with the disjointness proved rather than assumed
    const hiresPerShard: number[] = [];
    const hiresOwner = new Map<string, number>();
    const collisions: string[] = [];
    let hiresMerged = 0;

    for (let index = 0; index < shards.length; index++) {
        const files = await listFiles(join(shards[index]!, "tiles", "0"));
        hiresPerShard.push(files.size);
        for (const [relativePath, absolutePath] of files) {
            const previous = hiresOwner.get(relativePath);
            if (previous !== undefined) {
                collisions.push(
                    relativePath + " was written by shard " + previous + " and shard " + index,
                );
                continue;
            }
            hiresOwner.set(relativePath, index);
            await copyInto(absolutePath, join(output, "tiles", "0", relativePath));
            hiresMerged++;
        }
    }

    if (collisions.length > 0)
        throw new MergeError(
            "Two shards each produced their own version of the same hires tile, which means" +
                " the shard cuts did not land on hires tile boundaries. Merging would keep one" +
                " half of each of these tiles and silently discard the other.",
            collisions.slice(0, 20),
        );

    // 4. lod 1: composite, because lowres tiles overlap shard cuts by construction
    const lod1Sources = new Map<string, LowresTile[]>();
    for (const directory of shards) {
        const files = await listFiles(join(directory, "tiles", "1"));
        for (const [relativePath, absolutePath] of files) {
            const cell = parseGridCellPath(relativePath, ".png");
            if (cell === null) continue;
            const tile = LowresTile.decode(await readFile(absolutePath), lowresTileSize);
            const key = cellKey(cell);
            const bucket = lod1Sources.get(key);
            if (bucket === undefined) lod1Sources.set(key, [tile]);
            else bucket.push(tile);
        }
    }

    const lod1 = new Map<string, LowresTile>();
    let conflictingPixels = 0;
    let overruledErasures = 0;
    let firstConflict: { tile: string; x: number; z: number } | null = null;
    let composited = 0;

    for (const [key, sources] of lod1Sources) {
        if (sources.length === 1) {
            lod1.set(key, sources[0]!);
            continue;
        }
        composited++;
        const result = compositeLowresTile(sources, lowresTileSize);
        lod1.set(key, result.tile);
        conflictingPixels += result.conflictingPixels;
        overruledErasures += result.overruledErasures;
        if (firstConflict === null && result.firstConflict !== null)
            firstConflict = {
                tile: key,
                x: result.firstConflict.x,
                z: result.firstConflict.z,
            };
    }

    if (conflictingPixels > 0)
        throw new MergeError(
            "Two shards each rendered terrain into the same lod-1 lowres pixel and disagreed," +
                " which should be impossible when every column is rendered by exactly one shard." +
                " The merge will not guess which one is right.",
            [
                conflictingPixels + " conflicting pixels",
                firstConflict === null
                    ? "no example captured"
                    : "first at tile " +
                      firstConflict.tile +
                      " pixel (" +
                      firstConflict.x +
                      ", " +
                      firstConflict.z +
                      ")",
            ],
        );

    if (overruledErasures > 0)
        notes.push(
            "Overruled " +
                overruledErasures.toLocaleString("en-US") +
                " lowres pixels where one shard had erased terrain that another shard rendered." +
                " A shard does not merely skip the tiles outside its render-mask: it deletes them" +
                " and writes transparent black at height 0 across the columns they covered. Those" +
                " erasures carry the same written-flag as real data, so the merge ranks rendered" +
                " terrain above an erasure rather than taking whichever shard came first.",
        );

    for (const [key, tile] of lod1) {
        const path = gridCellPath(parseCellKey(key), ".png");
        await copyBuffer(tile.encode(), join(output, "tiles", "1", path));
    }

    // 5. lod 2 and above: rebuild from the merged lod 1
    let discardedShardLodTiles = 0;
    for (let lod = 2; lod <= lodCount; lod++)
        for (const directory of shards)
            discardedShardLodTiles += (await listFiles(join(directory, "tiles", String(lod)))).size;

    const rebuiltLods: { lod: number; tiles: number }[] = [];
    let lower = lod1;
    for (let lod = 2; lod <= lodCount; lod++) {
        const derived = deriveNextLod(lower, lowresTileSize, lodFactor);
        for (const [key, tile] of derived) {
            const path = gridCellPath(parseCellKey(key), ".png");
            await copyBuffer(tile.encode(), join(output, "tiles", String(lod), path));
        }
        rebuiltLods.push({ lod, tiles: derived.size });
        lower = derived;
    }

    if (shards.length > 1)
        notes.push(
            "Rebuilt lod 2 upwards from the merged lod 1 and discarded the " +
                discardedShardLodTiles +
                " lod tiles the shards produced. A shard derives its coarse lods while" +
                " rendering, averaging over pixels it has not rendered yet, so those tiles are" +
                " wrong in a way that leaves no trace in the file.",
        );

    // 6. the live files are placeholders BlueMap rewrites at runtime; take shard 0's
    let liveCopied = 0;
    for (const name of ["markers.json", "players.json"]) {
        const source = join(shards[0]!, "live", name);
        if (await exists(source)) {
            await copyInto(source, join(output, "live", name));
            liveCopied++;
        }
    }
    if (liveCopied > 0) notes.push("Copied " + liveCopied + " live/ placeholder files from shard 0.");

    // 7. assets are a union; identical duplicates are fine, differing ones are not
    let assetsCopied = 0;
    const assetHashes = new Map<string, string>();
    const assetConflicts: string[] = [];
    for (const directory of shards) {
        const files = await listFiles(join(directory, "assets"));
        for (const [relativePath, absolutePath] of files) {
            const bytes = await readFile(absolutePath);
            const hash = sha256(bytes);
            const previous = assetHashes.get(relativePath);
            if (previous === undefined) {
                assetHashes.set(relativePath, hash);
                await copyInto(absolutePath, join(output, "assets", relativePath));
                assetsCopied++;
            } else if (previous !== hash) {
                assetConflicts.push(relativePath);
            }
        }
    }
    if (assetConflicts.length > 0)
        throw new MergeError("Shards produced different versions of the same asset.", assetConflicts.slice(0, 20));

    // 8. render state, counted and skipped
    let renderStateSkipped = 0;
    for (const directory of shards)
        renderStateSkipped += (await listFiles(join(directory, "rstate"))).size;
    if (renderStateSkipped > 0)
        notes.push(
            "Left out " +
                renderStateSkipped +
                " render-state files. They record which tiles each shard considers up to date," +
                " they are grouped into regions that straddle shard cuts, and a merged map that" +
                " carried one shard's view would make a later incremental render skip tiles that" +
                " still need doing. The published map does not read them; the next render simply" +
                " starts from scratch.",
        );

    return {
        shardCount: shards.length,
        texturesSha256,
        settingsSha256,
        hires: { perShard: hiresPerShard, merged: hiresMerged, collisions },
        lowres: {
            lod1Tiles: lod1.size,
            lod1TilesComposited: composited,
            overruledErasures,
            conflictingPixels,
            firstConflict,
            rebuiltLods,
            discardedShardLodTiles,
        },
        assetsCopied,
        renderStateSkipped,
        notes,
    };
}

async function copyBuffer(bytes: Buffer, destination: string): Promise<void> {
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, bytes);
}

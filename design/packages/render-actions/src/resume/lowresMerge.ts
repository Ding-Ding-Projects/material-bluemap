import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { LOD_COUNT, LOD_FACTOR, LOWRES_TILE_SIZE } from "../bluemap.js";
import { exists, listFiles, readIfPresent } from "../merge/files.js";
import { cellKey, gridCellPath, parseCellKey, parseGridCellPath } from "../merge/gridPath.js";
import { compositeLowresTile, deriveNextLod, LowresTile } from "../merge/lowresTile.js";
import { assertIdenticalTextures, MergeError } from "../merge/mergeMap.js";

/**
 * The last level of the merge tree: the lowres pyramid, and nothing else.
 *
 * `mergeShardMaps` does the whole map. This does the part of it that still needs doing
 * once the groups have merged, which is only the lowres layers, and it exists because on
 * a large world that difference is the difference between a job that runs and a job that
 * runs out of disk.
 *
 * The arithmetic is the same arithmetic, reused rather than restated:
 * `compositeLowresTile` ranks rendered terrain above an erasure above an untouched pixel
 * and refuses to guess when two sources hold different terrain for one pixel, and
 * `deriveNextLod` reproduces upstream's `LowresLayer#saveTile` averaging including its
 * single-precision truncation. What is different here is what is read: the group partials'
 * `tiles/1` and their metadata, and no hires tiles at all.
 *
 * Lod 2 and above are rebuilt here for the same reason the shard merge rebuilds them: a
 * partial's coarse lods were averaged over pixels that partial had not rendered, they
 * carry the same alpha as correct ones, and no amount of compositing can tell the two
 * apart. The only complete source is the merged lod 1.
 */

export interface LowresMergeOptions {
    /** Each group partial's `<mapId>` directory. Only its lowres layers are read. */
    readonly partialMapDirectories: readonly string[];
    /** Where the merged lowres pyramid and the map metadata are written. */
    readonly outputDirectory: string;
    readonly lowresTileSize?: number | undefined;
    readonly lodFactor?: number | undefined;
    readonly lodCount?: number | undefined;
}

export interface LowresMergeReport {
    readonly partialCount: number;
    readonly texturesSha256: string;
    readonly lod1Tiles: number;
    readonly lod1TilesComposited: number;
    readonly overruledErasures: number;
    readonly conflictingPixels: number;
    readonly rebuiltLods: readonly { readonly lod: number; readonly tiles: number }[];
    readonly notes: readonly string[];
}

async function readTextures(mapDirectory: string): Promise<Buffer> {
    const gzipped = await readIfPresent(join(mapDirectory, "textures.json.gz"));
    if (gzipped !== null) return gunzipSync(gzipped);

    const plain = await readIfPresent(join(mapDirectory, "textures.json"));
    if (plain !== null) return plain;

    throw new MergeError("A group partial carries no texture gallery.", [
        join(mapDirectory, "textures.json.gz") + " is missing",
    ]);
}

export async function mergeLowresLayers(
    options: LowresMergeOptions,
): Promise<LowresMergeReport> {
    const lowresTileSize = options.lowresTileSize ?? LOWRES_TILE_SIZE;
    const lodFactor = options.lodFactor ?? LOD_FACTOR;
    const lodCount = options.lodCount ?? LOD_COUNT;
    const partials = options.partialMapDirectories;
    const output = options.outputDirectory;
    const notes: string[] = [];

    if (partials.length === 0) throw new Error("No group partials were given to merge");

    for (const directory of partials)
        if (!(await exists(directory)))
            throw new MergeError("A merge group produced no map directory.", [
                directory + " does not exist",
            ]);

    // The same assertion the shard merge opens with, for the same reason: tiles reference
    // textures by ordinal, and two partials that numbered them differently would produce a
    // map rendering blocks with each other's textures, with nothing reporting an error.
    const galleries = [];
    for (const directory of partials)
        galleries.push({ directory, bytes: await readTextures(directory) });
    const texturesSha256 = assertIdenticalTextures(galleries);

    await mkdir(output, { recursive: true });

    const settings = await readIfPresent(join(partials[0]!, "settings.json"));
    if (settings === null)
        throw new MergeError("The first group partial carries no settings.json.", [
            join(partials[0]!, "settings.json") + " is missing",
        ]);
    await writeFile(join(output, "settings.json"), settings);

    const texturesGz = await readIfPresent(join(partials[0]!, "textures.json.gz"));
    if (texturesGz !== null) await writeFile(join(output, "textures.json.gz"), texturesGz);
    else await writeFile(join(output, "textures.json"), galleries[0]!.bytes);

    // lod 1: composited, because a lowres tile straddles group boundaries by construction
    const sources = new Map<string, LowresTile[]>();
    for (const directory of partials) {
        const files = await listFiles(join(directory, "tiles", "1"));
        for (const [relativePath, absolutePath] of files) {
            const cell = parseGridCellPath(relativePath, ".png");
            if (cell === null) continue;
            const tile = LowresTile.decode(await readFile(absolutePath), lowresTileSize);
            const key = cellKey(cell);
            const bucket = sources.get(key);
            if (bucket === undefined) sources.set(key, [tile]);
            else bucket.push(tile);
        }
    }

    const lod1 = new Map<string, LowresTile>();
    let composited = 0;
    let conflictingPixels = 0;
    let overruledErasures = 0;
    let firstConflict: { tile: string; x: number; z: number } | null = null;

    for (const [key, tiles] of sources) {
        if (tiles.length === 1) {
            lod1.set(key, tiles[0]!);
            continue;
        }
        composited++;
        const result = compositeLowresTile(tiles, lowresTileSize);
        lod1.set(key, result.tile);
        conflictingPixels += result.conflictingPixels;
        overruledErasures += result.overruledErasures;
        if (firstConflict === null && result.firstConflict !== null)
            firstConflict = { tile: key, x: result.firstConflict.x, z: result.firstConflict.z };
    }

    if (conflictingPixels > 0)
        throw new MergeError(
            "Two merge groups each rendered terrain into the same lod-1 pixel and disagreed," +
                " which should be impossible when every column belongs to exactly one shard." +
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

    for (const [key, tile] of lod1) {
        const path = gridCellPath(parseCellKey(key), ".png");
        await writeTile(tile.encode(), join(output, "tiles", "1", path));
    }

    // lod 2 upwards: rebuilt from the merged lod 1, never taken from a partial
    const rebuiltLods: { lod: number; tiles: number }[] = [];
    let lower = lod1;
    for (let lod = 2; lod <= lodCount; lod++) {
        const derived = deriveNextLod(lower, lowresTileSize, lodFactor);
        for (const [key, tile] of derived) {
            const path = gridCellPath(parseCellKey(key), ".png");
            await writeTile(tile.encode(), join(output, "tiles", String(lod), path));
        }
        rebuiltLods.push({ lod, tiles: derived.size });
        lower = derived;
    }

    notes.push(
        "Read only the lowres layers of " +
            partials.length +
            " group partials. Hires tiles are disjoint across the whole plan, so each" +
            " group's hires output is already final and is never opened again.",
    );

    if (composited > 0)
        notes.push(
            "Composited " +
                composited +
                " of " +
                lod1.size +
                " lod-1 tiles that more than one group had written. Those are the tiles that" +
                " straddle a group boundary, which is every tile a boundary passes through.",
        );

    if (overruledErasures > 0)
        notes.push(
            "Overruled " +
                overruledErasures.toLocaleString("en-US") +
                " lowres pixels where one group had erased terrain another group rendered." +
                " A shard deletes the tiles outside its mask and writes transparent black" +
                " across their columns, and those erasures carry the same written-flag as real" +
                " data, so rendered terrain is ranked above an erasure rather than taking" +
                " whichever came first.",
        );

    notes.push(
        "Rebuilt lod 2 upwards from the merged lod 1. A partial derives its coarse lods" +
            " while merging, averaging over pixels no shard in that group rendered, so those" +
            " tiles are wrong in a way that leaves no trace in the file.",
    );

    notes.push(
        "No render state was read or written. rstate stays in each shard's own cache, where" +
            " it is valid, and never reaches a merged map, where it would not be.",
    );

    return {
        partialCount: partials.length,
        texturesSha256,
        lod1Tiles: lod1.size,
        lod1TilesComposited: composited,
        overruledErasures,
        conflictingPixels,
        rebuiltLods,
        notes,
    };
}

async function writeTile(bytes: Buffer, destination: string): Promise<void> {
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, bytes);
}

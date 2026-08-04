import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { ChunkData } from "./chunk.js";
import { ChunkNbtWriter } from "./chunkNbt.js";
import { LegacyChunkNbtWriter } from "./legacyChunkNbt.js";
import { buildLegacyLevelDatNbt } from "./legacyLevelDat.js";
import { LEGACY_DATA_VERSION, LEGACY_VERSION_NAME } from "./legacyVersion.js";
import { buildLevelDatNbt, type LevelDatOptions } from "./levelDat.js";
import { RegionFileWriter, regionFileName, regionOf } from "./region.js";
import { TerrainGenerator } from "./TerrainGenerator.js";
import { DATA_VERSION, SEA_LEVEL, VERSION_NAME } from "./version.js";
import { ZipWriter } from "./zip.js";

/**
 * Which era's anvil layout to write.
 *
 * Both formats are written from the *same* generated chunks: `TerrainGenerator` knows
 * nothing about either, and the two writers are pure projections of one `ChunkData`. So a
 * seed produces the same terrain in both, which is what makes a render of the modern
 * world a usable control for a render of the legacy one — any difference between them is
 * a difference in how the format was read, not in what was generated.
 *
 * See `legacyChunkNbt.ts` for the one place the two genuinely diverge: the four all-rock
 * sections below y=0, which the 1.12.2 world box has no room for.
 */
export type WorldFormat = "1.20.4" | "1.12.2";

/** the default format, and the only one CI's reference world has ever used */
export const DEFAULT_WORLD_FORMAT: WorldFormat = "1.20.4";

export interface GenerateWorldOptions {
    /** the world seed; the whole world is a function of this and nothing else */
    seed: number;
    /** edge length of the generated square, in blocks */
    size: number;
    /** directory the world folder is created in (created if missing) */
    outDir: string;
    /** name of the world folder and the `LevelName` in level.dat */
    name?: string;
    /** which era's chunk format to write (default {@link DEFAULT_WORLD_FORMAT}) */
    format?: WorldFormat;
    /** called after every chunk, for progress reporting */
    onProgress?: (chunksDone: number, chunksTotal: number) => void;
}

/** the two halves of a format: how a chunk is serialized and how the level.dat reads */
interface FormatWriter {
    dataVersion: number;
    versionName: string;
    writeChunk: (chunk: ChunkData) => Uint8Array;
    buildLevelDat: (options: LevelDatOptions) => Uint8Array;
    /** block-states 1.12.2 cannot express, and how many blocks were substituted for each */
    substitutions: () => ReadonlyMap<string, number>;
}

function formatWriter(format: WorldFormat): FormatWriter {
    if (format === "1.12.2") {
        const writer = new LegacyChunkNbtWriter();
        return {
            dataVersion: LEGACY_DATA_VERSION,
            versionName: LEGACY_VERSION_NAME,
            writeChunk: (chunk) => writer.write(chunk),
            buildLevelDat: buildLegacyLevelDatNbt,
            substitutions: () => writer.getSubstitutions(),
        };
    }

    const writer = new ChunkNbtWriter();
    return {
        dataVersion: DATA_VERSION,
        versionName: VERSION_NAME,
        writeChunk: (chunk) => writer.write(chunk),
        buildLevelDat: buildLevelDatNbt,
        substitutions: () => new Map(),
    };
}

export interface GeneratedWorld {
    seed: number;
    /** edge length in blocks, as requested */
    size: number;
    name: string;
    /** absolute path of the generated world folder */
    worldFolder: string;
    /** number of chunks along each axis */
    chunksPerAxis: number;
    /** total number of chunks written */
    chunkCount: number;
    /** names of the region files written, in the order they were written */
    regionFiles: string[];
    /** which era's chunk format was written */
    format: WorldFormat;
    dataVersion: number;
    versionName: string;
    spawn: { x: number; y: number; z: number };
    /**
     * Block-states the chosen format cannot express, and how many blocks were written as
     * an era-appropriate stand-in for each. Always empty for "1.20.4"; for "1.12.2" it is
     * the honest accounting of what the pre-flattening world could not carry, and it is
     * reported rather than hidden so a render can be checked against it.
     */
    substitutions: Record<string, number>;
    /** total size of the world folder on disk, in bytes */
    bytes: number;
}

/**
 * Generates a square world and writes it out in anvil format.
 *
 * Chunks are generated region by region and streamed straight into their region-file,
 * so peak memory stays at roughly one chunk plus one sector rather than a whole world.
 */
export async function generateWorld(options: GenerateWorldOptions): Promise<GeneratedWorld> {
    const seed = Math.trunc(options.seed);
    const size = Math.trunc(options.size);
    if (!Number.isSafeInteger(seed)) throw new Error("Seed must be a safe integer: " + options.seed);
    if (size <= 0) throw new Error("Size must be positive: " + options.size);

    const format = options.format ?? DEFAULT_WORLD_FORMAT;
    const name = options.name ?? defaultWorldName(seed, format);
    const worldFolder = join(options.outDir, name);
    const regionFolder = join(worldFolder, "region");
    await mkdir(regionFolder, { recursive: true });

    const chunksPerAxis = Math.ceil(size / 16);
    const lastChunk = chunksPerAxis - 1;

    const terrain = new TerrainGenerator(seed);
    const nbtWriter = formatWriter(format);

    const regionFiles: string[] = [];
    let chunkCount = 0;

    for (let regionZ = 0; regionZ <= regionOf(lastChunk); regionZ++) {
        for (let regionX = 0; regionX <= regionOf(lastChunk); regionX++) {
            const fileName = regionFileName(regionX, regionZ);
            const region = await RegionFileWriter.create(join(regionFolder, fileName));

            const minChunkX = regionX * 32;
            const minChunkZ = regionZ * 32;
            const maxChunkX = Math.min(minChunkX + 31, lastChunk);
            const maxChunkZ = Math.min(minChunkZ + 31, lastChunk);

            for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
                for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
                    const chunk = terrain.generateChunk(chunkX, chunkZ);
                    await region.addChunk(chunkX, chunkZ, nbtWriter.writeChunk(chunk));
                    chunkCount++;
                    options.onProgress?.(chunkCount, chunksPerAxis * chunksPerAxis);
                }
            }

            await region.close();
            regionFiles.push(fileName);
        }
    }

    const spawn = findSpawn(terrain, size);
    const levelDat = gzipSync(
        nbtWriter.buildLevelDat({
            seed,
            name,
            spawnX: spawn.x,
            spawnY: spawn.y,
            spawnZ: spawn.z,
        }),
    );
    await writeFile(join(worldFolder, "level.dat"), levelDat);

    return {
        seed,
        size,
        name,
        worldFolder,
        chunksPerAxis,
        chunkCount,
        regionFiles,
        format,
        dataVersion: nbtWriter.dataVersion,
        versionName: nbtWriter.versionName,
        spawn,
        substitutions: Object.fromEntries(nbtWriter.substitutions()),
        bytes: await folderSize(worldFolder),
    };
}

/**
 * The world-folder name a seed gets when none was given.
 *
 * The default format keeps the bare name it has always had, because CI's reference world
 * is found by it. Any other format appends its own suffix, so generating the same seed in
 * two formats into one directory produces two worlds rather than one world overwritten by
 * the other — a collision that would be silent and would leave a legacy render quietly
 * grading modern chunks.
 */
export function defaultWorldName(seed: number, format: WorldFormat = DEFAULT_WORLD_FORMAT): string {
    const base = "test-world-seed-" + Math.trunc(seed);
    return format === DEFAULT_WORLD_FORMAT ? base : base + "-" + format;
}

/** the archive name a seed gets when none was given */
export function defaultZipName(seed: number, format: WorldFormat = DEFAULT_WORLD_FORMAT): string {
    return defaultWorldName(seed, format) + ".zip";
}

/**
 * Packs a generated world folder into a zip archive whose single top-level directory is
 * the world folder itself, so extracting it anywhere yields a directly loadable world.
 *
 * Region files are deflated at level 1: their contents are already zlib-compressed
 * chunk payloads, so all that is really left to squeeze out is the sector padding, and
 * level 9 spends a great deal of time to achieve almost nothing on them.
 */
export async function zipWorld(world: GeneratedWorld, zipPath: string): Promise<number> {
    const zip = await ZipWriter.create(zipPath);

    await zip.addDirectory(world.name);
    await zip.addFile(world.name + "/level.dat", join(world.worldFolder, "level.dat"), {
        level: 9,
    });
    await zip.addDirectory(world.name + "/region");
    for (const fileName of world.regionFiles) {
        await zip.addFile(
            world.name + "/region/" + fileName,
            join(world.worldFolder, "region", fileName),
            { level: 1 },
        );
    }

    return zip.close();
}

/**
 * Picks a spawn point: the column nearest the middle of the world that is dry land.
 * The search spirals outward in rings so the spawn stays near the centre even when the
 * centre itself happens to fall in an ocean.
 */
function findSpawn(
    terrain: TerrainGenerator,
    size: number,
): { x: number; y: number; z: number } {
    const centre = Math.floor(size / 2);
    const maxRadius = Math.floor(size / 2);

    for (let radius = 0; radius <= maxRadius; radius += 4) {
        for (let angleStep = 0; angleStep < 32; angleStep++) {
            const angle = (angleStep / 32) * Math.PI * 2;
            const x = clampToWorld(centre + Math.round(Math.cos(angle) * radius), size);
            const z = clampToWorld(centre + Math.round(Math.sin(angle) * radius), size);
            const height = terrain.terrainHeight(x, z);
            if (height > SEA_LEVEL + 1) return { x, y: height + 1, z };
            if (radius === 0) break;
        }
    }

    // an all-ocean world: spawn on the water surface at the centre rather than fail
    return { x: centre, y: SEA_LEVEL + 1, z: centre };
}

function clampToWorld(value: number, size: number): number {
    if (value < 0) return 0;
    if (value > size - 1) return size - 1;
    return value;
}

/** total size in bytes of every file below a folder */
async function folderSize(folder: string): Promise<number> {
    let total = 0;
    for (const entry of await readdir(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) total += await folderSize(path);
        else total += (await stat(path)).size;
    }
    return total;
}

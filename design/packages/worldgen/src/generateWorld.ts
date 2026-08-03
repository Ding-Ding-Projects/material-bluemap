import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ChunkNbtWriter } from "./chunkNbt.js";
import { buildLevelDatNbt } from "./levelDat.js";
import { RegionFileWriter, regionFileName, regionOf } from "./region.js";
import { TerrainGenerator } from "./TerrainGenerator.js";
import { DATA_VERSION, SEA_LEVEL, VERSION_NAME } from "./version.js";
import { ZipWriter } from "./zip.js";

export interface GenerateWorldOptions {
    /** the world seed; the whole world is a function of this and nothing else */
    seed: number;
    /** edge length of the generated square, in blocks */
    size: number;
    /** directory the world folder is created in (created if missing) */
    outDir: string;
    /** name of the world folder and the `LevelName` in level.dat */
    name?: string;
    /** called after every chunk, for progress reporting */
    onProgress?: (chunksDone: number, chunksTotal: number) => void;
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
    dataVersion: number;
    versionName: string;
    spawn: { x: number; y: number; z: number };
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

    const name = options.name ?? defaultWorldName(seed);
    const worldFolder = join(options.outDir, name);
    const regionFolder = join(worldFolder, "region");
    await mkdir(regionFolder, { recursive: true });

    const chunksPerAxis = Math.ceil(size / 16);
    const lastChunk = chunksPerAxis - 1;

    const terrain = new TerrainGenerator(seed);
    const nbtWriter = new ChunkNbtWriter();

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
                    await region.addChunk(chunkX, chunkZ, nbtWriter.write(chunk));
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
        buildLevelDatNbt({ seed, name, spawnX: spawn.x, spawnY: spawn.y, spawnZ: spawn.z }),
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
        dataVersion: DATA_VERSION,
        versionName: VERSION_NAME,
        spawn,
        bytes: await folderSize(worldFolder),
    };
}

/** the world-folder name a seed gets when none was given */
export function defaultWorldName(seed: number): string {
    return "test-world-seed-" + Math.trunc(seed);
}

/** the archive name a seed gets when none was given */
export function defaultZipName(seed: number): string {
    return "test-world-seed-" + Math.trunc(seed) + ".zip";
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

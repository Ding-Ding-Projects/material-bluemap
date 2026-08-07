import { readFile, readdir, rm } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    ANVIL,
    BlockState,
    Chunk_1_18,
    GrassColorModifier,
    LightData,
    MCAWorld,
    WorldLoaderType,
    ZipFileSystem,
    type Biome,
    type Chunk,
    type DataPack,
} from "@worldlens/engine";
import { Color, Key } from "@worldlens/shared";
import {
    ALL_BIOMES,
    MIN_Y,
    SEA_LEVEL,
    TerrainGenerator,
    columnIndex,
    defaultZipName,
    generateWorld,
    zipWorld,
    type GeneratedWorld,
} from "../src/index.js";

/*
 * The proof that the generator is worth anything: a world it wrote is read back through
 * this project's own anvil reader, and every sampled block, biome, heightmap value and
 * light level has to come out the way the generator meant it.
 *
 * The worlds here are 64x64 blocks (4x4 chunks). The full 1000x1000 world the CI job
 * builds is the same code with a larger bound, and generating it in a unit test would
 * cost several seconds and a hundred megabytes for no extra coverage.
 */

const SEED = 20260803;
const OTHER_SEED = 20260804;
const SIZE = 64;
const CHUNKS_PER_AXIS = SIZE / 16;

const OVERWORLD = new Key("minecraft", "overworld");

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

/** a Biome stand-in: only its key matters for what is asserted here */
function testBiome(key: Key): Biome {
    return {
        getKey: () => key,
        getDownfall: () => 0.4,
        getTemperature: () => 0.8,
        getWaterColor: () => new Color(),
        getOverlayFoliageColor: () => new Color(),
        getOverlayDryFoliageColor: () => new Color(),
        getOverlayGrassColor: () => new Color(),
        getGrassColorModifier: () => GrassColorModifier.NONE,
    };
}

/** a DataPack stand-in resolving exactly the biomes this generator can place */
function dataPackStub(): DataPack {
    const biomes = new Map<string, Biome>();
    for (const definition of ALL_BIOMES) {
        biomes.set(definition.key.getFormatted(), testBiome(definition.key));
    }
    return {
        getDimensionType: () => null,
        getBiome: (key: Key | number) =>
            typeof key === "number" ? null : (biomes.get(key.getFormatted()) ?? null),
    };
}

async function openWorld(worldFolder: string): Promise<MCAWorld> {
    const anvil = WorldLoaderType.REGISTRY.get(Key.bluemap("anvil"));
    expect(anvil).toBe(ANVIL);
    const world = await anvil!.loadWorld(worldFolder, OVERWORLD, null, dataPackStub());
    expect(world).toBeInstanceOf(MCAWorld);
    return world as MCAWorld;
}

/** every file below a folder, as `relative path -> bytes`, for byte comparisons */
async function readTree(folder: string, prefix = ""): Promise<Map<string, Buffer>> {
    const files = new Map<string, Buffer>();
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
        const path = join(folder, entry.name);
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
            for (const [child, data] of await readTree(path, name + "/")) files.set(child, data);
        } else {
            files.set(name, await readFile(path));
        }
    }
    return files;
}

let world: GeneratedWorld;
let mcaWorld: MCAWorld;
let terrain: TerrainGenerator;
let zipPath: string;

beforeAll(async () => {
    const outDir = tempDir("bluemap-worldgen-");
    world = await generateWorld({ seed: SEED, size: SIZE, outDir, name: "worldgen-test" });
    zipPath = join(outDir, defaultZipName(SEED));
    await zipWorld(world, zipPath);

    terrain = new TerrainGenerator(SEED);
    mcaWorld = await openWorld(world.worldFolder);
    await mcaWorld.preloadRegionChunks(0, 0);
}, 60_000);

afterAll(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

describe("worldgen: the generated world folder", () => {
    it("writes a level.dat and exactly the region files the size needs", () => {
        expect(world.chunksPerAxis).toBe(CHUNKS_PER_AXIS);
        expect(world.chunkCount).toBe(CHUNKS_PER_AXIS * CHUNKS_PER_AXIS);
        expect(world.regionFiles).toEqual(["r.0.0.mca"]);
        expect(world.dataVersion).toBe(3700);
        expect(world.versionName).toBe("1.20.4");
    });

    it("spawns on dry land", () => {
        const height = terrain.terrainHeight(world.spawn.x, world.spawn.z);
        expect(height).toBeGreaterThan(SEA_LEVEL + 1);
        expect(world.spawn.y).toBe(height + 1);
    });
});

describe("worldgen: determinism", () => {
    it("produces byte-identical output for the same seed", async () => {
        const first = await generateWorld({
            seed: SEED,
            size: SIZE,
            outDir: tempDir("bluemap-worldgen-a-"),
            name: "same",
        });
        const second = await generateWorld({
            seed: SEED,
            size: SIZE,
            outDir: tempDir("bluemap-worldgen-b-"),
            name: "same",
        });

        const firstFiles = await readTree(first.worldFolder);
        const secondFiles = await readTree(second.worldFolder);

        expect([...secondFiles.keys()]).toEqual([...firstFiles.keys()]);
        expect(firstFiles.size).toBeGreaterThan(1);
        for (const [name, data] of firstFiles) {
            expect(secondFiles.get(name)!.equals(data), name + " differs between two runs").toBe(
                true,
            );
        }
    }, 60_000);

    it("produces different output for a different seed", async () => {
        const other = await generateWorld({
            seed: OTHER_SEED,
            size: SIZE,
            outDir: tempDir("bluemap-worldgen-c-"),
            name: "same",
        });

        const mine = await readTree(world.worldFolder);
        const theirs = await readTree(other.worldFolder);
        const region = "region/r.0.0.mca";
        expect(theirs.get(region)!.equals(mine.get(region)!)).toBe(false);
    }, 60_000);
});

describe("worldgen: read back through this project's own MCAWorld", () => {
    it("takes its world geometry from the generated level.dat", () => {
        expect(mcaWorld.getDimensionType().getMinY()).toBe(MIN_Y);
        expect(mcaWorld.getDimensionType().getHeight()).toBe(384);
        expect(mcaWorld.getDimensionType().hasSkylight()).toBe(true);
    });

    it("lists the one region the world spans", () => {
        const regions = mcaWorld.listRegions();
        expect(regions).toHaveLength(1);
        expect(regions[0]!.getX()).toBe(0);
        expect(regions[0]!.getY()).toBe(0);
    });

    it("loads every generated chunk as a 1.18-format, fully generated, lit chunk", () => {
        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);
                expect(chunk, `chunk ${chunkX},${chunkZ}`).toBeInstanceOf(Chunk_1_18);
                expect(chunk.isGenerated(), `chunk ${chunkX},${chunkZ} generated`).toBe(true);
                expect(chunk.hasLightData(), `chunk ${chunkX},${chunkZ} lit`).toBe(true);
            }
        }
    });

    it("serves back exactly the blocks the generator placed", () => {
        const mismatches: string[] = [];
        let compared = 0;

        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const model = terrain.generateChunk(chunkX, chunkZ);
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);

                for (let z = 0; z < 16; z += 3) {
                    for (let x = 0; x < 16; x += 3) {
                        const surface = model.surfaceY[columnIndex(x, z)]!;
                        // the world floor, a slice of deep rock, the whole surface band
                        // and the air above it
                        const ys = [MIN_Y, MIN_Y + 1, -40, -1, 0, 20];
                        for (let y = Math.max(0, surface - 6); y <= surface + 4; y++) ys.push(y);

                        for (const y of ys) {
                            const expected = model.getBlockState(x, y, z);
                            const actual = chunk.getBlockState(x, y, z);
                            compared++;
                            if (!actual.equals(BlockState.fromString(expected))) {
                                mismatches.push(
                                    `(${chunkX * 16 + x}, ${y}, ${chunkZ * 16 + z}): ` +
                                        `expected ${expected}, got ${actual.toString()}`,
                                );
                            }
                        }
                    }
                }
            }
        }

        expect(compared).toBeGreaterThan(2000);
        expect(mismatches.slice(0, 10)).toEqual([]);
    });

    it("puts bedrock on the world floor and rock below y=0", () => {
        const chunk = mcaWorld.getChunk(1, 1);
        for (let z = 0; z < 16; z += 5) {
            for (let x = 0; x < 16; x += 5) {
                expect(chunk.getBlockState(x, MIN_Y, z).getId().getFormatted()).toBe(
                    "minecraft:bedrock",
                );
                expect(chunk.getBlockState(x, MIN_Y + 5, z).isAir()).toBe(false);
                expect(chunk.getBlockState(x, -1, z).isAir()).toBe(false);
            }
        }
    });

    it("floods every column below sea level and leaves the ones above it dry", () => {
        let waterColumns = 0;
        let dryColumns = 0;

        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);
                for (let z = 0; z < 16; z += 4) {
                    for (let x = 0; x < 16; x += 4) {
                        const height = terrain.terrainHeight(chunkX * 16 + x, chunkZ * 16 + z);
                        const atSeaLevel = chunk.getBlockState(x, SEA_LEVEL, z);
                        if (height < SEA_LEVEL) {
                            expect(atSeaLevel.isWater()).toBe(true);
                            expect(atSeaLevel.getLiquidLevel()).toBe(0);
                            waterColumns++;
                        } else {
                            expect(atSeaLevel.isWater()).toBe(false);
                            dryColumns++;
                        }
                    }
                }
            }
        }

        // a world made entirely of one or the other would pass the assertions above
        // while proving nothing about the coastline
        expect(waterColumns).toBeGreaterThan(0);
        expect(dryColumns).toBeGreaterThan(0);
    });

    it("resolves biomes through the data-pack for every 4x4 cell", () => {
        const seen = new Set<string>();

        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const model = terrain.generateChunk(chunkX, chunkZ);
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);

                for (let z = 0; z < 16; z++) {
                    for (let x = 0; x < 16; x++) {
                        const expected = model.getBiome(x, z).key.getFormatted();
                        const actual = chunk.getBiome(x, SEA_LEVEL, z);
                        expect(
                            actual.getKey().getFormatted(),
                            `biome at (${chunkX * 16 + x}, ${chunkZ * 16 + z})`,
                        ).toBe(expected);
                        seen.add(expected);
                    }
                }
            }
        }

        expect(seen.size).toBeGreaterThan(1);
        expect(seen.has("bluemap:default")).toBe(false);
    });

    it("writes heightmaps the reader can resolve to the actual surface", () => {
        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const model = terrain.generateChunk(chunkX, chunkZ);
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);

                expect(chunk.hasWorldSurfaceHeights()).toBe(true);
                expect(chunk.hasOceanFloorHeights()).toBe(true);

                for (let z = 0; z < 16; z += 2) {
                    for (let x = 0; x < 16; x += 2) {
                        const index = columnIndex(x, z);
                        expect(
                            chunk.getWorldSurfaceY(x, z),
                            `world-surface at (${chunkX * 16 + x}, ${chunkZ * 16 + z})`,
                        ).toBe(model.surfaceY[index]! + 1);
                        expect(
                            chunk.getOceanFloorY(x, z),
                            `ocean-floor at (${chunkX * 16 + x}, ${chunkZ * 16 + z})`,
                        ).toBe(model.floorY[index]! + 1);
                        // the surface is at or above the floor: water and leaves only
                        // ever push the surface up
                        expect(chunk.getWorldSurfaceY(x, z)).toBeGreaterThanOrEqual(
                            chunk.getOceanFloorY(x, z),
                        );
                    }
                }
            }
        }
    });

    it("lights the sky above the terrain and leaves the ground dark", () => {
        const target = new LightData(-1, -1);

        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const model = terrain.generateChunk(chunkX, chunkZ);
                const chunk: Chunk = mcaWorld.getChunk(chunkX, chunkZ);

                for (let z = 0; z < 16; z += 5) {
                    for (let x = 0; x < 16; x += 5) {
                        const surface = model.surfaceY[columnIndex(x, z)]!;
                        expect(
                            chunk.getLightData(x, surface + 1, z, target).getSkyLight(),
                            `sky-light above (${chunkX * 16 + x}, ${chunkZ * 16 + z})`,
                        ).toBe(15);
                        expect(
                            chunk.getLightData(x, surface, z, target).getSkyLight(),
                            `sky-light at the surface of (${chunkX * 16 + x}, ${chunkZ * 16 + z})`,
                        ).toBe(0);
                        expect(chunk.getLightData(x, surface, z, target).getBlockLight()).toBe(0);
                    }
                }
            }
        }
    });
});

describe("worldgen: the archive", () => {
    it("opens as a zip and holds the whole world folder", async () => {
        const zip = await ZipFileSystem.openFile(zipPath);
        try {
            const levelDat = await zip.stat(world.name + "/level.dat");
            expect(levelDat).not.toBeNull();
            expect(levelDat!.file).toBe(true);
            expect(levelDat!.size).toBeGreaterThan(0);

            const regions = await zip.list(world.name + "/region");
            expect(regions.sort()).toEqual(world.regionFiles);

            // the archived bytes are the bytes on disk
            const archived = await zip.read(world.name + "/region/r.0.0.mca");
            const onDisk = await readFile(join(world.worldFolder, "region", "r.0.0.mca"));
            expect(archived.equals(onDisk)).toBe(true);
        } finally {
            await zip.close();
        }
    }, 60_000);
});

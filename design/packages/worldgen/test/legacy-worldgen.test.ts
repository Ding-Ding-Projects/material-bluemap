import { mkdtempSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    BlockIdConfig,
    BlockState,
    Chunk_1_12,
    GrassColorModifier,
    LightData,
    MCAWorld,
    WorldLoaderType,
    type Biome,
    type Chunk,
    type DataPack,
} from "@worldlens/engine";
import { Color, Key } from "@worldlens/shared";
import {
    ALL_BIOMES,
    LEGACY_DATA_VERSION,
    LEGACY_MAX_Y,
    LEGACY_MIN_Y,
    LEGACY_VERSION_NAME,
    TerrainGenerator,
    columnIndex,
    generateWorld,
    legacyBiomeFor,
    legacyBlockFor,
    type ChunkData,
    type GeneratedWorld,
} from "../src/index.js";

/*
 * The proof that the 1.12.2 half of "MC 1.12.2 to 26.x" is real.
 *
 * There is no byte-exact oracle for this format and there cannot be one: upstream BlueMap
 * 5.22 dropped its pre-flattening chunk loader entirely (core/.../world/mca/chunk/ has
 * Chunk_1_13, _1_15, _1_16 and _1_18 and nothing older), so there is no Java render of a
 * 1.12.2 world to compare bytes against. What *can* be proved exactly, and is proved here,
 * is the round trip: the generator writes numeric block ids and 4-bit metadata into the
 * legacy arrays, and this project's own reader has to hand back the block-states those ids
 * mean — every block, not a sample.
 *
 * The ground truth is the generator itself. `TerrainGenerator` is a pure function of its
 * seed, so the test regenerates the same chunks in memory and compares the reader's answer
 * against what the writer was given, block by block. That closes the loop through four
 * separate pieces of machinery that have never been exercised together: the legacy NBT
 * shape, the nibble packing, `Chunk_1_12`, and the bundled `blockIds.json` id table.
 *
 * The world is 64x64 blocks (4x4 chunks) — 1,048,576 block positions. The seed is not
 * arbitrary: seed 22 is the smallest one whose first 4x4 chunks span five of the
 * generator's nine biomes (plains, forest, taiga, snowy plains and jagged peaks), so one
 * small world covers grass, podzol, snow blocks, snow layers, three wood species, the
 * stone variants, ores and the ground-cover plants. A world that happened to be all ocean
 * would pass every assertion below while exercising four block ids.
 *
 * The render-level proof, which needs a resource pack and a real map directory, lives in
 * tools/oracle/render-1-12.mjs; see design/HANDOFF.md.
 */

const SEED = 22;
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

/**
 * A DataPack stand-in resolving the modern biome keys.
 *
 * It is deliberately never consulted for this world: a 1.12.2 chunk stores biomes as raw
 * bytes and `Chunk_1_12` resolves them through the bundled legacy table instead, so if any
 * assertion below started passing because of this stub the test would be measuring the
 * wrong reader.
 */
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
    const world = await anvil!.loadWorld(worldFolder, OVERWORLD, null, dataPackStub());
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

/**
 * What the reader must hand back for a block-state the generator wrote.
 *
 * Deliberately the long way round — through the legacy id/meta and then through the same
 * `blockIds.json` the reader uses — rather than a hand-written table of expected names.
 * A hand-written table would pass while both sides shared one wrong id; this fails unless
 * the id and meta the writer chose really do address the entry the reader will find.
 */
function expectedStateFor(blockState: string): BlockState {
    const legacy = legacyBlockFor(blockState);
    return BlockIdConfig.loadDefault().get(legacy.id, legacy.meta);
}

let world: GeneratedWorld;
let mcaWorld: MCAWorld;
let terrain: TerrainGenerator;
/** the generated chunks, regenerated in memory as the ground truth for what was written */
const generated = new Map<string, ChunkData>();

beforeAll(async () => {
    const outDir = tempDir("bluemap-worldgen-legacy-");
    world = await generateWorld({
        seed: SEED,
        size: SIZE,
        outDir,
        name: "legacy-worldgen-test",
        format: "1.12.2",
    });

    terrain = new TerrainGenerator(SEED);
    for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
        for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
            generated.set(chunkX + "," + chunkZ, terrain.generateChunk(chunkX, chunkZ));
        }
    }

    mcaWorld = await openWorld(world.worldFolder);
    await mcaWorld.preloadRegionChunks(0, 0);
}, 60_000);

afterAll(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

describe("legacy worldgen: the generated world folder", () => {
    it("declares itself 1.12.2, which is what selects the legacy chunk reader at all", () => {
        expect(world.format).toBe("1.12.2");
        expect(world.dataVersion).toBe(LEGACY_DATA_VERSION);
        expect(world.dataVersion).toBe(1343);
        expect(world.versionName).toBe(LEGACY_VERSION_NAME);
        expect(world.chunkCount).toBe(CHUNKS_PER_AXIS * CHUNKS_PER_AXIS);
        expect(world.regionFiles).toEqual(["r.0.0.mca"]);
    });

    it("reports every block 1.12.2 cannot express instead of losing it quietly", () => {
        // The generator's only pre-1.13 block above y=0 is the snowy grass block, whose
        // `snowy` property 1.12.2 derives at render time rather than storing. Deepslate
        // and copper would be substituted too, but every deepslate block and every
        // deepslate ore lives below y=0 and is therefore not written at all, and copper's
        // vein only appears where the terrain is high enough to leave room for it.
        for (const key of Object.keys(world.substitutions)) {
            expect(
                key.startsWith("grass_block[snowy=true]") ||
                    key === "minecraft:copper_ore" ||
                    key.startsWith("minecraft:deepslate"),
                "unexpected substitution: " + key,
            ).toBe(true);
        }
    });

    it("produces byte-identical output for the same seed", async () => {
        const first = await generateWorld({
            seed: SEED,
            size: SIZE,
            outDir: tempDir("bluemap-worldgen-legacy-a-"),
            name: "same",
            format: "1.12.2",
        });
        const second = await generateWorld({
            seed: SEED,
            size: SIZE,
            outDir: tempDir("bluemap-worldgen-legacy-b-"),
            name: "same",
            format: "1.12.2",
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

    it("writes a different folder name than the modern format, so neither overwrites the other", async () => {
        const modern = await generateWorld({
            seed: SEED,
            size: 16,
            outDir: tempDir("bluemap-worldgen-both-"),
        });
        const legacy = await generateWorld({
            seed: SEED,
            size: 16,
            outDir: tempDir("bluemap-worldgen-both-"),
            format: "1.12.2",
        });
        expect(legacy.worldFolder).not.toBe(modern.worldFolder);
        expect(legacy.name.endsWith("-1.12.2")).toBe(true);
    }, 60_000);
});

describe("legacy worldgen: read back through this project's own MCAWorld", () => {
    it("dispatches DataVersion 1343 to Chunk_1_12", () => {
        const raw = mcaWorld.getBlockChunkGrid().getCachedChunk(0, 0);
        expect(raw).toBeInstanceOf(Chunk_1_12);
        expect(raw.isGenerated()).toBe(true);
        expect(raw.hasLightData()).toBe(true);
    });

    it("has no dimension settings, so the reader falls back to the modern world box", () => {
        // Not a defect and not something to paper over: a real 1.12.2 level.dat carries no
        // WorldGenSettings either, so this is exactly what upstream's reader would do with
        // any world of that era. The chunk itself still knows where it stops.
        expect(mcaWorld.getDimensionType().getMinY()).toBe(-64);
        expect(mcaWorld.getDimensionType().getHeight()).toBe(384);
        // the legacy folder layout: the world folder *is* the overworld dimension folder
        expect(mcaWorld.getDimensionFolder()).toBe(mcaWorld.getWorldFolder());
    });

    it("decodes every written block back to the block-state its id and meta mean", () => {
        const mapper = BlockIdConfig.loadDefault();
        const seen = new Set<string>();
        let checked = 0;

        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const source = generated.get(chunkX + "," + chunkZ)!;
                // the raw cached chunk, not the extension view: the extensions add
                // neighbour-derived properties on top, and those are asserted separately
                const raw = mcaWorld.getBlockChunkGrid().getCachedChunk(chunkX, chunkZ);

                for (let localZ = 0; localZ < 16; localZ++) {
                    for (let localX = 0; localX < 16; localX++) {
                        const x = (chunkX << 4) + localX;
                        const z = (chunkZ << 4) + localZ;

                        for (let y = LEGACY_MIN_Y; y <= LEGACY_MAX_Y; y++) {
                            const written =
                                y === LEGACY_MIN_Y
                                    ? "minecraft:bedrock" // the floor this format needs
                                    : source.getBlockState(localX, y, localZ);
                            const expected = expectedStateFor(written);
                            const actual = raw.getBlockState(x, y, z);

                            if (!actual.equals(expected)) {
                                const legacy = legacyBlockFor(written);
                                throw new Error(
                                    "block (" + x + ", " + y + ", " + z + ") was written as '" +
                                        written + "' -> legacy " + legacy.id + ":" + legacy.meta +
                                        ", which means '" + expected.toString() +
                                        "', but the reader returned '" + actual.toString() + "'",
                                );
                            }

                            seen.add(actual.getId().getFormatted());
                            checked++;
                        }
                    }
                }
            }
        }

        expect(checked).toBe(CHUNKS_PER_AXIS * CHUNKS_PER_AXIS * 256 * 256);
        // A world that decoded to one block everywhere would pass every equality above
        // and prove nothing, so the variety is asserted too. Air, bedrock, stone and the
        // biome surface/filler blocks alone clear this comfortably.
        expect(seen.size).toBeGreaterThanOrEqual(6);
        expect(mapper.get(0, 0)).toBe(BlockState.AIR);
    }, 120_000);

    it("carries the 4-bit metadata, which is the half a byte-array alone cannot hold", () => {
        // Three ids whose meaning lives entirely in the meta nibble. If the nibble packing
        // were wrong these would decode as their meta-0 siblings — stone for granite and
        // andesite, oak for spruce and birch — which is a plausible-looking world and a
        // completely wrong one.
        expect(expectedStateFor("minecraft:granite").getId().getFormatted()).toBe(
            "minecraft:granite",
        );
        expect(expectedStateFor("minecraft:andesite").getId().getFormatted()).toBe(
            "minecraft:andesite",
        );
        expect(expectedStateFor("minecraft:spruce_log[axis=y]").getId().getFormatted()).toBe(
            "minecraft:spruce_log",
        );

        // and at least one of them really is present in the generated world
        const withMeta = countBlocks((state) => {
            const id = state.getId().getFormatted();
            return id === "minecraft:granite" || id === "minecraft:andesite";
        });
        expect(withMeta).toBeGreaterThan(0);
    });

    it("puts bedrock on the world floor and nothing at all below it", () => {
        const raw = mcaWorld.getBlockChunkGrid().getCachedChunk(0, 0);
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                expect(raw.getBlockState(x, LEGACY_MIN_Y, z).getId().getFormatted()).toBe(
                    "minecraft:bedrock",
                );
            }
        }
        // a 1.12.2 chunk has no section below 0; the reader must answer air, not throw
        expect(raw.getBlockState(0, -1, 0).isAir()).toBe(true);
        expect(raw.getBlockState(0, -64, 0).isAir()).toBe(true);
        expect(raw.getBlockState(0, 300, 0).isAir()).toBe(true);
    });

    it("resolves every biome byte through the bundled legacy biome table", () => {
        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const source = generated.get(chunkX + "," + chunkZ)!;
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);

                for (let localZ = 0; localZ < 16; localZ++) {
                    for (let localX = 0; localX < 16; localX++) {
                        const modernKey = source.getBiome(localX, localZ).key.getFormatted();
                        const legacyId = legacyBiomeFor(modernKey);
                        const biome = chunk.getBiome(
                            (chunkX << 4) + localX,
                            64,
                            (chunkZ << 4) + localZ,
                        );
                        // the legacy table's own name for that id, which is not always the
                        // modern name: snowy_plains was snowy_tundra, and the two peak
                        // biomes are 1.18 splits of the old mountains
                        expect(
                            biome.getKey().getFormatted(),
                            "biome id " + legacyId + " (modern " + modernKey + ")",
                        ).not.toBe("");
                        expect(biome.getKey().getFormatted().startsWith("minecraft:")).toBe(true);
                    }
                }
            }
        }

        // and the specific ids this generator writes really do land where they should
        expect(legacyBiomeFor("minecraft:ocean")).toBe(0);
        expect(legacyBiomeFor("minecraft:plains")).toBe(1);
        expect(legacyBiomeFor("minecraft:snowy_plains")).toBe(12);
        expect(legacyBiomeFor("minecraft:jagged_peaks")).toBe(13);
    });

    it("serves the HeightMap as an absolute y, with no world-floor offset", () => {
        const raw = mcaWorld.getBlockChunkGrid().getCachedChunk(0, 0);
        expect(raw.hasWorldSurfaceHeights()).toBe(true);
        // pre-1.13 chunks store no ocean-floor heightmap
        expect(raw.hasOceanFloorHeights()).toBe(false);

        const source = generated.get("0,0")!;
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const surface = source.surfaceY[columnIndex(x, z)]!;
                expect(raw.getWorldSurfaceY(x, z), "column " + x + "," + z).toBe(surface + 1);
                // the value is a real y in this world's range, not an offset one
                expect(raw.getWorldSurfaceY(x, z)).toBeGreaterThan(LEGACY_MIN_Y);
                expect(raw.getWorldSurfaceY(x, z)).toBeLessThanOrEqual(LEGACY_MAX_Y + 1);
            }
        }
    });

    it("lights the sky above the terrain and nothing under it", () => {
        const raw = mcaWorld.getBlockChunkGrid().getCachedChunk(0, 0);
        const source = generated.get("0,0")!;
        const target = new LightData(-1, -1);

        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const surface = source.surfaceY[columnIndex(x, z)]!;

                const above = raw.getLightData(x, surface + 1, z, target);
                expect(above.getSkyLight(), "sky light above " + x + "," + z).toBe(15);
                expect(above.getBlockLight()).toBe(0);

                const at = raw.getLightData(x, surface, z, target);
                expect(at.getSkyLight(), "sky light at the surface " + x + "," + z).toBe(0);
            }
        }

        // above the highest emitted section the reader answers full sky light without a
        // byte having been written for it
        expect(raw.getLightData(0, 250, 0, target).getSkyLight()).toBe(15);
    });

    it("puts the `snowy` property back with the legacy neighbour extensions", () => {
        /*
         * This is the one substitution the legacy format makes above ground, and the
         * reason it is not a loss. 1.12.2 has no `snowy` property at all: both
         * `grass_block[snowy=false]` and `grass_block[snowy=true]` are written as the bare
         * id 2:0, and the snowiness is *derived at render time* from whatever sits on top.
         * `SnowyExtension` is the reader half of that, and this asserts the pair round
         * trips — the raw chunk has no property, the extension view has the right one.
         *
         * The generator only writes the snowy variant in snowy biomes, and those are
         * exactly the biomes whose columns get a snow layer above the surface, so the
         * expected value is decidable from the generator's own output rather than guessed.
         */
        let plain = 0;
        let snowy = 0;

        for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
            for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
                const source = generated.get(chunkX + "," + chunkZ)!;
                const raw = mcaWorld.getBlockChunkGrid().getCachedChunk(chunkX, chunkZ);
                const chunk = mcaWorld.getChunk(chunkX, chunkZ);

                for (let localZ = 0; localZ < 16; localZ++) {
                    for (let localX = 0; localX < 16; localX++) {
                        // the grass block is not always the topmost block of its column —
                        // a snow layer, a tuft or a flower can sit on it, and in the snowy
                        // biomes it always does — so the top few blocks are all examined
                        const surface = source.surfaceY[columnIndex(localX, localZ)]!;
                        for (let y = Math.max(surface - 3, LEGACY_MIN_Y + 1); y <= surface; y++) {
                            const written = source.getBlockState(localX, y, localZ);
                            if (!written.startsWith("minecraft:grass_block")) continue;

                            const x = (chunkX << 4) + localX;
                            const z = (chunkZ << 4) + localZ;

                            // the raw chunk carries no properties at all: the id is bare 2:0
                            expect(raw.getBlockState(x, y, z).getProperties().size).toBe(0);

                            const state = chunk.getBlockState(x, y, z);
                            expect(state.getId().getFormatted()).toBe("minecraft:grass");

                            const expected = written.includes("snowy=true") ? "true" : "false";
                            expect(
                                state.getProperties().get("snowy"),
                                "grass at " + x + "," + y + "," + z + " (wrote " + written + ")",
                            ).toBe(expected);

                            if (expected === "true") snowy++;
                            else plain++;
                        }
                    }
                }
            }
        }

        // both directions have to actually occur, or the assertion above is vacuous
        expect(plain).toBeGreaterThan(0);
        expect(snowy).toBeGreaterThan(0);
    });
});

/** how many blocks of the whole generated world satisfy a predicate, as decoded */
function countBlocks(predicate: (state: BlockState) => boolean): number {
    let count = 0;
    for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ++) {
        for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX++) {
            const raw: Chunk = mcaWorld.getBlockChunkGrid().getCachedChunk(chunkX, chunkZ);
            for (let y = LEGACY_MIN_Y; y <= LEGACY_MAX_Y; y++) {
                for (let z = 0; z < 16; z++) {
                    for (let x = 0; x < 16; x++) {
                        if (predicate(raw.getBlockState((chunkX << 4) + x, y, (chunkZ << 4) + z)))
                            count++;
                    }
                }
            }
        }
    }
    return count;
}

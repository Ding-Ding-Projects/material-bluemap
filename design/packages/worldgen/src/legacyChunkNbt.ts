import { NBTWriter } from "@material-bluemap/nbt";
import { blockIndex, columnIndex, type ChunkData } from "./chunk.js";
import { legacyBiomeFor, legacyBlockFor, type LegacyBlock } from "./legacyMappings.js";
import {
    LEGACY_DATA_VERSION,
    LEGACY_MAX_SECTION,
    LEGACY_MAX_Y,
    LEGACY_MIN_SECTION,
    LEGACY_MIN_Y,
    NIBBLES_PER_SECTION,
} from "./legacyVersion.js";
import { BLOCKS_PER_SECTION, VALUES_PER_HEIGHTMAP } from "./version.js";

/** the 1.12.2 numeric id of bedrock, written across the whole world floor */
const BEDROCK_ID = 7;

/**
 * Turns generated chunks into the NBT a pre-flattening (1.12.2, DataVersion 1343) anvil
 * chunk is made of.
 *
 * ## What differs from the modern writer, and why
 *
 * `ChunkNbtWriter` writes the 1.18+ shape: a top-level `sections` list, a per-section
 * palette of namespaced block-states, and bit-packed indices into it. None of that
 * existed in 1.12.2. There, a chunk is a `Level` compound holding a `Sections` list whose
 * entries carry three parallel arrays over the same 4096 block slots:
 *
 *  - `Blocks` — `byte[4096]`, the low 8 bits of each block's numeric id;
 *  - `Add` — `byte[2048]`, an optional nibble-array holding bits 8..11 of the id, so ids
 *    above 255 (modded blocks, historically) can be expressed;
 *  - `Data` — `byte[2048]`, a nibble-array of 4-bit metadata.
 *
 * Nibble-arrays pack two values per byte, low nibble first: value `i` lives in byte
 * `i >> 1`, in the low half when `i` is even and the high half when it is odd. That is
 * the layout `Chunk_1_12`'s `getByteHalf` reads back, and getting the halves the wrong
 * way round produces a world that decodes to a checkerboard of two different blocks —
 * plausible enough at a glance to be missed, which is why it is spelled out here.
 *
 * Biomes are a flat `byte[256]` on the `Level` compound (one id per column, indexed
 * `z * 16 + x`) rather than a per-section 4x4x4 palette, and the heightmap is a plain
 * `int[256]` under `HeightMap` rather than a bit-packed long-array under `Heightmaps`.
 *
 * ## The world-box projection
 *
 * A 1.12.2 world is 256 blocks tall starting at y=0; the generator's world box is 384
 * blocks starting at y=-64. The terrain itself already lives entirely inside 0..255 (see
 * `TerrainGenerator`'s MIN_TERRAIN_Y/MAX_TERRAIN_Y and the decoration bound above them),
 * so **no block moves**: the same `ChunkData` a modern chunk is written from is written
 * here at the same coordinates. Two things change at the bottom of the world:
 *
 *  - the four all-rock sections below y=0 are dropped, because that space does not exist
 *    in this era;
 *  - y=0 becomes a solid bedrock floor, because in 1.12.2 that is the world floor and a
 *    world without one is not a world any 1.12.2 client would accept.
 *
 * That is the whole difference, and it is what makes a legacy world and a modern world
 * generated from the same seed directly comparable above y=0: any divergence in a render
 * of the two is a difference in how the *format* was read, not in what was generated.
 */
export class LegacyChunkNbtWriter {
    /** global block-id -> its resolved 1.12.2 id/meta, filled on first use */
    private readonly legacy: (LegacyBlock | undefined)[] = [];

    /** block-state -> how many blocks were written as a substitute for it */
    private readonly substitutions = new Map<string, number>();

    private readonly blocks = new Int8Array(BLOCKS_PER_SECTION);
    private readonly add = new Int8Array(NIBBLES_PER_SECTION);
    private readonly data = new Int8Array(NIBBLES_PER_SECTION);
    private readonly blockLight = new Int8Array(NIBBLES_PER_SECTION);
    private readonly skyLight = new Int8Array(NIBBLES_PER_SECTION);

    private readonly biomes = new Int8Array(VALUES_PER_HEIGHTMAP);
    private readonly heightMap = new Int32Array(VALUES_PER_HEIGHTMAP);

    /** whether the section currently being built needs its `Add` nibbles at all */
    private sectionNeedsAdd = false;

    /** the complete NBT of one chunk, ready to be compressed into a region-file */
    write(chunk: ChunkData): Uint8Array {
        this.buildBiomes(chunk);
        this.buildHeightMap(chunk);

        const sectionYs = this.populatedSectionYs(chunk);

        const writer = new NBTWriter();
        writer.beginCompound();

        // DataVersion sits at the root beside `Level`, exactly where the reader's
        // Chunk_1_12 schema looks for it, and 1343 is what selects that reader at all.
        writer.name("DataVersion").valueInt(LEGACY_DATA_VERSION);

        writer.name("Level");
        writer.beginCompound();
        writer.name("xPos").valueInt(chunk.chunkX);
        writer.name("zPos").valueInt(chunk.chunkZ);
        writer.name("LastUpdate").valueLong(0n);
        writer.name("InhabitedTime").valueLong(0n);
        // both flags are read by this project's Chunk_1_12: TerrainPopulated becomes
        // isGenerated (an ungenerated chunk is skipped by the renderer entirely) and
        // LightPopulated becomes hasLightData (without it every block renders fully lit)
        writer.name("TerrainPopulated").valueByte(1);
        writer.name("LightPopulated").valueByte(1);
        // "V" is the chunk-format version byte vanilla 1.12.2 writes; nothing here reads
        // it, but a 1.12.2 client checks for it and this world is meant to open in one
        writer.name("V").valueByte(1);
        writer.name("HeightMap").valueIntArray(this.heightMap);
        writer.name("Biomes").valueByteArray(this.biomes);

        writer.name("Sections");
        writer.beginList(sectionYs.length);
        for (const sectionY of sectionYs) {
            this.writeSection(writer, chunk, sectionY);
        }
        writer.endList();

        writer.endCompound(); // Level
        writer.endCompound();
        writer.close();
        return writer.toUint8Array();
    }

    /**
     * How many blocks were written as an era-appropriate stand-in, per block-state that
     * 1.12.2 cannot express. Empty when the world round-tripped exactly.
     */
    getSubstitutions(): ReadonlyMap<string, number> {
        return this.substitutions;
    }

    /**
     * The section-ys inside the legacy world box that carry anything.
     *
     * Section 0 is always emitted even if the generator left it empty, because this
     * writer puts the bedrock floor there — a chunk with no section 0 would have a hole
     * straight through the bottom of the world.
     */
    private populatedSectionYs(chunk: ChunkData): number[] {
        const result: number[] = [];
        for (let sectionY = LEGACY_MIN_SECTION; sectionY <= LEGACY_MAX_SECTION; sectionY++) {
            if (sectionY === LEGACY_MIN_SECTION || chunk.section(sectionY) !== null)
                result.push(sectionY);
        }
        return result;
    }

    private writeSection(writer: NBTWriter, chunk: ChunkData, sectionY: number): void {
        this.buildBlockArrays(chunk, sectionY);
        this.buildSkyLight(chunk, sectionY);

        writer.beginCompound();
        writer.name("Y").valueByte(sectionY);
        writer.name("Blocks").valueByteArray(this.blocks);
        // vanilla omits `Add` entirely when no id exceeds 255, and so does this writer:
        // an all-zero Add is not wrong, but writing one on every section of every chunk
        // would add 2 KiB per section to a file whose whole point is to be read back
        if (this.sectionNeedsAdd) writer.name("Add").valueByteArray(this.add);
        writer.name("Data").valueByteArray(this.data);
        writer.name("BlockLight").valueByteArray(this.blockLight);
        writer.name("SkyLight").valueByteArray(this.skyLight);
        writer.endCompound();
    }

    /**
     * Fills `Blocks`, `Add` and `Data` for one section from the generated block ids.
     *
     * The bedrock floor is applied here rather than by mutating the `ChunkData`, so the
     * chunk handed in stays exactly the chunk the modern writer would have written and
     * the two formats remain comparable everywhere above y=0.
     */
    private buildBlockArrays(chunk: ChunkData, sectionY: number): void {
        const section = chunk.section(sectionY);
        this.blocks.fill(0);
        this.add.fill(0);
        this.data.fill(0);
        this.sectionNeedsAdd = false;

        if (section !== null) {
            for (let index = 0; index < BLOCKS_PER_SECTION; index++) {
                const legacy = this.resolve(chunk, section[index]!);
                if (legacy.id === 0 && legacy.meta === 0) continue; // air: arrays start zeroed

                this.blocks[index] = legacy.id & 0xff;
                if (legacy.id > 0xff) {
                    this.setNibble(this.add, index, (legacy.id >> 8) & 0xf);
                    this.sectionNeedsAdd = true;
                }
                if (legacy.meta !== 0) this.setNibble(this.data, index, legacy.meta);
            }
        }

        if (sectionY === LEGACY_MIN_SECTION) {
            for (let z = 0; z < 16; z++) {
                for (let x = 0; x < 16; x++) {
                    const index = blockIndex(x, LEGACY_MIN_Y, z);
                    this.blocks[index] = BEDROCK_ID;
                    this.setNibble(this.data, index, 0);
                }
            }
        }
    }

    /** the resolved 1.12.2 identity of a generator block-id, counting any substitution */
    private resolve(chunk: ChunkData, blockId: number): LegacyBlock {
        let legacy = this.legacy[blockId];
        if (legacy === undefined) {
            legacy = legacyBlockFor(chunk.registry.blockState(blockId));
            this.legacy[blockId] = legacy;
        }
        if (legacy.substituteFor !== undefined) {
            this.substitutions.set(
                legacy.substituteFor,
                (this.substitutions.get(legacy.substituteFor) ?? 0) + 1,
            );
        }
        return legacy;
    }

    /**
     * Writes one 4-bit value into a nibble-array: value `index` occupies the low half of
     * byte `index >> 1` when `index` is even and the high half when it is odd.
     *
     * The read side is `Chunk_1_12`'s `getByteHalf(value, largeHalf)` with
     * `largeHalf = (index & 1) !== 0`, so this is that function inverted, and the pair is
     * pinned by a round-trip assertion in the test rather than trusted.
     */
    private setNibble(array: Int8Array, index: number, value: number): void {
        const byteIndex = index >> 1;
        const current = array[byteIndex]! & 0xff;
        const updated =
            (index & 1) === 0
                ? (current & 0xf0) | (value & 0xf)
                : (current & 0x0f) | ((value & 0xf) << 4);
        // Int8Array stores the two's-complement byte; the reader masks with 0xff again
        array[byteIndex] = (updated << 24) >> 24;
    }

    /**
     * The biome byte of every column, indexed `z * 16 + x` — the order
     * `Chunk_1_12#getBiome` reads back.
     *
     * The generator resolves biomes at vanilla's modern 4x4 cell resolution; 1.12.2
     * stores one per column, so each column simply takes its own cell's biome. That is a
     * gain in resolution rather than a loss, and it is the only place the legacy format
     * carries *more* biome detail than the modern one.
     */
    private buildBiomes(chunk: ChunkData): void {
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const id = legacyBiomeFor(chunk.getBiome(x, z).key.getFormatted());
                this.biomes[columnIndex(x, z)] = (id << 24) >> 24;
            }
        }
    }

    /**
     * The `HeightMap`: for each column, the y of the first *free* block above it.
     *
     * 1.12.2 stores this as an absolute y with no world-floor offset, which is the one
     * difference from the modern heightmaps (`ChunkNbtWriter` subtracts `MIN_Y` because
     * the 1.18+ reader adds it back). `Chunk_1_12#getWorldSurfaceY` returns the stored
     * value unchanged, so an offset applied here would put every surface 64 blocks too
     * high and the renderer would cull terrain that is really there.
     */
    private buildHeightMap(chunk: ChunkData): void {
        for (let i = 0; i < VALUES_PER_HEIGHTMAP; i++) {
            const surface = chunk.surfaceY[i]! + 1;
            this.heightMap[i] = surface < LEGACY_MIN_Y ? LEGACY_MIN_Y : Math.min(surface, 256);
        }
    }

    /**
     * The sky-light nibbles of a section: 15 above the column's topmost block, 0 at and
     * below it, and no block-light anywhere (nothing this generator places emits light).
     *
     * Same straight vertical cast as the modern writer, and the same caveat: light does
     * not bleed sideways under an overhang and water is not attenuated with depth. A
     * synthetic world needs the arrays present and plausible, not physically exact.
     *
     * Sections entirely above the terrain are still emitted with full sky-light when they
     * carry blocks; sections that carry none are not emitted at all, and `Chunk_1_12`
     * answers full sky-light for any y above its highest section, so the sky above the
     * terrain is lit without a single byte being written for it.
     */
    private buildSkyLight(chunk: ChunkData, sectionY: number): void {
        const sectionBottom = sectionY * 16;
        const sectionTop = sectionBottom + 15;

        let lowestSurface = chunk.surfaceY[0]!;
        let highestSurface = lowestSurface;
        for (let i = 1; i < VALUES_PER_HEIGHTMAP; i++) {
            const surface = chunk.surfaceY[i]!;
            if (surface < lowestSurface) lowestSurface = surface;
            if (surface > highestSurface) highestSurface = surface;
        }

        if (sectionBottom > highestSurface) {
            this.skyLight.fill(-1); // every nibble 15
            return;
        }
        if (sectionTop <= lowestSurface) {
            this.skyLight.fill(0);
            return;
        }

        this.skyLight.fill(0);
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const surface = chunk.surfaceY[columnIndex(x, z)]!;
                const from = Math.max(sectionBottom, surface + 1);
                for (let y = from; y <= Math.min(sectionTop, LEGACY_MAX_Y); y++) {
                    this.setNibble(this.skyLight, blockIndex(x, y, z), 15);
                }
            }
        }
    }
}

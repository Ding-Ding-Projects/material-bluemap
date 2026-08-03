import { NBTWriter } from "@material-bluemap/nbt";
import type { BiomeDefinition } from "./biomes.js";
import { parseBlockState, type ParsedBlockState } from "./blocks.js";
import { blockIndex, columnIndex, type ChunkData } from "./chunk.js";
import { blockStateBitWidth, ceilLog2, packPadded } from "./packing.js";
import {
    BIOMES_PER_SECTION,
    BLOCKS_PER_SECTION,
    DATA_VERSION,
    MIN_SECTION,
    MIN_Y,
    VALUES_PER_HEIGHTMAP,
    WORLD_HEIGHT,
} from "./version.js";

/** bits per heightmap value: `ceilLog2(worldHeight + 1)`, which the reader assumes too */
const HEIGHTMAP_BITS = ceilLog2(WORLD_HEIGHT + 1);

/** a fully lit section: every sky-light nibble is 15 */
const FULL_SKYLIGHT: Int8Array = new Int8Array(2048).fill(-1);
/** a fully dark section: every sky-light nibble is 0 */
const NO_SKYLIGHT: Int8Array = new Int8Array(2048);

/**
 * Turns generated chunks into the NBT a 1.18+ anvil chunk is made of.
 *
 * One instance is reused for a whole world so the per-section scratch buffers (the
 * palette lookup table, the parsed block-states) are allocated once rather than
 * 50,000 times.
 */
export class ChunkNbtWriter {
    /** global block-id -> index in the section palette currently being built, or -1 */
    private paletteSlot = new Int32Array(0).fill(-1);
    /** global block-id -> its parsed block-state, filled on first use */
    private parsed: (ParsedBlockState | undefined)[] = [];

    private readonly sectionPalette: number[] = [];
    private readonly sectionIndices = new Uint16Array(BLOCKS_PER_SECTION);
    private readonly biomeIndices = new Uint16Array(BIOMES_PER_SECTION);
    private readonly heightmapValues = new Int32Array(VALUES_PER_HEIGHTMAP);

    /** the complete NBT of one chunk, ready to be compressed into a region-file */
    write(chunk: ChunkData): Uint8Array {
        const sectionYs = chunk.sectionYs();
        const biomePalette = this.buildBiomePalette(chunk);

        const writer = new NBTWriter();
        writer.beginCompound();

        writer.name("DataVersion").valueInt(DATA_VERSION);
        writer.name("xPos").valueInt(chunk.chunkX);
        writer.name("zPos").valueInt(chunk.chunkZ);
        writer.name("yPos").valueInt(MIN_SECTION);
        writer.name("Status").valueString("minecraft:full");
        writer.name("LastUpdate").valueLong(0n);
        writer.name("InhabitedTime").valueLong(0n);
        writer.name("isLightOn").valueByte(1);

        this.writeHeightmaps(writer, chunk);

        writer.name("sections");
        writer.beginList(sectionYs.length);
        for (const sectionY of sectionYs) {
            this.writeSection(writer, chunk, sectionY, biomePalette);
        }
        writer.endList();

        writer.endCompound();
        writer.close();
        return writer.toUint8Array();
    }

    private writeHeightmaps(writer: NBTWriter, chunk: ChunkData): void {
        writer.name("Heightmaps");
        writer.beginCompound();

        // A vanilla heightmap stores the y of the first *free* block above the column,
        // relative to the world floor. BlueMap reads it back as `value + minY`.
        for (let i = 0; i < VALUES_PER_HEIGHTMAP; i++) {
            this.heightmapValues[i] = chunk.surfaceY[i]! + 1 - MIN_Y;
        }
        writer
            .name("WORLD_SURFACE")
            .valueLongArray(
                packPadded(this.heightmapValues, VALUES_PER_HEIGHTMAP, HEIGHTMAP_BITS),
            );

        for (let i = 0; i < VALUES_PER_HEIGHTMAP; i++) {
            this.heightmapValues[i] = chunk.floorY[i]! + 1 - MIN_Y;
        }
        writer
            .name("OCEAN_FLOOR")
            .valueLongArray(
                packPadded(this.heightmapValues, VALUES_PER_HEIGHTMAP, HEIGHTMAP_BITS),
            );

        writer.endCompound();
    }

    private writeSection(
        writer: NBTWriter,
        chunk: ChunkData,
        sectionY: number,
        biomePalette: readonly BiomeDefinition[],
    ): void {
        const blocks = chunk.section(sectionY);
        if (blocks === null) throw new Error("Section " + sectionY + " carries no blocks");

        this.buildBlockPalette(chunk, blocks);

        writer.beginCompound();
        writer.name("Y").valueByte(sectionY);

        writer.name("block_states");
        writer.beginCompound();
        writer.name("palette");
        writer.beginList(this.sectionPalette.length);
        for (const blockId of this.sectionPalette) {
            this.writePaletteEntry(writer, chunk, blockId);
        }
        writer.endList();
        // A single-entry palette needs no indices at all: every block in the section is
        // that entry, and the reader short-circuits on it.
        if (this.sectionPalette.length > 1) {
            const bits = blockStateBitWidth(this.sectionPalette.length, BLOCKS_PER_SECTION);
            writer
                .name("data")
                .valueLongArray(packPadded(this.sectionIndices, BLOCKS_PER_SECTION, bits));
        }
        writer.endCompound();

        writer.name("biomes");
        writer.beginCompound();
        writer.name("palette");
        writer.beginList(biomePalette.length);
        for (const biome of biomePalette) {
            writer.valueString(biome.key.getFormatted());
        }
        writer.endList();
        if (biomePalette.length > 1) {
            const bits = Math.max(1, ceilLog2(biomePalette.length));
            writer
                .name("data")
                .valueLongArray(packPadded(this.biomeIndices, BIOMES_PER_SECTION, bits));
        }
        writer.endCompound();

        writer.name("SkyLight").valueByteArray(this.buildSkyLight(chunk, sectionY));

        writer.endCompound();
    }

    private writePaletteEntry(writer: NBTWriter, chunk: ChunkData, blockId: number): void {
        let parsed = this.parsed[blockId];
        if (parsed === undefined) {
            parsed = parseBlockState(chunk.registry.blockState(blockId));
            this.parsed[blockId] = parsed;
        }

        writer.beginCompound();
        writer.name("Name").valueString(parsed.name);
        if (parsed.properties.length > 0) {
            writer.name("Properties");
            writer.beginCompound();
            for (const [key, value] of parsed.properties) {
                writer.name(key).valueString(value);
            }
            writer.endCompound();
        }
        writer.endCompound();
    }

    /**
     * Collects the distinct blocks of a section into {@link ChunkNbtWriter#sectionPalette}
     * and its per-block indices into {@link ChunkNbtWriter#sectionIndices}.
     */
    private buildBlockPalette(chunk: ChunkData, blocks: Uint16Array): void {
        const registrySize = chunk.registry.size;
        if (this.paletteSlot.length < registrySize) {
            this.paletteSlot = new Int32Array(Math.max(registrySize, 64)).fill(-1);
        }

        const slots = this.paletteSlot;
        const palette = this.sectionPalette;
        palette.length = 0;

        for (let i = 0; i < BLOCKS_PER_SECTION; i++) {
            const blockId = blocks[i]!;
            let slot = slots[blockId]!;
            if (slot < 0) {
                slot = palette.length;
                slots[blockId] = slot;
                palette.push(blockId);
            }
            this.sectionIndices[i] = slot;
        }

        // reset only the slots this section touched, so the table stays reusable
        for (const blockId of palette) slots[blockId] = -1;
    }

    /**
     * The chunk's biome palette, plus the 4x4x4 cell indices every section shares. This
     * generator's biomes do not vary with height, so one index array serves all
     * sections of the chunk.
     */
    private buildBiomePalette(chunk: ChunkData): BiomeDefinition[] {
        const palette: BiomeDefinition[] = [];
        const cellSlots = new Int32Array(16);

        for (let cell = 0; cell < 16; cell++) {
            const biome = chunk.biomeCells[cell]!;
            let slot = palette.indexOf(biome);
            if (slot < 0) {
                slot = palette.length;
                palette.push(biome);
            }
            cellSlots[cell] = slot;
        }

        // the reader indexes biome cells as `by * 16 + bz * 4 + bx`
        for (let by = 0; by < 4; by++) {
            for (let cell = 0; cell < 16; cell++) {
                this.biomeIndices[by * 16 + cell] = cellSlots[cell]!;
            }
        }

        return palette;
    }

    /**
     * The sky-light nibbles of a section: 15 above the column's topmost block, 0 at and
     * below it.
     *
     * This is a straight vertical cast rather than a real light propagation, so light
     * does not bleed sideways under an overhang and water is not attenuated with depth.
     * It is stated plainly in the package README; a synthetic test world needs the
     * arrays to be present and plausible, not physically exact.
     */
    private buildSkyLight(chunk: ChunkData, sectionY: number): Int8Array {
        const sectionBottom = sectionY * 16;
        const sectionTop = sectionBottom + 15;

        let lowestSurface = chunk.surfaceY[0]!;
        let highestSurface = lowestSurface;
        for (let i = 1; i < VALUES_PER_HEIGHTMAP; i++) {
            const surface = chunk.surfaceY[i]!;
            if (surface < lowestSurface) lowestSurface = surface;
            if (surface > highestSurface) highestSurface = surface;
        }

        if (sectionBottom > highestSurface) return FULL_SKYLIGHT;
        if (sectionTop <= lowestSurface) return NO_SKYLIGHT;

        const skyLight = new Int8Array(2048);
        for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
                const surface = chunk.surfaceY[columnIndex(x, z)]!;
                for (let y = Math.max(sectionBottom, surface + 1); y <= sectionTop; y++) {
                    const index = blockIndex(x, y, z);
                    const byteIndex = index >> 1;
                    const shift = (index & 1) === 0 ? 0 : 4;
                    skyLight[byteIndex] = skyLight[byteIndex]! | (15 << shift);
                }
            }
        }
        return skyLight;
    }
}

import type { BiomeDefinition } from "./biomes.js";
import type { BlockRegistry } from "./blocks.js";
import { BLOCKS_PER_SECTION, MAX_SECTION, MIN_SECTION } from "./version.js";

/** index of a block inside a section: y-major, then z, then x (the anvil order) */
export function blockIndex(x: number, y: number, z: number): number {
    return ((y & 0xf) << 8) | ((z & 0xf) << 4) | (x & 0xf);
}

/** index of a column inside a chunk (the heightmap order) */
export function columnIndex(x: number, z: number): number {
    return ((z & 0xf) << 4) | (x & 0xf);
}

/**
 * The generated block-data of one chunk, before it is turned into NBT.
 *
 * Sections are allocated lazily; a section that was never written stays `null` and is
 * simply not emitted, which is how the vast empty air above the terrain costs nothing.
 *
 * Sections may also be *shared*: the deepslate slabs below y=0 are identical in every
 * chunk, so one prototype array is handed to every chunk instead of being rebuilt
 * 3969 times. Writing into a shared section (an ore blob, for example) copies it
 * first, so a chunk can never corrupt its neighbours through the prototype.
 */
export class ChunkData {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly registry: BlockRegistry;

    private readonly sections: (Uint16Array | null)[];
    private readonly shared: boolean[];

    /** biome of each 4x4 column-cell of this chunk, indexed `bz * 4 + bx` */
    readonly biomeCells: BiomeDefinition[];

    /** highest non-air y of each column (including water and leaves), or `MIN_Y - 1` */
    readonly surfaceY: Int32Array;

    /** highest non-air, non-water y of each column, or `MIN_Y - 1` */
    readonly floorY: Int32Array;

    constructor(chunkX: number, chunkZ: number, registry: BlockRegistry) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.registry = registry;

        const sectionCount = MAX_SECTION - MIN_SECTION + 1;
        this.sections = new Array<Uint16Array | null>(sectionCount).fill(null);
        this.shared = new Array<boolean>(sectionCount).fill(false);

        this.biomeCells = new Array<BiomeDefinition>(16);
        this.surfaceY = new Int32Array(256);
        this.floorY = new Int32Array(256);
    }

    /** the block-ids of a section, or null when the section is entirely air */
    section(sectionY: number): Uint16Array | null {
        const index = sectionY - MIN_SECTION;
        if (index < 0 || index >= this.sections.length) return null;
        return this.sections[index] ?? null;
    }

    /** every section-y that carries blocks, ascending */
    sectionYs(): number[] {
        const result: number[] = [];
        for (let i = 0; i < this.sections.length; i++) {
            if (this.sections[i] != null) result.push(i + MIN_SECTION);
        }
        return result;
    }

    /**
     * Installs a prototype section shared with other chunks. It is copied on the first
     * write, so callers must never mutate the array they passed in.
     */
    setSharedSection(sectionY: number, blocks: Uint16Array): void {
        const index = sectionY - MIN_SECTION;
        if (index < 0 || index >= this.sections.length) return;
        this.sections[index] = blocks;
        this.shared[index] = true;
    }

    /** the writable block-array of a section, allocating or un-sharing it as needed */
    sectionForWrite(sectionY: number): Uint16Array {
        const index = sectionY - MIN_SECTION;
        if (index < 0 || index >= this.sections.length)
            throw new RangeError("Section-y out of world: " + sectionY);

        let blocks = this.sections[index];
        if (blocks == null) {
            blocks = new Uint16Array(BLOCKS_PER_SECTION);
            this.sections[index] = blocks;
            this.shared[index] = false;
        } else if (this.shared[index] === true) {
            blocks = new Uint16Array(blocks);
            this.sections[index] = blocks;
            this.shared[index] = false;
        }
        return blocks;
    }

    /** sets one block by its chunk-local x/z and absolute y */
    setBlock(localX: number, y: number, localZ: number, blockId: number): void {
        this.sectionForWrite(y >> 4)[blockIndex(localX, y, localZ)] = blockId;
    }

    /** the block-id at a chunk-local x/z and absolute y (0 = air) */
    getBlockId(localX: number, y: number, localZ: number): number {
        const section = this.section(y >> 4);
        if (section === null) return 0;
        return section[blockIndex(localX, y, localZ)]!;
    }

    /** the block-state string at a chunk-local x/z and absolute y */
    getBlockState(localX: number, y: number, localZ: number): string {
        return this.registry.blockState(this.getBlockId(localX, y, localZ));
    }

    /** the biome of a chunk-local column */
    getBiome(localX: number, localZ: number): BiomeDefinition {
        return this.biomeCells[((localZ & 0xf) >> 2) * 4 + ((localX & 0xf) >> 2)]!;
    }
}

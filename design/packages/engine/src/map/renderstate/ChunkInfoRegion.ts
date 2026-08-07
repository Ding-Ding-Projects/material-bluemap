import { INT_ARRAY_ADAPTER, TypeToken, type ObjectSchema } from "@worldlens/nbt";
import type { Cell } from "./CellStorage.js";

/**
 * upstream: {@code MapChunkState.SHIFT} (a package-private static this file imports
 * statically); it lives here in the port to keep the module graph acyclic, and
 * {@code MapChunkState.SHIFT} re-exports it. See the same note on `TileInfoRegion`.
 */
export const SHIFT = 7;

export const REGION_LENGTH = 1 << SHIFT;
export const REGION_MASK = REGION_LENGTH - 1;
export const CHUNKS_PER_REGION = REGION_LENGTH * REGION_LENGTH;

export const CHUNK_INFO_REGION_TOKEN: TypeToken<ChunkInfoRegion> = TypeToken.of("ChunkInfoRegion");

/** upstream: map/renderstate/ChunkInfoRegion.java */
export class ChunkInfoRegion implements Cell {
    /**
     * upstream: {@code @NBTName("chunk-hashes") private int[] chunkHashes} — public here
     * so the nbt-schema can assign it (see the note on `TileInfoRegion`).
     */
    chunkHashes: Int32Array | null = null;

    /** upstream: {@code @Getter private transient boolean modified} */
    private modified = false;

    private constructor() {}

    /** upstream: the {@code @NBTPostDeserialize}-annotated {@code init()} */
    init(): void {
        if (this.chunkHashes == null || this.chunkHashes.length !== CHUNKS_PER_REGION)
            this.chunkHashes = new Int32Array(CHUNKS_PER_REGION);
    }

    isModified(): boolean {
        return this.modified;
    }

    get(x: number, z: number): number {
        return this.chunkHashes![ChunkInfoRegion.index(x, z)]!;
    }

    set(x: number, z: number, hash: number): number {
        const index = ChunkInfoRegion.index(x, z);
        const previous = this.chunkHashes![index]!;

        this.chunkHashes![index] = hash;

        if (previous !== hash) this.modified = true;

        return previous;
    }

    private static index(x: number, z: number): number {
        return (((z & REGION_MASK) << SHIFT) | (x & REGION_MASK)) | 0;
    }

    static create(): ChunkInfoRegion {
        const region = new ChunkInfoRegion();
        region.init();
        return region;
    }

    /** Port addition: the explicit nbt-schema replacing upstream's field-reflection */
    static readonly SCHEMA: ObjectSchema<ChunkInfoRegion> = {
        create: () => new ChunkInfoRegion(),
        fields: {
            chunkHashes: { names: ["chunk-hashes"], type: INT_ARRAY_ADAPTER },
        },
        postDeserialize: (region) => region.init(),
    };
}

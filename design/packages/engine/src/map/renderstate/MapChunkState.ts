import type { GridStorage } from "../../storage/GridStorage.js";
import { CellStorage } from "./CellStorage.js";
import { CHUNK_INFO_REGION_TOKEN, ChunkInfoRegion, SHIFT } from "./ChunkInfoRegion.js";

/** upstream: map/renderstate/MapChunkState.java */
export class MapChunkState extends CellStorage<ChunkInfoRegion> {
    /** upstream: {@code static final int SHIFT = 7} — declared in `ChunkInfoRegion` here, see the note there */
    static readonly SHIFT = SHIFT;

    constructor(storage: GridStorage) {
        super(storage, CHUNK_INFO_REGION_TOKEN);
    }

    async get(x: number, z: number): Promise<number> {
        return (await this.cell(x >> SHIFT, z >> SHIFT)).get(x, z);
    }

    /** upstream: synchronized */
    async set(x: number, z: number, hash: number): Promise<number> {
        return (await this.cell(x >> SHIFT, z >> SHIFT)).set(x, z, hash);
    }

    protected override createNewCell(): ChunkInfoRegion {
        return ChunkInfoRegion.create();
    }
}

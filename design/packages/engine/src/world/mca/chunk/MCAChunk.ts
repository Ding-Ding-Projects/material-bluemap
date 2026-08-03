import {
    INT,
    TypeToken,
    type BlueNBT,
    type FieldsSchema,
    type ObjectSchema,
} from "@material-bluemap/nbt";
import type { Key } from "@material-bluemap/shared";
import type { BlockEntity } from "../../BlockEntity.js";
import type { BlockState } from "../../BlockState.js";
import { Chunk } from "../../Chunk.js";
import type { MCAWorld } from "../MCAWorld.js";

// (upstream: protected static fields on MCAChunk — module-consts so the top-level
// ported Data classes can share them)
export const BLOCKS_PER_SECTION: number = 16 * 16 * 16;
export const BIOMES_PER_SECTION: number = 4 * 4 * 4;
export const VALUES_PER_HEIGHTMAP: number = 16 * 16;

export const EMPTY_BYTE_ARRAY: Int8Array = new Int8Array(0);
export const EMPTY_INT_ARRAY: Int32Array = new Int32Array(0);
export const EMPTY_LONG_ARRAY: BigInt64Array = new BigInt64Array(0);
export const EMPTY_KEY_ARRAY: Key[] = [];
export const EMPTY_BLOCKSTATE_ARRAY: BlockState[] = [];
export const EMPTY_BLOCK_ENTITIES_ARRAY: (BlockEntity | null)[] = [];

export const MCA_CHUNK_DATA_TOKEN: TypeToken<MCAChunkData> = TypeToken.of("MCAChunk.Data");

/** upstream: MCAChunk.Data */
export class MCAChunkData {
    dataVersion = 0; // @NBTName("DataVersion")

    getDataVersion(): number {
        return this.dataVersion;
    }
}

/** shared base-fields for schemas of MCAChunk.Data subclasses (upstream: inherited fields) */
export const MCA_CHUNK_DATA_FIELDS = {
    dataVersion: { names: ["DataVersion"], type: INT },
} as const satisfies FieldsSchema<MCAChunkData>;

const MCA_CHUNK_DATA_SCHEMA: ObjectSchema<MCAChunkData> = {
    create: () => new MCAChunkData(),
    fields: MCA_CHUNK_DATA_FIELDS,
};

export function registerMCAChunkSchemas(nbt: BlueNBT): void {
    nbt.register(MCA_CHUNK_DATA_TOKEN, MCA_CHUNK_DATA_SCHEMA);
}

export abstract class MCAChunk extends Chunk {
    static readonly Data = MCAChunkData;

    private readonly world: MCAWorld;
    private readonly dataVersion: number;

    constructor(world: MCAWorld, chunkData: MCAChunkData) {
        super();
        this.world = world;
        this.dataVersion = chunkData.getDataVersion();
    }

    getWorld(): MCAWorld {
        return this.world;
    }

    getDataVersion(): number {
        return this.dataVersion;
    }

    override toString(): string {
        return `${this.constructor.name}(dataVersion=${this.dataVersion})`;
    }
}

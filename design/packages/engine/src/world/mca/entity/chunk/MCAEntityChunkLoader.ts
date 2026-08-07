import { IOException } from "@worldlens/nbt";
import type { Compression } from "../../../../storage/compression/Compression.js";
import type { ChunkLoader } from "../../ChunkLoader.js";
import { MCAUtil } from "../../MCAUtil.js";
import { MCAEntityChunk, MCA_ENTITY_CHUNK_TOKEN } from "./MCAEntityChunk.js";

export class MCAEntityChunkLoader implements ChunkLoader<MCAEntityChunk> {
    async load(
        data: Uint8Array,
        offset: number,
        length: number,
        compression: Compression,
    ): Promise<MCAEntityChunk> {
        const decompressed = await compression.decompress(data.subarray(offset, offset + length));
        try {
            return MCAUtil.BLUENBT.read(decompressed, MCA_ENTITY_CHUNK_TOKEN);
        } catch (e) {
            throw new IOException(`Failed to parse chunk-data (MCAEntityChunk): ${String(e)}`, {
                cause: e,
            });
        }
    }

    emptyChunk(): MCAEntityChunk {
        return MCAEntityChunk.EMPTY_CHUNK;
    }

    erroredChunk(): MCAEntityChunk {
        return MCAEntityChunk.ERRORED_CHUNK;
    }
}

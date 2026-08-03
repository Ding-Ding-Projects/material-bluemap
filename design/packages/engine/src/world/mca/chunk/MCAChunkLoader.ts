import { IOException, type TypeToken } from "@material-bluemap/nbt";
import type { Compression } from "../../../storage/compression/Compression.js";
import { Chunk } from "../../Chunk.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { MCAUtil } from "../MCAUtil.js";
import type { MCAWorld } from "../MCAWorld.js";
import { MCAChunk, MCAChunkData } from "./MCAChunk.js";
import { Chunk_1_13, CHUNK_1_13_DATA_TOKEN } from "./Chunk_1_13.js";
import { Chunk_1_15 } from "./Chunk_1_15.js";
import { Chunk_1_16, CHUNK_1_16_DATA_TOKEN } from "./Chunk_1_16.js";
import { Chunk_1_18, CHUNK_1_18_DATA_TOKEN } from "./Chunk_1_18.js";
// the legacy 1.12 chunk-format (ported from the v0.10.3-mc1.12 sources)
import { Chunk_1_12, CHUNK_1_12_DATA_TOKEN } from "./Chunk_1_12.js";

/** what a version-loader needs from a loaded chunk (MCAChunk and the legacy Chunk_1_12) */
type VersionedChunk = Chunk & { getDataVersion(): number };

/** upstream: MCAChunkLoader.ChunkVersionLoader (with the generics erased into an interface) */
interface VersionLoader {
    load(world: MCAWorld, data: Uint8Array): VersionedChunk;

    mightSupport(dataVersion: number): boolean;
}

class ChunkVersionLoader<D extends { dataVersion: number }> implements VersionLoader {
    constructor(
        private readonly dataType: TypeToken<D>,
        private readonly chunkConstructor: (world: MCAWorld, data: D) => VersionedChunk,
        private readonly dataVersion: number,
    ) {}

    load(world: MCAWorld, data: Uint8Array): VersionedChunk {
        try {
            const chunkData = MCAUtil.BLUENBT.read(data, this.dataType);
            if (this.mightSupport(chunkData.dataVersion))
                return this.chunkConstructor(world, chunkData);
            // upstream: new MCAChunk(world, data) {}
            const baseData = new MCAChunkData();
            baseData.dataVersion = chunkData.dataVersion;
            return new (class extends MCAChunk {})(world, baseData);
        } catch (e) {
            throw new IOException(
                `Failed to parse chunk-data (${this.dataType.identifier}): ${String(e)}`,
                { cause: e },
            );
        }
    }

    mightSupport(dataVersion: number): boolean {
        return dataVersion >= this.dataVersion;
    }
}

// sorted list of chunk-versions, loaders at the start of the list are preferred over loaders at the end
// (deviation from upstream e664c1a: the Chunk_1_13 floor is raised from 0 to 1344 so that
// DataVersions <= 1343 — or chunks without a DataVersion — dispatch to the legacy Chunk_1_12)
// prettier-ignore
const CHUNK_VERSION_LOADERS: readonly VersionLoader[] = [
    new ChunkVersionLoader(CHUNK_1_18_DATA_TOKEN, (world, data) => new Chunk_1_18(world, data), 2844),
    new ChunkVersionLoader(CHUNK_1_16_DATA_TOKEN, (world, data) => new Chunk_1_16(world, data), 2500),
    // upstream: Chunk_1_15.Data resolves to the inherited Chunk_1_13.Data
    new ChunkVersionLoader(CHUNK_1_13_DATA_TOKEN, (world, data) => new Chunk_1_15(world, data), 2200),
    new ChunkVersionLoader(CHUNK_1_13_DATA_TOKEN, (world, data) => new Chunk_1_13(world, data), 1344),
    new ChunkVersionLoader(CHUNK_1_12_DATA_TOKEN, (world, data) => new Chunk_1_12(world, data), 0),
];

export class MCAChunkLoader implements ChunkLoader<Chunk> {
    private readonly world: MCAWorld;

    private lastUsedLoader: VersionLoader = CHUNK_VERSION_LOADERS[0]!;

    constructor(world: MCAWorld) {
        this.world = world;
    }

    async load(
        data: Uint8Array,
        offset: number,
        length: number,
        compression: Compression,
    ): Promise<Chunk> {
        const decompressed = await compression.decompress(data.subarray(offset, offset + length));

        // try last used version
        const usedLoader = this.lastUsedLoader;
        let chunk = usedLoader.load(this.world, decompressed);

        // check version and reload chunk if the wrong loader has been used and a better one has been found
        const actualLoader = this.findBestLoaderForVersion(chunk.getDataVersion());
        if (actualLoader != null && usedLoader !== actualLoader) {
            // upstream resets the compressed stream and decompresses again; the
            // decompressed data is already buffered here
            chunk = actualLoader.load(this.world, decompressed);
            this.lastUsedLoader = actualLoader;
        }

        return chunk;
    }

    emptyChunk(): Chunk {
        return Chunk.EMPTY_CHUNK;
    }

    erroredChunk(): Chunk {
        return Chunk.ERRORED_CHUNK;
    }

    private findBestLoaderForVersion(version: number): VersionLoader | null {
        for (const loader of CHUNK_VERSION_LOADERS) {
            if (loader.mightSupport(version)) return loader;
        }
        return null;
    }
}

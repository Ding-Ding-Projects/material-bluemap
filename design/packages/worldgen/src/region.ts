import { open, type FileHandle } from "node:fs/promises";
import { deflateSync } from "node:zlib";

/** bytes in one region-file sector */
const SECTOR_SIZE = 4096;
/** the offset/timestamp tables at the head of a region-file */
const HEADER_SECTORS = 2;
/** the chunk-compression id for zlib, which is what this project's reader expects */
const COMPRESSION_ZLIB = 2;

/**
 * Every chunk gets the same fixed modification timestamp. A real timestamp would be
 * the one thing making two generations of the same seed differ, and nothing reads it.
 */
const CHUNK_TIMESTAMP = 1;

/** region-file coordinates of the region a chunk belongs to */
export function regionOf(chunkCoordinate: number): number {
    return chunkCoordinate >> 5;
}

/** the conventional file name of a region */
export function regionFileName(regionX: number, regionZ: number): string {
    return "r." + regionX + "." + regionZ + ".mca";
}

/**
 * Writes one `.mca` region-file: an 8 KiB header of 1024 offset entries followed by
 * 1024 timestamps, then the chunk payloads, each padded out to a whole number of 4 KiB
 * sectors.
 *
 * Chunks are streamed straight to disk as they are generated and the header is written
 * last, so a whole region never has to be held in memory at once.
 */
export class RegionFileWriter {
    private readonly handle: FileHandle;
    private readonly header: Buffer;
    private nextSector = HEADER_SECTORS;
    private chunkCount = 0;

    private constructor(handle: FileHandle) {
        this.handle = handle;
        this.header = Buffer.alloc(SECTOR_SIZE * HEADER_SECTORS);
    }

    static async create(path: string): Promise<RegionFileWriter> {
        return new RegionFileWriter(await open(path, "w"));
    }

    /** appends one chunk; `chunkX`/`chunkZ` are world chunk coordinates */
    async addChunk(chunkX: number, chunkZ: number, nbt: Uint8Array): Promise<void> {
        const compressed = deflateSync(nbt);

        const payloadLength = 5 + compressed.length;
        const sectorCount = Math.ceil(payloadLength / SECTOR_SIZE);
        if (sectorCount > 255)
            throw new Error(
                "Chunk (" +
                    chunkX +
                    ", " +
                    chunkZ +
                    ") needs " +
                    sectorCount +
                    " sectors; the region header can only address 255. " +
                    "Oversized chunks (.mcc side-files) are not implemented.",
            );

        const sector = Buffer.alloc(sectorCount * SECTOR_SIZE);
        sector.writeInt32BE(compressed.length + 1, 0);
        sector.writeUInt8(COMPRESSION_ZLIB, 4);
        compressed.copy(sector, 5);

        await this.handle.write(sector, 0, sector.length, this.nextSector * SECTOR_SIZE);

        const slot = ((chunkZ & 0b11111) << 5) | (chunkX & 0b11111);
        this.header.writeUIntBE(this.nextSector, slot * 4, 3);
        this.header.writeUInt8(sectorCount, slot * 4 + 3);
        this.header.writeInt32BE(CHUNK_TIMESTAMP, SECTOR_SIZE + slot * 4);

        this.nextSector += sectorCount;
        this.chunkCount++;
    }

    /** writes the header and closes the file, returning its total size in bytes */
    async close(): Promise<number> {
        await this.handle.write(this.header, 0, this.header.length, 0);
        await this.handle.close();
        return this.nextSector * SECTOR_SIZE;
    }

    getChunkCount(): number {
        return this.chunkCount;
    }
}

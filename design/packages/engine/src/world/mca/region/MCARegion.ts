import { existsSync } from "node:fs";
import { open, readFile, stat, type FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { IOException } from "@material-bluemap/nbt";
import { Vector2i } from "@material-bluemap/shared";
import { Compression } from "../../../storage/compression/Compression.js";
import type { ChunkConsumer } from "../../ChunkConsumer.js";
import { Region } from "../../Region.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { javaParseInt } from "../MCAUtil.js";

export class MCARegion<T> extends Region<T> {
    static readonly FILE_SUFFIX: string = ".mca";
    static readonly FILE_PATTERN: RegExp = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

    static readonly CHUNK_COMPRESSION_MAP: (Compression | undefined)[] = new Array<
        Compression | undefined
    >(255);
    static {
        MCARegion.CHUNK_COMPRESSION_MAP[0] = Compression.NONE;
        MCARegion.CHUNK_COMPRESSION_MAP[1] = Compression.GZIP;
        MCARegion.CHUNK_COMPRESSION_MAP[2] = Compression.DEFLATE;
        MCARegion.CHUNK_COMPRESSION_MAP[3] = Compression.NONE;
        MCARegion.CHUNK_COMPRESSION_MAP[4] = Compression.LZ4;
    }

    private readonly regionFile: string;
    private readonly chunkLoader: ChunkLoader<T>;
    private readonly regionPos: Vector2i;

    constructor(chunkLoader: ChunkLoader<T>, regionFile: string) {
        super();
        this.chunkLoader = chunkLoader;
        this.regionFile = regionFile;

        const filenameParts = basename(regionFile).split(".");
        const rX = javaParseInt(filenameParts[1] ?? "");
        const rZ = javaParseInt(filenameParts[2] ?? "");

        this.regionPos = new Vector2i(rX, rZ);
    }

    getRegionFile(): string {
        return this.regionFile;
    }

    getChunkLoader(): ChunkLoader<T> {
        return this.chunkLoader;
    }

    getRegionPos(): Vector2i {
        return this.regionPos;
    }

    override async loadChunk(chunkX: number, chunkZ: number): Promise<T> {
        if (!existsSync(this.regionFile)) return this.chunkLoader.emptyChunk();

        const fileLength = (await stat(this.regionFile)).size;
        if (fileLength === 0) return this.chunkLoader.emptyChunk();

        let channel: FileHandle | null = null;
        try {
            channel = await open(this.regionFile, "r");
            const xzChunk = ((chunkZ & 0b11111) << 5) | (chunkX & 0b11111);

            const header = Buffer.alloc(4);
            await readFully(channel, header, 0, 4, xzChunk * 4);

            let offset = (header[0]! & 0xff) << 16;
            offset |= (header[1]! & 0xff) << 8;
            offset |= header[2]! & 0xff;
            offset *= 4096;
            const size = (header[3]! & 0xff) * 4096;

            if (size <= 0) return this.chunkLoader.emptyChunk();

            const chunkDataBuffer = Buffer.alloc(size);

            await readFully(channel, chunkDataBuffer, 0, size, offset);

            return await this.loadChunkData(chunkX, chunkZ, chunkDataBuffer, size);
        } catch (ex) {
            throw new IOException(
                `Exception trying to read chunk (${chunkX},${chunkZ}) from region '${this.regionFile}': ${String(ex)}`,
                { cause: ex },
            );
        } finally {
            if (channel != null) await channel.close();
        }
    }

    override async iterateAllChunks(consumer: ChunkConsumer<T>): Promise<void> {
        if (!existsSync(this.regionFile)) return;

        const fileLength = (await stat(this.regionFile)).size;
        if (fileLength === 0) return;

        const chunkStartX = this.regionPos.getX() * 32;
        const chunkStartZ = this.regionPos.getY() * 32;

        let channel: FileHandle | null = null;
        try {
            channel = await open(this.regionFile, "r");
            const header = Buffer.alloc(1024 * 8);
            let chunkDataBuffer: Buffer | null = null;

            // read the header
            await readFully(channel, header, 0, header.length, 0);

            // iterate over all chunks
            for (let x = 0; x < 32; x++) {
                for (let z = 0; z < 32; z++) {
                    const xzChunk = ((z & 0b11111) << 5) | (x & 0b11111);

                    const size = (header[xzChunk * 4 + 3]! & 0xff) * 4096;
                    if (size <= 0) continue;

                    const chunkX = chunkStartX + x;
                    const chunkZ = chunkStartZ + z;

                    let i = xzChunk * 4 + 4096;
                    let timestamp = header[i++]! << 24;
                    timestamp |= (header[i++]! & 0xff) << 16;
                    timestamp |= (header[i++]! & 0xff) << 8;
                    timestamp |= header[i]! & 0xff;

                    // load chunk only if consumers filter returns true
                    if (
                        consumer.filter === undefined ||
                        consumer.filter(chunkX, chunkZ, timestamp)
                    ) {
                        i = xzChunk * 4;
                        let offset = (header[i++]! & 0xff) << 16;
                        offset |= (header[i++]! & 0xff) << 8;
                        offset |= header[i]! & 0xff;
                        offset *= 4096;

                        if (chunkDataBuffer == null || chunkDataBuffer.length < size)
                            chunkDataBuffer = Buffer.alloc(size);

                        await readFully(channel, chunkDataBuffer, 0, size, offset);

                        try {
                            const chunk = await this.loadChunkData(
                                chunkX,
                                chunkZ,
                                chunkDataBuffer,
                                size,
                            );
                            consumer.accept(chunkX, chunkZ, chunk);
                        } catch (ex) {
                            const exception =
                                ex instanceof IOException
                                    ? ex
                                    : new IOException(String(ex), { cause: ex });
                            // (upstream interface-default for fail: rethrow)
                            if (consumer.fail !== undefined)
                                consumer.fail(chunkX, chunkZ, exception);
                            else throw exception;
                        }
                    }
                }
            }
        } catch (ex) {
            throw new IOException(
                `Exception trying to iterate chunks in region '${this.regionFile}': ${String(ex)}`,
                { cause: ex },
            );
        } finally {
            if (channel != null) await channel.close();
        }
    }

    override emptyChunk(): T {
        return this.chunkLoader.emptyChunk();
    }

    override exists(): boolean {
        return existsSync(this.regionFile);
    }

    /** upstream: the private loadChunk(chunkX, chunkZ, data, size) overload */
    private async loadChunkData(
        chunkX: number,
        chunkZ: number,
        data: Uint8Array,
        size: number,
    ): Promise<T> {
        let compressionTypeId = data[4]!; // Byte.toUnsignedInt(data[4])
        let offset = 5;
        size -= 5;

        // oversized chunks
        if (compressionTypeId > 127) {
            compressionTypeId -= 128;
            const chunkFile = join(dirname(this.regionFile), `c.${chunkX}.${chunkZ}.mcc`);
            data = await readFile(chunkFile);
            offset = 0;
            size = data.length;
        }

        const compression = MCARegion.CHUNK_COMPRESSION_MAP[compressionTypeId];
        if (compression == null)
            throw new IOException("Unknown chunk compression-id: " + compressionTypeId);

        return this.chunkLoader.load(data, offset, size, compression);
    }

    static getRegionFileName(regionX: number, regionZ: number): string {
        return "r." + regionX + "." + regionZ + MCARegion.FILE_SUFFIX;
    }
}

/**
 * Reads exactly `len` bytes from `position` into dst[off..off+len); if the file ends
 * early, the remaining bytes are zeroed out (upstream: readFully's zero-fill on EOF).
 */
async function readFully(
    src: FileHandle,
    dst: Buffer,
    off: number,
    len: number,
    position: number,
): Promise<void> {
    const limit = off + len;
    if (limit > dst.length) throw new RangeError("buffer too small");

    let cursor = off;
    while (cursor < limit) {
        const { bytesRead } = await src.read(
            dst,
            cursor,
            limit - cursor,
            position + (cursor - off),
        );
        if (bytesRead <= 0) {
            // zero out all the remaining data from the buffer
            dst.fill(0, cursor, limit);
            return;
        }
        cursor += bytesRead;
    }
}

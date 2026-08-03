import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { IOException } from "@material-bluemap/nbt";
import { Vector2i } from "@material-bluemap/shared";
import { Compression } from "../../../storage/compression/Compression.js";
import type { ChunkConsumer } from "../../ChunkConsumer.js";
import { Region } from "../../Region.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { javaParseInt } from "../MCAUtil.js";

/*
 * LinearFormat:
 *
 *  REGION-FILE:
 *   8 byte - MAGIC value
 *   1 byte - version
 *   8 byte - region timestamp
 *   1 byte - compression level
 *   2 byte - chunk count
 *   4 byte - data-length in bytes
 *   8 byte - data-hash
 *   ? byte - data
 *   8 byte - MAGIC value
 *
 *  DATA: (zstd compressed)
 *   32 * 32 * 8 - header:
 *    4 byte - chunk-data-length
 *    4 byte - timestamp
 *   ? - chunks
 *
 */

const MAGIC = 0xc3ff13183cca9d9an;

export class LinearRegion<T> extends Region<T> {
    static readonly FILE_SUFFIX: string = ".linear";
    static readonly FILE_PATTERN: RegExp = /^r\.(-?\d+)\.(-?\d+)\.linear$/;

    private readonly chunkLoader: ChunkLoader<T>;
    private readonly regionFile: string;
    private readonly regionPos: Vector2i;

    private initialized = false;

    private version = 0;
    private newestTimestamp = 0n;
    private compressionLevel = 0;
    private chunkCount = 0;
    private dataLength = 0;
    private dataHash = 0n;
    private compressedData: Uint8Array = new Uint8Array(0);

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

    getVersion(): number {
        return this.version;
    }

    getNewestTimestamp(): bigint {
        return this.newestTimestamp;
    }

    getCompressionLevel(): number {
        return this.compressionLevel;
    }

    getChunkCount(): number {
        return this.chunkCount;
    }

    getDataLength(): number {
        return this.dataLength;
    }

    getDataHash(): bigint {
        return this.dataHash;
    }

    private async init(): Promise<void> {
        if (this.initialized) return;

        if (!existsSync(this.regionFile)) return;

        const fileLength = (await stat(this.regionFile)).size;
        if (fileLength === 0) return;

        const file = await readFile(this.regionFile);
        const view = new DataView(file.buffer, file.byteOffset, file.byteLength);

        if (file.length < 32 || view.getBigUint64(0) !== MAGIC)
            throw new IOException("Linear region-file format: invalid header magic");

        // read the header
        this.version = view.getInt8(8);
        this.newestTimestamp = view.getBigInt64(9);
        this.compressionLevel = view.getInt8(17);
        this.chunkCount = view.getInt16(18);
        this.dataLength = view.getInt32(20);
        this.dataHash = view.getBigInt64(24);

        if (this.version < 1 || this.version > 2)
            throw new IOException(
                "Linear region-file format: Unsupported version: " + this.version,
            );

        if (fileLength !== this.dataLength + 40)
            // 40 = header + footer
            throw new IOException(
                "Linear region-file format: Invalid file length. Expected " +
                    (this.dataLength + 40) +
                    " but got " +
                    fileLength,
            );

        this.compressedData = file.subarray(32, 32 + this.dataLength);

        if (view.getBigUint64(32 + this.dataLength) !== MAGIC)
            throw new IOException("Linear region-file format: invalid footer magic");

        this.initialized = true;
    }

    override async iterateAllChunks(consumer: ChunkConsumer<T>): Promise<void> {
        if (!this.initialized) await this.init();

        const chunkStartX = this.regionPos.getX() * 32;
        const chunkStartZ = this.regionPos.getY() * 32;

        const data = await Compression.ZSTD.decompress(this.compressedData);
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        const chunkDataLengths = new Int32Array(1024);
        const chunkTimestamps = new Int32Array(1024);
        for (let i = 0; i < 1024; i++) {
            chunkDataLengths[i] = view.getInt32(i * 8);
            chunkTimestamps[i] = view.getInt32(i * 8 + 4);
        }

        let i = 0;
        let toBeSkipped = 0;
        let position = 1024 * 8;
        for (let z = 0; z < 32; z++) {
            for (let x = 0; x < 32; x++) {
                const length = chunkDataLengths[i]!;
                if (length > 0) {
                    const chunkX = chunkStartX + x;
                    const chunkZ = chunkStartZ + z;
                    const timestamp =
                        this.version === 2
                            ? chunkTimestamps[i]!
                            : Number(BigInt.asIntN(32, this.newestTimestamp)); // TODO: check if in seconds or milliseconds

                    if (
                        consumer.filter === undefined ||
                        consumer.filter(chunkX, chunkZ, timestamp)
                    ) {
                        if (toBeSkipped > 0) {
                            position += toBeSkipped;
                            toBeSkipped = 0;
                        }

                        const chunkDataBuffer = data.subarray(position, position + length);
                        if (chunkDataBuffer.length < length)
                            throw new IOException("Stream ended prematurely");
                        position += length;

                        try {
                            const chunk = await this.chunkLoader.load(
                                chunkDataBuffer,
                                0,
                                length,
                                Compression.NONE,
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
                    } else {
                        // skip before reading the next chunk, but only if there is a next chunk
                        // that we actually want to read, to avoid decompressing unnecessary data
                        toBeSkipped += length;
                    }
                }

                i++;
            }
        }
    }

    override emptyChunk(): T {
        return this.chunkLoader.emptyChunk();
    }

    override exists(): boolean {
        return existsSync(this.regionFile);
    }

    static getRegionFileName(regionX: number, regionZ: number): string {
        return "r." + regionX + "." + regionZ + LinearRegion.FILE_SUFFIX;
    }
}

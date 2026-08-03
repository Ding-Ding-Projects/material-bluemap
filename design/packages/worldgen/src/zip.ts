import { open, readFile, type FileHandle } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";

/*
 * A small deterministic zip-writer (store + deflate, no zip64, no encryption).
 *
 * The engine has an equivalent in-memory builder for its pack fixtures
 * (`engine/src/resources/pack/vfs/zipTestUtil.ts`), but that one concatenates the whole
 * archive in memory and is test-support inside another package. This writer streams
 * each entry to the output file as it is added, so a world of several hundred megabytes
 * never has to exist twice at once, and it fixes the modification time so the same seed
 * produces the same archive bytes.
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** MS-DOS time/date for 1980-01-01 00:00, the earliest the format can express */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

/** zip without zip64 cannot address anything past this */
const MAX_ZIP_SIZE = 0xffffffff;

const CRC_TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

interface CentralEntry {
    nameBytes: Buffer;
    method: number;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
    directory: boolean;
}

export interface ZipEntryOptions {
    /** deflate level: 0 stores, 1 is fastest, 9 is smallest (node's zlib levels) */
    level?: number;
}

export class ZipWriter {
    private readonly handle: FileHandle;
    private readonly entries: CentralEntry[] = [];
    private offset = 0;

    private constructor(handle: FileHandle) {
        this.handle = handle;
    }

    static async create(path: string): Promise<ZipWriter> {
        return new ZipWriter(await open(path, "w"));
    }

    /** adds an explicit directory entry (the name gets a trailing slash) */
    async addDirectory(name: string): Promise<void> {
        const entryName = name.endsWith("/") ? name : name + "/";
        await this.writeEntry(entryName, Buffer.alloc(0), METHOD_STORE, Buffer.alloc(0), true);
    }

    /** adds a file entry from a buffer already in memory */
    async addBuffer(name: string, data: Buffer, options: ZipEntryOptions = {}): Promise<void> {
        const level = options.level ?? 6;
        if (level <= 0) {
            await this.writeEntry(name, data, METHOD_STORE, data, false);
            return;
        }
        const compressed = deflateRawSync(data, { level });
        // storing is better than a deflate that grew the data (tiny or already-packed files)
        if (compressed.length >= data.length) {
            await this.writeEntry(name, data, METHOD_STORE, data, false);
            return;
        }
        await this.writeEntry(name, data, METHOD_DEFLATE, compressed, false);
    }

    /** adds a file entry, reading its content from the given path */
    async addFile(name: string, sourcePath: string, options: ZipEntryOptions = {}): Promise<void> {
        await this.addBuffer(name, await readFile(sourcePath), options);
    }

    /** writes the central directory and closes the file, returning its size in bytes */
    async close(): Promise<number> {
        const centralParts: Buffer[] = [];
        for (const entry of this.entries) {
            const header = Buffer.alloc(46);
            header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
            header.writeUInt16LE(20, 4); // version made by
            header.writeUInt16LE(20, 6); // version needed to extract
            header.writeUInt16LE(0, 8); // general purpose bit flag
            header.writeUInt16LE(entry.method, 10);
            header.writeUInt16LE(DOS_TIME, 12);
            header.writeUInt16LE(DOS_DATE, 14);
            header.writeUInt32LE(entry.crc, 16);
            header.writeUInt32LE(entry.compressedSize, 20);
            header.writeUInt32LE(entry.uncompressedSize, 24);
            header.writeUInt16LE(entry.nameBytes.length, 28);
            header.writeUInt16LE(0, 30); // extra field length
            header.writeUInt16LE(0, 32); // file comment length
            header.writeUInt16LE(0, 34); // disk number start
            header.writeUInt16LE(0, 36); // internal file attributes
            header.writeUInt32LE(entry.directory ? 0x10 : 0, 38); // external file attributes
            header.writeUInt32LE(entry.localHeaderOffset, 42);
            centralParts.push(header, entry.nameBytes);
        }

        const centralDirectory = Buffer.concat(centralParts);
        const centralDirectoryOffset = this.offset;

        const end = Buffer.alloc(22);
        end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
        end.writeUInt16LE(0, 4); // disk number
        end.writeUInt16LE(0, 6); // central directory start disk
        end.writeUInt16LE(this.entries.length, 8);
        end.writeUInt16LE(this.entries.length, 10);
        end.writeUInt32LE(centralDirectory.length, 12);
        end.writeUInt32LE(centralDirectoryOffset, 16);
        end.writeUInt16LE(0, 20); // comment length

        await this.write(centralDirectory);
        await this.write(end);

        const size = this.offset;
        await this.handle.close();
        return size;
    }

    private async writeEntry(
        name: string,
        uncompressed: Buffer,
        method: number,
        payload: Buffer,
        directory: boolean,
    ): Promise<void> {
        const nameBytes = Buffer.from(name, "utf-8");
        const localHeaderOffset = this.offset;
        if (localHeaderOffset > MAX_ZIP_SIZE)
            throw new Error(
                "Archive exceeds 4 GiB at entry '" + name + "'; zip64 is not implemented",
            );

        const crc = crc32(uncompressed);

        const header = Buffer.alloc(30);
        header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
        header.writeUInt16LE(20, 4); // version needed to extract
        header.writeUInt16LE(0, 6); // general purpose bit flag
        header.writeUInt16LE(method, 8);
        header.writeUInt16LE(DOS_TIME, 10);
        header.writeUInt16LE(DOS_DATE, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(payload.length, 18);
        header.writeUInt32LE(uncompressed.length, 22);
        header.writeUInt16LE(nameBytes.length, 26);
        header.writeUInt16LE(0, 28); // extra field length

        await this.write(header);
        await this.write(nameBytes);
        if (payload.length > 0) await this.write(payload);

        this.entries.push({
            nameBytes,
            method,
            crc,
            compressedSize: payload.length,
            uncompressedSize: uncompressed.length,
            localHeaderOffset,
            directory,
        });
    }

    private async write(data: Buffer): Promise<void> {
        if (data.length === 0) return;
        await this.handle.write(data, 0, data.length, this.offset);
        this.offset += data.length;
    }
}

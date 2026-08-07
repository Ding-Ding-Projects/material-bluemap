/**
 * A minimal pure-JS random-access zip reader (store + deflate, Zip64-aware), used by
 * {@link ZipFileSystem} in place of `yauzl-promise`.
 *
 * ## Why this exists rather than the library
 *
 * `packages/app/src/main/download/zip.ts` documents the constraint this also has to
 * satisfy: `electron-builder.config.cjs` states that esbuild inlines every runtime
 * dependency reachable from the app's entry points, and no native `.node` module may
 * reach the packaged application. `yauzl-promise` depends on `@node-rs/crc32`, a native
 * N-API addon; esbuild has no loader for `.node` files, so bundling anything that
 * imports it fails the app's build outright — on every platform, not just CI's Linux
 * runner, since it is the platform-specific binary that gets resolved and esbuild
 * chokes on the binary regardless of which one it is.
 *
 * `@worldlens/engine` is reachable from that same bundle (via
 * `@worldlens/server`, which `packages/app` imports directly), so the native
 * dependency had to come out of here too, not just out of the app's own zip-reading
 * code. This mirrors `zip.ts`'s approach: parse the central directory directly and
 * decompress with `node:zlib`. It additionally supports reading from an in-memory
 * `Buffer` (needed for "jar-in-jar" fabric mods), which `zip.ts` does not need.
 *
 * The CRC-32 table/algorithm is the standard IEEE 802.3 one (every zip, PNG and gzip
 * implementation uses it), so this is byte-identical to what `@node-rs/crc32` computed —
 * verified by `ZipFileSystem.test.ts` reading real deflated and stored fixtures.
 */

import { open as openFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** The classic fields are 16 or 32 bits; these are the "look in Zip64" sentinels. */
const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;

/** A zip comment can be 64 KB, so the end record can be that far from the end. */
const MAX_END_SEARCH = 0xffff + 22;

export class ZipReadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ZipReadError";
    }
}

export interface ZipReaderEntry {
    readonly filename: string;
    readonly method: number;
    readonly crc32: number;
    readonly compressedSize: number;
    readonly uncompressedSize: number;
    readonly localHeaderOffset: number;
    readonly generalPurposeBitFlag: number;
}

/** Something `ZipReader` can pull an arbitrary byte-range out of. */
interface ByteSource {
    readonly size: number;
    read(buffer: Buffer, position: number): Promise<void>;
    close(): Promise<void>;
}

class FileByteSource implements ByteSource {
    readonly size: number;
    private readonly handle: FileHandle;

    private constructor(handle: FileHandle, size: number) {
        this.handle = handle;
        this.size = size;
    }

    static async open(osPath: string): Promise<FileByteSource> {
        const handle = await openFile(osPath, "r");
        try {
            const size = (await handle.stat()).size;
            return new FileByteSource(handle, size);
        } catch (error) {
            await handle.close().catch(() => undefined);
            throw error;
        }
    }

    async read(buffer: Buffer, position: number): Promise<void> {
        let read = 0;
        while (read < buffer.length) {
            const result = await this.handle.read(
                buffer,
                read,
                buffer.length - read,
                position + read,
            );
            if (result.bytesRead <= 0) {
                throw new ZipReadError(
                    `The archive ended after ${String(position + read)} bytes, before the index it points at.`,
                );
            }
            read += result.bytesRead;
        }
    }

    async close(): Promise<void> {
        await this.handle.close();
    }
}

class BufferByteSource implements ByteSource {
    private readonly data: Buffer;

    constructor(data: Buffer) {
        this.data = data;
    }

    get size(): number {
        return this.data.length;
    }

    async read(buffer: Buffer, position: number): Promise<void> {
        if (position < 0 || position + buffer.length > this.data.length) {
            throw new ZipReadError(
                `The archive ended after ${String(this.data.length)} bytes, before the index it points at.`,
            );
        }
        this.data.copy(buffer, 0, position, position + buffer.length);
    }

    async close(): Promise<void> {
        // nothing to release for an in-memory buffer
    }
}

/** Reads a zip's central directory once, then decompresses entries on demand. */
export class ZipReader {
    private readonly source: ByteSource;
    private readonly records: readonly ZipReaderEntry[];

    private constructor(source: ByteSource, records: readonly ZipReaderEntry[]) {
        this.source = source;
        this.records = records;
    }

    /** opens a zip-file from the OS file-system */
    static async openFile(osPath: string): Promise<ZipReader> {
        return ZipReader.index(await FileByteSource.open(osPath));
    }

    /** opens a zip-file held in memory (e.g. a zip nested inside another zip) */
    static async fromBuffer(buffer: Buffer): Promise<ZipReader> {
        return ZipReader.index(new BufferByteSource(buffer));
    }

    private static async index(source: ByteSource): Promise<ZipReader> {
        try {
            const end = await readEndRecord(source);
            const central = Buffer.allocUnsafe(end.centralDirectorySize);
            await source.read(central, end.centralDirectoryOffset);
            return new ZipReader(source, parseCentralDirectory(central, end.entryCount));
        } catch (error) {
            await source.close().catch(() => undefined);
            throw error;
        }
    }

    entries(): readonly ZipReaderEntry[] {
        return this.records;
    }

    /**
     * The entry's decompressed bytes, checked against its recorded CRC-32 and size — the
     * archive itself has already been checked against its published hash by the time
     * anything gets here (see `zip.ts`), so this is the second of two independent checks
     * rather than the only one, but it is what catches a decompressor that went wrong
     * rather than a transfer that did.
     */
    async read(entry: ZipReaderEntry): Promise<Buffer> {
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
            throw new ZipReadError(`${entry.filename} is encrypted, which is not supported.`);
        }
        if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
            throw new ZipReadError(
                `${entry.filename} is compressed with method ${String(entry.method)}; only store and ` +
                    "deflate are supported.",
            );
        }

        // The local header's own name and extra lengths, not the central directory's:
        // the two are allowed to differ, and using the wrong one starts reading the
        // compressed data a few bytes late, which inflates into nonsense.
        const header = Buffer.allocUnsafe(30);
        await this.source.read(header, entry.localHeaderOffset);
        if (header.readUInt32LE(0) !== LOCAL_HEADER) {
            throw new ZipReadError(
                `${entry.filename} has no local header where the index says it is.`,
            );
        }
        const dataStart =
            entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);

        if (entry.compressedSize === 0) return Buffer.alloc(0);

        const compressed = Buffer.allocUnsafe(entry.compressedSize);
        await this.source.read(compressed, dataStart);
        const data = entry.method === METHOD_DEFLATE ? inflateRawSync(compressed) : compressed;

        if (data.length !== entry.uncompressedSize) {
            throw new ZipReadError(
                `${entry.filename} unpacked to ${String(data.length)} bytes; the archive says ` +
                    `${String(entry.uncompressedSize)}.`,
            );
        }
        const actual = crc32(data);
        if (actual !== entry.crc32) {
            throw new ZipReadError(
                `${entry.filename} failed its CRC-32 check: expected ` +
                    `${entry.crc32.toString(16)}, got ${actual.toString(16)}.`,
            );
        }
        return data;
    }

    async close(): Promise<void> {
        await this.source.close();
    }
}

/* -------------------------------------------------------------------------- */
/* The end record, classic and Zip64                                          */
/* -------------------------------------------------------------------------- */

interface EndRecord {
    readonly entryCount: number;
    readonly centralDirectorySize: number;
    readonly centralDirectoryOffset: number;
}

async function readEndRecord(source: ByteSource): Promise<EndRecord> {
    const window = Math.min(source.size, MAX_END_SEARCH);
    if (window < 22) throw new ZipReadError("The file is too short to be a zip archive.");
    const tail = Buffer.allocUnsafe(window);
    await source.read(tail, source.size - window);

    // Backwards, because a zip comment is allowed to contain the signature itself and
    // the *last* plausible one is the real record.
    let position = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) !== END_OF_CENTRAL_DIRECTORY) continue;
        const commentLength = tail.readUInt16LE(i + 20);
        if (i + 22 + commentLength === tail.length) {
            position = i;
            break;
        }
    }
    if (position < 0) {
        throw new ZipReadError("No end-of-central-directory record was found; this is not a zip.");
    }

    const entryCount = tail.readUInt16LE(position + 10);
    const centralDirectorySize = tail.readUInt32LE(position + 12);
    const centralDirectoryOffset = tail.readUInt32LE(position + 16);

    const needsZip64 =
        entryCount === U16_MAX ||
        centralDirectorySize === U32_MAX ||
        centralDirectoryOffset === U32_MAX;
    if (!needsZip64) return { entryCount, centralDirectorySize, centralDirectoryOffset };

    // The locator sits immediately before the classic record and points at the real one.
    const locatorAt = position - 20;
    if (locatorAt < 0 || tail.readUInt32LE(locatorAt) !== ZIP64_LOCATOR) {
        throw new ZipReadError(
            "The archive needs Zip64 but carries no Zip64 locator, so its real size cannot be read.",
        );
    }
    const zip64At = readUInt64LE(tail, locatorAt + 8);

    const record = Buffer.allocUnsafe(56);
    await source.read(record, zip64At);
    if (record.readUInt32LE(0) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
        throw new ZipReadError("The Zip64 end-of-central-directory record is not where it says.");
    }
    return {
        entryCount: readUInt64LE(record, 32),
        centralDirectorySize: readUInt64LE(record, 40),
        centralDirectoryOffset: readUInt64LE(record, 48),
    };
}

function parseCentralDirectory(central: Buffer, entryCount: number): ZipReaderEntry[] {
    const entries: ZipReaderEntry[] = [];
    let at = 0;
    for (let index = 0; index < entryCount; index++) {
        if (at + 46 > central.length) {
            throw new ZipReadError(
                `The central directory ends after ${String(index)} of ${String(entryCount)} entries.`,
            );
        }
        if (central.readUInt32LE(at) !== CENTRAL_HEADER) {
            throw new ZipReadError(`Entry ${String(index + 1)} has no central directory header.`);
        }

        const generalPurposeBitFlag = central.readUInt16LE(at + 8);
        const method = central.readUInt16LE(at + 10);
        const entryCrc32 = central.readUInt32LE(at + 16);
        let compressedSize = central.readUInt32LE(at + 20);
        let uncompressedSize = central.readUInt32LE(at + 24);
        const nameLength = central.readUInt16LE(at + 28);
        const extraLength = central.readUInt16LE(at + 30);
        const commentLength = central.readUInt16LE(at + 32);
        let localHeaderOffset = central.readUInt32LE(at + 42);

        const nameAt = at + 46;
        const extraAt = nameAt + nameLength;
        if (extraAt + extraLength + commentLength > central.length) {
            throw new ZipReadError(`Entry ${String(index + 1)} runs past the central directory.`);
        }
        // Bit 11 says the name is UTF-8; everything this project writes sets it, and
        // decoding as UTF-8 either way is what every modern tool does.
        const filename = central.toString("utf8", nameAt, extraAt);

        // The Zip64 extra field lists only the fields that were sentinels, in a fixed
        // order. Reading it positionally without checking which ones are present is the
        // classic way to get an offset that is really a size.
        const zip64 = findExtraField(central.subarray(extraAt, extraAt + extraLength), 0x0001);
        if (zip64 !== null) {
            let cursor = 0;
            if (uncompressedSize === U32_MAX) {
                uncompressedSize = readUInt64LE(zip64, cursor);
                cursor += 8;
            }
            if (compressedSize === U32_MAX) {
                compressedSize = readUInt64LE(zip64, cursor);
                cursor += 8;
            }
            if (localHeaderOffset === U32_MAX) {
                localHeaderOffset = readUInt64LE(zip64, cursor);
                cursor += 8;
            }
        }

        entries.push({
            filename,
            method,
            crc32: entryCrc32,
            compressedSize,
            uncompressedSize,
            localHeaderOffset,
            generalPurposeBitFlag,
        });

        at = extraAt + extraLength + commentLength;
    }
    return entries;
}

/** The payload of one extra field by its header id, or null when it is not there. */
function findExtraField(extra: Buffer, id: number): Buffer | null {
    let at = 0;
    while (at + 4 <= extra.length) {
        const headerId = extra.readUInt16LE(at);
        const size = extra.readUInt16LE(at + 2);
        if (at + 4 + size > extra.length) return null;
        if (headerId === id) return extra.subarray(at + 4, at + 4 + size);
        at += 4 + size;
    }
    return null;
}

/**
 * A 64-bit little-endian field, refused rather than truncated when it does not fit.
 *
 * `Number` holds every integer up to 2^53, which is nine petabytes. An archive past that
 * is not a case worth supporting, but silently keeping the low 53 bits of one would be
 * a wrong offset presented as a right one.
 */
function readUInt64LE(buffer: Buffer, offset: number): number {
    const value = buffer.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new ZipReadError(
            `The archive carries a 64-bit value (${value.toString()}) that is too large to address.`,
        );
    }
    return Number(value);
}

const CRC_TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

/** CRC-32 (IEEE 802.3) of a whole buffer — the same algorithm every zip/PNG/gzip uses. */
function crc32(data: Uint8Array): number {
    let value = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        value = (CRC_TABLE[(value ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
}

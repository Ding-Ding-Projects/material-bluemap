/**
 * Reading a zip archive with nothing but `node:zlib`.
 *
 * ## Why this exists rather than a library
 *
 * `electron-builder.config.cjs` states the packaging contract in three places: esbuild
 * inlines every runtime dependency, no `node_modules` tree reaches the asar, and no
 * native module reaches the packaged application. The obvious zip libraries break that
 * contract - `yauzl-promise` depends on `@node-rs/crc32`, which is a `.node` addon
 * esbuild refuses to bundle, and the build fails outright. Marking it external would
 * mean shipping a `node_modules` tree and a per-platform binary into an application that
 * currently ships neither.
 *
 * So: the central directory is parsed here, and `zlib.createInflateRaw` does the
 * decompression. Store and deflate only, which is every zip this project produces or
 * consumes, and an entry compressed any other way is refused by name rather than
 * silently written out as garbage.
 *
 * ## Zip64 is not optional here
 *
 * This module exists to open archives of rendered worlds, which are tens of gigabytes.
 * Past 4 GB - or past 65,535 entries, which a world of region files passes long before
 * that - a zip stores its real sizes and offsets in Zip64 records and leaves `0xFFFFFFFF`
 * sentinels in the classic fields. A reader that takes those sentinels at face value
 * reads from offset 4294967295 and reports a corrupt archive on a perfectly good file.
 *
 * ## Everything is verified
 *
 * Each entry's CRC-32 is checked against the central directory as the entry is read.
 * The archive itself has already been checked against its published SHA-256 by the time
 * anything gets here, so this is the second of two independent checks rather than the
 * only one, but it is what catches a decompressor that went wrong rather than a
 * transfer that did.
 */

import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

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

export class ZipFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ZipFormatError";
    }
}

export interface ZipEntry {
    readonly name: string;
    readonly method: number;
    readonly crc32: number;
    readonly compressedSize: number;
    readonly uncompressedSize: number;
    readonly localHeaderOffset: number;
    /** The top 16 bits carry the Unix mode on an archive made on Unix. */
    readonly externalFileAttributes: number;
    readonly generalPurposeBitFlag: number;
    readonly directory: boolean;
}

/** Reads the central directory once, then streams entries out of the same file. */
export class ZipReader {
    private readonly path: string;
    private readonly handle: FileHandle;
    private readonly records: readonly ZipEntry[];

    private constructor(path: string, handle: FileHandle, records: readonly ZipEntry[]) {
        this.path = path;
        this.handle = handle;
        this.records = records;
    }

    static async open(path: string): Promise<ZipReader> {
        const size = (await stat(path)).size;
        const handle = await open(path, "r");
        try {
            const end = await readEndRecord(handle, size);
            const central = Buffer.allocUnsafe(end.centralDirectorySize);
            await readExactly(handle, central, end.centralDirectoryOffset);
            return new ZipReader(path, handle, parseCentralDirectory(central, end.entryCount));
        } catch (error) {
            await handle.close().catch(() => undefined);
            throw error;
        }
    }

    entries(): readonly ZipEntry[] {
        return this.records;
    }

    /**
     * A stream of the entry's **decompressed** bytes, with its CRC-32 checked at the end.
     *
     * The check is at the end because that is where a CRC can be checked: the stream
     * ends with an error rather than resolving, so a consumer that piped it into a file
     * has a failed pipeline and a partial file it knows about, instead of a complete
     * file it does not.
     */
    async openEntry(entry: ZipEntry): Promise<Readable> {
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
            throw new ZipFormatError(`${entry.name} is encrypted, which is not supported.`);
        }
        if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
            throw new ZipFormatError(
                `${entry.name} is compressed with method ${String(entry.method)}; only store and ` +
                    "deflate are supported.",
            );
        }

        // The local header's own name and extra lengths, not the central directory's:
        // the two are allowed to differ, and using the wrong one starts reading the
        // compressed data a few bytes late, which inflates into nonsense.
        const header = Buffer.allocUnsafe(30);
        await readExactly(this.handle, header, entry.localHeaderOffset);
        if (header.readUInt32LE(0) !== LOCAL_HEADER) {
            throw new ZipFormatError(`${entry.name} has no local header where the index says it is.`);
        }
        const dataStart =
            entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);

        if (entry.compressedSize === 0) return Readable.from([]);

        const raw = createReadStream(this.path, {
            start: dataStart,
            end: dataStart + entry.compressedSize - 1,
        });
        const decoded =
            entry.method === METHOD_DEFLATE ? raw.pipe(createInflateRaw()) : (raw as Readable);
        return verifying(decoded, entry);
    }

    async close(): Promise<void> {
        await this.handle.close();
    }
}

/** Wraps a stream so it fails at the end unless the bytes hashed to what was promised. */
function verifying(source: Readable, entry: ZipEntry): Readable {
    let crc = 0xffffffff;
    let bytes = 0;
    return Readable.from(
        (async function* () {
            for await (const chunk of source) {
                const buffer = chunk as Buffer;
                crc = updateCrc32(crc, buffer);
                bytes += buffer.length;
                yield buffer;
            }
            const actual = (crc ^ 0xffffffff) >>> 0;
            if (bytes !== entry.uncompressedSize) {
                throw new ZipFormatError(
                    `${entry.name} unpacked to ${String(bytes)} bytes; the archive says ` +
                        `${String(entry.uncompressedSize)}.`,
                );
            }
            if (actual !== entry.crc32) {
                throw new ZipFormatError(
                    `${entry.name} failed its CRC-32 check: expected ` +
                        `${entry.crc32.toString(16)}, got ${actual.toString(16)}.`,
                );
            }
        })(),
    );
}

/* -------------------------------------------------------------------------- */
/* The end record, classic and Zip64                                          */
/* -------------------------------------------------------------------------- */

interface EndRecord {
    readonly entryCount: number;
    readonly centralDirectorySize: number;
    readonly centralDirectoryOffset: number;
}

async function readEndRecord(handle: FileHandle, fileSize: number): Promise<EndRecord> {
    const window = Math.min(fileSize, MAX_END_SEARCH);
    if (window < 22) throw new ZipFormatError("The file is too short to be a zip archive.");
    const tail = Buffer.allocUnsafe(window);
    await readExactly(handle, tail, fileSize - window);

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
        throw new ZipFormatError("No end-of-central-directory record was found; this is not a zip.");
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
        throw new ZipFormatError(
            "The archive needs Zip64 but carries no Zip64 locator, so its real size cannot be read.",
        );
    }
    const zip64At = readUInt64LE(tail, locatorAt + 8);

    const record = Buffer.allocUnsafe(56);
    await readExactly(handle, record, zip64At);
    if (record.readUInt32LE(0) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
        throw new ZipFormatError("The Zip64 end-of-central-directory record is not where it says.");
    }
    return {
        entryCount: readUInt64LE(record, 32),
        centralDirectorySize: readUInt64LE(record, 40),
        centralDirectoryOffset: readUInt64LE(record, 48),
    };
}

function parseCentralDirectory(central: Buffer, entryCount: number): ZipEntry[] {
    const entries: ZipEntry[] = [];
    let at = 0;
    for (let index = 0; index < entryCount; index++) {
        if (at + 46 > central.length) {
            throw new ZipFormatError(
                `The central directory ends after ${String(index)} of ${String(entryCount)} entries.`,
            );
        }
        if (central.readUInt32LE(at) !== CENTRAL_HEADER) {
            throw new ZipFormatError(`Entry ${String(index + 1)} has no central directory header.`);
        }

        const generalPurposeBitFlag = central.readUInt16LE(at + 8);
        const method = central.readUInt16LE(at + 10);
        const crc32 = central.readUInt32LE(at + 16);
        let compressedSize = central.readUInt32LE(at + 20);
        let uncompressedSize = central.readUInt32LE(at + 24);
        const nameLength = central.readUInt16LE(at + 28);
        const extraLength = central.readUInt16LE(at + 30);
        const commentLength = central.readUInt16LE(at + 32);
        const externalFileAttributes = central.readUInt32LE(at + 38);
        let localHeaderOffset = central.readUInt32LE(at + 42);

        const nameAt = at + 46;
        const extraAt = nameAt + nameLength;
        if (extraAt + extraLength + commentLength > central.length) {
            throw new ZipFormatError(`Entry ${String(index + 1)} runs past the central directory.`);
        }
        // Bit 11 says the name is UTF-8. Everything this project reads sets it, and
        // decoding as UTF-8 either way is what every modern tool does; the alternative
        // is CP437, which would mangle exactly the names bit 11 exists to protect.
        const name = central.toString("utf8", nameAt, extraAt);

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
            name,
            method,
            crc32,
            compressedSize,
            uncompressedSize,
            localHeaderOffset,
            externalFileAttributes,
            generalPurposeBitFlag,
            directory: name.endsWith("/"),
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
        throw new ZipFormatError(`The archive carries a 64-bit value (${value.toString()}) that is too large to address.`);
    }
    return Number(value);
}

async function readExactly(handle: FileHandle, buffer: Buffer, position: number): Promise<void> {
    let read = 0;
    while (read < buffer.length) {
        const result = await handle.read(buffer, read, buffer.length - read, position + read);
        if (result.bytesRead <= 0) {
            throw new ZipFormatError(
                `The archive ended after ${String(position + read)} bytes, before the index it points at.`,
            );
        }
        read += result.bytesRead;
    }
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

/** Feeds more bytes into a running CRC-32. Seed with `0xffffffff`, finish with `^ 0xffffffff`. */
export function updateCrc32(crc: number, data: Uint8Array): number {
    let value = crc;
    for (let i = 0; i < data.length; i++) {
        value = (CRC_TABLE[(value ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (value >>> 8);
    }
    return value >>> 0;
}

/** CRC-32 of a whole buffer. */
export function crc32(data: Uint8Array): number {
    return (updateCrc32(0xffffffff, data) ^ 0xffffffff) >>> 0;
}

/**
 * Packing a folder into one deterministic Zip64 archive, streamed.
 *
 * A backup has to be a single file before it can be split and uploaded, and the single
 * file has to be a **zip** rather than anything cleverer for one reason: the restore half
 * of this feature is `main/download/`, which already fetches parts, verifies each one,
 * rejoins them and unpacks the result - and the thing it unpacks is a zip, through
 * `download/zip.ts`. Inventing a second container here would mean a second extractor,
 * a second set of path-traversal defences and a second place for them to disagree.
 *
 * ## Deterministic, and what that costs
 *
 * The same folder packs to the same bytes, every time, on any machine:
 *
 * - entries are sorted by their **UTF-8 bytes**, not by a locale collation, so a machine
 *   set to Turkish does not order `I` differently from one set to English;
 * - every timestamp is the same fixed DOS stamp, because a file's mtime is not part of a
 *   world and letting it in would make two identical backups two different archives;
 * - modes, external attributes, comments and the "version made by" byte are all fixed;
 * - nothing is compressed. Everything is stored.
 *
 * That last one is the deliberate cost. A render is mostly PNG tiles and a world is
 * mostly already-compressed region files, so deflate buys single-digit percentages on the
 * bulk of the payload while spending CPU on every byte of a multi-gigabyte pack. Storing
 * also makes the pack I/O-bound and interruptible, and makes a re-pack of an unchanged
 * folder produce the identical digest, which is what lets a repeated backup be recognised
 * rather than re-uploaded. If a future version wants compression, the Cheap LFS pointer
 * already has a `part-deflate` line for it - which is a reason to leave this simple now.
 *
 * ## One pass over each file
 *
 * A zip's local header carries the CRC-32 and the sizes, which are not known until the
 * bytes have been read. The alternatives are reading every file twice - doubling the disk
 * read on a 20 GB pack - or the streaming form the format provides for exactly this: set
 * the "sizes follow" flag, write placeholders, and put the true values in a data
 * descriptor after the data and in the central directory. Every reader that matters,
 * including this project's own, reads sizes from the central directory, so the descriptor
 * costs 24 bytes an entry and saves a whole second read of the payload.
 *
 * Zip64 records are written for **every** entry rather than only for the large ones. A
 * conditional would be smaller and would mean the 4 GB boundary is a code path that only
 * runs on the archives nobody can afford to test with.
 */

import { createReadStream } from "node:fs";
import { mkdir, open, opendir, rm, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

/** How much is read at a time. One mebibyte, matching `@material-bluemap/parts`. */
export const READ_CHUNK_BYTES = 1024 * 1024;

/**
 * The fixed timestamp every entry gets: 1980-01-01 00:00:00, the earliest a DOS stamp can
 * express. Chosen because it is the format's own zero rather than an arbitrary date.
 */
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 0x21;

const SIGNATURE_LOCAL = 0x04034b50;
const SIGNATURE_DATA_DESCRIPTOR = 0x08074b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_ZIP64_END = 0x06064b50;
const SIGNATURE_ZIP64_LOCATOR = 0x07064b50;
const SIGNATURE_END = 0x06054b50;

/** "Look in the Zip64 extra field", in both 32-bit and 16-bit widths. */
const SENTINEL_32 = 0xffffffff;
const SENTINEL_16 = 0xffff;

/** Version 4.5, which is the version that introduced Zip64. */
const VERSION_ZIP64 = 45;
/** Bit 3: the sizes and CRC follow the data. Bit 11: the name is UTF-8. */
const FLAG_STREAMING_UTF8 = 0x0008 | 0x0800;
const METHOD_STORE = 0;

export interface ArchiveProgress {
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly filesDone: number;
    readonly filesTotal: number;
    /** 0 to 100. */
    readonly percent: number;
    /** The file being packed, relative to the folder, or null between files. */
    readonly current: string | null;
}

export interface ArchiveOptions {
    readonly onProgress?: ((progress: ArchiveProgress) => void) | undefined;
    readonly signal?: AbortSignal | undefined;
}

export interface ArchiveResult {
    /** The archive that was written, absolute. */
    readonly path: string;
    readonly bytes: number;
    /** Lowercase hex SHA-256 of the archive, computed as it was written. */
    readonly sha256: string;
    readonly files: number;
    /** The total size of the packed files, before the zip's own overhead. */
    readonly contentBytes: number;
}

/** One file the walk found, with the name it will carry inside the archive. */
export interface ArchiveEntry {
    /** Absolute path on disk. */
    readonly path: string;
    /** Forward-slashed, relative to the folder being packed. */
    readonly name: string;
    readonly bytes: number;
}

/**
 * A folder to be packed, refused rather than half-packed when it is not one.
 *
 * Symbolic links are **skipped, not followed**. A world folder with a link pointing at a
 * home directory would otherwise pack that home directory into a backup somebody is about
 * to publish, and the person who made the link would have no reason to expect it. They
 * are reported in `skipped` so the count is never silently short.
 */
export interface FolderContents {
    readonly entries: readonly ArchiveEntry[];
    readonly bytes: number;
    /** Relative names that were deliberately left out, with the reason. */
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

/** A folder that cannot be packed, with a sentence saying why. */
export class ArchiveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ArchiveError";
    }
}

/**
 * Every regular file below `folder`, sorted into the order the archive stores them.
 *
 * Sorted by the UTF-8 bytes of the archive name rather than by `String.prototype.sort`'s
 * UTF-16 ordering. The two differ above the basic plane, and a world with an emoji in a
 * folder name is not exotic enough to be a case worth getting wrong.
 */
export async function readFolderContents(
    folder: string,
    signal?: AbortSignal,
): Promise<FolderContents> {
    const root = resolve(folder);
    const stats = await stat(root).catch(() => null);
    if (stats === null || !stats.isDirectory()) {
        throw new ArchiveError(`${root} is not a folder that can be backed up.`);
    }

    const entries: ArchiveEntry[] = [];
    const skipped: { name: string; reason: string }[] = [];
    let bytes = 0;

    const walk = async (directory: string): Promise<void> => {
        signal?.throwIfAborted();
        const handle = await opendir(directory);
        for await (const item of handle) {
            signal?.throwIfAborted();
            const path = join(directory, item.name);
            const name = archiveNameFor(root, path);
            if (item.isSymbolicLink()) {
                skipped.push({
                    name,
                    reason:
                        "It is a link. A backup follows no links: the folder a link points at" +
                        " is somewhere else on this computer, and packing it would publish" +
                        " whatever happens to be there.",
                });
                continue;
            }
            if (item.isDirectory()) {
                await walk(path);
                continue;
            }
            if (!item.isFile()) {
                skipped.push({ name, reason: "It is not an ordinary file." });
                continue;
            }
            const fileStats = await stat(path).catch(() => null);
            if (fileStats === null) {
                skipped.push({ name, reason: "It could not be read when the backup was packed." });
                continue;
            }
            entries.push({ path, name, bytes: fileStats.size });
            bytes += fileStats.size;
        }
    };

    await walk(root);
    entries.sort(compareByUtf8Name);
    return { entries, bytes, skipped };
}

/** The name a file gets inside the archive: relative, forward-slashed, never absolute. */
function archiveNameFor(root: string, path: string): string {
    return relative(root, path).split(sep).join("/");
}

const nameEncoder = new TextEncoder();

function compareByUtf8Name(left: ArchiveEntry, right: ArchiveEntry): number {
    return Buffer.compare(
        Buffer.from(nameEncoder.encode(left.name)),
        Buffer.from(nameEncoder.encode(right.name)),
    );
}

/**
 * Packs `folder` into `target`, reporting progress and hashing as it goes.
 *
 * The SHA-256 is folded in while the bytes are being written rather than computed by
 * reading the finished archive back. On a 20 GB pack that is one whole extra read of the
 * disk saved, and the digest is the thing the pointer promises, so computing it from what
 * was actually written is also the stronger claim.
 *
 * A failure or a cancellation removes the partial archive. A half-written zip left on
 * disk looks exactly like a finished one to anything that only checks the name, and the
 * one thing worse than a failed pack is a failed pack that an upload mistakes for a good
 * one.
 */
export async function packFolder(
    folder: string,
    target: string,
    options: ArchiveOptions = {},
): Promise<ArchiveResult> {
    const archivePath = resolve(target);
    const contents = await readFolderContents(folder, options.signal);
    if (contents.entries.length === 0) {
        throw new ArchiveError(
            `${resolve(folder)} holds no files, so there is nothing to back up. An empty ` +
                "backup would upload and restore perfectly and give back nothing.",
        );
    }

    await mkdir(resolve(archivePath, ".."), { recursive: true });

    const hash = createHash("sha256");
    let written = 0;
    let bytesDone = 0;

    const handle = await open(archivePath, "w");
    const write = async (buffer: Buffer): Promise<void> => {
        await writeFully(handle, buffer);
        hash.update(buffer);
        written += buffer.length;
    };

    interface CentralRecord {
        readonly name: string;
        readonly crc: number;
        readonly bytes: number;
        readonly offset: number;
    }
    const central: CentralRecord[] = [];

    try {
        for (const [index, entry] of contents.entries.entries()) {
            options.signal?.throwIfAborted();
            const nameBytes = Buffer.from(nameEncoder.encode(entry.name));
            const offset = written;
            await write(localHeader(nameBytes));

            let crc = 0;
            let entryBytes = 0;
            const reader = createReadStream(entry.path, { highWaterMark: READ_CHUNK_BYTES });
            for await (const chunk of reader) {
                options.signal?.throwIfAborted();
                const buffer = chunk as Buffer;
                crc = crc32Continue(crc, buffer);
                entryBytes += buffer.length;
                bytesDone += buffer.length;
                await write(buffer);
                options.onProgress?.({
                    bytesDone,
                    bytesTotal: contents.bytes,
                    filesDone: index,
                    filesTotal: contents.entries.length,
                    percent: percentOf(bytesDone, contents.bytes),
                    current: entry.name,
                });
            }

            await write(dataDescriptor(crc, entryBytes));
            central.push({ name: entry.name, crc, bytes: entryBytes, offset });
            options.onProgress?.({
                bytesDone,
                bytesTotal: contents.bytes,
                filesDone: index + 1,
                filesTotal: contents.entries.length,
                percent: percentOf(bytesDone, contents.bytes),
                current: null,
            });
        }

        const centralOffset = written;
        for (const record of central) {
            await write(
                centralHeader(
                    Buffer.from(nameEncoder.encode(record.name)),
                    record.crc,
                    record.bytes,
                    record.offset,
                ),
            );
        }
        const centralSize = written - centralOffset;
        await write(endRecords(central.length, centralSize, centralOffset, written));
    } catch (error) {
        await handle.close().catch(() => undefined);
        await rm(archivePath, { force: true }).catch(() => undefined);
        throw error;
    }

    await handle.close();
    return {
        path: archivePath,
        bytes: written,
        sha256: hash.digest("hex"),
        files: central.length,
        contentBytes: contents.bytes,
    };
}

/**
 * The running CRC-32, built from the same polynomial `download/zip.ts` reads with.
 *
 * That module exports `crc32`, the whole-buffer form, which is what a *reader* verifying
 * one entry needs. A writer streaming a 4 GB file cannot use it: it has to carry the
 * running value across chunks, and a one-shot function has nowhere to carry it. Combining
 * two finished CRCs without re-reading needs the matrix trick, which is far more code
 * than the eight lines below.
 *
 * So the table is re-derived here, and `archive.test.ts` pins the two together by
 * asserting that this, fed in chunks, agrees with `crc32` over the same bytes in one go.
 * That test is the thing that makes the duplication safe: a change to either polynomial
 * fails it, rather than producing archives this project can write and cannot read.
 */
const CRC_TABLE = ((): Uint32Array => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function crc32Continue(previous: number, data: Buffer): number {
    let value = (previous ^ 0xffffffff) >>> 0;
    // An indexed loop rather than `for...of`: this runs over every byte of a multi-
    // gigabyte pack, and a Buffer's iterator protocol costs enough at that scale to be
    // visible in the wall clock of a backup.
    for (let index = 0; index < data.length; index += 1) {
        value = ((value >>> 8) ^ (CRC_TABLE[(value ^ (data[index] as number)) & 0xff] as number)) >>> 0;
    }
    return (value ^ 0xffffffff) >>> 0;
}

/** The 20-byte Zip64 extra field carried by a local header, sizes still unknown. */
function localZip64Extra(): Buffer {
    const extra = Buffer.alloc(20);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(16, 2);
    writeUInt64LE(extra, 0, 4);
    writeUInt64LE(extra, 0, 12);
    return extra;
}

function localHeader(nameBytes: Buffer): Buffer {
    const extra = localZip64Extra();
    const header = Buffer.alloc(30);
    header.writeUInt32LE(SIGNATURE_LOCAL, 0);
    header.writeUInt16LE(VERSION_ZIP64, 4);
    header.writeUInt16LE(FLAG_STREAMING_UTF8, 6);
    header.writeUInt16LE(METHOD_STORE, 8);
    header.writeUInt16LE(FIXED_DOS_TIME, 10);
    header.writeUInt16LE(FIXED_DOS_DATE, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(SENTINEL_32, 18);
    header.writeUInt32LE(SENTINEL_32, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(extra.length, 28);
    return Buffer.concat([header, nameBytes, extra]);
}

/** The Zip64 data descriptor: signature, CRC, then two 64-bit sizes. */
function dataDescriptor(crc: number, bytes: number): Buffer {
    const descriptor = Buffer.alloc(24);
    descriptor.writeUInt32LE(SIGNATURE_DATA_DESCRIPTOR, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    writeUInt64LE(descriptor, bytes, 8);
    writeUInt64LE(descriptor, bytes, 16);
    return descriptor;
}

function centralHeader(nameBytes: Buffer, crc: number, bytes: number, offset: number): Buffer {
    const extra = Buffer.alloc(28);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(24, 2);
    writeUInt64LE(extra, bytes, 4);
    writeUInt64LE(extra, bytes, 12);
    writeUInt64LE(extra, offset, 20);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(SIGNATURE_CENTRAL, 0);
    // "Made by" a Unix-flavoured 4.5 packer. Fixed, so the same folder packed on Windows
    // and on a Linux runner is the same archive rather than two that differ in one byte.
    header.writeUInt16LE((3 << 8) | VERSION_ZIP64, 4);
    header.writeUInt16LE(VERSION_ZIP64, 6);
    header.writeUInt16LE(FLAG_STREAMING_UTF8, 8);
    header.writeUInt16LE(METHOD_STORE, 10);
    header.writeUInt16LE(FIXED_DOS_TIME, 12);
    header.writeUInt16LE(FIXED_DOS_DATE, 14);
    header.writeUInt32LE(crc >>> 0, 16);
    header.writeUInt32LE(SENTINEL_32, 20);
    header.writeUInt32LE(SENTINEL_32, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt16LE(extra.length, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    // External attributes: a fixed regular-file mode, 0644, in the high half where a Unix
    // packer puts it. Fixed rather than read off the disk, because a backup taken on a
    // machine with a different umask must still be the same archive.
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    header.writeUInt32LE(SENTINEL_32, 42);
    return Buffer.concat([header, nameBytes, extra]);
}

/** The Zip64 end record, its locator, and the classic end record after them. */
function endRecords(
    entryCount: number,
    centralSize: number,
    centralOffset: number,
    zip64EndOffset: number,
): Buffer {
    const zip64End = Buffer.alloc(56);
    zip64End.writeUInt32LE(SIGNATURE_ZIP64_END, 0);
    writeUInt64LE(zip64End, 44, 4);
    zip64End.writeUInt16LE((3 << 8) | VERSION_ZIP64, 12);
    zip64End.writeUInt16LE(VERSION_ZIP64, 14);
    zip64End.writeUInt32LE(0, 16);
    zip64End.writeUInt32LE(0, 20);
    writeUInt64LE(zip64End, entryCount, 24);
    writeUInt64LE(zip64End, entryCount, 32);
    writeUInt64LE(zip64End, centralSize, 40);
    writeUInt64LE(zip64End, centralOffset, 48);

    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(SIGNATURE_ZIP64_LOCATOR, 0);
    locator.writeUInt32LE(0, 4);
    writeUInt64LE(locator, zip64EndOffset, 8);
    locator.writeUInt32LE(1, 16);

    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIGNATURE_END, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entryCount > SENTINEL_16 ? SENTINEL_16 : entryCount, 8);
    end.writeUInt16LE(entryCount > SENTINEL_16 ? SENTINEL_16 : entryCount, 10);
    end.writeUInt32LE(SENTINEL_32, 12);
    end.writeUInt32LE(SENTINEL_32, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([zip64End, locator, end]);
}

/**
 * A 64-bit little-endian write, through `BigInt` because `writeUInt32LE` pairs get the
 * high word wrong for anything past 4 GB and this format's whole point is being past it.
 */
function writeUInt64LE(buffer: Buffer, value: number, offset: number): void {
    buffer.writeBigUInt64LE(BigInt(value), offset);
}

/**
 * Writes the whole buffer, however many calls that takes.
 *
 * `FileHandle.write` may write fewer bytes than it was given. It essentially never does
 * for a regular file, which is exactly why a truncated archive produced this way would be
 * found months later by somebody debugging a restore that will not open.
 */
async function writeFully(handle: FileHandle, buffer: Buffer): Promise<void> {
    let written = 0;
    while (written < buffer.length) {
        const result = await handle.write(buffer, written, buffer.length - written);
        if (result.bytesWritten <= 0) throw new ArchiveError("The archive accepted no bytes.");
        written += result.bytesWritten;
    }
}

function percentOf(done: number, total: number): number {
    if (total <= 0) return 100;
    return Math.min(100, (done / total) * 100);
}

/**
 * Test support: a tiny in-memory zip builder.
 *
 * Only what the reader has to be tested against - stored and deflated entries, with or
 * without Zip64 - and deliberately able to produce the entry names and the damage a real
 * archive would never contain, because those are the cases the reader has to refuse.
 *
 * The Zip64 switch matters more than it looks. The archives this feature exists for are
 * tens of gigabytes, so the Zip64 path is the one that will actually run in production,
 * and a fixture of a few hundred bytes can exercise it exactly: the format allows the
 * sentinels and the Zip64 records at any size, they are only *required* past 4 GB.
 *
 * `crc32` is imported from the reader rather than reimplemented here, so a fixture can
 * never pass by agreeing with a second, differently-wrong implementation.
 */

import { deflateRawSync } from "node:zlib";
import { crc32 } from "./zip.js";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

export interface ZipFixtureEntry {
    readonly name: string;
    readonly content?: Buffer;
    /** Compress this entry with deflate instead of storing it. */
    readonly deflate?: boolean;
    /** Set to mark the entry as a Unix symbolic link. */
    readonly symlink?: boolean;
    /** Write a CRC that does not match the content, to test the reader's check. */
    readonly breakCrc?: boolean;
    /** Claim a compression method the reader does not support. */
    readonly method?: number;
}

export interface ZipFixtureOptions {
    /** Write Zip64 sentinels, extra fields and end records. */
    readonly zip64?: boolean;
    /** An archive comment, which pushes the end record away from the end of the file. */
    readonly comment?: string;
}

export function buildZip(
    entries: readonly ZipFixtureEntry[],
    options: ZipFixtureOptions = {},
): Buffer {
    const zip64 = options.zip64 === true;
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const directory = entry.name.endsWith("/");
        const data = directory ? Buffer.alloc(0) : (entry.content ?? Buffer.alloc(0));
        const useDeflate = entry.deflate === true && data.length > 0;
        const stored = useDeflate ? deflateRawSync(data) : data;
        const method = entry.method ?? (useDeflate ? METHOD_DEFLATE : METHOD_STORE);
        const nameBytes = Buffer.from(entry.name, "utf8");
        const crc = entry.breakCrc === true ? (crc32(data) ^ 0xff) >>> 0 : crc32(data);

        const header = Buffer.alloc(30);
        header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x0800, 6); // bit 11: the name is UTF-8
        header.writeUInt16LE(method, 8);
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(0x21, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(stored.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(nameBytes.length, 26);
        header.writeUInt16LE(0, 28);
        local.push(header, nameBytes, stored);

        const zip64Extra = zip64 ? Buffer.alloc(4 + 24) : Buffer.alloc(0);
        if (zip64) {
            zip64Extra.writeUInt16LE(0x0001, 0);
            zip64Extra.writeUInt16LE(24, 2);
            zip64Extra.writeBigUInt64LE(BigInt(data.length), 4);
            zip64Extra.writeBigUInt64LE(BigInt(stored.length), 12);
            zip64Extra.writeBigUInt64LE(BigInt(offset), 20);
        }

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
        centralHeader.writeUInt16LE(0x0314, 4); // made by Unix, so the mode bits are read
        centralHeader.writeUInt16LE(zip64 ? 45 : 20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(method, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0x21, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(zip64 ? 0xffffffff : stored.length, 20);
        centralHeader.writeUInt32LE(zip64 ? 0xffffffff : data.length, 24);
        centralHeader.writeUInt16LE(nameBytes.length, 28);
        centralHeader.writeUInt16LE(zip64Extra.length, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        const mode = entry.symlink === true ? 0o120777 : directory ? 0o040755 : 0o100644;
        // `>>>` again on the outside: `|` is a signed operation, so the unsigned mode
        // in the top half comes back out of it as a negative number.
        centralHeader.writeUInt32LE((((mode << 16) >>> 0) | (directory ? 0x10 : 0)) >>> 0, 38);
        centralHeader.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
        central.push(centralHeader, nameBytes, zip64Extra);

        offset += header.length + nameBytes.length + stored.length;
    }

    const centralDirectory = Buffer.concat(central);
    const centralDirectoryOffset = offset;
    const tail: Buffer[] = [];

    if (zip64) {
        const record = Buffer.alloc(56);
        record.writeUInt32LE(ZIP64_END_SIGNATURE, 0);
        record.writeBigUInt64LE(BigInt(44), 4);
        record.writeUInt16LE(45, 12);
        record.writeUInt16LE(45, 14);
        record.writeUInt32LE(0, 16);
        record.writeUInt32LE(0, 20);
        record.writeBigUInt64LE(BigInt(entries.length), 24);
        record.writeBigUInt64LE(BigInt(entries.length), 32);
        record.writeBigUInt64LE(BigInt(centralDirectory.length), 40);
        record.writeBigUInt64LE(BigInt(centralDirectoryOffset), 48);

        const locator = Buffer.alloc(20);
        locator.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, 0);
        locator.writeUInt32LE(0, 4);
        locator.writeBigUInt64LE(BigInt(centralDirectoryOffset + centralDirectory.length), 8);
        locator.writeUInt32LE(1, 16);

        tail.push(record, locator);
    }

    const commentBytes = Buffer.from(options.comment ?? "", "utf8");
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(zip64 ? 0xffff : entries.length, 8);
    end.writeUInt16LE(zip64 ? 0xffff : entries.length, 10);
    end.writeUInt32LE(zip64 ? 0xffffffff : centralDirectory.length, 12);
    end.writeUInt32LE(zip64 ? 0xffffffff : centralDirectoryOffset, 16);
    end.writeUInt16LE(commentBytes.length, 20);

    return Buffer.concat([...local, centralDirectory, ...tail, end, commentBytes]);
}

export { crc32 };

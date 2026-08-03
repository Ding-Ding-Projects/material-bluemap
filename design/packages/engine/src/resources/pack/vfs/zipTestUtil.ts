import { deflateRawSync } from "node:zlib";

/*
 * Minimal in-memory zip-writer (store + deflate, no zip64, no encryption) used by the
 * vfs/pack tests to build zip/jar fixtures. Test-support only — not part of the
 * upstream port.
 */

export interface ZipTestEntry {
    /** entry-name; a trailing "/" marks an explicit directory-entry */
    name: string;
    /** file-content (ignored for directory-entries) */
    data?: Buffer | string;
    /** compress with deflate instead of storing uncompressed */
    deflate?: boolean;
}

const CRC_TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** builds a complete zip-file from the given entries (in the given order) */
export function buildZip(entries: ZipTestEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = Buffer.from(entry.name, "utf-8");
        const isDirectory = entry.name.endsWith("/");
        const data = isDirectory
            ? Buffer.alloc(0)
            : typeof entry.data === "string"
              ? Buffer.from(entry.data, "utf-8")
              : (entry.data ?? Buffer.alloc(0));
        const method = entry.deflate === true && !isDirectory ? 8 : 0;
        const compressed = method === 8 ? deflateRawSync(data) : data;
        const checksum = crc32(data);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
        localHeader.writeUInt16LE(20, 4); // version needed to extract
        localHeader.writeUInt16LE(0, 6); // general purpose bit flag
        localHeader.writeUInt16LE(method, 8); // compression method
        localHeader.writeUInt16LE(0, 10); // last mod time
        localHeader.writeUInt16LE(0x21, 12); // last mod date (1980-01-01)
        localHeader.writeUInt32LE(checksum, 14); // crc-32
        localHeader.writeUInt32LE(compressed.length, 18); // compressed size
        localHeader.writeUInt32LE(data.length, 22); // uncompressed size
        localHeader.writeUInt16LE(nameBytes.length, 26); // file name length
        localHeader.writeUInt16LE(0, 28); // extra field length

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0); // central directory header signature
        centralHeader.writeUInt16LE(20, 4); // version made by
        centralHeader.writeUInt16LE(20, 6); // version needed to extract
        centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
        centralHeader.writeUInt16LE(method, 10); // compression method
        centralHeader.writeUInt16LE(0, 12); // last mod time
        centralHeader.writeUInt16LE(0x21, 14); // last mod date
        centralHeader.writeUInt32LE(checksum, 16); // crc-32
        centralHeader.writeUInt32LE(compressed.length, 20); // compressed size
        centralHeader.writeUInt32LE(data.length, 24); // uncompressed size
        centralHeader.writeUInt16LE(nameBytes.length, 28); // file name length
        centralHeader.writeUInt16LE(0, 30); // extra field length
        centralHeader.writeUInt16LE(0, 32); // file comment length
        centralHeader.writeUInt16LE(0, 34); // disk number start
        centralHeader.writeUInt16LE(0, 36); // internal file attributes
        centralHeader.writeUInt32LE(isDirectory ? 0x10 : 0, 38); // external file attributes
        centralHeader.writeUInt32LE(offset, 42); // local header offset

        localParts.push(localHeader, nameBytes, compressed);
        centralParts.push(centralHeader, nameBytes);
        offset += localHeader.length + nameBytes.length + compressed.length;
    }

    const centralDirectory = Buffer.concat(centralParts);

    const endOfCentralDirectory = Buffer.alloc(22);
    endOfCentralDirectory.writeUInt32LE(0x06054b50, 0); // end of central directory signature
    endOfCentralDirectory.writeUInt16LE(0, 4); // disk number
    endOfCentralDirectory.writeUInt16LE(0, 6); // central directory start disk
    endOfCentralDirectory.writeUInt16LE(entries.length, 8); // entries on this disk
    endOfCentralDirectory.writeUInt16LE(entries.length, 10); // total entries
    endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12); // central directory size
    endOfCentralDirectory.writeUInt32LE(offset, 16); // central directory offset
    endOfCentralDirectory.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

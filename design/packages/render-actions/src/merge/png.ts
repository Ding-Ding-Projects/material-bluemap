import { deflateSync, inflateSync } from "node:zlib";

/**
 * A deliberately small PNG codec for exactly one shape of image: 8-bit RGBA,
 * non-interlaced. That is what BlueMap's lowres tiles always are, because
 * `LowresTile#save` hands ImageIO a `BufferedImage.TYPE_INT_ARGB`.
 *
 * This is hand-written rather than pulled from a package on purpose. The merge step
 * has to decode a lowres tile, composite it and write it back, and adding a codec
 * dependency to a workspace whose lockfile several people are editing at once buys
 * a dependency-resolution problem in exchange for saving a page of well-understood
 * format handling. The subset is fixed by BlueMap, so it cannot drift.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A decoded image: `data` is width * height pixels, 4 bytes each, in R,G,B,A order. */
export interface RgbaImage {
    width: number;
    height: number;
    data: Buffer;
}

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buffer.length; i++)
        c = CRC_TABLE[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

/** Decodes an 8-bit RGBA non-interlaced PNG. Anything else is rejected by name. */
export function decodePng(buffer: Buffer): RgbaImage {
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
        throw new Error("Not a PNG: the 8-byte signature does not match");

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = -1;
    let interlace = 0;
    const idatParts: Buffer[] = [];
    let sawHeader = false;

    let offset = 8;
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("latin1", offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > buffer.length)
            throw new Error("Truncated PNG: chunk '" + type + "' runs past the end of the file");

        if (type === "IHDR") {
            width = buffer.readUInt32BE(dataStart);
            height = buffer.readUInt32BE(dataStart + 4);
            bitDepth = buffer[dataStart + 8]!;
            colorType = buffer[dataStart + 9]!;
            interlace = buffer[dataStart + 12]!;
            sawHeader = true;
        } else if (type === "IDAT") {
            idatParts.push(buffer.subarray(dataStart, dataEnd));
        } else if (type === "IEND") {
            break;
        }

        offset = dataEnd + 4;
    }

    if (!sawHeader) throw new Error("Malformed PNG: no IHDR chunk");
    if (bitDepth !== 8 || colorType !== 6)
        throw new Error(
            "Unsupported PNG: expected 8-bit RGBA (bitDepth 8, colorType 6) but got bitDepth " +
                bitDepth +
                ", colorType " +
                colorType,
        );
    if (interlace !== 0) throw new Error("Unsupported PNG: interlaced images are not handled");

    const raw = inflateSync(Buffer.concat(idatParts));
    const bytesPerPixel = 4;
    const stride = width * bytesPerPixel;
    const data = Buffer.alloc(stride * height);

    let rawOffset = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rawOffset++];
        if (filter === undefined)
            throw new Error("Truncated PNG: scanline " + y + " has no filter byte");

        const lineStart = y * stride;
        const previousStart = lineStart - stride;
        for (let x = 0; x < stride; x++) {
            const value = raw[rawOffset + x];
            if (value === undefined)
                throw new Error("Truncated PNG: scanline " + y + " is short");

            const left = x >= bytesPerPixel ? data[lineStart + x - bytesPerPixel]! : 0;
            const up = y > 0 ? data[previousStart + x]! : 0;
            const upLeft =
                y > 0 && x >= bytesPerPixel ? data[previousStart + x - bytesPerPixel]! : 0;

            let restored: number;
            switch (filter) {
                case 0:
                    restored = value;
                    break;
                case 1:
                    restored = value + left;
                    break;
                case 2:
                    restored = value + up;
                    break;
                case 3:
                    restored = value + ((left + up) >> 1);
                    break;
                case 4:
                    restored = value + paeth(left, up, upLeft);
                    break;
                default:
                    throw new Error("Unsupported PNG filter type " + filter + " on scanline " + y);
            }
            data[lineStart + x] = restored & 0xff;
        }
        rawOffset += stride;
    }

    return { width, height, data };
}

function chunk(type: string, data: Buffer): Buffer {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length, 0);
    header.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
    return Buffer.concat([header, data, crc]);
}

/**
 * Encodes an 8-bit RGBA PNG with every scanline stored unfiltered.
 *
 * The bytes will not match what Java's ImageIO produces for the same pixels, and they
 * do not need to: the webapp reads these as images. Merge verification therefore
 * compares lowres tiles pixel by pixel and never byte by byte.
 */
export function encodePng(image: RgbaImage): Buffer {
    const stride = image.width * 4;
    const raw = Buffer.alloc((stride + 1) * image.height);
    for (let y = 0; y < image.height; y++) {
        raw[y * (stride + 1)] = 0;
        image.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(image.width, 0);
    header.writeUInt32BE(image.height, 4);
    header[8] = 8;
    header[9] = 6;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;

    return Buffer.concat([
        PNG_SIGNATURE,
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** An all-zero (fully transparent) image of the given size. */
export function blankImage(width: number, height: number): RgbaImage {
    return { width, height, data: Buffer.alloc(width * height * 4) };
}

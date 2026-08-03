/**
 * A minimal, dependency-free PNG reader.
 *
 * `tools/` deliberately has no `node_modules` (see tools/README.md), and the oracle has
 * to compare lowres tiles *pixel for pixel* rather than byte for byte: two encoders can
 * emit different-but-equivalent PNG bytes (filter choice, zlib level, ancillary chunks)
 * for the same image, and a byte comparison would fail on a correct render. So the bytes
 * are compared first — that is the cheap, strongest signal — and only when they differ
 * are both images decoded and their pixels compared.
 *
 * Supported: non-interlaced, bit depth 8, colour types 0 (grey), 2 (rgb), 3 (palette),
 * 4 (grey+alpha) and 6 (rgba). That covers everything ImageIO writes for a
 * `TYPE_INT_ARGB` BufferedImage, which is what `LowresTile#save` hands it. Anything else
 * throws with the exact reason instead of guessing.
 */

import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channel count per colour type, indexed by the colour-type byte. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export class PngFormatError extends Error {}

/**
 * @param {Buffer} data
 * @returns {{ chunks: {type: string, data: Buffer}[] }}
 */
function readChunks(data) {
    if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE))
        throw new PngFormatError("not a PNG file (bad signature)");

    const chunks = [];
    let offset = 8;
    while (offset + 8 <= data.length) {
        const length = data.readUInt32BE(offset);
        const type = data.toString("latin1", offset + 4, offset + 8);
        const start = offset + 8;
        const end = start + length;
        if (end + 4 > data.length)
            throw new PngFormatError(`truncated PNG chunk '${type}' at offset ${offset}`);
        chunks.push({ type, data: data.subarray(start, end) });
        offset = end + 4; // skip the crc
        if (type === "IEND") break;
    }
    return { chunks };
}

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

/**
 * Decodes a PNG into 8-bit RGBA.
 *
 * @param {Buffer} data
 * @returns {{ width: number, height: number, pixels: Buffer }} `pixels` is
 *          `width * height * 4` bytes, RGBA, row-major.
 */
export function decodePng(data) {
    const { chunks } = readChunks(data);

    const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
    if (ihdr === undefined) throw new PngFormatError("PNG has no IHDR chunk");
    if (ihdr.data.length < 13) throw new PngFormatError("PNG IHDR chunk is too short");

    const width = ihdr.data.readUInt32BE(0);
    const height = ihdr.data.readUInt32BE(4);
    const bitDepth = ihdr.data.readUInt8(8);
    const colourType = ihdr.data.readUInt8(9);
    const interlace = ihdr.data.readUInt8(12);

    if (bitDepth !== 8)
        throw new PngFormatError(`unsupported PNG bit depth ${bitDepth} (only 8 is decoded)`);
    if (interlace !== 0) throw new PngFormatError("unsupported interlaced PNG");
    const channels = CHANNELS[colourType];
    if (channels === undefined)
        throw new PngFormatError(`unsupported PNG colour type ${colourType}`);

    let palette = null;
    let transparency = null;
    const idatParts = [];
    for (const chunk of chunks) {
        if (chunk.type === "IDAT") idatParts.push(chunk.data);
        else if (chunk.type === "PLTE") palette = chunk.data;
        else if (chunk.type === "tRNS") transparency = chunk.data;
    }
    if (idatParts.length === 0) throw new PngFormatError("PNG has no IDAT chunk");

    const raw = inflateSync(Buffer.concat(idatParts));

    const bytesPerPixel = channels; // bit depth is 8
    const stride = width * bytesPerPixel;
    const expected = (stride + 1) * height;
    if (raw.length < expected)
        throw new PngFormatError(
            `PNG image data is ${raw.length} bytes, expected at least ${expected}`,
        );

    // un-filter, in place, into one contiguous scanline buffer
    const lines = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const inOffset = y * (stride + 1) + 1;
        const outOffset = y * stride;
        const prevOffset = outOffset - stride;

        for (let x = 0; x < stride; x++) {
            const value = raw[inOffset + x];
            const a = x >= bytesPerPixel ? lines[outOffset + x - bytesPerPixel] : 0;
            const b = y > 0 ? lines[prevOffset + x] : 0;
            const c = y > 0 && x >= bytesPerPixel ? lines[prevOffset + x - bytesPerPixel] : 0;

            let out;
            switch (filter) {
                case 0:
                    out = value;
                    break;
                case 1:
                    out = value + a;
                    break;
                case 2:
                    out = value + b;
                    break;
                case 3:
                    out = value + ((a + b) >> 1);
                    break;
                case 4:
                    out = value + paethPredictor(a, b, c);
                    break;
                default:
                    throw new PngFormatError(`unknown PNG filter type ${filter} on row ${y}`);
            }
            lines[outOffset + x] = out & 0xff;
        }
    }

    // expand to rgba
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const source = i * bytesPerPixel;
        switch (colourType) {
            case 0: {
                const grey = lines[source];
                pixels[p] = grey;
                pixels[p + 1] = grey;
                pixels[p + 2] = grey;
                pixels[p + 3] = 0xff;
                break;
            }
            case 2:
                pixels[p] = lines[source];
                pixels[p + 1] = lines[source + 1];
                pixels[p + 2] = lines[source + 2];
                pixels[p + 3] = 0xff;
                break;
            case 3: {
                if (palette === null) throw new PngFormatError("paletted PNG without a PLTE chunk");
                const index = lines[source];
                pixels[p] = palette[index * 3] ?? 0;
                pixels[p + 1] = palette[index * 3 + 1] ?? 0;
                pixels[p + 2] = palette[index * 3 + 2] ?? 0;
                pixels[p + 3] = transparency !== null ? (transparency[index] ?? 0xff) : 0xff;
                break;
            }
            case 4: {
                const grey = lines[source];
                pixels[p] = grey;
                pixels[p + 1] = grey;
                pixels[p + 2] = grey;
                pixels[p + 3] = lines[source + 1];
                break;
            }
            case 6:
                pixels[p] = lines[source];
                pixels[p + 1] = lines[source + 1];
                pixels[p + 2] = lines[source + 2];
                pixels[p + 3] = lines[source + 3];
                break;
            default:
                throw new PngFormatError(`unsupported PNG colour type ${colourType}`);
        }
    }

    return { width, height, pixels };
}

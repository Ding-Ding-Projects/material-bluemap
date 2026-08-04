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

    /*
     * Bit depths below 8 exist here for one reason, and it is a comparison that matters:
     * Java's ImageIO writes a small-palette texture as an indexed PNG at 1, 2 or 4 bits
     * per pixel, while this project's encoder writes 8-bit RGBA. 532 of the 2092 textures
     * in `textures.json` are in that shape, and refusing to decode them would leave a
     * quarter of the gallery compared as "could not check" - which reads as agreement and
     * is not.
     *
     * Only indexed and greyscale images are ever packed below 8 bits (the PNG spec allows
     * it for colour types 0 and 3 only), so this stays narrow deliberately.
     */
    if (![1, 2, 4, 8].includes(bitDepth))
        throw new PngFormatError(`unsupported PNG bit depth ${bitDepth} (1, 2, 4 and 8 are decoded)`);
    if (bitDepth !== 8 && colourType !== 0 && colourType !== 3)
        throw new PngFormatError(
            `PNG colour type ${colourType} cannot be ${bitDepth} bits per sample`,
        );
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

    /*
     * The filter works on bytes, so a packed row is un-filtered as bytes and only then
     * unpacked into samples. `bytesPerPixel` is the filter's "distance to the pixel on
     * the left", which the spec rounds *down* to one byte when a pixel occupies less than
     * one - getting that wrong is a silent corruption rather than an error.
     */
    const samplesPerRow = width * channels;
    const stride =
        bitDepth === 8 ? samplesPerRow : Math.ceil((samplesPerRow * bitDepth) / 8);
    const bytesPerPixel = bitDepth === 8 ? channels : 1;
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

    /*
     * Unpack sub-byte samples into one byte each, so everything below works on the same
     * shape whatever the file's bit depth was.
     *
     * Greyscale is *scaled* to the full range rather than left as a raw index, which is
     * what the spec requires and what any viewer does: a 1-bit white pixel is 255, not 1.
     * Palette indices are left alone, because they are indices and scaling one would look
     * up the wrong colour.
     */
    const samples =
        bitDepth === 8
            ? lines
            : (() => {
                  const unpacked = Buffer.alloc(samplesPerRow * height);
                  const max = (1 << bitDepth) - 1;
                  const perByte = 8 / bitDepth;
                  for (let y = 0; y < height; y++) {
                      for (let s = 0; s < samplesPerRow; s++) {
                          const byte = lines[y * stride + Math.floor(s / perByte)];
                          const shift = 8 - bitDepth * ((s % perByte) + 1);
                          const value = (byte >> shift) & max;
                          unpacked[y * samplesPerRow + s] =
                              colourType === 3 ? value : Math.round((value * 255) / max);
                      }
                  }
                  return unpacked;
              })();
    const samplesPerPixel = channels;

    // expand to rgba
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const source = i * samplesPerPixel;
        switch (colourType) {
            case 0: {
                const grey = samples[source];
                pixels[p] = grey;
                pixels[p + 1] = grey;
                pixels[p + 2] = grey;
                pixels[p + 3] = 0xff;
                break;
            }
            case 2:
                pixels[p] = samples[source];
                pixels[p + 1] = samples[source + 1];
                pixels[p + 2] = samples[source + 2];
                pixels[p + 3] = 0xff;
                break;
            case 3: {
                if (palette === null) throw new PngFormatError("paletted PNG without a PLTE chunk");
                const index = samples[source];
                pixels[p] = palette[index * 3] ?? 0;
                pixels[p + 1] = palette[index * 3 + 1] ?? 0;
                pixels[p + 2] = palette[index * 3 + 2] ?? 0;
                pixels[p + 3] = transparency !== null ? (transparency[index] ?? 0xff) : 0xff;
                break;
            }
            case 4: {
                const grey = samples[source];
                pixels[p] = grey;
                pixels[p + 1] = grey;
                pixels[p + 2] = grey;
                pixels[p + 3] = samples[source + 1];
                break;
            }
            case 6:
                pixels[p] = samples[source];
                pixels[p + 1] = samples[source + 1];
                pixels[p + 2] = samples[source + 2];
                pixels[p + 3] = samples[source + 3];
                break;
            default:
                throw new PngFormatError(`unsupported PNG colour type ${colourType}`);
        }
    }

    return { width, height, pixels };
}

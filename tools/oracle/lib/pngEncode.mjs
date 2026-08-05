/**
 * A minimal, dependency-free PNG writer — the encoding half of `lib/png.mjs`'s reader.
 *
 * `tools/` deliberately has no `node_modules` (see `tools/README.md`), so this cannot reach
 * for `pngjs` the way `design/packages/engine` does. Every texture this harness needs to
 * fabricate (see `tools/oracle/fixtures/syntheticModPack.mjs`) is small and synthetic, so a
 * full encoder is not needed either — this always writes the simplest legal shape: 8-bit
 * RGBA (colour type 6), one IDAT chunk, filter type 0 (None) on every scanline, no
 * interlacing. `lib/png.mjs`'s decoder reads that shape directly (its own doc comment lists
 * colour type 6 / bit depth 8 as supported), and it is exactly what `pngjs` and Java's
 * `ImageIO` both decode without any special case.
 */

import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The standard PNG/zlib CRC-32 table (polynomial 0xedb88320), built once. */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
    return Buffer.concat([length, typeBytes, data, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number) => [r: number, g: number, b: number, a: number]} paint
 * @returns {Buffer} a complete, standalone PNG file
 */
export function encodePng(width, height, paint) {
    const stride = width * 4;
    const raw = Buffer.alloc(height * (1 + stride));
    for (let y = 0; y < height; y++) {
        const rowStart = y * (1 + stride);
        raw[rowStart] = 0; // filter type: None
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = paint(x, y);
            const p = rowStart + 1 + x * 4;
            raw[p] = r;
            raw[p + 1] = g;
            raw[p + 2] = b;
            raw[p + 3] = a;
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: truecolour + alpha
    ihdr[10] = 0; // compression method
    ihdr[11] = 0; // filter method
    ihdr[12] = 0; // interlace method: none

    return Buffer.concat([
        PNG_SIGNATURE,
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** A single flat colour, the shape almost every one of this harness's textures needs. */
export function solidPng(width, height, [r, g, b, a]) {
    return encodePng(width, height, () => [r, g, b, a]);
}

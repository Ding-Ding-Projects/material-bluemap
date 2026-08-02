import { gunzipSync, inflateSync } from "node:zlib";

/**
 * Auto-detects gzip- (magic 0x1f 0x8b) or zlib/deflate- (0x78 CMF-byte) compressed
 * nbt-data and decompresses it via node:zlib. Data without a known
 * compression-header is returned unchanged (raw/uncompressed nbt).
 *
 * Covers .dat-style files (level.dat, playerdata, renderstate); mca-chunk-payloads
 * carry an explicit compression-type byte instead and are handled by the engine.
 */
export function decompressNbt(data: Uint8Array): Uint8Array {
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) return gunzipSync(data);
    if (data.length >= 1 && data[0] === 0x78) return inflateSync(data);
    return data;
}

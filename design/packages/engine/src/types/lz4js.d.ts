/**
 * Minimal type declarations for the untyped `lz4js` package (v0.2.0), covering only the
 * raw-block codec used by the lz4-java block-stream port in storage/compression/Lz4Block.ts.
 */
declare module "lz4js" {
    /**
     * Compresses `sLength` bytes of `src` starting at `sIndex` into `dst` (from index 0)
     * as one raw lz4 block. Returns the number of bytes written to `dst`, or 0 when
     * nothing could be encoded (incompressible input).
     * `hashTable` is scratch space of 1 << 16 uint32 slots; 0 marks an empty slot.
     */
    export function compressBlock(
        src: Uint8Array,
        dst: Uint8Array,
        sIndex: number,
        sLength: number,
        hashTable: Uint32Array | number[],
    ): number;

    /**
     * Decompresses `sLength` bytes of one raw lz4 block in `src` starting at `sIndex`
     * into `dst` starting at `dIndex`. Returns the end index of the decompressed data
     * in `dst` (i.e. the number of bytes produced when `dIndex` is 0).
     */
    export function decompressBlock(
        src: Uint8Array,
        dst: Uint8Array,
        sIndex: number,
        sLength: number,
        dIndex: number,
    ): number;

    /** Worst-case compressed size of `n` input bytes: `(n + (n / 255) + 16) | 0`. */
    export function compressBound(n: number): number;
}

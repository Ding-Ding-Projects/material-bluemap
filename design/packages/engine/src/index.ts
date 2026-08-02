// storage/compression
export { Compression } from "./storage/compression/Compression.js";
export {
    BufferedCompression,
    type BufferCodec,
    type Compressor,
    type Decompressor,
    type StreamTransformer,
} from "./storage/compression/BufferedCompression.js";
export { NoCompression } from "./storage/compression/NoCompression.js";
export { CompressedInputStream } from "./storage/compression/CompressedInputStream.js";
export {
    CHECKSUM_MASK,
    COMPRESSION_LEVEL_BASE,
    COMPRESSION_METHOD_LZ4,
    COMPRESSION_METHOD_RAW,
    DEFAULT_BLOCK_SIZE,
    DEFAULT_SEED,
    HEADER_LENGTH,
    MAGIC,
    MAGIC_LENGTH,
    MAX_BLOCK_SIZE,
    MIN_BLOCK_SIZE,
    compressionLevel,
    createLz4BlockCompressStream,
    createLz4BlockDecompressStream,
    lz4BlockCompress,
    lz4BlockDecompress,
} from "./storage/compression/Lz4Block.js";

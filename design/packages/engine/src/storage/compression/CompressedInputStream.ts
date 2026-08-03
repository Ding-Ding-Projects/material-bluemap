import { Compression } from "./Compression.js";

/**
 * An InputStream that is aware of the {@link Compression} that it's data is compressed with.
 *
 * (Upstream extends DelegateInputStream; the port is a (Buffer, Compression) pair — the
 * buffer holds the bytes the delegate stream would yield, i.e. the still-compressed data.)
 */
export class CompressedInputStream {
    private readonly in: Buffer;
    private readonly compression: Compression;

    /**
     * Creates a new CompressedInputStream with {@link Compression#NONE} from (uncompressed) data,
     * or from <b>already compressed</b> data and the {@link Compression} it is compressed with.
     * This does <b>not</b> compress the provided data.
     */
    constructor(input: Uint8Array, compression: Compression = Compression.NONE) {
        this.in = Buffer.isBuffer(input)
            ? input
            : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
        this.compression = compression;
    }

    /**
     * Returns the decompressed data
     */
    decompress(): Promise<Buffer> {
        return this.compression.decompress(this.in);
    }

    /**
     * Returns the {@link Compression} this data is compressed with
     */
    getCompression(): Compression {
        return this.compression;
    }

    /**
     * Returns the raw (still compressed) data — the equivalent of reading the upstream
     * stream directly without calling {@code decompress()}
     */
    getBuffer(): Buffer {
        return this.in;
    }
}

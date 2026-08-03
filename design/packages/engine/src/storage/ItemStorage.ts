import type { CompressedInputStream } from "./compression/CompressedInputStream.js";

/**
 * upstream: storage/ItemStorage.java
 *
 * Upstream hands out an {@code OutputStream} to write into and a
 * {@link CompressedInputStream} to read from, both closed by the caller. This port is
 * buffer-oriented instead — {@link CompressedInputStream} is already a
 * (Buffer, Compression) pair here, and every upstream caller of {@code write()} writes a
 * complete document in one go. See docs/deviations.md.
 */
export interface ItemStorage {
    /**
     * Writes the item-data of this storage (overwriting any existing item), compressing it
     * with this storage's compression.
     */
    write(data: Uint8Array): Promise<void>;

    /**
     * Returns a {@link CompressedInputStream} holding the item-data of this storage
     * or null if there is nothing stored.
     */
    read(): Promise<CompressedInputStream | null>;

    /**
     * Deletes the item from this storage
     */
    delete(): Promise<void>;

    /**
     * Tests if this item of this storage exists
     */
    exists(): Promise<boolean>;

    /**
     * Checks if this storage is closed
     */
    isClosed(): boolean;
}

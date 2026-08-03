import type { CompressedInputStream } from "./compression/CompressedInputStream.js";
import type { ItemStorage } from "./ItemStorage.js";

/**
 * upstream: storage/GridStorage.java
 *
 * A storage storing items on an infinite grid (x,z), each position on the grid can hold one item.
 */
export interface GridStorage {
    /**
     * Writes an item into this storage at the given position (overwriting any existing item).
     */
    write(x: number, z: number, data: Uint8Array): Promise<void>;

    /**
     * Returns a {@link CompressedInputStream} holding the item from this storage at the
     * given position or null if there is no item stored.
     */
    read(x: number, z: number): Promise<CompressedInputStream | null>;

    /**
     * Deletes the item from this storage at the given position
     */
    delete(x: number, z: number): Promise<void>;

    /**
     * Tests if there is an item stored on the given position in this storage
     */
    exists(x: number, z: number): Promise<boolean>;

    /**
     * Returns a {@link ItemStorage} for the given position
     */
    cell(x: number, z: number): ItemStorage;

    /**
     * Returns all <b>existing</b> items in this storage.
     *
     * (Upstream returns a lazy {@code Stream<Cell>}; the port collects it, exactly as
     * {@code util/FileHelper#walk} already does — every upstream consumer drains it.)
     */
    stream(): Promise<Cell[]>;

    /**
     * Checks if this storage is closed
     */
    isClosed(): boolean;
}

/** upstream: GridStorage.Cell (a nested interface) */
export interface Cell extends ItemStorage {
    /**
     * Returns the x position of this item in the grid
     */
    getX(): number;

    /**
     * Returns the z position of this item in the grid
     */
    getZ(): number;
}

/** upstream: GridStorage.GridStorageCell (a nested class) */
export class GridStorageCell implements Cell {
    private readonly storage: GridStorage;
    private readonly x: number;
    private readonly z: number;

    constructor(storage: GridStorage, x: number, z: number) {
        this.storage = storage;
        this.x = x;
        this.z = z;
    }

    getStorage(): GridStorage {
        return this.storage;
    }

    getX(): number {
        return this.x;
    }

    getZ(): number {
        return this.z;
    }

    write(data: Uint8Array): Promise<void> {
        return this.storage.write(this.x, this.z, data);
    }

    read(): Promise<CompressedInputStream | null> {
        return this.storage.read(this.x, this.z);
    }

    delete(): Promise<void> {
        return this.storage.delete(this.x, this.z);
    }

    exists(): Promise<boolean> {
        return this.storage.exists(this.x, this.z);
    }

    isClosed(): boolean {
        return this.storage.isClosed();
    }
}

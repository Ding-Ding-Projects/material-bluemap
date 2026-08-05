import type { Key } from "@material-bluemap/shared";
import { CompressedInputStream } from "../compression/CompressedInputStream.js";
import type { Compression } from "../compression/Compression.js";
import { GridStorageCell, type Cell, type GridStorage } from "../GridStorage.js";
import type { ItemStorage } from "../ItemStorage.js";
import type { CommandSet } from "./commandset/CommandSet.js";
import { collectPages } from "./PageSpliterator.js";

/** upstream: the literal `1000` passed to `new PageSpliterator<>(page -> sql.listGridItems(..., page * 1000, 1000))` */
const PAGE_SIZE = 1000;

/**
 * upstream: storage/sql/SQLGridStorage.java
 */
export class SQLGridStorage implements GridStorage {
    private readonly sql: CommandSet;
    private readonly mapId: string;
    private readonly storageKey: Key;
    private readonly compression: Compression;

    constructor(sql: CommandSet, mapId: string, storageKey: Key, compression: Compression) {
        this.sql = sql;
        this.mapId = mapId;
        this.storageKey = storageKey;
        this.compression = compression;
    }

    async write(x: number, z: number, data: Uint8Array): Promise<void> {
        const compressed = await this.compression.compress(data);
        await this.sql.writeGridItem(this.mapId, this.storageKey, x, z, this.compression, compressed);
    }

    async read(x: number, z: number): Promise<CompressedInputStream | null> {
        const data = await this.sql.readGridItem(this.mapId, this.storageKey, x, z, this.compression);
        if (data === null) return null;
        return new CompressedInputStream(data, this.compression);
    }

    async delete(x: number, z: number): Promise<void> {
        await this.sql.deleteGridItem(this.mapId, this.storageKey, x, z);
    }

    async exists(x: number, z: number): Promise<boolean> {
        return this.sql.hasGridItem(this.mapId, this.storageKey, x, z, this.compression);
    }

    cell(x: number, z: number): ItemStorage {
        return new GridStorageCell(this, x, z);
    }

    async stream(): Promise<Cell[]> {
        const positions = await collectPages(PAGE_SIZE, (start, count) =>
            this.sql.listGridItems(this.mapId, this.storageKey, this.compression, start, count),
        );
        return positions.map((pos) => new GridStorageCell(this, pos.x, pos.z));
    }

    isClosed(): boolean {
        return this.sql.isClosed();
    }
}

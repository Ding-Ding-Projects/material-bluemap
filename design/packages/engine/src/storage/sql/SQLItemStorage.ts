import type { Key } from "@material-bluemap/shared";
import { CompressedInputStream } from "../compression/CompressedInputStream.js";
import type { Compression } from "../compression/Compression.js";
import type { ItemStorage } from "../ItemStorage.js";
import type { CommandSet } from "./commandset/CommandSet.js";

/**
 * upstream: storage/sql/SQLItemStorage.java
 *
 * Upstream hands the caller an {@code OutputStream} that compresses as it is written
 * and, on close, stores the compressed bytes; this port's buffer-oriented
 * {@link ItemStorage} contract (see the port's own doc-comment on that interface)
 * compresses up front instead — the same shape {@link FileItemStorage} already uses.
 */
export class SQLItemStorage implements ItemStorage {
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

    async write(data: Uint8Array): Promise<void> {
        const compressed = await this.compression.compress(data);
        await this.sql.writeItem(this.mapId, this.storageKey, this.compression, compressed);
    }

    async read(): Promise<CompressedInputStream | null> {
        const data = await this.sql.readItem(this.mapId, this.storageKey, this.compression);
        if (data === null) return null;
        return new CompressedInputStream(data, this.compression);
    }

    async delete(): Promise<void> {
        await this.sql.deleteItem(this.mapId, this.storageKey);
    }

    async exists(): Promise<boolean> {
        return this.sql.hasItem(this.mapId, this.storageKey, this.compression);
    }

    isClosed(): boolean {
        return this.sql.isClosed();
    }
}

import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { decodeTilePath, encodeTilePath } from "@worldlens/shared";
import { walk } from "../../util/FileHelper.js";
import type { CompressedInputStream } from "../compression/CompressedInputStream.js";
import type { Compression } from "../compression/Compression.js";
import type { Cell, GridStorage } from "../GridStorage.js";
import type { ItemStorage } from "../ItemStorage.js";
import { FileItemStorage } from "./FileItemStorage.js";

/**
 * upstream: storage/file/FileGridStorage.java
 *
 * The item-path encoding ({@code getItemPath}) and its inverse (the {@code ITEM_PATH_PATTERN}
 * matching inside {@code stream()}) live in {@code shared/TilePathCodec}, which the webapp
 * shares — they are the same codec and were ported once.
 */
export class FileGridStorage implements GridStorage {
    private readonly root: string;
    private readonly suffix: string;
    private readonly compression: Compression;
    private readonly atomic: boolean;

    constructor(root: string, suffix: string, compression: Compression, atomic: boolean) {
        this.root = root;
        this.suffix = suffix;
        this.compression = compression;
        this.atomic = atomic;
    }

    getRoot(): string {
        return this.root;
    }

    getSuffix(): string {
        return this.suffix;
    }

    write(x: number, z: number, data: Uint8Array): Promise<void> {
        return this.cell(x, z).write(data);
    }

    read(x: number, z: number): Promise<CompressedInputStream | null> {
        return this.cell(x, z).read();
    }

    delete(x: number, z: number): Promise<void> {
        return this.cell(x, z).delete();
    }

    exists(x: number, z: number): Promise<boolean> {
        return this.cell(x, z).exists();
    }

    cell(x: number, z: number): ItemStorage {
        return new FileItemStorage(this.getItemPath(x, z), this.compression, this.atomic);
    }

    async stream(): Promise<Cell[]> {
        const cells: Cell[] = [];
        for (const itemPath of await walk(this.root)) {
            let isRegularFile: boolean;
            try {
                isRegularFile = (await stat(itemPath)).isFile();
            } catch {
                continue;
            }
            if (!isRegularFile) continue;

            const relativePath = relative(this.root, itemPath);
            // upstream: `if (!path.startsWith(root)) return null;`
            if (relativePath.startsWith("..")) continue;

            const coords = decodeTilePath(relativePath, this.suffix);
            if (coords === null) continue;

            cells.push(
                new PathCell(coords.x, coords.z, itemPath, this.compression, this.atomic),
            );
        }
        return cells;
    }

    isClosed(): boolean {
        return false;
    }

    getItemPath(x: number, z: number): string {
        return join(this.root, ...encodeTilePath(x, z, this.suffix).split("/"));
    }
}

/** upstream: FileGridStorage.PathCell (a private nested class) */
class PathCell extends FileItemStorage implements Cell {
    private readonly x: number;
    private readonly z: number;

    constructor(
        x: number,
        z: number,
        itemPath: string,
        compression: Compression,
        atomic: boolean,
    ) {
        super(itemPath, compression, atomic);
        this.x = x;
        this.z = z;
    }

    getX(): number {
        return this.x;
    }

    getZ(): number {
        return this.z;
    }
}

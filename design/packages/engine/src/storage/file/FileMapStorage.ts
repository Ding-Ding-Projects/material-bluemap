import { rm } from "node:fs/promises";
import { join } from "node:path";
import { walk } from "../../util/FileHelper.js";
import { Compression } from "../compression/Compression.js";
import type { GridStorage } from "../GridStorage.js";
import type { ItemStorage } from "../ItemStorage.js";
import { MapStorage, type DoublePredicate } from "../MapStorage.js";
import { fileExists, FileItemStorage } from "./FileItemStorage.js";
import { FileGridStorage } from "./FileGridStorage.js";

const TILES_PATH = "tiles";
const RENDER_STATE_PATH = "rstate";
const LIVE_PATH = "live";

/**
 * upstream: storage/file/FileMapStorage.java
 */
export class FileMapStorage implements MapStorage {
    private readonly root: string;
    private readonly compression: Compression;
    private readonly atomic: boolean;

    private readonly hiresGridStorage: GridStorage;
    /** upstream: {@code LoadingCache<Integer, GridStorage>} (caffeine) */
    private readonly lowresGridStorages = new Map<number, GridStorage>();
    private readonly tileStateStorage: GridStorage;
    private readonly chunkStateStorage: GridStorage;
    private readonly regionStateStorage: GridStorage;

    constructor(root: string, compression: Compression, atomic: boolean) {
        this.root = root;
        this.compression = compression;
        this.atomic = atomic;

        this.hiresGridStorage = new FileGridStorage(
            join(root, TILES_PATH, "0"),
            ".prbm" + compression.getFileSuffix(),
            compression,
            atomic,
        );

        this.tileStateStorage = new FileGridStorage(
            join(root, RENDER_STATE_PATH),
            ".tiles.dat",
            Compression.GZIP,
            atomic,
        );

        this.chunkStateStorage = new FileGridStorage(
            join(root, RENDER_STATE_PATH),
            ".chunks.dat",
            Compression.GZIP,
            atomic,
        );

        this.regionStateStorage = new FileGridStorage(
            join(root, RENDER_STATE_PATH, "regions"),
            ".regions.dat",
            Compression.GZIP,
            atomic,
        );
    }

    getRoot(): string {
        return this.root;
    }

    hiresTiles(): GridStorage {
        return this.hiresGridStorage;
    }

    lowresTiles(lod: number): GridStorage {
        let storage = this.lowresGridStorages.get(lod);
        if (storage === undefined) {
            storage = new FileGridStorage(
                join(this.root, TILES_PATH, String(lod)),
                ".png",
                Compression.NONE,
                this.atomic,
            );
            this.lowresGridStorages.set(lod, storage);
        }
        return storage;
    }

    tileState(): GridStorage {
        return this.tileStateStorage;
    }

    chunkState(): GridStorage {
        return this.chunkStateStorage;
    }

    regionState(): GridStorage {
        return this.regionStateStorage;
    }

    getAssetPath(name: string): string {
        const parts = MapStorage.escapeAssetName(name).split("/");
        return join(this.root, "assets", ...parts);
    }

    asset(name: string): ItemStorage {
        return new FileItemStorage(this.getAssetPath(name), Compression.NONE, this.atomic);
    }

    settings(): ItemStorage {
        return new FileItemStorage(join(this.root, "settings.json"), Compression.NONE, this.atomic);
    }

    textures(): ItemStorage {
        return new FileItemStorage(
            join(this.root, "textures.json" + this.compression.getFileSuffix()),
            this.compression,
            this.atomic,
        );
    }

    markers(): ItemStorage {
        return new FileItemStorage(
            join(this.root, LIVE_PATH, "markers.json"),
            Compression.NONE,
            this.atomic,
        );
    }

    players(): ItemStorage {
        return new FileItemStorage(
            join(this.root, LIVE_PATH, "players.json"),
            Compression.NONE,
            this.atomic,
        );
    }

    async delete(onProgress: DoublePredicate = () => true): Promise<void> {
        if (!(await fileExists(this.root))) return;

        // collect sub-files to be able to provide progress-updates
        const subFiles = await walk(this.root, 3);
        const subFilesCount = subFiles.length;

        // delete subFiles first to be able to track the progress and cancel
        while (subFiles.length > 0) {
            const subFile = subFiles[subFiles.length - 1] as string;
            await rm(subFile, { recursive: true, force: true });
            subFiles.pop();

            if (!onProgress(1 - subFiles.length / subFilesCount)) return;
        }

        // make sure everything is deleted
        if (await fileExists(this.root)) await rm(this.root, { recursive: true, force: true });
    }

    exists(): Promise<boolean> {
        return fileExists(this.root);
    }

    isClosed(): boolean {
        return false;
    }
}

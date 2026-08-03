import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Compression } from "../compression/Compression.js";
import type { Storage } from "../Storage.js";
import { fileExists } from "./FileItemStorage.js";
import { FileMapStorage } from "./FileMapStorage.js";

/**
 * upstream: storage/file/FileStorage.java
 */
export class FileStorage implements Storage {
    private readonly root: string;
    private readonly compression: Compression;
    private readonly atomic: boolean;
    /** upstream: {@code LoadingCache<String, FileMapStorage>} (caffeine) */
    private readonly mapStorages = new Map<string, FileMapStorage>();

    constructor(root: string, compression: Compression, atomic: boolean) {
        this.root = root;
        this.compression = compression;
        this.atomic = atomic;
    }

    getRoot(): string {
        return this.root;
    }

    async initialize(): Promise<void> {}

    map(mapId: string): FileMapStorage {
        let storage = this.mapStorages.get(mapId);
        if (storage === undefined) {
            storage = new FileMapStorage(join(this.root, mapId), this.compression, this.atomic);
            this.mapStorages.set(mapId, storage);
        }
        return storage;
    }

    async mapIds(): Promise<string[]> {
        if (!(await fileExists(this.root))) return [];
        const entries = await readdir(this.root, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }

    isClosed(): boolean {
        return false;
    }

    async close(): Promise<void> {}
}

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
    PackPath,
    normalizePath,
    type PackFileStats,
    type PackFileSystem,
} from "./PackFileSystem.js";

/**
 * A {@link PackFileSystem} over a real directory on the OS file-system
 * (upstream: the default java.nio FileSystem).
 */
export class DirFileSystem implements PackFileSystem {
    /** absolute OS-path of the directory this file-system is rooted at */
    readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    getName(): string {
        return this.root;
    }

    getOsPath(path: string): string {
        const normalized = normalizePath(path);
        return normalized === "" ? this.root : join(this.root, ...normalized.split("/"));
    }

    async stat(path: string): Promise<PackFileStats | null> {
        try {
            const stats = await stat(this.getOsPath(path));
            return { file: stats.isFile(), directory: stats.isDirectory(), size: stats.size };
        } catch (_ex) {
            return null;
        }
    }

    async list(path: string): Promise<string[]> {
        try {
            return await readdir(this.getOsPath(path));
        } catch (_ex) {
            return [];
        }
    }

    async read(path: string): Promise<Buffer> {
        return readFile(this.getOsPath(path));
    }

    async close(): Promise<void> {
        // nothing to release
    }

    /** the root-directory of this file-system as a {@link PackPath} */
    getRoot(): PackPath {
        return new PackPath(this, "");
    }
}

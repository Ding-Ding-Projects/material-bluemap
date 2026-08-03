import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { atomicMove, createDirectories } from "../../util/FileHelper.js";
import { CompressedInputStream } from "../compression/CompressedInputStream.js";
import type { Compression } from "../compression/Compression.js";
import type { ItemStorage } from "../ItemStorage.js";

/** true if the given error is a "file does not exist" error (upstream: NoSuchFileException) */
function isNoSuchFile(ex: unknown): boolean {
    return typeof ex === "object" && ex !== null && (ex as { code?: string }).code === "ENOENT";
}

/** upstream: {@code Files.exists(file)} */
export async function fileExists(file: string): Promise<boolean> {
    try {
        await stat(file);
        return true;
    } catch (ex) {
        if (isNoSuchFile(ex)) return false;
        // java's Files.exists swallows every IOException and answers false
        return false;
    }
}

/**
 * upstream: storage/file/FileItemStorage.java
 */
export class FileItemStorage implements ItemStorage {
    private readonly file: string;
    private readonly compression: Compression;
    private readonly atomic: boolean;

    constructor(file: string, compression: Compression, atomic: boolean) {
        this.file = file;
        this.compression = compression;
        this.atomic = atomic;
    }

    getFile(): string {
        return this.file;
    }

    /**
     * Writes (and compresses) the data, overwriting any existing item.
     *
     * When {@code atomic}, the bytes go to a sibling {@code .filepart} file which is
     * atomically moved over the target afterwards — the port of
     * {@code FileHelper#createFilepartOutputStream} plus the close-action it installs.
     */
    async write(data: Uint8Array): Promise<void> {
        const compressed = await this.compression.compress(data);

        const folder = dirname(resolve(this.file));

        if (this.atomic) {
            const partFile = resolve(folder, basename(this.file) + ".filepart");
            await createDirectories(folder);
            await writeFile(partFile, compressed);
            if (!(await fileExists(partFile))) return;
            await createDirectories(folder);
            await atomicMove(partFile, this.file);
            return;
        }

        await createDirectories(folder);
        await writeFile(this.file, compressed);
    }

    async read(): Promise<CompressedInputStream | null> {
        if (!(await fileExists(this.file))) return null;
        try {
            return new CompressedInputStream(await readFile(this.file), this.compression);
        } catch (ex) {
            // upstream: FileNotFoundException | NoSuchFileException -> null
            if (isNoSuchFile(ex)) return null;
            throw ex;
        }
    }

    async delete(): Promise<void> {
        if (await fileExists(this.file)) await rm(this.file, { force: true });
    }

    exists(): Promise<boolean> {
        return fileExists(this.file);
    }

    isClosed(): boolean {
        return false;
    }
}

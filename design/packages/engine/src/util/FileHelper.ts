/*
 * upstream: util/FileHelper.java
 *
 * Only the three members the resources-layer needs are ported: {@link walk},
 * {@link createDirectories} and {@link atomicMove}. The remaining upstream members
 * (createFilepartOutputStream, extractZipFile, copy, awaitExistence) belong to the
 * storage/webapp layers and arrive with them.
 *
 * Paths are OS path-strings (node:fs) rather than java.nio {@code Path}s; the pack
 * loader's virtual file-system lives in resources/pack/vfs instead.
 */

import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

/** true if the given error is a "file does not exist" error (upstream: NoSuchFileException) */
function isNoSuchFile(ex: unknown): boolean {
    return typeof ex === "object" && ex !== null && (ex as { code?: string }).code === "ENOENT";
}

/**
 * Tries to move the file atomically, but fallbacks to a normal move operation if moving atomically fails
 *
 * (Node has a single {@code rename}, which is the atomic move — there is no
 * non-atomic {@code Files.move} to fall back to, and a copy+delete fallback would not
 * be a move at all. A {@code NoSuchFileException} is ignored exactly as upstream.)
 */
export async function atomicMove(from: string, to: string): Promise<void> {
    try {
        await rename(from, to);
    } catch (ex) {
        if (isNoSuchFile(ex)) return;
        throw ex;
    }
}

/**
 * Same as {@link Files#createDirectories(Path, FileAttribute[])} but accepts symlinked folders.
 * @see Files#createDirectories(Path, FileAttribute[])
 */
export async function createDirectories(dir: string): Promise<string> {
    if (await isDirectory(dir)) return dir;
    await mkdir(dir, { recursive: true });
    return dir;
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Adapted version of {@link Files#walk(Path, int, FileVisitOption...)}.
 * This version ignores NoSuchFileException if they occur while iterating the file-tree.
 *
 * (Upstream returns a lazy {@code Stream<Path>}; the port collects the walk into an
 * array — every upstream consumer drains the stream immediately. The start-path is
 * included first, then each directory's children in {@code readdir} order, depth-first.)
 */
export async function walk(start: string, maxDepth: number = 2147483647): Promise<string[]> {
    const result: string[] = [];
    await walkInto(start, maxDepth, result);
    return result;
}

async function walkInto(path: string, remainingDepth: number, result: string[]): Promise<void> {
    let directory: boolean;
    try {
        directory = (await stat(path)).isDirectory();
    } catch (ex) {
        // ignore NoSuchFileException while iterating the file-tree
        if (isNoSuchFile(ex)) return;
        throw ex;
    }

    result.push(path);
    if (!directory || remainingDepth <= 0) return;

    let names: string[];
    try {
        names = await readdir(path);
    } catch (ex) {
        if (isNoSuchFile(ex)) return;
        throw ex;
    }

    for (const name of names) await walkInto(join(path, name), remainingDepth - 1, result);
}

export const FileHelper = {
    atomicMove,
    createDirectories,
    walk,
};

/**
 * Unpacking a verified archive into the application's storage directory.
 *
 * Streamed entry by entry, for the same reason everything else here is: a rendered world
 * is tens of gigabytes and the archive holding it does not fit in memory.
 *
 * ## Every entry path is proved to stay inside the destination
 *
 * A zip entry name is arbitrary text chosen by whoever made the archive. `../../.ssh/`
 * and `C:\Windows\` are both valid entry names, and an extractor that joins them onto a
 * destination writes exactly where it was told to. That is Zip Slip, and it is the one
 * bug in an extractor that turns "downloaded a world" into "gave a stranger the machine".
 *
 * So the resolved path is compared with the destination after normalisation, absolute
 * entry names are refused outright, and so are symbolic links: a link is a path
 * dereferenced later, by something that will not be doing this check.
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipReader } from "./zip.js";
import type { ZipEntry } from "./zip.js";

export interface ExtractProgress {
    readonly entriesDone: number;
    readonly entriesTotal: number;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    /** 0 to 100, by uncompressed bytes rather than by entry count. */
    readonly percent: number;
    readonly currentEntry: string;
}

export interface ExtractOptions {
    readonly onProgress?: (progress: ExtractProgress) => void;
    readonly signal?: AbortSignal;
}

export interface ExtractResult {
    readonly root: string;
    readonly entries: number;
    readonly bytes: number;
}

/** Anything that went wrong while unpacking, whichever layer noticed it. */
export class ExtractError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ExtractError";
    }
}

/** Wraps whatever a zip reader threw, so the caller has one type to classify. */
export function asExtractError(error: unknown): ExtractError {
    if (error instanceof ExtractError) return error;
    return new ExtractError(error instanceof Error ? error.message : String(error));
}

export class UnsafeEntryError extends ExtractError {
    readonly entry: string;

    constructor(entry: string, reason: string) {
        super(
            "The archive contains an entry that would be written outside the download folder: " +
                `${reason} (${entry})`,
        );
        this.name = "UnsafeEntryError";
        this.entry = entry;
    }
}

/**
 * Where an entry may be written, or null when it may not be written at all.
 *
 * Exported because it is the security boundary of this module and deserves to be tested
 * on its own, against names no archive this project produces would ever contain.
 */
export function safeEntryPath(destination: string, entryName: string): string | null {
    if (entryName.length === 0 || entryName.includes("\0")) return null;
    // Zip stores forward slashes by specification; archives written on Windows sometimes
    // use backslashes anyway, and a backslash is a separator on the platform this
    // application mostly runs on.
    const cleaned = entryName.replace(/\\/g, "/");
    if (isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned) || cleaned.startsWith("/")) return null;

    const root = resolve(destination);
    const candidate = resolve(root, normalize(cleaned));
    const prefix = root.endsWith(sep) ? root : root + sep;
    if (candidate !== root && !candidate.startsWith(prefix)) return null;
    return candidate;
}

/**
 * Unpacks `archivePath` into `destination`.
 *
 * The caller is expected to have verified the archive's digest first. Nothing here can
 * tell a corrupt zip from a hostile one, and by the time an extractor is running it is
 * far too late to find out which it was.
 */
export async function extractZip(
    archivePath: string,
    destination: string,
    options: ExtractOptions = {},
): Promise<ExtractResult> {
    await mkdir(destination, { recursive: true });
    const zip = await ZipReader.open(archivePath);

    let entriesDone = 0;
    let bytesDone = 0;
    let bytesTotal = 0;
    let entriesTotal = 0;

    try {
        // The whole central directory first. Two things need it before a byte is
        // written: the uncompressed total, so the progress bar means something from the
        // first entry rather than climbing to 100% and then continuing; and the entry
        // names, so an archive carrying one hostile path is refused before it has been
        // allowed to write the forty innocent ones in front of it.
        const entries = zip.entries();
        for (const entry of entries) {
            if (safeEntryPath(destination, entry.name) === null) {
                throw new UnsafeEntryError(entry.name, "the entry name escapes the destination");
            }
            if (isSymlink(entry)) {
                throw new UnsafeEntryError(
                    entry.name,
                    "the entry is a symbolic link, which is resolved later by something that cannot check it",
                );
            }
            if (entry.directory) continue;
            entriesTotal += 1;
            bytesTotal += entry.uncompressedSize;
        }

        for (const entry of entries) {
            options.signal?.throwIfAborted();
            const target = safeEntryPath(destination, entry.name);
            if (target === null) {
                throw new UnsafeEntryError(entry.name, "the entry name escapes the destination");
            }
            if (entry.directory) {
                await mkdir(target, { recursive: true });
                continue;
            }
            await mkdir(dirname(target), { recursive: true });
            const source = await zip.openEntry(entry);
            await pipeline(source, createWriteStream(target), {
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            entriesDone += 1;
            bytesDone += entry.uncompressedSize;
            options.onProgress?.({
                entriesDone,
                entriesTotal,
                bytesDone,
                bytesTotal,
                percent: bytesTotal <= 0 ? 100 : Math.min(100, (bytesDone / bytesTotal) * 100),
                currentEntry: entry.name,
            });
        }
    } finally {
        await zip.close().catch(() => undefined);
    }

    return { root: join(destination), entries: entriesDone, bytes: bytesDone };
}

/** Unix mode `0o120000` in the top half of the external attributes. */
function isSymlink(entry: ZipEntry): boolean {
    return ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000;
}

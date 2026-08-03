/**
 * Cutting one oversized file into parts a release can actually carry.
 *
 * One pass over the source, streamed. Every byte read is written into the current part,
 * folded into that part's SHA-256, and folded into the whole-file SHA-256 at the same
 * time, so a 20 GB archive is hashed twice over without ever being read twice and
 * without a byte of it being held in memory longer than the chunk it arrived in.
 *
 * ## A file that fits is left alone
 *
 * `splitFile` on a file no larger than the part size writes nothing and reports
 * `split: false`. Producing a one-part manifest for a 40 MB installer would mean every
 * consumer of every release had to learn the join format to open an asset that was
 * never split, which is a cost paid by everyone to describe a case that did not happen.
 */

import { createReadStream } from "node:fs";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Hash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { READ_CHUNK_BYTES } from "./hash.js";
import { DEFAULT_PART_SIZE, manifestNameFor, partNameFor } from "./manifest.js";
import type { PartRecord, PartsManifest } from "./manifest.js";
import { PARTS_MANIFEST_VERSION } from "./manifest.js";

export interface SplitProgress {
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    /** 0 to 100. */
    readonly percent: number;
}

export interface SplitOptions {
    /** Defaults to {@link DEFAULT_PART_SIZE}, 1.7 GB. */
    readonly partSize?: number;
    /** Defaults to the directory the source file is in. */
    readonly outDir?: string;
    readonly onProgress?: (progress: SplitProgress) => void;
    readonly signal?: AbortSignal;
}

/** The file was already small enough, so nothing was written and nothing changed. */
export interface SplitSkipped {
    readonly split: false;
    /** The source file, absolute. */
    readonly file: string;
    readonly bytes: number;
}

export interface SplitPerformed {
    readonly split: true;
    readonly file: string;
    readonly bytes: number;
    /** Absolute path of the `<name>.parts.json` that was written. */
    readonly manifestPath: string;
    readonly manifest: PartsManifest;
    /** Absolute paths of the parts, in join order. */
    readonly partPaths: readonly string[];
}

export type SplitResult = SplitSkipped | SplitPerformed;

/**
 * Splits `path` into `<name>.001`, `<name>.002`, ... and a `<name>.parts.json`.
 *
 * A failure part-way through deletes everything it had written. A directory holding
 * eleven of nineteen parts and no manifest is indistinguishable from a complete split
 * to anything that looks at it later, and the one thing worse than a failed split is a
 * failed split that a publish step mistakes for a finished one.
 */
export async function splitFile(path: string, options: SplitOptions = {}): Promise<SplitResult> {
    const source = resolve(path);
    const partSize = options.partSize ?? DEFAULT_PART_SIZE;
    if (!Number.isSafeInteger(partSize) || partSize <= 0) {
        throw new RangeError(`The part size must be a positive whole number of bytes, not ${String(partSize)}.`);
    }

    const stats = await stat(source);
    if (!stats.isFile()) throw new Error(`${source} is not a file.`);
    const bytesTotal = stats.size;

    if (bytesTotal <= partSize) return { split: false, file: source, bytes: bytesTotal };

    const fileName = basename(source);
    const outDir = resolve(options.outDir ?? dirname(source));
    await mkdir(outDir, { recursive: true });

    const partsTotal = Math.ceil(bytesTotal / partSize);
    const whole = createHash("sha256");
    const records: PartRecord[] = [];
    const partPaths: string[] = [];

    /** The part currently being written, or null between parts. */
    interface OpenPart {
        readonly index: number;
        readonly handle: FileHandle;
        readonly hash: Hash;
        bytes: number;
    }

    let current: OpenPart | null = null;
    let partIndex = 0;
    let bytesDone = 0;

    const finishPart = async (part: OpenPart): Promise<void> => {
        await part.handle.close();
        records.push({
            index: part.index,
            name: partNameFor(fileName, part.index),
            bytes: part.bytes,
            sha256: part.hash.digest("hex"),
        });
        options.onProgress?.({
            bytesDone,
            bytesTotal,
            partsDone: records.length,
            partsTotal,
            percent: percentOf(bytesDone, bytesTotal),
        });
    };

    try {
        const reader = createReadStream(source, { highWaterMark: READ_CHUNK_BYTES });
        for await (const chunk of reader) {
            options.signal?.throwIfAborted();
            const buffer = chunk as Buffer;
            let offset = 0;
            while (offset < buffer.length) {
                if (current === null) {
                    partIndex += 1;
                    const partPath = join(outDir, partNameFor(fileName, partIndex));
                    partPaths.push(partPath);
                    current = {
                        index: partIndex,
                        handle: await open(partPath, "w"),
                        hash: createHash("sha256"),
                        bytes: 0,
                    };
                }
                const take = Math.min(partSize - current.bytes, buffer.length - offset);
                const slice = buffer.subarray(offset, offset + take);
                await writeFully(current.handle, slice);
                current.hash.update(slice);
                whole.update(slice);
                current.bytes += take;
                offset += take;
                bytesDone += take;
                if (current.bytes === partSize) {
                    await finishPart(current);
                    current = null;
                }
            }
        }
        if (current !== null) {
            await finishPart(current);
            current = null;
        }
    } catch (error) {
        if (current !== null) await current.handle.close().catch(() => undefined);
        for (const written of partPaths) await rm(written, { force: true }).catch(() => undefined);
        throw error;
    }

    const manifest: PartsManifest = {
        version: PARTS_MANIFEST_VERSION,
        file: fileName,
        bytes: bytesTotal,
        sha256: whole.digest("hex"),
        partSize,
        parts: records,
    };
    const manifestPath = join(outDir, manifestNameFor(fileName));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");

    return { split: true, file: source, bytes: bytesTotal, manifestPath, manifest, partPaths };
}

/**
 * Writes the whole buffer, however many calls that takes.
 *
 * `FileHandle.write` is allowed to write fewer bytes than it was given. It essentially
 * never does for a regular file, which is exactly why a truncated part produced this
 * way would be found months later by somebody debugging a corrupt download.
 */
async function writeFully(handle: FileHandle, buffer: Buffer): Promise<void> {
    let written = 0;
    while (written < buffer.length) {
        const result = await handle.write(buffer, written, buffer.length - written);
        if (result.bytesWritten <= 0) throw new Error("The part file accepted no bytes.");
        written += result.bytesWritten;
    }
}

function percentOf(done: number, total: number): number {
    if (total <= 0) return 100;
    return Math.min(100, (done / total) * 100);
}

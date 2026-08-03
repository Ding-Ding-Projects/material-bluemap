/**
 * Putting the parts back together, and proving that what came out is what went in.
 *
 * Two checks, both of them load-bearing:
 *
 * - **every part** is hashed as it is appended, so a bad file is named. "Part 3 of 19,
 *   `world.zip.003`, does not match the manifest" is a sentence somebody can act on by
 *   re-downloading one file. "The archive is corrupt" is not;
 * - **the whole file** is hashed at the end, because nineteen correct parts assembled in
 *   the wrong order, or with a part written twice, produce nineteen passing digests and
 *   a broken archive.
 *
 * A rejoin that skipped these would produce a corrupt world that unzips cleanly and then
 * surfaces as a rendering bug three layers away. The checks are the reason the format
 * exists, not a safety net bolted onto it.
 *
 * ## Resuming
 *
 * A join of a 20 GB archive that dies at 90% must not start over. The output file's own
 * length says how far the last attempt got: the prefix is re-read once, segment by
 * segment, and every part it already contains is verified against its digest as it goes.
 * That read costs a fraction of a re-copy, and it doubles as proof that the bytes
 * already on disk are the right ones, which a naive "seek to the end and carry on" can
 * never establish.
 *
 * Anything past the last complete part is discarded rather than trusted, because the
 * bytes at the end of an interrupted write are exactly the bytes most likely to be
 * short.
 */

import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Hash } from "node:crypto";
import { dirname, join as joinPath, resolve } from "node:path";
import { READ_CHUNK_BYTES } from "./hash.js";
import { PartsIntegrityError, PartsManifestError, parseManifest, partOffsets } from "./manifest.js";
import type { PartRecord, PartsManifest } from "./manifest.js";

export interface JoinProgress {
    /** 1-based index of the part being appended right now. */
    readonly partIndex: number;
    readonly partName: string;
    readonly partsDone: number;
    readonly partsTotal: number;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    /** 0 to 100. */
    readonly percent: number;
}

export interface JoinOptions {
    /** Defaults to the directory the manifest is in. */
    readonly outDir?: string;
    readonly onProgress?: (progress: JoinProgress) => void;
    readonly signal?: AbortSignal;
}

export interface JoinResult {
    /** Absolute path of the rejoined file. */
    readonly path: string;
    readonly bytes: number;
    /** The verified whole-file digest, equal to the manifest's by construction. */
    readonly sha256: string;
    /**
     * How many parts an interrupted earlier run had already written and this one reused.
     * Zero for a join that started from nothing.
     */
    readonly reusedParts: number;
}

/** Reads and validates a manifest from disk. */
export async function readManifest(manifestPath: string): Promise<PartsManifest> {
    const path = resolve(manifestPath);
    let text: string;
    try {
        text = await readFile(path, "utf8");
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new PartsManifestError(`${path} could not be read: ${detail}`);
    }
    return parseManifest(text, path);
}

/**
 * Rejoins the parts a manifest describes into the original file.
 *
 * The parts are looked for beside the manifest, by the names the manifest gives them,
 * every one of which has already been proved to be a plain file name and so cannot
 * point outside that directory.
 */
export async function joinParts(manifestPath: string, options: JoinOptions = {}): Promise<JoinResult> {
    const resolvedManifest = resolve(manifestPath);
    const manifest = await readManifest(resolvedManifest);
    const partsDir = dirname(resolvedManifest);
    const outDir = resolve(options.outDir ?? partsDir);
    await mkdir(outDir, { recursive: true });
    const outPath = joinPath(outDir, manifest.file);

    const offsets = partOffsets(manifest);
    const existingBytes = await fileSize(outPath);

    let whole = createHash("sha256");
    let reusedParts = 0;

    if (existingBytes > 0) {
        const verified = await verifyExistingPrefix(outPath, manifest, offsets, existingBytes, whole, options.signal);
        whole = verified.hash;
        reusedParts = verified.parts;
    }

    let position = offsets[reusedParts] ?? 0;
    const out = await open(outPath, existingBytes > 0 ? "r+" : "w");
    try {
        await out.truncate(position);
        report(options, manifest, reusedParts, position);

        for (let index = reusedParts; index < manifest.parts.length; index++) {
            const record = manifest.parts[index];
            if (record === undefined) break;
            options.signal?.throwIfAborted();

            const partPath = joinPath(partsDir, record.name);
            const partBytes = await fileSize(partPath);
            if (partBytes < 0) {
                throw new PartsIntegrityError(
                    describePart(record, manifest) + " is missing. Download it again and rejoin.",
                    record,
                    record.sha256,
                    "",
                );
            }
            if (partBytes !== record.bytes) {
                throw new PartsIntegrityError(
                    `${describePart(record, manifest)} is ${String(partBytes)} bytes; the manifest ` +
                        `says ${String(record.bytes)}. Download it again and rejoin.`,
                    record,
                    record.sha256,
                    "",
                );
            }

            const before = whole.copy();
            const startedAt = position;
            const partHash = createHash("sha256");
            const reader = createReadStream(partPath, { highWaterMark: READ_CHUNK_BYTES });
            for await (const chunk of reader) {
                options.signal?.throwIfAborted();
                const buffer = chunk as Buffer;
                await writeFully(out, buffer, position);
                partHash.update(buffer);
                whole.update(buffer);
                position += buffer.length;
            }

            const actual = partHash.digest("hex");
            if (actual !== record.sha256) {
                // Roll the output and the running digest back to the state before this
                // part, so a later attempt resumes at exactly the part that went wrong
                // rather than re-copying the ones that were fine.
                whole = before;
                position = startedAt;
                await out.truncate(startedAt);
                throw new PartsIntegrityError(
                    `${describePart(record, manifest)} does not match the manifest: expected ` +
                        `SHA-256 ${record.sha256}, got ${actual}. Download that part again and rejoin.`,
                    record,
                    record.sha256,
                    actual,
                );
            }
            report(options, manifest, index + 1, position);
        }
    } finally {
        await out.close();
    }

    if (position !== manifest.bytes) {
        await rm(outPath, { force: true });
        throw new PartsIntegrityError(
            `${manifest.file} rejoined to ${String(position)} bytes but the manifest says ` +
                `${String(manifest.bytes)}. The incomplete file has been deleted.`,
            null,
            String(manifest.bytes),
            String(position),
        );
    }

    const digest = whole.digest("hex");
    if (digest !== manifest.sha256) {
        // Every part matched and the total is right, so the manifest and the parts
        // disagree about something no per-part check can see. The joined file is
        // deleted rather than left behind: a file of exactly the right name and length
        // that is nonetheless wrong is the kind of thing a later step happily uses.
        await rm(outPath, { force: true });
        throw new PartsIntegrityError(
            `${manifest.file} rejoined but its whole-file SHA-256 is ${digest}, not ` +
                `${manifest.sha256}. The rejoined file has been deleted; every part matched its ` +
                "own digest, so the manifest and the parts disagree.",
            null,
            manifest.sha256,
            digest,
        );
    }

    return { path: outPath, bytes: position, sha256: digest, reusedParts };
}

/**
 * How many complete, correct parts an earlier attempt already left in the output.
 *
 * Returns the running whole-file hash advanced over exactly those parts, so the caller
 * can carry straight on from there. A part whose bytes on disk do not match its digest
 * ends the prefix: everything from it onwards is re-copied.
 */
async function verifyExistingPrefix(
    outPath: string,
    manifest: PartsManifest,
    offsets: readonly number[],
    existingBytes: number,
    whole: Hash,
    signal: AbortSignal | undefined,
): Promise<{ hash: Hash; parts: number }> {
    // Only whole parts count. A trailing fragment is what an interrupted write leaves,
    // and it is never assumed to be correct.
    let candidate = 0;
    while (candidate < manifest.parts.length && (offsets[candidate + 1] ?? Infinity) <= existingBytes) {
        candidate += 1;
    }
    if (candidate === 0) return { hash: whole, parts: 0 };

    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    const handle = await open(outPath, "r");
    let running = whole;
    let verified = 0;
    try {
        for (let index = 0; index < candidate; index++) {
            const record = manifest.parts[index];
            const start = offsets[index];
            if (record === undefined || start === undefined) break;
            signal?.throwIfAborted();

            const before = running.copy();
            const partHash = createHash("sha256");
            let remaining = record.bytes;
            let position = start;
            while (remaining > 0) {
                const { bytesRead } = await handle.read(
                    buffer,
                    0,
                    Math.min(buffer.length, remaining),
                    position,
                );
                if (bytesRead <= 0) break;
                const slice = buffer.subarray(0, bytesRead);
                partHash.update(slice);
                running.update(slice);
                remaining -= bytesRead;
                position += bytesRead;
            }
            if (remaining !== 0 || partHash.digest("hex") !== record.sha256) {
                running = before;
                break;
            }
            verified = index + 1;
        }
    } finally {
        await handle.close();
    }
    return { hash: running, parts: verified };
}

function report(
    options: JoinOptions,
    manifest: PartsManifest,
    partsDone: number,
    bytesDone: number,
): void {
    if (options.onProgress === undefined) return;
    const next = manifest.parts[Math.min(partsDone, manifest.parts.length - 1)];
    options.onProgress({
        partIndex: next?.index ?? manifest.parts.length,
        partName: next?.name ?? manifest.file,
        partsDone,
        partsTotal: manifest.parts.length,
        bytesDone,
        bytesTotal: manifest.bytes,
        percent: manifest.bytes <= 0 ? 100 : Math.min(100, (bytesDone / manifest.bytes) * 100),
    });
}

function describePart(record: PartRecord, manifest: PartsManifest): string {
    return `Part ${String(record.index)} of ${String(manifest.parts.length)} (${record.name})`;
}

/** The file's length, or -1 when it is not there or is not a file. */
async function fileSize(path: string): Promise<number> {
    try {
        const stats = await stat(path);
        return stats.isFile() ? stats.size : -1;
    } catch {
        return -1;
    }
}

async function writeFully(handle: FileHandle, buffer: Buffer, position: number): Promise<void> {
    let written = 0;
    while (written < buffer.length) {
        const result = await handle.write(
            buffer,
            written,
            buffer.length - written,
            position + written,
        );
        if (result.bytesWritten <= 0) throw new Error("The rejoined file accepted no bytes.");
        written += result.bytesWritten;
    }
}

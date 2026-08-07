/**
 * Hashing the downloaded parts, once, for two answers at the same time.
 *
 * Every part has to be checked against the digest the release published for it. That is
 * the check that matters, and it is not optional: a part that arrived one byte short
 * produces an archive that unzips perfectly well and a world that opens and corrupts
 * later, in a file nobody would think to look in.
 *
 * The join this feeds also wants a whole-file digest, and a `SHA256SUMS` does not publish
 * one. Reading the parts a second time to get it would double the read of a 6.6 GB world
 * for a number that is already derivable from the same bytes, so both digests come out of
 * one pass: each part's own hash, and a running hash of everything concatenated in order.
 *
 * ## What the whole-file digest is, and what it is not
 *
 * It is **derived**, not published. It proves the join wrote what the verified parts say -
 * a truncated write, a full disk, a copy that stopped halfway - and it proves nothing at
 * all about whether the publisher's file was right. The per-part digests from `SHA256SUMS`
 * are the only external authority here, and calling the derived number "verification"
 * would be a claim this code cannot support. Everything downstream says so too.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { READ_CHUNK_BYTES } from "@worldlens/parts";

export interface DigestedPart {
    readonly name: string;
    readonly path: string;
    readonly bytes: number;
    /** Lowercase hex SHA-256 of this part alone. */
    readonly sha256: string;
}

export interface DigestedParts {
    readonly parts: readonly DigestedPart[];
    readonly bytes: number;
    /** Lowercase hex SHA-256 of every part concatenated in the order given. Derived. */
    readonly sha256: string;
}

export interface DigestProgress {
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    readonly partName: string;
}

export interface DigestOptions {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: DigestProgress) => void;
}

/**
 * Streams every part in the order given and reports both digests.
 *
 * Streamed rather than read: the archives this exists for do not fit in memory, and a
 * `readFile` of a 1.7 GB part is a main process that stops answering while it happens.
 *
 * The abort signal is checked between chunks rather than only between files. A part is
 * gigabytes; a cancel that only took effect at the next file boundary would sit there for
 * a minute after the button was pressed, which reads as a cancel that did not work.
 */
export async function digestParts(
    files: readonly { readonly name: string; readonly path: string }[],
    options: DigestOptions = {},
): Promise<DigestedParts> {
    const whole = createHash("sha256");
    const parts: DigestedPart[] = [];
    let bytesDone = 0;

    let bytesTotal = 0;
    for (const file of files) bytesTotal += (await stat(file.path)).size;

    for (const [index, file] of files.entries()) {
        options.signal?.throwIfAborted();
        const part = createHash("sha256");
        let partBytes = 0;

        const stream = createReadStream(file.path, { highWaterMark: READ_CHUNK_BYTES });
        try {
            for await (const chunk of stream) {
                options.signal?.throwIfAborted();
                const buffer = chunk as Buffer;
                part.update(buffer);
                whole.update(buffer);
                partBytes += buffer.length;
                bytesDone += buffer.length;
                options.onProgress?.({
                    bytesDone,
                    bytesTotal,
                    partsDone: index,
                    partsTotal: files.length,
                    partName: file.name,
                });
            }
        } finally {
            // Destroyed explicitly so an abort in the middle of a part closes the handle
            // rather than leaving it open until the stream is collected. On Windows an
            // open handle is a file that cannot be deleted, and a failed part is a file
            // that must be deleted before it can be fetched again.
            stream.destroy();
        }

        parts.push({
            name: file.name,
            path: file.path,
            bytes: partBytes,
            sha256: part.digest("hex"),
        });
    }

    return { parts, bytes: bytesDone, sha256: whole.digest("hex") };
}

/** One part whose bytes are not what the release said they would be. */
export interface DigestMismatch {
    readonly name: string;
    readonly expected: string;
    readonly actual: string;
}

/**
 * Compares what arrived against what was published.
 *
 * A part the checksum list never mentions is a mismatch rather than a pass. "Not listed"
 * and "listed and correct" are the same outcome only to a reader that treats an absent
 * expectation as a satisfied one, and that reader joins unverified bytes into somebody's
 * world.
 */
export function compareDigests(
    digested: readonly DigestedPart[],
    published: ReadonlyMap<string, string>,
): DigestMismatch[] {
    const mismatches: DigestMismatch[] = [];
    for (const part of digested) {
        const expected = published.get(part.name);
        if (expected === undefined) {
            mismatches.push({ name: part.name, expected: "(not listed)", actual: part.sha256 });
            continue;
        }
        if (expected !== part.sha256) {
            mismatches.push({ name: part.name, expected, actual: part.sha256 });
        }
    }
    return mismatches;
}

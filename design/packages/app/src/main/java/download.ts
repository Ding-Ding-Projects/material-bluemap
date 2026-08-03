/**
 * A resumable download that is verified before anybody is allowed to use it.
 *
 * A JDK is around 150-200 MB. On a hotel network that is several minutes, and losing
 * all of it because a laptop lid closed is the difference between a feature people
 * use and a feature people give up on. So the transfer lands in a `.part` file that
 * survives a restart, and a resumed transfer asks for a byte range rather than
 * starting again.
 *
 * Resuming is also the thing most likely to corrupt a file silently: append to the
 * wrong part file, or to the right one after the server changed the artefact behind
 * the URL, and the result is a plausible-looking archive of the correct size that is
 * garbage. Two defences against that. A sidecar records the URL and the expected
 * digest, and a part file whose sidecar does not match is discarded rather than
 * appended to. And the digest is verified over the *finished file on disk*, not over
 * the bytes as they streamed past, so a resumed download is checked end to end
 * including everything a previous attempt wrote.
 *
 * The verified name only ever appears via a rename of an already-verified part file,
 * so a file at the final path is always a file that passed.
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";

export interface HttpBinaryResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText?: string;
    readonly headers: { get(name: string): string | null };
    /** Node's `fetch` body is async-iterable, which is all this needs. */
    readonly body: AsyncIterable<Uint8Array> | null;
}

export interface FetchBinaryInit {
    readonly headers: Record<string, string>;
}

export type FetchBinary = (url: string, init: FetchBinaryInit) => Promise<HttpBinaryResponse>;

export interface DownloadProgress {
    readonly url: string;
    /** Bytes on disk, including anything a previous attempt left. */
    readonly received: number;
    /** Expected total, or null when the server did not say. */
    readonly total: number | null;
    /** How many bytes this attempt started from. Non-zero means it resumed. */
    readonly resumedFrom: number;
}

export interface DownloadOptions {
    readonly url: string;
    /** Lower-case hex SHA-256 the finished file must have. */
    readonly sha256: string;
    /** Absolute path the verified file ends up at. */
    readonly target: string;
    /** From the release metadata, used for progress reporting only. */
    readonly expectedSize?: number;
    readonly fetchBinary?: FetchBinary;
    readonly onProgress?: (progress: DownloadProgress) => void;
    readonly signal?: AbortSignal;
}

export interface DownloadResult {
    readonly path: string;
    readonly bytes: number;
    /** True when an already-verified file was found and nothing was transferred. */
    readonly reused: boolean;
    /** Bytes a previous attempt had already fetched. */
    readonly resumedFrom: number;
}

interface PartMetadata {
    readonly url: string;
    readonly sha256: string;
}

const defaultFetchBinary: FetchBinary = (url, init) =>
    globalThis.fetch(url, { headers: init.headers, redirect: "follow" });

/** SHA-256 of a file on disk, streamed so a 200 MB archive is not held in memory. */
export async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(path), hash);
    return hash.digest("hex");
}

async function sizeOf(path: string): Promise<number> {
    try {
        return (await stat(path)).size;
    } catch {
        return 0;
    }
}

/**
 * Reads the sidecar that says what the part file is a part *of*.
 *
 * Without this, a part file is just bytes: there is no way to tell a half-fetched
 * copy of the artefact being asked for now from a half-fetched copy of a different
 * one that happened to have the same name.
 */
async function readPartMetadata(path: string): Promise<PartMetadata | null> {
    try {
        const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
        if (typeof parsed !== "object" || parsed === null) return null;
        const record = parsed as Record<string, unknown>;
        const url = record["url"];
        const sha256 = record["sha256"];
        if (typeof url !== "string" || typeof sha256 !== "string") return null;
        return { url, sha256 };
    } catch {
        return null;
    }
}

function describeStatus(response: HttpBinaryResponse): string {
    return response.statusText === undefined || response.statusText.length === 0
        ? String(response.status)
        : `${String(response.status)} ${response.statusText}`;
}

/**
 * Downloads `url` to `target` and refuses to produce it unless the SHA-256 matches.
 *
 * Every thrown error names the URL, and network errors also name the status, because
 * "download failed" is unactionable and 403-from-a-proxy, 404-artefact-withdrawn and
 * 000-no-DNS need three different responses from whoever reads it.
 */
export async function downloadVerified(options: DownloadOptions): Promise<DownloadResult> {
    const { url, target } = options;
    const expected = options.sha256.toLowerCase();
    const fetchBinary = options.fetchBinary ?? defaultFetchBinary;
    const partFile = `${target}.part`;
    const metaFile = `${target}.part.json`;

    await mkdir(dirname(target), { recursive: true });

    // An already-verified artefact is the common case on every launch after the
    // first, and re-downloading 200 MB to reach the same conclusion is a waste of
    // somebody's bandwidth. The digest is still checked - the file is only trusted
    // because it matches, not because it exists.
    const existing = await sizeOf(target);
    if (existing > 0) {
        if ((await sha256File(target)) === expected) {
            return { path: target, bytes: existing, reused: true, resumedFrom: 0 };
        }
        // Present but wrong: a truncated copy from an older version of this code, or
        // a different build published at the same path. Either way it is not the file
        // that was asked for, so it goes.
        await rm(target, { force: true });
    }

    const metadata = await readPartMetadata(metaFile);
    let resumeFrom = await sizeOf(partFile);
    if (metadata === null || metadata.url !== url || metadata.sha256.toLowerCase() !== expected) {
        await rm(partFile, { force: true });
        resumeFrom = 0;
    }
    await writeFile(metaFile, JSON.stringify({ url, sha256: expected }), "utf8");

    const headers: Record<string, string> = { accept: "application/octet-stream" };
    if (resumeFrom > 0) headers["range"] = `bytes=${String(resumeFrom)}-`;

    let response = await fetchBinary(url, { headers });

    // 416 means the part file is at or past the artefact's length, which happens when
    // a previous run wrote the last byte and then died before verifying. Start over
    // rather than guess: it is one download against permanently wedged state.
    if (response.status === 416 && resumeFrom > 0) {
        await rm(partFile, { force: true });
        resumeFrom = 0;
        response = await fetchBinary(url, { headers: { accept: "application/octet-stream" } });
    }

    if (!response.ok) {
        throw new Error(`Download failed with HTTP ${describeStatus(response)} for ${url}`);
    }
    if (response.body === null) {
        throw new Error(`Download returned no body for ${url}`);
    }

    // A server that ignores `Range` answers 200 with the whole artefact. Appending
    // that to an existing part file produces a corrupt archive of exactly the kind
    // the digest would catch later, after several more minutes of transfer.
    const append = resumeFrom > 0 && response.status === 206;
    if (resumeFrom > 0 && !append) {
        await rm(partFile, { force: true });
        resumeFrom = 0;
    }

    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    const total = Number.isFinite(contentLength)
        ? resumeFrom + contentLength
        : options.expectedSize !== undefined && options.expectedSize > 0
          ? options.expectedSize
          : null;

    const resumedFrom = resumeFrom;
    let received = resumeFrom;
    options.onProgress?.({ url, received, total, resumedFrom });

    const sink = createWriteStream(partFile, { flags: append ? "a" : "w" });
    try {
        for await (const chunk of response.body) {
            options.signal?.throwIfAborted();
            received += chunk.byteLength;
            if (!sink.write(chunk)) {
                // Both listeners are removed on whichever fires. Leaving the error
                // handler attached after every drain would accumulate one per
                // backpressure event, and a 150 MB download hits enough of them to
                // trip Node's max-listeners warning.
                await new Promise<void>((resolve, reject) => {
                    const onDrain = (): void => {
                        sink.off("error", onError);
                        resolve();
                    };
                    const onError = (error: Error): void => {
                        sink.off("drain", onDrain);
                        reject(error);
                    };
                    sink.once("drain", onDrain);
                    sink.once("error", onError);
                });
            }
            options.onProgress?.({ url, received, total, resumedFrom });
        }
    } finally {
        await new Promise<void>((resolve, reject) => {
            sink.end((error: Error | null | undefined) => (error ? reject(error) : resolve()));
        });
    }

    const digest = await sha256File(partFile);
    if (digest !== expected) {
        // The part file is deleted rather than kept for a retry. Resuming onto bytes
        // that are known to be wrong can only produce something else that is wrong,
        // and keeping it around invites exactly that.
        await rm(partFile, { force: true });
        await rm(metaFile, { force: true });
        throw new Error(
            `Checksum mismatch for ${url}: expected SHA-256 ${expected}, got ${digest}. Nothing was installed.`,
        );
    }

    await rename(partFile, target);
    await rm(metaFile, { force: true });
    return { path: target, bytes: received, reused: false, resumedFrom };
}

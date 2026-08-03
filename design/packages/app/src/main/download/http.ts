/**
 * Downloading one file, in a way that survives being interrupted.
 *
 * A 1.7 GB part on a domestic connection is minutes of transfer, and the thing most
 * likely to happen to it is that something stops it: a laptop lid, a dropped wifi
 * connection, an application that was quit. Starting those minutes again from zero is
 * how a twenty-part world becomes undownloadable on a connection that drops every hour.
 *
 * So every part is fetched with an HTTP `Range` request continuing from whatever is
 * already on disk. Three answers are possible and all three are handled, because the
 * one that is not handled is the one that silently corrupts a file:
 *
 * - **206 Partial Content** - what was asked for. The bytes are appended.
 * - **200 OK** - the server ignored the range and is sending the whole file from the
 *   start. The local file is truncated first; appending a second copy of the first
 *   megabyte to a file that already has it produces a file of exactly the wrong length
 *   with no error anywhere.
 * - **416 Range Not Satisfiable** - the local file is at least as long as the remote
 *   one. That is either a finished download or a corrupt one, so it is thrown away and
 *   fetched again rather than guessed at.
 */

import { createWriteStream } from "node:fs";
import { mkdir, stat, truncate } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { FetchLike } from "./release.js";

export class HttpDownloadError extends Error {
    readonly status: number | null;
    readonly url: string;

    constructor(message: string, status: number | null, url: string) {
        super(message);
        this.name = "HttpDownloadError";
        this.status = status;
        this.url = url;
    }
}

export interface ResumableDownloadOptions {
    readonly fetch: FetchLike;
    readonly headers?: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
    /** The published size. Lets a complete file be recognised without a request. */
    readonly expectedBytes?: number;
    /** Called as bytes land, with the delta and the running total for this file. */
    readonly onBytes?: (delta: number, total: number) => void;
}

export interface ResumableDownloadResult {
    /** The file's length once the transfer finished. */
    readonly bytes: number;
    /** The offset this attempt started at. Zero when nothing was reused. */
    readonly resumedAt: number;
    /** True when the server honoured the range request. */
    readonly ranged: boolean;
}

/**
 * Fetches `url` into `destination`, continuing an interrupted attempt where it stopped.
 *
 * Returns without a request at all when the file on disk is already `expectedBytes`
 * long. That is not a claim that the file is *correct* - only the digest check the
 * caller runs afterwards can say that - it is a claim that there is nothing left to
 * transfer, which is a different and much cheaper question.
 */
export async function downloadToFile(
    url: string,
    destination: string,
    options: ResumableDownloadOptions,
): Promise<ResumableDownloadResult> {
    await mkdir(dirname(destination), { recursive: true });

    let existing = await fileSize(destination);
    if (options.expectedBytes !== undefined && existing >= 0) {
        if (existing === options.expectedBytes) {
            options.onBytes?.(0, existing);
            return { bytes: existing, resumedAt: existing, ranged: false };
        }
        if (existing > options.expectedBytes) {
            // Longer than it should be. Something wrote to it that was not this, and
            // there is no honest way to reuse any of it.
            await truncate(destination, 0);
            existing = 0;
        }
    }

    const start = existing > 0 ? existing : 0;
    let response = await request(url, start, options);

    if (response.status === 416) {
        await truncate(destination, 0);
        response = await request(url, 0, options);
        return await receive(url, destination, response, 0, false, options);
    }
    if (!response.ok) {
        throw new HttpDownloadError(
            `The server answered ${String(response.status)} ${response.statusText}.`,
            response.status,
            url,
        );
    }

    const ranged = response.status === 206 && start > 0;
    const writeFrom = ranged ? start : 0;
    if (!ranged && start > 0) await truncate(destination, 0);
    return await receive(url, destination, response, writeFrom, ranged, options);
}

async function request(
    url: string,
    start: number,
    options: ResumableDownloadOptions,
): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers };
    if (start > 0) headers["range"] = `bytes=${String(start)}-`;
    try {
        return await options.fetch(url, {
            headers,
            redirect: "follow",
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
    } catch (error) {
        if (isAbort(error)) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new HttpDownloadError(detail, null, url);
    }
}

async function receive(
    url: string,
    destination: string,
    response: Response,
    writeFrom: number,
    ranged: boolean,
    options: ResumableDownloadOptions,
): Promise<ResumableDownloadResult> {
    if (!response.ok) {
        throw new HttpDownloadError(
            `The server answered ${String(response.status)} ${response.statusText}.`,
            response.status,
            url,
        );
    }
    const body = response.body;
    if (body === null) {
        throw new HttpDownloadError("The server sent no body.", response.status, url);
    }

    let total = writeFrom;
    const counted = async function* (): AsyncGenerator<Buffer> {
        // `Readable.fromWeb` rather than iterating the web stream directly, so that
        // destroying the pipeline on cancellation actually cancels the transfer instead
        // of leaving a socket draining a gigabyte into nothing.
        const source = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
        for await (const chunk of source) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
            total += buffer.length;
            options.onBytes?.(buffer.length, total);
            yield buffer;
        }
    };

    const sink = createWriteStream(destination, ranged ? { flags: "r+", start: writeFrom } : { flags: "w" });
    await pipeline(counted(), sink, {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    return { bytes: total, resumedAt: writeFrom, ranged };
}

/** True for the rejection an `AbortSignal` produces, whichever layer raised it. */
export function isAbort(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const name = (error as { name?: unknown }).name;
    return name === "AbortError" || name === "TimeoutError";
}

async function fileSize(path: string): Promise<number> {
    try {
        const stats = await stat(path);
        return stats.isFile() ? stats.size : -1;
    } catch {
        return -1;
    }
}

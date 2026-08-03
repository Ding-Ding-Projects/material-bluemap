/**
 * The resume path, exercised against a stub server that behaves like GitHub's and,
 * where it matters, like one that does not.
 *
 * The three answers a range request can get are all tested, because the one that is not
 * handled is the one that silently corrupts a file: a server that ignores `Range` and
 * sends the whole body again produces a file of exactly the wrong length with no error
 * anywhere unless the local file is truncated first.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpDownloadError, downloadToFile } from "./http.js";
import type { FetchLike } from "./release.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-http-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

const BODY = Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz");

interface Served {
    fetch: FetchLike;
    ranges: (string | null)[];
}

/** A server that honours `Range`, the way GitHub's asset storage does. */
function ranged(body: Buffer = BODY): Served {
    const ranges: (string | null)[] = [];
    const fetch: FetchLike = (_url, init) => {
        const headers = new Headers(init?.headers);
        const range = headers.get("range");
        ranges.push(range);
        if (range === null) {
            return Promise.resolve(new Response(new Uint8Array(body), { status: 200 }));
        }
        const start = Number.parseInt(range.replace("bytes=", "").split("-")[0] ?? "0", 10);
        if (start >= body.length) return Promise.resolve(new Response(null, { status: 416 }));
        const slice = body.subarray(start);
        return Promise.resolve(
            new Response(new Uint8Array(slice), {
                status: 206,
                headers: {
                    "content-range": `bytes ${String(start)}-${String(body.length - 1)}/${String(body.length)}`,
                },
            }),
        );
    };
    return { fetch, ranges };
}

/** A server that accepts the header and ignores it. Proxies and mirrors do this. */
function ignoresRange(body: Buffer = BODY): Served {
    const ranges: (string | null)[] = [];
    const fetch: FetchLike = (_url, init) => {
        ranges.push(new Headers(init?.headers).get("range"));
        return Promise.resolve(new Response(new Uint8Array(body), { status: 200 }));
    };
    return { fetch, ranges };
}

describe("downloadToFile", () => {
    it("fetches a file that is not there yet", async () => {
        const destination = join(workDir, "asset.bin");
        const served = ranged();

        const result = await downloadToFile("https://example/asset", destination, {
            fetch: served.fetch,
        });

        expect(result.bytes).toBe(BODY.length);
        expect(result.resumedAt).toBe(0);
        expect(served.ranges).toEqual([null]);
        expect(await readFile(destination)).toEqual(BODY);
    });

    it("continues an interrupted transfer from where it stopped", async () => {
        const destination = join(workDir, "asset.bin");
        await writeFile(destination, BODY.subarray(0, 10));
        const served = ranged();

        const result = await downloadToFile("https://example/asset", destination, {
            fetch: served.fetch,
            expectedBytes: BODY.length,
        });

        expect(served.ranges).toEqual(["bytes=10-"]);
        expect(result.ranged).toBe(true);
        expect(result.resumedAt).toBe(10);
        expect(await readFile(destination)).toEqual(BODY);
    });

    it("makes no request at all when the file is already the published size", async () => {
        const destination = join(workDir, "asset.bin");
        await writeFile(destination, BODY);
        const served = ranged();

        const result = await downloadToFile("https://example/asset", destination, {
            fetch: served.fetch,
            expectedBytes: BODY.length,
        });

        expect(served.ranges).toEqual([]);
        expect(result.bytes).toBe(BODY.length);
    });

    it("starts over when the server ignores the range", async () => {
        const destination = join(workDir, "asset.bin");
        await writeFile(destination, BODY.subarray(0, 10));
        const served = ignoresRange();

        const result = await downloadToFile("https://example/asset", destination, {
            fetch: served.fetch,
        });

        // The bug this guards: appending a whole body onto a ten-byte head produces a
        // 46-byte file that no status code complains about.
        expect(result.ranged).toBe(false);
        expect(result.bytes).toBe(BODY.length);
        expect(await readFile(destination)).toEqual(BODY);
    });

    it("throws away a local file the server says is too long", async () => {
        const destination = join(workDir, "asset.bin");
        await writeFile(destination, Buffer.concat([BODY, Buffer.from("extra")]));
        const served = ranged();

        const result = await downloadToFile("https://example/asset", destination, {
            fetch: served.fetch,
            expectedBytes: BODY.length,
        });

        expect(result.bytes).toBe(BODY.length);
        expect(await readFile(destination)).toEqual(BODY);
    });

    it("re-fetches from the start on 416 rather than assuming the file is finished", async () => {
        const destination = join(workDir, "asset.bin");
        // Exactly as long as the remote file, but not the same bytes: a 416 here means
        // "you already have this much", which is not the same as "you have this file".
        await writeFile(destination, Buffer.alloc(BODY.length, 0x41));
        const served = ranged();

        const result = await downloadToFile("https://example/asset", destination, {
            fetch: served.fetch,
        });

        expect(served.ranges).toEqual([`bytes=${String(BODY.length)}-`, null]);
        expect(result.bytes).toBe(BODY.length);
        expect(await readFile(destination)).toEqual(BODY);
    });

    it("reports the status when the server refuses", async () => {
        const fetch: FetchLike = () => Promise.resolve(new Response("no", { status: 403 }));

        const error = await downloadToFile("https://example/asset", join(workDir, "a.bin"), {
            fetch,
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(HttpDownloadError);
        expect((error as HttpDownloadError).status).toBe(403);
        expect((error as HttpDownloadError).url).toBe("https://example/asset");
    });

    it("reports a transport failure with its own message", async () => {
        const fetch: FetchLike = () => Promise.reject(new Error("getaddrinfo ENOTFOUND"));

        const error = await downloadToFile("https://example/asset", join(workDir, "a.bin"), {
            fetch,
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(HttpDownloadError);
        expect((error as HttpDownloadError).status).toBeNull();
        expect((error as HttpDownloadError).message).toContain("ENOTFOUND");
    });

    it("counts bytes as they land", async () => {
        const seen: number[] = [];
        const served = ranged();

        await downloadToFile("https://example/asset", join(workDir, "a.bin"), {
            fetch: served.fetch,
            onBytes: (_delta, total) => seen.push(total),
        });

        expect(seen.at(-1)).toBe(BODY.length);
    });
});

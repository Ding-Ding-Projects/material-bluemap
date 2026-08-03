import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { DownloadProgress, FetchBinary, HttpBinaryResponse } from "./download.js";
import { downloadVerified, sha256File } from "./download.js";

const temporaryDirectories: string[] = [];
afterAll(() => {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bluemap-jdk-download-"));
    temporaryDirectories.push(directory);
    return directory;
}

/** Stand-in for a 150 MB JDK archive: same code path, three orders of magnitude less disk. */
const ARCHIVE = Buffer.from("PK a pretend jdk archive, long enough to slice ".repeat(8));
const ARCHIVE_SHA256 = createHash("sha256").update(ARCHIVE).digest("hex");

function headers(values: Record<string, string>): { get(name: string): string | null } {
    return { get: (name) => values[name.toLowerCase()] ?? null };
}

async function* chunks(body: Buffer, size = 16): AsyncGenerator<Uint8Array> {
    for (let offset = 0; offset < body.length; offset += size) {
        yield Uint8Array.prototype.slice.call(body, offset, offset + size);
    }
}

interface Recorded {
    readonly url: string;
    readonly range: string | null;
}

/** A server that honours `Range`, which is what GitHub's release CDN actually does. */
function rangeServer(body: Buffer): { fetchBinary: FetchBinary; requests: Recorded[] } {
    const requests: Recorded[] = [];
    const fetchBinary: FetchBinary = (url, init) => {
        const range = init.headers["range"] ?? null;
        requests.push({ url, range });

        const match = range === null ? null : /^bytes=(\d+)-$/.exec(range);
        const start = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
        if (start >= body.length) {
            return Promise.resolve<HttpBinaryResponse>({
                ok: false,
                status: 416,
                statusText: "Range Not Satisfiable",
                headers: headers({}),
                body: null,
            });
        }

        const slice = body.subarray(start);
        return Promise.resolve<HttpBinaryResponse>({
            ok: true,
            status: start > 0 ? 206 : 200,
            statusText: start > 0 ? "Partial Content" : "OK",
            headers: headers({ "content-length": String(slice.length) }),
            body: chunks(slice),
        });
    };
    return { fetchBinary, requests };
}

describe("downloadVerified", () => {
    it("downloads, verifies and renames into place", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        const { fetchBinary, requests } = rangeServer(ARCHIVE);

        const result = await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        expect(result.reused).toBe(false);
        expect(result.resumedFrom).toBe(0);
        expect(readFileSync(target)).toEqual(ARCHIVE);
        expect(requests[0]?.range).toBeNull();
        // Neither the part file nor its sidecar survives a success.
        expect(existsSync(`${target}.part`)).toBe(false);
        expect(existsSync(`${target}.part.json`)).toBe(false);
    });

    it("reports progress that ends at the full size", async () => {
        const directory = temporaryDirectory();
        const { fetchBinary } = rangeServer(ARCHIVE);
        const progress: DownloadProgress[] = [];

        await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target: join(directory, "jdk.zip"),
            fetchBinary,
            onProgress: (event) => progress.push(event),
        });

        expect(progress.at(-1)?.received).toBe(ARCHIVE.length);
        expect(progress.at(-1)?.total).toBe(ARCHIVE.length);
    });

    it("reuses an already-verified file without asking the network", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        writeFileSync(target, ARCHIVE);
        const { fetchBinary, requests } = rangeServer(ARCHIVE);

        const result = await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        expect(result.reused).toBe(true);
        expect(requests).toHaveLength(0);
    });

    it("replaces an existing file whose digest does not match", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        writeFileSync(target, Buffer.from("a truncated copy from an older run"));
        const { fetchBinary } = rangeServer(ARCHIVE);

        const result = await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        expect(result.reused).toBe(false);
        expect(readFileSync(target)).toEqual(ARCHIVE);
    });

    it("resumes from a part file instead of starting again", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        const already = 64;
        writeFileSync(`${target}.part`, ARCHIVE.subarray(0, already));
        writeFileSync(
            `${target}.part.json`,
            JSON.stringify({ url: "https://example.invalid/jdk.zip", sha256: ARCHIVE_SHA256 }),
        );
        const { fetchBinary, requests } = rangeServer(ARCHIVE);

        const result = await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        expect(requests[0]?.range).toBe(`bytes=${String(already)}-`);
        expect(result.resumedFrom).toBe(already);
        // The end-to-end digest is over the whole file, including the resumed prefix.
        expect(readFileSync(target)).toEqual(ARCHIVE);
    });

    it("discards a part file that belongs to a different artefact", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        writeFileSync(`${target}.part`, Buffer.from("bytes of some other download"));
        writeFileSync(
            `${target}.part.json`,
            JSON.stringify({ url: "https://example.invalid/other.zip", sha256: "0".repeat(64) }),
        );
        const { fetchBinary, requests } = rangeServer(ARCHIVE);

        await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        // Appending to those bytes would have produced a plausible archive of the
        // right length that is entirely corrupt.
        expect(requests[0]?.range).toBeNull();
        expect(readFileSync(target)).toEqual(ARCHIVE);
    });

    it("starts over when the server ignores Range and answers 200", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        writeFileSync(`${target}.part`, ARCHIVE.subarray(0, 32));
        writeFileSync(
            `${target}.part.json`,
            JSON.stringify({ url: "https://example.invalid/jdk.zip", sha256: ARCHIVE_SHA256 }),
        );

        const fetchBinary: FetchBinary = () =>
            Promise.resolve<HttpBinaryResponse>({
                ok: true,
                status: 200,
                headers: headers({ "content-length": String(ARCHIVE.length) }),
                body: chunks(ARCHIVE),
            });

        const result = await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        expect(result.resumedFrom).toBe(0);
        expect(readFileSync(target)).toEqual(ARCHIVE);
    });

    it("recovers when a part file is already at or past the full length", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        writeFileSync(`${target}.part`, Buffer.concat([ARCHIVE, Buffer.from("overrun")]));
        writeFileSync(
            `${target}.part.json`,
            JSON.stringify({ url: "https://example.invalid/jdk.zip", sha256: ARCHIVE_SHA256 }),
        );
        const { fetchBinary, requests } = rangeServer(ARCHIVE);

        await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: ARCHIVE_SHA256,
            target,
            fetchBinary,
        });

        expect(requests).toHaveLength(2);
        expect(requests[1]?.range).toBeNull();
        expect(readFileSync(target)).toEqual(ARCHIVE);
    });

    it("refuses a mismatched digest, names both, and leaves nothing behind", async () => {
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        const tampered = Buffer.from(ARCHIVE);
        tampered[10] = 0x00;
        const { fetchBinary } = rangeServer(tampered);
        const url = "https://example.invalid/jdk.zip";

        await expect(
            downloadVerified({ url, sha256: ARCHIVE_SHA256, target, fetchBinary }),
        ).rejects.toThrow(/Checksum mismatch for https:\/\/example\.invalid\/jdk\.zip/);

        expect(existsSync(target)).toBe(false);
        // The bad bytes are deleted rather than left for a resume to append onto.
        expect(existsSync(`${target}.part`)).toBe(false);
        expect(existsSync(`${target}.part.json`)).toBe(false);
    });

    it("handles a body far larger than the write stream's buffer", async () => {
        // Node's default highWaterMark is 64 KiB, so anything past that exercises the
        // backpressure path that a real 150 MB JDK spends its entire download in.
        const directory = temporaryDirectory();
        const target = join(directory, "jdk.zip");
        const large = Buffer.alloc(512 * 1024, 0x7a);
        const digest = createHash("sha256").update(large).digest("hex");
        const { fetchBinary } = rangeServer(large);

        const result = await downloadVerified({
            url: "https://example.invalid/jdk.zip",
            sha256: digest,
            target,
            fetchBinary,
        });

        expect(result.bytes).toBe(large.length);
        expect(await sha256File(target)).toBe(digest);
    });

    it("names the URL and the status when the transfer is refused", async () => {
        const directory = temporaryDirectory();
        const fetchBinary: FetchBinary = () =>
            Promise.resolve<HttpBinaryResponse>({
                ok: false,
                status: 403,
                statusText: "Forbidden",
                headers: headers({}),
                body: null,
            });

        await expect(
            downloadVerified({
                url: "https://example.invalid/jdk.zip",
                sha256: ARCHIVE_SHA256,
                target: join(directory, "jdk.zip"),
                fetchBinary,
            }),
        ).rejects.toThrow(/HTTP 403 Forbidden for https:\/\/example\.invalid\/jdk\.zip/);
    });
});

describe("sha256File", () => {
    it("hashes a file on disk", async () => {
        const directory = temporaryDirectory();
        const path = join(directory, "archive.bin");
        writeFileSync(path, ARCHIVE);
        expect(await sha256File(path)).toBe(ARCHIVE_SHA256);
    });
});

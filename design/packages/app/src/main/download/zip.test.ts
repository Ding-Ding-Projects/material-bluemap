/**
 * The zip reader, against archives built byte by byte in the test.
 *
 * The Zip64 cases are the ones that matter most in practice and are hardest to reach by
 * accident: the archives this feature exists for are tens of gigabytes, so Zip64 is the
 * path production will actually take, and a reader that takes a `0xFFFFFFFF` sentinel at
 * face value reads from offset 4294967295 and calls a perfectly good archive corrupt.
 * The format permits the Zip64 records at any size, so a 200-byte fixture exercises
 * exactly the code a 20 GB world would.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZipFormatError, ZipReader, crc32 } from "./zip.js";
import { buildZip } from "./zipTestUtil.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-zip-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

async function archive(
    entries: Parameters<typeof buildZip>[0],
    options: Parameters<typeof buildZip>[1] = {},
): Promise<string> {
    const path = join(workDir, "archive.zip");
    await writeFile(path, buildZip(entries, options));
    return path;
}

async function read(zip: ZipReader, name: string): Promise<Buffer> {
    const entry = zip.entries().find((candidate) => candidate.name === name);
    if (entry === undefined) throw new Error(`no such entry: ${name}`);
    const chunks: Buffer[] = [];
    for await (const chunk of await zip.openEntry(entry)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

describe("crc32", () => {
    it("agrees with the published check values", () => {
        // The two every CRC-32 implementation is checked against.
        expect(crc32(Buffer.from(""))).toBe(0);
        expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    });
});

describe("ZipReader", () => {
    it("lists entries, with directories marked", async () => {
        const path = await archive([
            { name: "world/" },
            { name: "world/level.dat", content: Buffer.from("level") },
        ]);
        const zip = await ZipReader.open(path);

        expect(zip.entries().map((entry) => entry.name)).toEqual(["world/", "world/level.dat"]);
        expect(zip.entries()[0]?.directory).toBe(true);
        expect(zip.entries()[1]?.directory).toBe(false);
        expect(zip.entries()[1]?.uncompressedSize).toBe(5);
        await zip.close();
    });

    it("reads a stored entry", async () => {
        const content = Buffer.alloc(5_000, 42);
        const path = await archive([{ name: "a.bin", content }]);
        const zip = await ZipReader.open(path);

        expect(await read(zip, "a.bin")).toEqual(content);
        await zip.close();
    });

    it("reads a deflated entry", async () => {
        const content = Buffer.from("the same words over and over ".repeat(400));
        const path = await archive([{ name: "a.txt", content, deflate: true }]);
        const zip = await ZipReader.open(path);

        // Really compressed, not quietly stored: the check would pass either way if the
        // fixture had fallen back, and then the deflate path would never be exercised.
        expect(zip.entries()[0]?.method).toBe(8);
        expect(zip.entries()[0]?.compressedSize).toBeLessThan(content.length / 4);
        expect(await read(zip, "a.txt")).toEqual(content);
        await zip.close();
    });

    it("reads several entries from one archive, in any order", async () => {
        const path = await archive([
            { name: "one.bin", content: Buffer.alloc(300, 1) },
            { name: "two.txt", content: Buffer.from("hello ".repeat(200)), deflate: true },
            { name: "three.bin", content: Buffer.alloc(100, 3) },
        ]);
        const zip = await ZipReader.open(path);

        expect(await read(zip, "three.bin")).toEqual(Buffer.alloc(100, 3));
        expect(await read(zip, "one.bin")).toEqual(Buffer.alloc(300, 1));
        expect(await read(zip, "two.txt")).toEqual(Buffer.from("hello ".repeat(200)));
        await zip.close();
    });

    it("reads an empty entry", async () => {
        const path = await archive([{ name: "empty.bin", content: Buffer.alloc(0) }]);
        const zip = await ZipReader.open(path);

        expect(await read(zip, "empty.bin")).toEqual(Buffer.alloc(0));
        await zip.close();
    });

    it("finds the end record past an archive comment", async () => {
        const path = await archive([{ name: "a.bin", content: Buffer.alloc(10, 9) }], {
            comment: "a comment long enough to sit between the end record and the end of the file",
        });
        const zip = await ZipReader.open(path);

        expect(await read(zip, "a.bin")).toEqual(Buffer.alloc(10, 9));
        await zip.close();
    });

    it("reads a Zip64 archive", async () => {
        const content = Buffer.alloc(4_000, 6);
        const path = await archive(
            [
                { name: "world/" },
                { name: "world/region.mca", content },
                { name: "world/level.dat", content: Buffer.from("x".repeat(900)), deflate: true },
            ],
            { zip64: true },
        );
        const zip = await ZipReader.open(path);

        // The classic fields are all sentinels here; every real number came out of the
        // Zip64 extra field and the Zip64 end record.
        expect(zip.entries()).toHaveLength(3);
        expect(zip.entries()[1]?.uncompressedSize).toBe(4_000);
        expect(await read(zip, "world/region.mca")).toEqual(content);
        expect(await read(zip, "world/level.dat")).toEqual(Buffer.from("x".repeat(900)));
        await zip.close();
    });

    it("fails at the end of a stream whose bytes do not match the recorded CRC", async () => {
        const path = await archive([
            { name: "a.bin", content: Buffer.alloc(200, 5), breakCrc: true },
        ]);
        const zip = await ZipReader.open(path);

        // The failure is at the end of the stream, so a consumer piping into a file gets
        // a failed pipeline and a partial file it knows about, rather than a complete
        // file it does not.
        await expect(read(zip, "a.bin")).rejects.toBeInstanceOf(ZipFormatError);
        await zip.close();
    });

    it("refuses a compression method it cannot honestly decode", async () => {
        const path = await archive([{ name: "a.bin", content: Buffer.alloc(10, 1), method: 14 }]);
        const zip = await ZipReader.open(path);

        const error = await read(zip, "a.bin").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ZipFormatError);
        expect((error as ZipFormatError).message).toContain("method 14");
        await zip.close();
    });

    it("refuses a file that is not a zip at all", async () => {
        const path = join(workDir, "not.zip");
        await writeFile(path, Buffer.alloc(4_000, 0x41));

        await expect(ZipReader.open(path)).rejects.toBeInstanceOf(ZipFormatError);
    });

    it("refuses a file too short to hold an end record", async () => {
        const path = join(workDir, "tiny.zip");
        await writeFile(path, Buffer.from("PK"));

        await expect(ZipReader.open(path)).rejects.toBeInstanceOf(ZipFormatError);
    });

    it("refuses an archive whose central directory is truncated", async () => {
        const full = buildZip([
            { name: "one.bin", content: Buffer.alloc(100, 1) },
            { name: "two.bin", content: Buffer.alloc(100, 2) },
        ]);
        // Claim three entries where the directory holds two: an index that promises more
        // than the file contains must be reported, not read past.
        full.writeUInt16LE(3, full.length - 22 + 10);
        const path = join(workDir, "short.zip");
        await writeFile(path, full);

        await expect(ZipReader.open(path)).rejects.toBeInstanceOf(ZipFormatError);
    });

    it("keeps the Unix mode bits, so a symbolic link can be recognised", async () => {
        const path = await archive([
            { name: "link", content: Buffer.from("/etc/passwd"), symlink: true },
            { name: "plain", content: Buffer.from("ordinary") },
        ]);
        const zip = await ZipReader.open(path);

        expect((zip.entries()[0]?.externalFileAttributes ?? 0) >>> 16).toBe(0o120777);
        expect((zip.entries()[1]?.externalFileAttributes ?? 0) >>> 16).toBe(0o100644);
        await zip.close();
    });
});

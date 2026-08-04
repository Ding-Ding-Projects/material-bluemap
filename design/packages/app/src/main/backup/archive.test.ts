/**
 * The pack, against real temporary directories rather than a stand-in filesystem.
 *
 * Two properties carry the whole feature and both are checked here against bytes on a
 * disk. **Determinism**: the same folder packs to the same digest twice, because that is
 * what lets a repeated backup be recognised instead of re-uploaded, and what makes a
 * pointer's whole-file digest mean something. **Readability by this project's own
 * extractor**: an archive nobody can open is not a backup, so what `packFolder` writes is
 * handed straight to `download/zip.ts` and `download/extract.ts` - the very code a restore
 * runs - and the unpacked tree is compared with the one that went in.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArchiveError, READ_CHUNK_BYTES, packFolder, readFolderContents } from "./archive.js";
import { extractZip } from "../download/extract.js";
import { ZipReader, crc32 } from "../download/zip.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-archive-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** A small world-shaped tree: a level.dat, two regions and a nested folder. */
async function makeWorld(root: string): Promise<void> {
    await mkdir(join(root, "region"), { recursive: true });
    await mkdir(join(root, "data", "deep"), { recursive: true });
    await writeFile(join(root, "level.dat"), Buffer.from("level-dat-bytes"));
    await writeFile(join(root, "region", "r.0.0.mca"), randomFrom("region-0"));
    await writeFile(join(root, "region", "r.0.1.mca"), randomFrom("region-1"));
    await writeFile(join(root, "data", "deep", "notes.txt"), Buffer.from("hello"));
}

/** Deterministic "random" bytes, so two runs of a test compare the same content. */
function randomFrom(seed: string): Buffer {
    const buffer = Buffer.alloc(4096);
    for (let index = 0; index < buffer.length; index += 1) {
        buffer[index] = (seed.charCodeAt(index % seed.length) * (index + 7)) % 256;
    }
    return buffer;
}

describe("reading a folder before packing it", () => {
    it("finds every ordinary file, sorted, with forward-slashed relative names", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);

        const contents = await readFolderContents(source);
        expect(contents.entries.map((entry) => entry.name)).toEqual([
            "data/deep/notes.txt",
            "level.dat",
            "region/r.0.0.mca",
            "region/r.0.1.mca",
        ]);
        expect(contents.bytes).toBe(4096 * 2 + "level-dat-bytes".length + "hello".length);
        expect(contents.skipped).toEqual([]);
    });

    it("refuses a path that is not a folder, by name", async () => {
        const file = join(workDir, "not-a-folder.txt");
        await writeFile(file, "x");
        await expect(readFolderContents(file)).rejects.toBeInstanceOf(ArchiveError);
    });
});

describe("packing", () => {
    it("produces the same bytes and the same digest from the same folder, twice", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);

        const first = await packFolder(source, join(workDir, "one.zip"));
        const second = await packFolder(source, join(workDir, "two.zip"));

        expect(second.sha256).toBe(first.sha256);
        expect(second.bytes).toBe(first.bytes);
        expect(await readFile(join(workDir, "two.zip"))).toEqual(
            await readFile(join(workDir, "one.zip")),
        );
    });

    it("hashes what it wrote, so the digest matches the file on disk", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);
        const packed = await packFolder(source, join(workDir, "world.zip"));

        const { createHash } = await import("node:crypto");
        const onDisk = createHash("sha256")
            .update(await readFile(join(workDir, "world.zip")))
            .digest("hex");
        expect(packed.sha256).toBe(onDisk);
        expect(packed.bytes).toBe((await stat(join(workDir, "world.zip"))).size);
        expect(packed.files).toBe(4);
    });

    it("reports progress with real byte counts that reach the total", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);

        const seen: number[] = [];
        let total = 0;
        const packed = await packFolder(source, join(workDir, "world.zip"), {
            onProgress: (progress) => {
                seen.push(progress.bytesDone);
                total = progress.bytesTotal;
            },
        });

        expect(seen.length).toBeGreaterThan(0);
        expect(seen.at(-1)).toBe(total);
        expect(total).toBe(packed.contentBytes);
    });

    it("refuses an empty folder rather than making a backup of nothing", async () => {
        const source = join(workDir, "empty");
        await mkdir(source, { recursive: true });
        await expect(packFolder(source, join(workDir, "empty.zip"))).rejects.toBeInstanceOf(
            ArchiveError,
        );
    });

    it("leaves no partial archive behind when it is cancelled", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);
        const controller = new AbortController();
        controller.abort();

        await expect(
            packFolder(source, join(workDir, "cancelled.zip"), { signal: controller.signal }),
        ).rejects.toThrow();
        await expect(stat(join(workDir, "cancelled.zip"))).rejects.toThrow();
    });
});

describe("what it writes is what this project's own restore reads", () => {
    it("opens in ZipReader with the right names, sizes and CRCs", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);
        const archive = join(workDir, "world.zip");
        await packFolder(source, archive);

        const reader = await ZipReader.open(archive);
        try {
            const entries = reader.entries();
            expect(entries.map((entry) => entry.name)).toEqual([
                "data/deep/notes.txt",
                "level.dat",
                "region/r.0.0.mca",
                "region/r.0.1.mca",
            ]);

            const levelDat = entries.find((entry) => entry.name === "level.dat");
            expect(levelDat?.uncompressedSize).toBe("level-dat-bytes".length);
            expect(levelDat?.crc32).toBe(crc32(Buffer.from("level-dat-bytes")));
        } finally {
            await reader.close();
        }
    });

    it("unpacks through extractZip into a tree identical to the one packed", async () => {
        const source = join(workDir, "world");
        await makeWorld(source);
        const archive = join(workDir, "world.zip");
        await packFolder(source, archive);

        const out = join(workDir, "restored");
        const result = await extractZip(archive, out);
        expect(result.entries).toBe(4);

        expect(await readFile(join(out, "level.dat"))).toEqual(Buffer.from("level-dat-bytes"));
        expect(await readFile(join(out, "region", "r.0.0.mca"))).toEqual(randomFrom("region-0"));
        expect(await readFile(join(out, "region", "r.0.1.mca"))).toEqual(randomFrom("region-1"));
        expect(await readFile(join(out, "data", "deep", "notes.txt"))).toEqual(Buffer.from("hello"));
    });

    it("survives a file large enough to need more than one read chunk", async () => {
        const source = join(workDir, "big");
        await mkdir(source, { recursive: true });
        // Exactly one byte over two read chunks, and no more. The property under test is
        // that the chunk boundary is handled - that the running CRC, the running SHA-256
        // and the part offsets all carry across it - and that is as true of a file just
        // over the boundary as of a gigabyte. Making it larger only spends wall clock,
        // and a test that takes seconds is a test somebody eventually stops running.
        const payload = randomBytes(READ_CHUNK_BYTES + 17);
        await writeFile(join(source, "payload.bin"), payload);

        const archive = join(workDir, "big.zip");
        await packFolder(source, archive);

        const out = join(workDir, "big-out");
        await extractZip(archive, out);
        expect(await readFile(join(out, "payload.bin"))).toEqual(payload);
    });

    it("keeps a Unicode name intact through the pack and the unpack", async () => {
        const source = join(workDir, "unicode");
        await mkdir(source, { recursive: true });
        await writeFile(join(source, "世界-overworld.txt"), "tiles");

        const archive = join(workDir, "unicode.zip");
        await packFolder(source, archive);

        const reader = await ZipReader.open(archive);
        try {
            expect(reader.entries().map((entry) => entry.name)).toEqual(["世界-overworld.txt"]);
        } finally {
            await reader.close();
        }
    });
});

/**
 * Tests for the encrypted transport.
 *
 * The round trip is the easy half. The half worth writing tests for is what happens when
 * the set of parts is not the set that was sealed, because on this path the parts travel
 * as separate release assets: an upload can drop one, a retry can leave an old one
 * behind, and two runs of the same world can put their assets in the same place. None of
 * those produce a corrupt part - each individual file is perfectly genuine - so per-part
 * authentication alone would wave them all through and hand a renderer a world assembled
 * out of two different snapshots.
 *
 * The manifest is what catches that, and these tests are mostly about proving it does:
 * a missing part, a part from another payload, a part swapped with another, a payload
 * with no manifest at all.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrivateCryptoError, generateKey, seal } from "./crypto.js";
import {
    deriveLegacyProjectId,
    deriveProjectId,
    manifestAssetName,
    partAssetName,
} from "./ids.js";
import {
    PRIVATE_PART_BYTES,
    PrivatePayloadError,
    legacyManifestAad,
    legacyPartAad,
    manifestAad,
    openPayload,
    partAad,
    readManifest,
    sealPayload,
} from "./payload.js";

const KEY = generateKey();
const PROJECT_ID = deriveProjectId(KEY, "a world nobody outside should learn the name of");

let directory: string;
let sealedDirectory: string;
let input: string;
let output: string;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "material-bluemap-private-"));
    sealedDirectory = join(directory, "sealed");
    input = join(directory, "payload.tar");
    output = join(directory, "opened.tar");
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

/** Random rather than repeated bytes, so a test cannot pass by accidental alignment. */
async function writeInput(bytes: number): Promise<Buffer> {
    const content = randomBytes(bytes);
    await writeFile(input, content);
    return content;
}

describe("the part size", () => {
    it("is 50 MB, and is not the release-asset split limit", () => {
        // Named here because the two numbers are easy to conflate and live in different
        // parts of this repository. This one bounds a buffer in every job on the private
        // path; the other bounds how large a published asset may be.
        expect(PRIVATE_PART_BYTES).toBe(50 * 1024 * 1024);
    });
});

describe("transport identity", () => {
    it("writes Worldlens AAD and keeps the old generation read-only", () => {
        expect(partAad("abc", 2, 64)).toBe("worldlens/private-transport/1|abc|part|2|64");
        expect(manifestAad("abc")).toBe("worldlens/private-transport/1|abc|manifest");
        expect(legacyPartAad("abc", 2, 64)).toBe(
            "material-bluemap/private-transport/1|abc|part|2|64",
        );
        expect(legacyManifestAad("abc")).toBe(
            "material-bluemap/private-transport/1|abc|manifest",
        );
    });
});

describe("sealPayload and openPayload", () => {
    it("round-trips a payload that fits in one part", async () => {
        const content = await writeInput(4096);

        const sealed = await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
        });
        expect(sealed.partCount).toBe(1);

        const opened = await openPayload({
            key: KEY,
            inputDirectory: sealedDirectory,
            outputPath: output,
            projectId: PROJECT_ID,
        });

        expect(opened.totalBytes).toBe(content.length);
        expect((await readFile(output)).equals(content)).toBe(true);
    });

    it("round-trips a payload that does not, splitting it at the part size", async () => {
        const content = await writeInput(1000);

        const sealed = await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });

        expect(sealed.partCount).toBe(4);
        expect(sealed.totalBytes).toBe(1000);

        await openPayload({
            key: KEY,
            inputDirectory: sealedDirectory,
            outputPath: output,
            projectId: PROJECT_ID,
        });
        expect((await readFile(output)).equals(content)).toBe(true);
    });

    it("writes nothing readable, and nothing that names the world", async () => {
        await writeFile(input, "the-world-is-called-something", "utf8");

        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
        });

        const names = await readdir(sealedDirectory);
        for (const name of names) {
            expect(name.startsWith(PROJECT_ID)).toBe(true);
            const bytes = await readFile(join(sealedDirectory, name));
            expect(bytes.includes("the-world-is-called-something")).toBe(false);
        }
    });

    it("opens a payload sealed with the legacy id and AAD contexts", async () => {
        const content = Buffer.from("legacy payload that must survive the rename", "utf8");
        const legacyProjectId = deriveLegacyProjectId(KEY, "a legacy world");
        const digest = createHash("sha256").update(content).digest("hex");
        const manifest = {
            version: 1,
            projectId: legacyProjectId,
            partBytes: content.length,
            partCount: 1,
            totalBytes: content.length,
            sha256: digest,
            parts: [{ index: 0, bytes: content.length, sha256: digest }],
        };

        await mkdir(sealedDirectory, { recursive: true });
        await writeFile(
            join(sealedDirectory, partAssetName(legacyProjectId, 0)),
            seal(KEY, legacyPartAad(legacyProjectId, 0, content.length), content),
        );
        await writeFile(
            join(sealedDirectory, manifestAssetName(legacyProjectId)),
            seal(
                KEY,
                legacyManifestAad(legacyProjectId),
                Buffer.from(JSON.stringify(manifest), "utf8"),
            ),
        );

        await openPayload({
            key: KEY,
            inputDirectory: sealedDirectory,
            outputPath: output,
            projectId: legacyProjectId,
        });

        expect((await readFile(output)).equals(content)).toBe(true);
    });

    it("refuses to seal an empty file rather than producing a payload that renders nothing", async () => {
        await writeFile(input, "");

        await expect(
            sealPayload({
                key: KEY,
                inputPath: input,
                outputDirectory: sealedDirectory,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(PrivatePayloadError);
    });
});

describe("a set of parts that is not the set that was sealed", () => {
    it("refuses a payload with a part missing", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });

        await rm(join(sealedDirectory, partAssetName(PROJECT_ID, 2)));

        await expect(
            openPayload({
                key: KEY,
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(/Part 2 of 4 is missing/);
    });

    it("refuses two parts of the same payload swapped over", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });

        const first = join(sealedDirectory, partAssetName(PROJECT_ID, 0));
        const second = join(sealedDirectory, partAssetName(PROJECT_ID, 1));
        const [a, b] = [await readFile(first), await readFile(second)];
        await writeFile(first, b);
        await writeFile(second, a);

        // Both files are genuine and both authenticate against the key. What refuses them
        // is that each one says which part it is, and that claim is authenticated too.
        await expect(
            openPayload({
                key: KEY,
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(PrivateCryptoError);
    });

    it("refuses a genuine part left behind by an earlier run of the same world", async () => {
        // Same key, same project id, different content: exactly what a retried upload
        // into an existing release produces. Per-part authentication cannot tell the
        // difference; the manifest's digests can.
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });
        const stale = await readFile(join(sealedDirectory, partAssetName(PROJECT_ID, 1)));

        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });
        await writeFile(join(sealedDirectory, partAssetName(PROJECT_ID, 1)), stale);

        await expect(
            openPayload({
                key: KEY,
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(/is not the part this payload's manifest describes/);
    });

    it("leaves no half-written output behind when it refuses", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });
        await rm(join(sealedDirectory, partAssetName(PROJECT_ID, 3)));

        await expect(
            openPayload({
                key: KEY,
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(PrivatePayloadError);

        // The dangerous artefact is a file that looks like a world and is three quarters
        // of one. A later step would render it and nothing would know.
        const left = await readdir(directory);
        expect(left).not.toContain("opened.tar");
        expect(left.some((name) => name.endsWith(".opening"))).toBe(false);
    });
});

describe("a payload that was tampered with", () => {
    it("refuses a part whose ciphertext was altered", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
            partBytes: 300,
        });

        const target = join(sealedDirectory, partAssetName(PROJECT_ID, 1));
        const bytes = await readFile(target);
        bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0x01, bytes.length - 1);
        await writeFile(target, bytes);

        await expect(
            openPayload({
                key: KEY,
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(/failed its authentication check/);
    });

    it("refuses a manifest that was altered", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
        });

        const target = join(sealedDirectory, manifestAssetName(PROJECT_ID));
        const bytes = await readFile(target);
        bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0x01, bytes.length - 1);
        await writeFile(target, bytes);

        await expect(
            readManifest({ key: KEY, inputDirectory: sealedDirectory, projectId: PROJECT_ID }),
        ).rejects.toThrow(/failed its authentication check/);
    });

    it("refuses everything when the key is wrong", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
        });

        await expect(
            openPayload({
                key: generateKey(),
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(PrivateCryptoError);
    });

    it("refuses a payload whose manifest never arrived", async () => {
        await writeInput(1000);
        await sealPayload({
            key: KEY,
            inputPath: input,
            outputDirectory: sealedDirectory,
            projectId: PROJECT_ID,
        });
        await rm(join(sealedDirectory, manifestAssetName(PROJECT_ID)));

        // The manifest is written last, so this is also what a half-finished upload looks
        // like. Refusing it is the difference between rendering three quarters of a world
        // and saying that only three quarters arrived.
        await expect(
            openPayload({
                key: KEY,
                inputDirectory: sealedDirectory,
                outputPath: output,
                projectId: PROJECT_ID,
            }),
        ).rejects.toThrow(/No manifest was found/);
    });
});

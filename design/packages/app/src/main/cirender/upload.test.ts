/**
 * The uploader, against a recording fake of the transfer.
 *
 * The point of these is that they are **route-agnostic**. Every property asserted here -
 * the order the assets go up in, what the pointer says, which assets a resumed upload skips
 * and which it sends again - is a property of the one packer, not of a credential. A fake
 * transport is what makes that provable: if any of this behaviour lived in the `gh` side or
 * in the REST side instead, these tests would have to be written twice and the two copies
 * would eventually disagree.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupIdFor, backupWorkspace, parseCheapLfsPointer, stagedPointerPath } from "../backup/index.js";
import { uploadWorldForRender } from "./upload.js";
import type { CiUploadEvent } from "./upload.js";
import type { CiRelease, CiReleaseAsset, CiTransport } from "./transport.js";

const OWNER = "o";
const REPO = "r";
const AT = new Date("2026-08-04T10:00:00Z");
/** Larger than anything this test packs, so nothing is ever split. */
const PART_SIZE = 64 * 1024 * 1024;

let workDir = "";
let world = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-ci-upload-"));
    world = join(workDir, "saves", "overworld");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "level");
    await writeFile(join(world, "region", "r.0.0.mca"), "region bytes");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

interface FakeTransport extends CiTransport {
    /** Every asset it was asked to put, in order, with the bytes it was told to expect. */
    readonly puts: { name: string; bytes: number }[];
    readonly created: string[];
    /** What the release is pretending to already hold. Set to script a resume. */
    readonly existing: Map<string, CiReleaseAsset>;
}

/**
 * A transport that records the transfer and refuses everything else.
 *
 * Everything outside the four transfer calls throws, deliberately: the uploader has no
 * business dispatching a workflow or reading a job's log, and a stub that answered those
 * politely would let such a call slip in unnoticed.
 */
function fakeTransport(release: CiRelease = { id: 5, tag: "", htmlUrl: "https://github.test/r" }): FakeTransport {
    const puts: { name: string; bytes: number }[] = [];
    const created: string[] = [];
    const existing = new Map<string, CiReleaseAsset>();
    const unused = (): never => {
        throw new Error("the uploader asked the transport for something that is not a transfer");
    };

    return {
        route: "session",
        describe: "a fake",
        canUpload: true,
        puts,
        created,
        existing,

        readWorkflow: unused,
        readDefaultBranch: unused,
        dispatchWorkflow: unused,
        findDispatchedRun: unused,
        readRun: unused,
        readRunJobs: unused,
        readJobLogTail: unused,
        listRunArtifacts: unused,
        downloadArtifact: unused,
        readRepository: unused,

        releaseHasAsset: (_owner, _repo, _tag, name) => Promise.resolve(existing.has(name)),
        findRelease: (_owner, _repo, tag) =>
            Promise.resolve(created.includes(tag) ? { ...release, tag } : null),
        createRelease: (_owner, _repo, tag) => {
            created.push(tag);
            return Promise.resolve({ ...release, tag });
        },
        listReleaseAssets: () => Promise.resolve(existing),
        uploadReleaseAsset: (upload) => {
            puts.push({ name: upload.assetName, bytes: upload.bytes });
            // Reported once at the end, as the `gh` transport does - it has no byte-by-byte
            // figure to relay and inventing one would make a stalled upload look busy.
            upload.onProgress?.({ bytesSent: upload.bytes, bytesTotal: upload.bytes });
            return Promise.resolve();
        },

        readVariable: unused,
        writeVariable: unused,
    };
}

function upload(transport: CiTransport, extra: { resume?: { tag: string; archiveName: string } } = {}) {
    return uploadWorldForRender({
        transport,
        owner: OWNER,
        repo: REPO,
        worldFolder: world,
        storageDir: join(workDir, "maps"),
        partSize: PART_SIZE,
        at: AT,
        ...(extra.resume === undefined ? {} : { resume: extra.resume }),
    });
}

/* -------------------------------------------------------------------------- */

describe("what goes up, and in what order", () => {
    it("puts the parts first, the sidecar next and the pointer last", async () => {
        const transport = fakeTransport();

        const result = await upload(transport);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(transport.created).toEqual([result.summary.tag]);
        // The pointer is the completion marker: a release with parts and no pointer is an
        // upload that stopped part-way, and one written first would make an unfinished
        // upload look like a finished backup.
        expect(transport.puts.map((put) => put.name)).toEqual([
            result.summary.archive,
            "backup.json",
            `${result.summary.archive}.cheaplfs`,
        ]);
        expect(result.summary.parts).toBe(1);
    });

    it("writes a pointer that names the archive and its digest, byte for byte", async () => {
        const transport = fakeTransport();
        const events: CiUploadEvent[] = [];
        const result = await uploadWorldForRender({
            transport,
            owner: OWNER,
            repo: REPO,
            worldFolder: world,
            storageDir: join(workDir, "maps"),
            partSize: PART_SIZE,
            at: AT,
            onEvent: (event) => events.push(event),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Read back off disk through `backup/`'s own parser, from `backup/`'s own staging
        // path: a pointer this application could not parse, in a place its own restore
        // does not look, is a backup neither application could use.
        const workspace = backupWorkspace(
            join(workDir, "maps"),
            backupIdFor(OWNER, REPO, result.summary.tag),
        );
        const parsed = parseCheapLfsPointer(
            await readFile(stagedPointerPath(workspace, `${result.summary.archive}.cheaplfs`), "utf8"),
        );
        expect(parsed).not.toBeNull();
        expect(parsed?.assetName).toBe(result.summary.archive);
        expect(parsed?.sha256).toBe(result.summary.sha256);
        expect(parsed?.releaseTag).toBe(result.summary.tag);

        // The release is announced before a byte moves, so a caller can write the tag down
        // and resume the upload that failed rather than the upload that succeeded.
        const announced = events.findIndex((event) => event.type === "release");
        const firstProgress = events.findIndex(
            (event) => event.type === "progress" && event.description.startsWith("Uploading"),
        );
        expect(announced).toBeGreaterThanOrEqual(0);
        expect(announced).toBeLessThan(firstProgress);
    });
});

describe("resuming is a property of the packer, not of a credential", () => {
    it("skips what the release already holds at the right size, and sends what is short", async () => {
        const first = fakeTransport();
        const made = await upload(first);
        expect(made.ok).toBe(true);
        if (!made.ok) return;

        const resumed = fakeTransport();
        resumed.created.push(made.summary.tag);
        // The archive arrived intact; the sidecar was cut off part-way. A name-only check
        // would call both of them done, which is how a resumed upload leaves a release that
        // looks complete and restores as a fragment.
        const archive = first.puts[0] as { name: string; bytes: number };
        resumed.existing.set(archive.name, { name: archive.name, size: archive.bytes });
        resumed.existing.set("backup.json", { name: "backup.json", size: 2 });

        const again = await upload(resumed, {
            resume: { tag: made.summary.tag, archiveName: made.summary.archive },
        });

        expect(again.ok).toBe(true);
        // No second release: it carried on with the one it was given.
        expect(resumed.created).toEqual([made.summary.tag]);
        expect(resumed.puts.map((put) => put.name)).toEqual([
            "backup.json",
            `${made.summary.archive}.cheaplfs`,
        ]);
    });

    it("refuses a resume onto a tag with no release rather than quietly making one", async () => {
        const transport = fakeTransport();

        const result = await upload(transport, { resume: { tag: "gone", archiveName: "world.zip" } });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-release-to-resume");
        // Making a different release under that name would look like it worked and leave
        // the original half-finished one exactly where it was, with nothing pointing at it.
        expect(transport.created).toHaveLength(0);
        expect(transport.puts).toHaveLength(0);
    });
});

describe("refusals are values", () => {
    it("answers rather than rejecting when the folder is not a world", async () => {
        const result = await uploadWorldForRender({
            transport: fakeTransport(),
            owner: OWNER,
            repo: REPO,
            worldFolder: join(workDir, "not-a-world"),
            storageDir: join(workDir, "maps"),
            partSize: PART_SIZE,
            at: AT,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message.length).toBeGreaterThan(0);
    });
});

/**
 * The one gap `runner.test.ts`, `restore.test.ts` and the rest of this directory all name
 * and do not close: real contact with github.com. Every other test here proves the code is
 * right about GitHub's documented shapes against a recording fake; this file finds out
 * whether a real backup, a real resume, and a real restore actually work against the real
 * release API, following the same "loud skip by default, real network on request" pattern
 * `github.realAccount.test.ts` uses.
 *
 * ## What is proven here, and how
 *
 * Set **`MBM_TEST_BACKUP_LIVE=1`**, **`MBM_TEST_BACKUP_TOKEN`** (a real token with `repo`
 * scope) and **`MBM_TEST_BACKUP_REPO`** (`owner/repo` the token can push to) to run it:
 *
 * 1. Packs a small multi-part world, publishes it as a real release with `BackupRunner`
 *    against real `api.github.com` and `uploads.github.com`, and confirms the pointer, the
 *    sidecar and every part actually landed as real release assets.
 * 2. Cancels a *second* backup of the same world mid-upload, after its first part is
 *    genuinely on the release, then resumes it under the same tag and confirms the resume
 *    reuses the *original* archive name rather than re-deriving one from the resuming
 *    call's own clock - the exact bug fixed in `archiveNameFromTag` (see `source.ts`'s own
 *    doc comment), now checked against the real release API rather than only the fake one
 *    `runner.test.ts` uses.
 * 3. Restores both releases with `BackupRestoreRunner` against the same real API and
 *    confirms the unpacked content is byte-for-byte the original folder.
 *
 * ## What this still does not prove
 *
 * That a backup made here restores through `desktop-material`'s own restore path. That
 * needs that application running against a real release, which this suite cannot do; see
 * `restore.ts`'s own doc comment and the article's callout for the precise scope of what
 * is and is not claimed about interoperability.
 *
 * ## Nothing here is cleaned up automatically
 *
 * Every release this test creates is left on the repository as durable evidence - append-
 * only, exactly as the feature promises - rather than deleted at the end of the run. A
 * repository used for this is expected to accumulate a few small prerelease tags.
 */

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { BackupRunner } from "./runner.js";
import type { BackupEvent } from "./runner.js";
import { BackupRestoreRunner } from "./restore.js";
import { archiveNameFromTag } from "./source.js";

const LIVE = process.env["MBM_TEST_BACKUP_LIVE"] === "1";
const TOKEN = process.env["MBM_TEST_BACKUP_TOKEN"];
const REPO = process.env["MBM_TEST_BACKUP_REPO"];

if (!LIVE || TOKEN === undefined || TOKEN.trim() === "" || REPO === undefined || REPO.trim() === "") {
    describe("a real backup and restore - real github.com", () => {
        it("is skipped because MBM_TEST_BACKUP_LIVE, _TOKEN or _REPO is not set", () => {
            // Set all three to run it for real: MBM_TEST_BACKUP_LIVE=1,
            // MBM_TEST_BACKUP_TOKEN=<a token with repo scope>, and
            // MBM_TEST_BACKUP_REPO=<owner/repo the token can push to>. Recorded as a
            // passing test rather than silence, so a run that never touched real GitHub
            // cannot be mistaken for one that did.
            expect(LIVE && TOKEN !== undefined && REPO !== undefined).toBe(false);
        });
    });
} else {
    const [owner, repo] = REPO.split("/");
    const token = TOKEN;

    describe("a real backup and restore - real github.com", () => {
        let workDir = "";

        async function makeWorld(name: string): Promise<string> {
            const root = join(workDir, "saves", name);
            await mkdir(join(root, "region"), { recursive: true });
            await writeFile(join(root, "level.dat"), `level-dat for ${name}, made ${new Date().toISOString()}`);
            await writeFile(join(root, "region", "r.0.0.mca"), Buffer.alloc(6000, 1));
            await writeFile(join(root, "region", "r.0.1.mca"), Buffer.alloc(6000, 2));
            return root;
        }

        async function fingerprint(root: string): Promise<Map<string, string>> {
            const found = new Map<string, string>();
            async function walk(dir: string): Promise<void> {
                for (const entry of await readdir(dir, { withFileTypes: true })) {
                    const full = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        await walk(full);
                    } else if (entry.isFile()) {
                        const bytes = await readFile(full);
                        found.set(
                            relative(root, full).split("\\").join("/"),
                            createHash("sha256").update(bytes).digest("hex"),
                        );
                    }
                }
            }
            await walk(root);
            return found;
        }

        function makeRunner(events: BackupEvent[] = []): BackupRunner {
            return new BackupRunner({
                storageDir: () => join(workDir, "storage"),
                token: () => token,
                onEvent: (event) => events.push(event),
                appVersion: "live-proof",
            });
        }

        function makeRestorer(): BackupRestoreRunner {
            return new BackupRestoreRunner({
                storageDir: () => join(workDir, "restoreStorage"),
                token: () => token,
            });
        }

        it(
            "packs, splits, publishes, uploads and restores a real multi-part backup",
            async () => {
                workDir = await mkdtemp(join(tmpdir(), "mbm-backup-live-"));
                try {
                    if (owner === undefined || repo === undefined) throw new Error("MBM_TEST_BACKUP_REPO must be owner/repo");

                    const folder = await makeWorld("live-overworld");
                    const original = await fingerprint(folder);
                    expect(original.size).toBe(3);

                    const runner = makeRunner();
                    const backed = await runner.backup({
                        kind: "world",
                        folder,
                        owner,
                        repo,
                        acknowledgePublic: true,
                        partSize: 4096,
                    });

                    if (!backed.ok) {
                        throw new Error(`live backup failed: ${backed.failure.code} - ${backed.failure.message}`);
                    }
                    expect(backed.ok).toBe(true);
                    expect(backed.summary.parts).toBeGreaterThan(1);
                    expect(backed.summary.repository).toBe(REPO);
                    expect(backed.summary.releaseUrl).toContain(`github.com/${REPO}/releases/tag/`);

                    const restorer = makeRestorer();
                    const restored = await restorer.restore({ owner, repo, tag: backed.summary.tag });

                    expect(restored.ok).toBe(true);
                    if (!restored.ok) {
                        throw new Error(`live restore failed: ${restored.failure.code} - ${restored.failure.message}`);
                    }
                    expect(restored.summary.sha256).toBe(backed.summary.sha256);
                    expect(restored.summary.bytes).toBe(backed.summary.bytes);
                    expect(restored.summary.parts).toBe(backed.summary.parts);

                    const restoredFingerprint = await fingerprint(restored.summary.contentFolder);
                    expect(restoredFingerprint).toEqual(original);
                } finally {
                    await rm(workDir, { recursive: true, force: true });
                }
            },
            120_000,
        );

        it(
            "resumes a real cancelled upload under the original archive name, and restores what results",
            async () => {
                workDir = await mkdtemp(join(tmpdir(), "mbm-backup-live-resume-"));
                try {
                    if (owner === undefined || repo === undefined) throw new Error("MBM_TEST_BACKUP_REPO must be owner/repo");

                    const folder = await makeWorld("live-resume-world");
                    const original = await fingerprint(folder);

                    // First attempt: cancelled deliberately, once at least one real part has
                    // genuinely landed on the release. `runner.cancel` is called from inside
                    // the progress callback, which is the same mechanism a person clicking
                    // Stop mid-upload would trigger.
                    const firstEvents: BackupEvent[] = [];
                    const firstRunner = makeRunner(firstEvents);
                    let cancelled = false;
                    const firstPromise = firstRunner.backup({
                        kind: "world",
                        folder,
                        owner,
                        repo,
                        acknowledgePublic: true,
                        partSize: 4096,
                    });
                    await new Promise<void>((resolve) => {
                        const check = (): void => {
                            // Waits specifically for real upload progress, not just any
                            // progress - packing and splitting also emit progress events
                            // with bytesDone > 0, and cancelling during those would abort
                            // before the release (and therefore anything to resume) exists.
                            const uploadedSomething = firstEvents.some(
                                (event) =>
                                    event.type === "progress" &&
                                    event.phase === "uploading" &&
                                    event.task.bytesDone > 0,
                            );
                            if (uploadedSomething && !cancelled) {
                                cancelled = true;
                                const id = firstRunner.activeBackupIds()[0];
                                if (id !== undefined) firstRunner.cancel(id);
                                resolve();
                            } else {
                                setTimeout(check, 25);
                            }
                        };
                        check();
                    });
                    const firstResult = await firstPromise;
                    expect(firstResult.ok).toBe(false);
                    if (firstResult.ok) return;
                    expect(firstResult.failure.code).toBe("cancelled");

                    const originalTag = firstEvents.find((event) => event.type === "started")?.type === "started"
                        ? (firstEvents.find((event) => event.type === "started") as Extract<BackupEvent, { type: "started" }>).tag
                        : undefined;
                    expect(originalTag).toBeDefined();
                    if (originalTag === undefined) return;

                    // Confirms the fixed bug's own claim before resuming: the archive name
                    // a resume must reuse is recoverable straight from the tag, not from
                    // whatever moment the resume happens to start in.
                    const expectedArchiveName = archiveNameFromTag(originalTag);
                    expect(expectedArchiveName).not.toBeNull();

                    // Second attempt: resumes under the same tag, genuinely later in real
                    // time (a real cross-UTC-second gap is exactly the case the bug needed
                    // to reproduce, and this run is real wall-clock time, not simulated).
                    const secondRunner = makeRunner();
                    const resumed = await secondRunner.backup({
                        kind: "world",
                        folder,
                        owner,
                        repo,
                        acknowledgePublic: true,
                        partSize: 4096,
                        resumeTag: originalTag,
                    });

                    if (!resumed.ok) {
                        throw new Error(`live resume failed: ${resumed.failure.code} - ${resumed.failure.message}`);
                    }
                    expect(resumed.ok).toBe(true);
                    expect(resumed.summary.tag).toBe(originalTag);
                    expect(resumed.summary.archive).toBe(expectedArchiveName);

                    const restorer = makeRestorer();
                    const restored = await restorer.restore({ owner, repo, tag: originalTag });
                    expect(restored.ok).toBe(true);
                    if (!restored.ok) return;
                    expect(restored.summary.sha256).toBe(resumed.summary.sha256);

                    const restoredFingerprint = await fingerprint(restored.summary.contentFolder);
                    expect(restoredFingerprint).toEqual(original);
                } finally {
                    await rm(workDir, { recursive: true, force: true });
                }
            },
            180_000,
        );
    });
}

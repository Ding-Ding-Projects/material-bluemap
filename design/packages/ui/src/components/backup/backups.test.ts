/**
 * The backup surface's state, without a component.
 *
 * The behaviours pinned here are the ones a mounted test would prove slowly and less
 * precisely: that an event for a backup started somewhere else lands in the right row,
 * that a refusal with no id is reported beside the form rather than as a phantom row, and
 * that reading a repository clears whatever the last one said - which is the difference
 * between "this repository is private" being a fact and being a leftover.
 */

import { describe, expect, it, vi } from "vitest";
import { canResume, createBackups, etaText, partsText, phaseLabel, transferText } from "./backups.js";
import type { BackupRow } from "./backups.js";
import type {
    Answer,
    BackupBridge,
    BackupEvent,
    BackupListing,
    BackupResult,
    RepositoryChoice,
    RepositoryReport,
} from "./backupBridge.js";

const t = ((key: string, a?: unknown, b?: unknown): string => {
    const fallback = typeof a === "string" ? a : typeof b === "string" ? b : key;
    const named = typeof a === "object" && a !== null ? (a as Record<string, unknown>) : {};
    return fallback.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in named ? String(named[name]) : whole,
    );
}) as never;

function fakeBridge(
    overrides: Partial<BackupBridge> = {},
): BackupBridge & { emit(event: BackupEvent): void } {
    let listener: ((event: BackupEvent) => void) | null = null;
    const bridge: BackupBridge & { emit(event: BackupEvent): void } = {
        listBackupRepositories: () =>
            Promise.resolve({ ok: true, value: [] } as Answer<readonly RepositoryChoice[]>),
        inspectBackupRepository: () =>
            Promise.resolve({
                ok: true,
                value: {
                    owner: "o",
                    repo: "r",
                    fullName: "o/r",
                    private: true,
                    canWrite: true,
                    htmlUrl: "",
                    warning: { level: "note", message: "private, but not free" },
                },
            } as Answer<RepositoryReport>),
        inspectBackupSource: () =>
            Promise.resolve({
                ok: true,
                value: { kind: "world", folder: "/w", label: "w", files: 1, bytes: 1, skipped: [] },
            }),
        listBackups: () => Promise.resolve({ ok: true, value: [] } as Answer<readonly BackupListing[]>),
        startBackup: () =>
            Promise.resolve({
                ok: true,
                backupId: "b1",
                summary: {
                    backupId: "b1",
                    repository: "o/r",
                    tag: "tag",
                    releaseUrl: "",
                    archive: "a.zip",
                    bytes: 1,
                    sha256: "a".repeat(64),
                    parts: 1,
                    kind: "world",
                    label: "w",
                },
                durationMs: 1,
            } as BackupResult),
        cancelBackup: () => Promise.resolve(true),
        activeBackups: () => Promise.resolve([]),
        onBackupEvent: (next) => {
            listener = next;
            return () => {
                listener = null;
            };
        },
        canCancel: true,
        canListRepositories: true,
        canListBackups: true,
        canSeeActive: true,
        ...overrides,
        emit(event: BackupEvent): void {
            listener?.(event);
        },
    };
    return bridge;
}

const startedAt = "2026-08-04T10:15:00.000Z";

describe("with no bridge at all", () => {
    it("reports itself unavailable rather than pretending", () => {
        const backups = createBackups(null);
        expect(backups.available).toBe(false);
        expect(backups.canCancel).toBe(false);
        expect(backups.canListBackups).toBe(false);
    });

    it("answers every call harmlessly, so a surface never has to guard each one", async () => {
        const backups = createBackups(null);
        expect(await backups.check("o", "r")).toBeNull();
        expect(await backups.start({ kind: "world", folder: "/w", owner: "o", repo: "r" })).toBeNull();
        expect(await backups.stop("b1")).toBe(false);
        await backups.reconcile();
        expect(backups.rows.value).toEqual([]);
    });
});

describe("events become rows", () => {
    it("builds a row from a started event and fills it in as it goes", () => {
        const bridge = fakeBridge();
        const backups = createBackups(bridge);

        bridge.emit({
            type: "started",
            backupId: "b1",
            repository: "o/r",
            tag: "tag-1",
            kind: "world",
            label: "Overworld",
            at: startedAt,
        });
        expect(backups.rows.value).toHaveLength(1);
        expect(backups.rows.value[0]?.label).toBe("Overworld");
        expect(backups.rows.value[0]?.state).toBe("running");

        bridge.emit({
            type: "progress",
            backupId: "b1",
            phase: "uploading",
            task: {
                phase: "uploading",
                description: "Uploading part 2 of 3",
                bytesDone: 50,
                bytesTotal: 100,
                partsDone: 1,
                partsTotal: 3,
                currentPart: "a.zip.002-abc",
                percent: 70,
                etaSeconds: 30,
                etaText: "30 seconds",
            },
            at: startedAt,
        });
        expect(backups.rows.value[0]?.task?.percent).toBe(70);
        expect(backups.rows.value[0]?.phase).toBe("uploading");
    });

    it("puts a running backup above a finished one, and the newest first inside each", () => {
        const bridge = fakeBridge();
        const backups = createBackups(bridge);

        bridge.emit({ type: "started", backupId: "old", repository: "o/r", tag: "t1", kind: "world", label: "old", at: "2026-08-01T00:00:00Z" });
        bridge.emit({ type: "cancelled", backupId: "old", at: "2026-08-01T00:01:00Z" });
        bridge.emit({ type: "started", backupId: "new", repository: "o/r", tag: "t2", kind: "world", label: "new", at: "2026-08-04T00:00:00Z" });

        expect(backups.rows.value.map((row) => row.backupId)).toEqual(["new", "old"]);
    });

    it("keeps a bounded log rather than growing without limit over an hour", () => {
        const bridge = fakeBridge();
        const backups = createBackups(bridge);
        for (let index = 0; index < 150; index += 1) {
            bridge.emit({
                type: "log",
                backupId: "b1",
                level: "info",
                message: `line ${String(index)}`,
                at: startedAt,
            });
        }
        expect(backups.rows.value[0]?.log).toHaveLength(100);
        expect(backups.rows.value[0]?.log.at(-1)?.message).toBe("line 149");
    });

    it("reports a refusal with no id beside the form, not as a row", () => {
        const bridge = fakeBridge();
        const backups = createBackups(bridge);
        bridge.emit({
            type: "failed",
            backupId: "nowhere",
            failure: {
                code: "public-not-acknowledged",
                message: "o/r is a PUBLIC repository.",
                detail: null,
                status: null,
                needsSignIn: false,
            },
            at: startedAt,
        });
        expect(backups.rows.value).toEqual([]);
        expect(backups.startFailure.value?.code).toBe("public-not-acknowledged");
    });

    it("stops listening when it is disposed", () => {
        const bridge = fakeBridge();
        const backups = createBackups(bridge);
        backups.dispose();
        bridge.emit({ type: "started", backupId: "b1", repository: "o/r", tag: "t", kind: "world", label: "l", at: startedAt });
        expect(backups.rows.value).toEqual([]);
    });
});

describe("reading a repository", () => {
    it("clears the previous answer before asking, so nothing stale is on screen", async () => {
        let answer: RepositoryReport = {
            owner: "o",
            repo: "private-one",
            fullName: "o/private-one",
            private: true,
            canWrite: true,
            htmlUrl: "",
            warning: { level: "note", message: "private" },
        };
        const bridge = fakeBridge({
            inspectBackupRepository: () => Promise.resolve({ ok: true, value: answer }),
        });
        const backups = createBackups(bridge);

        await backups.check("o", "private-one");
        expect(backups.report.value?.private).toBe(true);

        answer = { ...answer, repo: "public-one", fullName: "o/public-one", private: false };
        const during = backups.check("o", "public-one");
        // Cleared the moment the question is asked: a stale "private" beside a repository
        // somebody has just changed is how a world ends up public.
        expect(backups.report.value).toBeNull();
        await during;
        expect(backups.report.value?.private).toBe(false);
    });

    it("keeps the main process's own sentence when it refuses", async () => {
        const bridge = fakeBridge({
            inspectBackupRepository: () =>
                Promise.resolve({ ok: false, message: "Nobody is signed in. Sign in from Settings." }),
        });
        const backups = createBackups(bridge);
        expect(await backups.check("o", "r")).toBeNull();
        expect(backups.reportFailure.value).toContain("Settings");
        expect(backups.report.value).toBeNull();
    });

    it("survives a bridge that rejects rather than answering", async () => {
        const bridge = fakeBridge({
            inspectBackupRepository: () => Promise.reject(new Error("the channel went away")),
        });
        const backups = createBackups(bridge);
        expect(await backups.check("o", "r")).toBeNull();
        expect(backups.reportFailure.value).toBe("the channel went away");
    });
});

describe("starting and stopping", () => {
    it("marks a row as stopping before the answer comes back", async () => {
        const bridge = fakeBridge({ cancelBackup: () => new Promise(() => undefined) });
        const backups = createBackups(bridge);
        bridge.emit({ type: "started", backupId: "b1", repository: "o/r", tag: "t", kind: "world", label: "l", at: startedAt });

        void backups.stop("b1");
        expect(backups.rows.value[0]?.stopping).toBe(true);
    });

    it("adopts an id that is already in flight, so a second copy is never started", async () => {
        const bridge = fakeBridge({ activeBackups: () => Promise.resolve(["elsewhere"]) });
        const backups = createBackups(bridge);
        await backups.reconcile();
        expect(backups.rows.value.map((row) => row.backupId)).toEqual(["elsewhere"]);
        expect(backups.rows.value[0]?.live).toBe(false);
    });

    it("passes the acknowledgement through, because the main process requires it", async () => {
        const startBackup = vi.fn(() =>
            Promise.resolve({
                ok: false,
                backupId: "nowhere",
                failure: { code: "x", message: "no", detail: null, status: null, needsSignIn: false },
            } as BackupResult),
        );
        const bridge = fakeBridge({ startBackup });
        const backups = createBackups(bridge);

        await backups.start({
            kind: "world",
            folder: "/w",
            owner: "o",
            repo: "r",
            acknowledgePublic: true,
        });
        expect(startBackup).toHaveBeenCalledWith(
            expect.objectContaining({ acknowledgePublic: true }),
        );
    });
});

describe("what a row says", () => {
    const row: BackupRow = {
        backupId: "b1",
        repository: "o/r",
        tag: "tag-1",
        kind: "world",
        label: "Overworld",
        state: "cancelled",
        phase: "uploading",
        task: null,
        summary: null,
        failure: null,
        startedAt,
        finishedAt: startedAt,
        durationMs: 1,
        live: true,
        stopping: false,
        log: [],
    };

    it("offers to carry on a stopped backup that got as far as its release", () => {
        expect(canResume(row)).toBe(true);
    });

    it("does not offer it for one that never got a tag, since there is nothing to resume into", () => {
        expect(canResume({ ...row, tag: "" })).toBe(false);
    });

    it("does not offer it for a backup that finished", () => {
        expect(canResume({ ...row, state: "finished" })).toBe(false);
    });

    it("names each phase in words rather than showing its code", () => {
        expect(phaseLabel("packing", t)).toContain("Packing");
        expect(phaseLabel("uploading", t)).toContain("Uploading");
        expect(phaseLabel(null, t)).toContain("Starting");
    });

    it("says which part only when there is more than one", () => {
        const task = {
            phase: "uploading" as const,
            description: "",
            bytesDone: 1,
            bytesTotal: 2,
            partsDone: 1,
            partsTotal: 3,
            currentPart: null,
            percent: 50,
            etaSeconds: null,
            etaText: null,
        };
        expect(partsText(task, t)).toBe("part 1 of 3");
        expect(partsText({ ...task, partsTotal: 1 }, t)).toBe("");
        expect(partsText(null, t)).toBe("");
    });

    it("renders bytes and the estimate through the downloads surface's own formatting", () => {
        const task = {
            phase: "uploading" as const,
            description: "",
            bytesDone: 1_500_000_000,
            bytesTotal: 3_000_000_000,
            partsDone: 1,
            partsTotal: 2,
            currentPart: null,
            percent: 50,
            etaSeconds: 90,
            etaText: "2 minutes",
        };
        expect(transferText(task, t)).toContain("GB");
        expect(etaText(task, t)).toContain("2 minutes");
    });
});

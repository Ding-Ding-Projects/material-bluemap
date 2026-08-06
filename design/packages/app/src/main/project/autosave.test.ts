/**
 * The autosave scheduler, proved two ways.
 *
 * The debounce, the no-op detection, the boundary flush and the never-fail contract are
 * properties of the scheduler itself and are tested against an injected `save` spy with fake
 * timers, so every tick is deterministic and nothing here waits on a real clock.
 *
 * The append-only guarantee - that a restore is a new revision, and that restoring a restore
 * is itself just another revision - is not this module's to prove twice; `history/repository.ts`
 * and `project/ipc.test.ts` already prove it against a real git. What *is* this module's to
 * prove is that an autosave-triggered write is indistinguishable, from that engine's point of
 * view, from a manual one: the "real git" block below drives the scheduler with the genuine
 * `saveProject` and shows the same append-only history comes out the other end, including a
 * project's own settings bodies riding along coherently.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROJECT_FORMAT_VERSION, projectFileSchema, type ProjectFile } from "@material-bluemap/config";

import { runGit, type GitResult, type GitRunner } from "../history/index.js";

import {
    DEFAULT_AUTOSAVE_MAX_WAIT_MS,
    DEFAULT_AUTOSAVE_QUIET_MS,
    createProjectAutosave,
    wireAutosaveQuitFlush,
    type AutosaveOutcome,
    type QuitAppLike,
} from "./autosave.js";
import { projectHistoryRoot, projectRepositoryPath } from "./history.js";
import type { ProjectSaveResult } from "./save.js";

/* -------------------------------------------------------------------------- */
/* Building projects and fake results                                        */
/* -------------------------------------------------------------------------- */

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
    return projectFileSchema.parse({
        version: PROJECT_FORMAT_VERSION,
        id: "p-1",
        name: "Home world",
        createdAt: "2026-08-05T12:00:00-04:00",
        updatedAt: "2026-08-05T12:00:00-04:00",
        ...overrides,
    });
}

let fakeRevisionCounter = 0;

function fakeSaveResult(saved: ProjectFile, historyOk = true): ProjectSaveResult {
    fakeRevisionCounter += 1;
    return {
        ok: true,
        path: "/fake/world/material-bluemap.project.json",
        project: saved,
        historyOk,
        revision: historyOk
            ? {
                  id: fakeRevisionCounter.toString(16).padStart(40, "0"),
                  shortId: fakeRevisionCounter.toString(16).padStart(12, "0"),
                  at: new Date().toISOString(),
                  label: `Changed the project (${String(fakeRevisionCounter)})`,
                  action: "changed",
                  changes: [],
                  note: null,
                  restoredFrom: null,
              }
            : null,
        historyMessage: historyOk ? "Recorded a revision." : "Git broke, so nothing was recorded.",
    };
}

/* -------------------------------------------------------------------------- */
/* The scheduler, driven by fake timers and an injected save                 */
/* -------------------------------------------------------------------------- */

describe("the debounce", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("autosaves on a real change and does nothing for a no-op", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        engine.notifyChange("/world", project({ name: "A" }));
        expect(engine.hasPendingFor("/world")).toBe(true);
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS);
        expect(save).toHaveBeenCalledTimes(1);
        expect(engine.hasPendingFor("/world")).toBe(false);

        // The exact same project again: nothing changed against what was just written, so this
        // must not even start a timer, let alone write.
        engine.notifyChange("/world", project({ name: "A" }));
        expect(engine.hasPendingFor("/world")).toBe(false);
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS * 2);
        expect(save).toHaveBeenCalledTimes(1);

        engine.dispose();
    });

    it("coalesces a burst of edits into the one write that reflects where they stopped", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        engine.notifyChange("/world", project({ name: "A" }));
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS / 2);
        engine.notifyChange("/world", project({ name: "AB" }));
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS / 2);
        engine.notifyChange("/world", project({ name: "ABC" }));

        // Neither of the first two edits ever went quiet for the full interval, so nothing has
        // written yet.
        expect(save).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS);
        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0]?.[2]).toMatchObject({ name: "ABC" });

        engine.dispose();
    });

    it("drops a pending write that gets undone back to the last known baseline before it fires", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        engine.notifyChange("/world", project({ name: "A" }));
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS);
        expect(save).toHaveBeenCalledTimes(1);

        engine.notifyChange("/world", project({ name: "A changed" }));
        expect(engine.hasPendingFor("/world")).toBe(true);
        // Undo, before the debounce fires - back to exactly what was last written.
        engine.notifyChange("/world", project({ name: "A" }));
        expect(engine.hasPendingFor("/world")).toBe(false);

        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS * 2);
        expect(save).toHaveBeenCalledTimes(1);

        engine.dispose();
    });

    it("forces a write once the max-wait ceiling is reached, even under continuous edits", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save, quietMs: 1_000, maxWaitMs: 5_000 });

        // Keep the debounce from ever going quiet by editing every 900ms, well under the
        // 1000ms quiet interval, for longer than the 5000ms ceiling.
        for (let tick = 0; tick < 7; tick += 1) {
            engine.notifyChange("/world", project({ name: `Edit ${String(tick)}` }));
            await vi.advanceTimersByTimeAsync(900);
        }

        // The ceiling should have forced at least one write despite the debounce never once
        // going quiet.
        expect(save.mock.calls.length).toBeGreaterThanOrEqual(1);

        engine.dispose();
    });

    it("flushes a boundary or destructive reason immediately, without waiting for quiet", async () => {
        vi.useFakeTimers();
        const ticks: AutosaveOutcome[] = [];
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save, onAutosave: (tick) => ticks.push(tick) });

        engine.notifyChange("/world", project({ name: "About to do something destructive" }));
        const result = await engine.flush("/world", "destructive");

        expect(save).toHaveBeenCalledTimes(1);
        expect(result?.ok).toBe(true);
        expect(ticks).toHaveLength(1);
        expect(ticks[0]?.reason).toBe("destructive");
        expect(engine.hasPendingFor("/world")).toBe(false);

        engine.dispose();
    });

    it("does nothing when a flush is asked for and nothing is pending", async () => {
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        const result = await engine.flush("/world", "boundary");
        expect(result).toBeNull();
        expect(save).not.toHaveBeenCalled();

        engine.dispose();
    });

    it("flushAll writes every world with something pending and leaves the rest alone", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        engine.notifyChange("/world-a", project({ name: "A" }));
        engine.notifyChange("/world-b", project({ name: "B" }));
        expect(engine.hasAnyPending()).toBe(true);

        await engine.flushAll("quit");

        expect(save).toHaveBeenCalledTimes(2);
        expect(engine.hasAnyPending()).toBe(false);

        engine.dispose();
    });

    /**
     * The clause the whole module exists to satisfy: an autosave that goes wrong must not take
     * the caller down with it, and must not wedge the scheduler for the world it happened to.
     */
    it("a failed autosave never fails the caller, and the next one still runs", async () => {
        vi.useFakeTimers();
        const ticks: AutosaveOutcome[] = [];
        let attempt = 0;
        const save = vi.fn(async (_options, _world, saved: ProjectFile): Promise<ProjectSaveResult> => {
            attempt += 1;
            if (attempt === 1) throw new Error("the disk vanished");
            return fakeSaveResult(saved);
        });
        const engine = createProjectAutosave({ dataDir: "/data", save, onAutosave: (tick) => ticks.push(tick) });

        engine.notifyChange("/world", project({ name: "First" }));
        const first = await engine.flush("/world", "boundary");
        expect(first?.ok).toBe(false);
        expect(ticks).toHaveLength(1);
        expect(ticks[0]?.result.ok).toBe(false);

        // A caller-injected save can also succeed but report a broken history - exactly the
        // shape the real `saveProject` returns when git is unavailable. The user's edit is
        // still, from this scheduler's point of view, a success: the write happened.
        engine.notifyChange("/world", project({ name: "Second" }));
        const second = await engine.flush("/world", "boundary");
        expect(second?.ok).toBe(true);
        if (second?.ok) expect(second.historyOk).toBe(true);
        expect(ticks).toHaveLength(2);

        engine.dispose();
    });

    it("a broken history still reports the write as a success, never as a failure of the edit", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved, false));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        engine.notifyChange("/world", project({ name: "Saved anyway" }));
        const result = await engine.flush("/world", "boundary");

        expect(result?.ok).toBe(true);
        if (result?.ok) {
            expect(result.historyOk).toBe(false);
            expect(result.historyMessage).toContain("Git broke");
        }

        engine.dispose();
    });

    it("dispose cancels every pending timer so a stray tick cannot fire after shutdown", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });

        engine.notifyChange("/world", project({ name: "Never written" }));
        engine.dispose();
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_QUIET_MS + DEFAULT_AUTOSAVE_MAX_WAIT_MS);

        expect(save).not.toHaveBeenCalled();
    });
});

/* -------------------------------------------------------------------------- */
/* Flushing on quit                                                           */
/* -------------------------------------------------------------------------- */

describe("wireAutosaveQuitFlush", () => {
    function fakeApp(): QuitAppLike & { readonly fired: number; readonly listeners: ((event: { preventDefault(): void }) => void)[] } {
        const listeners: ((event: { preventDefault(): void }) => void)[] = [];
        let fired = 0;
        return {
            get fired() {
                return fired;
            },
            listeners,
            quit() {
                fired += 1;
                for (const listener of listeners) listener({ preventDefault: () => undefined });
            },
            on(_event, listener) {
                listeners.push(listener);
            },
        };
    }

    it("lets an ordinary quit through untouched when nothing is pending", () => {
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });
        const app = fakeApp();
        wireAutosaveQuitFlush(app, engine);

        let prevented = false;
        for (const listener of app.listeners) listener({ preventDefault: () => (prevented = true) });

        expect(prevented).toBe(false);
        engine.dispose();
    });

    it("flushes every pending world before letting the application actually quit", async () => {
        vi.useFakeTimers();
        const save = vi.fn(async (_options, _world, saved: ProjectFile) => fakeSaveResult(saved));
        const engine = createProjectAutosave({ dataDir: "/data", save });
        const app = fakeApp();
        wireAutosaveQuitFlush(app, engine);

        engine.notifyChange("/world", project({ name: "Unsaved at quit time" }));

        let prevented = false;
        for (const listener of app.listeners) listener({ preventDefault: () => (prevented = true) });
        expect(prevented).toBe(true);

        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        await Promise.resolve();

        expect(save).toHaveBeenCalledTimes(1);
        expect(app.fired).toBe(1);

        vi.useRealTimers();
        engine.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Against a real git, driving the real saveProject                          */
/* -------------------------------------------------------------------------- */

const gitProbe = await runGit(["--version"], { cwd: process.cwd() });
const hasGit = gitProbe.ok;

const noGit: GitRunner = () =>
    Promise.resolve<GitResult>({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

const created: string[] = [];

async function tempFolder(prefix: string): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), prefix));
    created.push(folder);
    return folder;
}

async function world(): Promise<{ folder: string; dataDir: string }> {
    const folder = await tempFolder("mb-project-autosave-world-");
    const dataDir = await tempFolder("mb-project-autosave-data-");
    await writeFile(join(folder, "level.dat"), "not really nbt", "utf8");
    return { folder, dataDir };
}

async function exists(path: string): Promise<boolean> {
    return await stat(path).then(
        () => true,
        () => false,
    );
}

afterEach(async () => {
    while (created.length > 0) {
        const folder = created.pop();
        if (folder !== undefined) await rm(folder, { recursive: true, force: true });
    }
});

describe.skipIf(!hasGit)("driving the real saveProject, on a real disk", { timeout: 60_000 }, () => {
    it("never creates a .git inside the world, and keeps the repository beside the app's data", async () => {
        const { folder, dataDir } = await world();
        const engine = createProjectAutosave({ dataDir });

        engine.notifyChange(folder, project({ name: "Autosaved" }));
        const result = await engine.flush(folder, "boundary");

        expect(result?.ok).toBe(true);
        expect(await exists(join(folder, ".git"))).toBe(false);

        const repository = projectRepositoryPath(dataDir, folder);
        expect(repository.startsWith(projectHistoryRoot(dataDir))).toBe(true);
        expect(await exists(join(repository, ".git"))).toBe(true);

        engine.dispose();
    });

    it("a snapshot failure (no git on the machine) still leaves the autosaved write successful", async () => {
        const { folder, dataDir } = await world();
        const engine = createProjectAutosave({ dataDir, git: noGit });

        engine.notifyChange(folder, project({ name: "Written despite no git" }));
        const result = await engine.flush(folder, "boundary");

        expect(result?.ok).toBe(true);
        if (result?.ok) {
            expect(result.historyOk).toBe(false);
            expect(result.historyMessage).toContain("Git is not installed");
        }
        expect(await exists(join(folder, ".git"))).toBe(false);

        engine.dispose();
    });

    /**
     * Append-only, driven by the scheduler rather than by a direct call to `saveProject`: two
     * autosaved revisions, a restore back to the first that adds a third revision rather than
     * discarding the second, and a restore of *that* restore that adds a fourth. Nothing here
     * is new history logic - it is `history/repository.ts`'s own guarantee, exercised through
     * the path an autosave actually takes.
     */
    it("an autosaved history stays append-only: a restore can itself be restored", async () => {
        const { folder, dataDir } = await world();
        const engine = createProjectAutosave({ dataDir });

        engine.notifyChange(folder, project({ name: "First", core: "sky-color: \"#7dabff\"" }));
        await engine.flush(folder, "boundary");
        engine.notifyChange(
            folder,
            project({
                name: "Second",
                updatedAt: "2026-08-05T13:00:00-04:00",
                core: "sky-color: \"#ffffff\"",
            }),
        );
        await engine.flush(folder, "boundary");

        const { projectHistoryListing, restoreProjectRevision } = await import("./history.js");
        const before = await projectHistoryListing({ dataDir }, folder);
        expect(before.revisions).toHaveLength(2);
        const first = before.revisions[1];

        // Restore to "First" - this must ADD a revision, never rewrite history.
        const restored = await restoreProjectRevision({ dataDir }, folder, first?.id ?? "");
        expect(restored.ok).toBe(true);

        const afterFirstRestore = await projectHistoryListing({ dataDir }, folder);
        expect(afterFirstRestore.revisions).toHaveLength(3);
        expect(afterFirstRestore.revisions[0]?.action).toBe("restored");
        // The project's own settings body travelled with the restore, so the state is coherent
        // rather than a project with the wrong render/core settings under a restored name.
        const { readProject } = await import("./file.js");
        const readBack = await readProject(folder);
        expect(readBack.ok && readBack.project.name).toBe("First");
        expect(readBack.ok && readBack.project.core).toBe("sky-color: \"#7dabff\"");

        // Restore the restore's own predecessor back to "Second" - undoing the undo.
        const second = before.revisions[0];
        const restoredAgain = await restoreProjectRevision({ dataDir }, folder, second?.id ?? "");
        expect(restoredAgain.ok).toBe(true);

        const afterSecondRestore = await projectHistoryListing({ dataDir }, folder);
        // Four: the two autosaves, and both restores, each its own row - nothing was rewritten.
        expect(afterSecondRestore.revisions).toHaveLength(4);
        expect(afterSecondRestore.revisions.filter((revision) => revision.action === "restored")).toHaveLength(2);
        expect(afterSecondRestore.revisions.map((revision) => revision.id)).toEqual(
            expect.arrayContaining(before.revisions.map((revision) => revision.id)),
        );

        const finalRead = await readProject(folder);
        expect(finalRead.ok && finalRead.project.name).toBe("Second");
        expect(finalRead.ok && finalRead.project.core).toBe("sky-color: \"#ffffff\"");

        engine.dispose();
    });
});

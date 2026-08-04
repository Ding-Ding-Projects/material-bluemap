/**
 * The project channel, exercised end to end against real world folders and a real git.
 *
 * The properties this feature has to have - a save that records exactly one revision, a
 * history repository that never appears inside somebody's world, a broken history that
 * leaves a good save alone - are properties of what git and the file system actually do. A
 * fake git would cheerfully "prove" all three while the shipped code did none of them, so
 * the integration block below runs against the real binary and is skipped, loudly, on a
 * machine that has none.
 *
 * The two things that *are* injected are the two a test cannot otherwise produce honestly: a
 * machine with no git installed, and a git that fails partway through a commit. Both arrive
 * as a `GitRunner`, which is the seam `history/git.ts` exists to provide.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    PROJECT_FILE_NAME,
    PROJECT_FORMAT_VERSION,
    projectFileSchema,
    type ProjectFile,
    type ProjectMap,
} from "@material-bluemap/config";

import { historyRoot, runGit, type GitResult, type GitRunner, type RestoreResult } from "../history/index.js";

import {
    PROJECT_CHANNELS,
    projectHistoryRoot,
    projectRepositoryPath,
    registerProjectHandlers,
    type ProjectHistoryListing,
    type ProjectPresence,
    type ProjectReadOutcome,
    type ProjectSaveResult,
} from "./index.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Just enough of `ipcMain` to register against.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel can be exercised exactly as the renderer would reach it with no Electron runtime
 * anywhere near the test.
 */
function fakeIpcMain(): IpcMain & { readonly handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler): void {
            if (handlers.has(channel)) throw new Error(`second handler for '${channel}'`);
            handlers.set(channel, handler);
        },
        removeHandler(channel: string): void {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { readonly handlers: Map<string, Handler> };
}

const noEvent = {} as IpcMainInvokeEvent;

/* -------------------------------------------------------------------------- */
/* Real folders, in a real temporary directory                                */
/* -------------------------------------------------------------------------- */

const created: string[] = [];

async function tempFolder(prefix: string): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), prefix));
    created.push(folder);
    return folder;
}

async function world(): Promise<{ folder: string; dataDir: string }> {
    const folder = await tempFolder("mb-project-ipc-world-");
    const dataDir = await tempFolder("mb-project-ipc-data-");
    await writeFile(join(folder, "level.dat"), "not really nbt", "utf8");
    return { folder, dataDir };
}

async function exists(path: string): Promise<boolean> {
    return await stat(path).then(
        () => true,
        () => false,
    );
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
    return projectFileSchema.parse({
        version: PROJECT_FORMAT_VERSION,
        id: "p-1",
        name: "Home world",
        createdAt: "2026-08-04T12:00:00-04:00",
        updatedAt: "2026-08-04T12:00:00-04:00",
        ...overrides,
    });
}

function map(id: string, name: string, dimension: string): ProjectMap {
    return { id, name, dimension, world: null, config: "", storage: "file", sorting: 0, enabled: true };
}

/* -------------------------------------------------------------------------- */
/* Is there a git on this machine?                                            */
/* -------------------------------------------------------------------------- */

const gitProbe = await runGit(["--version"], { cwd: process.cwd() });
const hasGit = gitProbe.ok;

/** Exactly what `execFile` reports when the binary is not there. */
const noGit: GitRunner = () =>
    Promise.resolve<GitResult>({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

/* -------------------------------------------------------------------------- */
/* Registration and argument checking                                         */
/* -------------------------------------------------------------------------- */

describe("the channels this module owns", () => {
    it("registers and removes exactly the channels it declares", () => {
        const ipcMain = fakeIpcMain();
        const registered = registerProjectHandlers(ipcMain, { dataDir: "/data", git: noGit });

        expect([...ipcMain.handlers.keys()].sort()).toEqual([...PROJECT_CHANNELS].sort());
        registered.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("refuses a relative world folder on every channel instead of resolving it", async () => {
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir: "/data", git: noGit });

        const read = (await ipcMain.handlers.get("project:read")?.(noEvent, "worlds/mine")) as ProjectReadOutcome;
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.failure.kind).toBe("unreadable");

        const saved = (await ipcMain.handlers
            .get("project:save")
            ?.(noEvent, "worlds/mine", project())) as ProjectSaveResult;
        expect(saved.ok).toBe(false);
        if (!saved.ok) expect(saved.reason).toContain("not a full path");
    });

    it("refuses a revision that is git syntax rather than a hash", async () => {
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir: "/data", git: noGit });

        for (const bad of ["HEAD@{1}", ":/message", "--", "main^{tree}", ""]) {
            const answer = (await ipcMain.handlers
                .get("project:restore")
                ?.(noEvent, "/tmp/whatever", bad)) as RestoreResult;
            expect(answer.ok, bad).toBe(false);
        }
    });

    it("refuses to save something that is not a project, naming what was wrong with it", async () => {
        const { folder, dataDir } = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers
            .get("project:save")
            ?.(noEvent, folder, { version: 1, id: "", name: "" })) as ProjectSaveResult;

        expect(saved.ok).toBe(false);
        if (!saved.ok) expect(saved.reason).toMatch(/id|name/);
        expect(await exists(join(folder, PROJECT_FILE_NAME))).toBe(false);
    });

    it("answers with an empty list rather than failing when discovery is handed a non-list", async () => {
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir: "/data", git: noGit });

        expect(await ipcMain.handlers.get("project:discoverMany")?.(noEvent, "not a list")).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* A machine with no git on it                                                */
/* -------------------------------------------------------------------------- */

describe("a machine with no git is an honest state, not a lost save", () => {
    /**
     * The clause the whole channel is shaped around.
     *
     * A person pressing Save wants their project written. Whether a *record* of that save
     * could also be kept is the application's problem, not theirs.
     */
    it("still saves the project, and says separately that it could not be recorded", async () => {
        const { folder, dataDir } = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers
            .get("project:save")
            ?.(noEvent, folder, project({ name: "Saved anyway" }))) as ProjectSaveResult;

        expect(saved.ok).toBe(true);
        if (saved.ok) {
            expect(saved.historyOk).toBe(false);
            expect(saved.historyMessage).toContain("Git is not installed");
        }
        expect(await readFile(join(folder, PROJECT_FILE_NAME), "utf8")).toContain("Saved anyway");
        expect(await exists(join(folder, ".git"))).toBe(false);
    });

    it("resolves rather than rejects on every channel, so no caller can be taken down by it", async () => {
        const { folder, dataDir } = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: noGit });

        const listing = (await ipcMain.handlers.get("project:history")?.(noEvent, folder)) as ProjectHistoryListing;
        expect(listing.available).toBe(false);
        expect(listing.revisions).toEqual([]);

        const restored = (await ipcMain.handlers
            .get("project:restore")
            ?.(noEvent, folder, "abcdef1234567")) as RestoreResult;
        expect(restored.ok).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Telling a world list which worlds carry a project                          */
/* -------------------------------------------------------------------------- */

describe("whether a catalogued world carries a project", () => {
    it("says no for a world nobody has set up, without calling it a failure", async () => {
        const { folder, dataDir } = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: noGit });

        const found = (await ipcMain.handlers.get("project:discover")?.(noEvent, folder)) as ProjectPresence;
        expect(found.present).toBe(false);
        expect(found.name).toBeNull();
        expect(found.problem).toBeNull();
        expect(found.path).toBe(join(folder, PROJECT_FILE_NAME));
    });

    it("reports the name and the map count, which is what a row shows", async () => {
        const { folder, dataDir } = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: noGit });

        await ipcMain.handlers.get("project:save")?.(
            noEvent,
            folder,
            project({
                name: "Survival",
                maps: [
                    map("overworld", "Overworld", "minecraft:overworld"),
                    map("nether", "Nether", "minecraft:the_nether"),
                ],
            }),
        );

        const found = (await ipcMain.handlers.get("project:discover")?.(noEvent, folder)) as ProjectPresence;
        expect(found.present).toBe(true);
        expect(found.name).toBe("Survival");
        expect(found.mapCount).toBe(2);
        expect(found.problem).toBeNull();
    });

    /**
     * A damaged project is still a project.
     *
     * Reporting `present: false` here would tell somebody their settings are gone while the
     * file is sitting in the folder, which is both untrue and the worst possible moment to
     * be untrue.
     */
    it("says a world has a project even when this build cannot read it, and why", async () => {
        const { folder, dataDir } = await world();
        await writeFile(join(folder, PROJECT_FILE_NAME), "{ half a file", "utf8");

        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: noGit });

        const found = (await ipcMain.handlers.get("project:discover")?.(noEvent, folder)) as ProjectPresence;
        expect(found.present).toBe(true);
        expect(found.name).toBeNull();
        expect(found.problem).toContain("edited by hand");
    });

    it("decorates a whole scanned folder in one call, one row per world", async () => {
        const withProject = await world();
        const without = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir: withProject.dataDir, git: noGit });

        await ipcMain.handlers.get("project:save")?.(noEvent, withProject.folder, project({ name: "One" }));

        const found = (await ipcMain.handlers
            .get("project:discoverMany")
            ?.(noEvent, [withProject.folder, without.folder, 42])) as readonly ProjectPresence[];

        expect(found.map((row) => row.present)).toEqual([true, false, false]);
        expect(found[0]?.name).toBe("One");
        // The nonsense entry keeps its row and carries its own sentence rather than removing
        // a world from the list or taking the whole call down.
        expect(found[2]?.problem).toContain("has to be given as text");
    });
});

/* -------------------------------------------------------------------------- */
/* Against a real git                                                         */
/* -------------------------------------------------------------------------- */

// Each test here spawns a dozen or more real git processes; under a full-suite run they
// share the CPU with every other worker, and a loaded machine is slower than a quiet one.
describe.skipIf(!hasGit)("a real history, on a real disk", { timeout: 60_000 }, () => {
    async function wired(): Promise<{
        folder: string;
        dataDir: string;
        save: (project: ProjectFile) => Promise<ProjectSaveResult>;
        list: () => Promise<ProjectHistoryListing>;
        restore: (id: string) => Promise<RestoreResult>;
        read: () => Promise<ProjectReadOutcome>;
    }> {
        const { folder, dataDir } = await world();
        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir });
        const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
            Promise.resolve(ipcMain.handlers.get(channel)?.(noEvent, ...args)) as Promise<T>;

        return {
            folder,
            dataDir,
            save: (value) => call<ProjectSaveResult>("project:save", folder, value),
            list: () => call<ProjectHistoryListing>("project:history", folder),
            restore: (id) => call<RestoreResult>("project:restore", folder, id),
            read: () => call<ProjectReadOutcome>("project:read", folder),
        };
    }

    /**
     * The count is a contract, not an implementation detail.
     *
     * The history panel's rows have to correspond to things people did. A save that produced
     * two rows would make every count in the interface wrong, and a reader would be left
     * wondering which of the two was the real one.
     */
    it("records exactly one revision for one save", async () => {
        const app = await wired();

        const saved = await app.save(project({ name: "First" }));
        expect(saved.ok).toBe(true);
        if (saved.ok) {
            expect(saved.historyOk).toBe(true);
            expect(saved.revision).not.toBeNull();
        }

        const listing = await app.list();
        expect(listing.available).toBe(true);
        expect(listing.revisions).toHaveLength(1);
        expect(listing.revisions[0]?.label).toBe('Started keeping this project\'s history: "First"');
        expect(listing.revisions[0]?.action).toBe("started");
    });

    it("adds exactly one more revision per further save, each saying what changed", async () => {
        const app = await wired();
        await app.save(project({ name: "First" }));
        await app.save(project({ name: "Renamed", updatedAt: "2026-08-04T13:00:00-04:00" }));
        await app.save(
            project({
                name: "Renamed",
                updatedAt: "2026-08-04T14:00:00-04:00",
                maps: [map("nether", "Nether", "minecraft:the_nether")],
            }),
        );

        const listing = await app.list();
        expect(listing.revisions).toHaveLength(3);
        expect(listing.revisions.map((revision) => revision.label)).toEqual([
            "Added the Nether map",
            'Renamed the project to "Renamed"',
            'Started keeping this project\'s history: "First"',
        ]);
    });

    it("records nothing at all when a save changed nothing", async () => {
        const app = await wired();
        const value = project({ name: "Unchanged" });
        await app.save(value);

        const again = await app.save(value);
        expect(again.ok).toBe(true);
        if (again.ok) {
            expect(again.historyOk).toBe(true);
            expect(again.revision).toBeNull();
            expect(again.historyMessage).toContain("Nothing had changed");
        }
        expect((await app.list()).revisions).toHaveLength(1);
    });

    it("never creates a .git inside the world, and keeps the repository beside the app's data", async () => {
        const app = await wired();
        await app.save(project());

        expect(await exists(join(app.folder, ".git"))).toBe(false);

        const listing = await app.list();
        expect(listing.repository).toBe(projectRepositoryPath(app.dataDir, app.folder));
        expect(listing.repository.startsWith(projectHistoryRoot(app.dataDir))).toBe(true);
        expect(await exists(join(listing.repository, ".git"))).toBe(true);
    });

    /**
     * A project history is its own family of repositories.
     *
     * A repository here is a *complete* mirror, so one holding both a config folder and a
     * project would have each snapshot record the other's disappearance. The two roots are
     * what makes that impossible even when somebody points the config editor at the world.
     */
    it("keeps project histories apart from config histories, even for the same folder", async () => {
        const app = await wired();
        await app.save(project());

        expect(projectHistoryRoot(app.dataDir)).not.toBe(historyRoot(app.dataDir));
        expect((await app.list()).repository.startsWith(historyRoot(app.dataDir))).toBe(false);
    });

    it("keeps the history local: no remote, ever", async () => {
        const app = await wired();
        await app.save(project());
        expect((await app.list()).remotes).toEqual([]);
    });

    it("puts a project back, and records the restore as a revision of its own", async () => {
        const app = await wired();
        await app.save(project({ name: "First" }));
        await app.save(project({ name: "Second", updatedAt: "2026-08-04T13:00:00-04:00" }));

        const before = await app.list();
        expect(before.revisions).toHaveLength(2);
        const original = before.revisions[1];

        const restored = await app.restore(original?.id ?? "");
        expect(restored.ok).toBe(true);

        const read = await app.read();
        expect(read.ok && read.project.name).toBe("First");

        const after = await app.list();
        // Three, not two: the restore is a revision, and the two before it are both still
        // there, in order, so the restore can itself be undone.
        expect(after.revisions).toHaveLength(3);
        expect(after.revisions[0]?.action).toBe("restored");
        expect(after.revisions[0]?.restoredFrom).toBe(original?.id);
        expect(after.revisions[0]?.label).toContain("Restored the project as it was at");
        expect(after.revisions.slice(1).map((revision) => revision.id)).toEqual(
            before.revisions.map((revision) => revision.id),
        );
    });

    it("lets an undo be undone, which a destructive restore would have made impossible", async () => {
        const app = await wired();
        await app.save(project({ name: "First" }));
        await app.save(project({ name: "Second", updatedAt: "2026-08-04T13:00:00-04:00" }));

        const start = await app.list();
        const first = start.revisions[1]?.id ?? "";
        const second = start.revisions[0]?.id ?? "";

        await app.restore(first);
        const undone = await app.read();
        expect(undone.ok && undone.project.name).toBe("First");

        const back = await app.restore(second);
        expect(back.ok).toBe(true);
        const redone = await app.read();
        expect(redone.ok && redone.project.name).toBe("Second");

        const listing = await app.list();
        expect(listing.revisions.filter((revision) => revision.action === "restored")).toHaveLength(2);
        expect(listing.revisions.map((revision) => revision.id)).toContain(first);
        expect(listing.revisions.map((revision) => revision.id)).toContain(second);
    });

    /**
     * The clause the whole channel is shaped around, proved against a git that breaks at the
     * moment a save has already landed on disk.
     */
    it("never turns a broken history into a broken save", async () => {
        const { folder, dataDir } = await world();

        const brokenCommit: GitRunner = (args, options) =>
            args.includes("commit")
                ? Promise.resolve<GitResult>({
                      ok: false,
                      code: 128,
                      stdout: "",
                      stderr: "fatal: unable to write new index file",
                      spawnError: null,
                  })
                : runGit(args, options);

        const ipcMain = fakeIpcMain();
        registerProjectHandlers(ipcMain, { dataDir, git: brokenCommit });

        const saved = (await ipcMain.handlers
            .get("project:save")
            ?.(noEvent, folder, project({ name: "Still saved" }))) as ProjectSaveResult;

        expect(saved.ok).toBe(true);
        if (saved.ok) {
            expect(saved.historyOk).toBe(false);
            expect(saved.historyMessage).toContain("could not be recorded");
        }
        expect(await readFile(join(folder, PROJECT_FILE_NAME), "utf8")).toContain("Still saved");
        expect(await exists(join(folder, ".git"))).toBe(false);
    });

    /**
     * A snapshot records the bytes that are in the world, not this build's impression of
     * them.
     *
     * The case that matters is a project a newer app wrote: it must be recorded exactly, so
     * that restoring gives back the file somebody had rather than a version of it with every
     * unknown setting quietly missing.
     */
    it("refuses to save over a newer project, and leaves the history alone too", async () => {
        const app = await wired();
        const fromTheFuture = JSON.stringify({ ...project(), version: PROJECT_FORMAT_VERSION + 1 });
        await writeFile(join(app.folder, PROJECT_FILE_NAME), fromTheFuture, "utf8");

        const saved = await app.save(project({ name: "Mine" }));
        expect(saved.ok).toBe(false);
        if (!saved.ok) expect(saved.reason).toContain("newer version");

        expect(await readFile(join(app.folder, PROJECT_FILE_NAME), "utf8")).toBe(fromTheFuture);
        // No revision either: nothing happened, so nothing is recorded as having happened.
        expect((await app.list()).revisions).toHaveLength(0);
    });
});

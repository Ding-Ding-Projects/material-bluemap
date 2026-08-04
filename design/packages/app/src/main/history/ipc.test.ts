/**
 * The history layer, exercised against real git repositories in real temporary folders.
 *
 * Almost nothing here is mocked, and that is the point. The properties this feature has to
 * have - a restore that cannot lose the state it replaced, a repository that never appears
 * inside the user's own folder, a failed history write that leaves the user's save alone -
 * are properties of what git actually does, not of what a stand-in was told to pretend.
 * A fake git would happily "prove" all three while the shipped code did none of them.
 *
 * The two things that *are* injected are the two a test cannot otherwise produce honestly:
 * a machine with no git installed, and a git that fails halfway through a commit. Both
 * arrive as a {@link GitRunner}, which is the seam `git.ts` exists to provide.
 *
 * The integration block is skipped, loudly, on a machine with no git. That is the same
 * situation a user without git is in, and it is covered by its own tests below which do
 * not need one.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
    HISTORY_CHANNELS,
    describeChanges,
    describeFile,
    folderSlug,
    historyRoot,
    joinNames,
    parseLog,
    parseStatus,
    projectId,
    readIndex,
    registerHistoryHandlers,
    repositoryPath,
    runGit,
    type GitResult,
    type GitRunner,
    type HistoryListing,
    type HistoryStatus,
    type HistoryWrite,
    type RestoreResult,
    type RevisionDiffResult,
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

async function put(folder: string, relative: string, text: string): Promise<void> {
    const path = join(folder, ...relative.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
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

/** A project and its history root, wired to a fresh pair of temporary directories. */
async function project(): Promise<{ folder: string; dataDir: string }> {
    const folder = await tempFolder("mb-history-project-");
    const dataDir = await tempFolder("mb-history-data-");
    await put(folder, "core.conf", 'accept-download: false\ndata: "bluemap"\n');
    await put(folder, "maps/overworld.conf", 'world: "world"\n');
    return { folder, dataDir };
}

/* -------------------------------------------------------------------------- */
/* Is there a git on this machine?                                            */
/* -------------------------------------------------------------------------- */

const gitProbe = await runGit(["--version"], { cwd: process.cwd() });
const hasGit = gitProbe.ok;

/* -------------------------------------------------------------------------- */
/* The pure parts                                                             */
/* -------------------------------------------------------------------------- */

describe("a revision is labelled with what changed, never that something did", () => {
    it("names a map, a storage and each root config the way the editor's screens do", () => {
        expect(describeFile("maps/nether.conf")).toBe("the nether map");
        expect(describeFile("storages/file.conf")).toBe("the file storage");
        expect(describeFile("core.conf")).toBe("the core settings");
        expect(describeFile("webapp.conf")).toBe("the web app settings");
        expect(describeFile("webserver.conf")).toBe("the web server settings");
        expect(describeFile("plugin.conf")).toBe("the plugin settings");
    });

    it("keeps the path for a file it does not model, rather than inventing a name", () => {
        expect(describeFile("extra.conf")).toBe("extra.conf");
        expect(describeFile("odd/place.conf")).toBe("odd/place.conf");
    });

    it("says exactly which map was deleted", () => {
        const described = describeChanges([{ path: "maps/nether.conf", status: "deleted" }]);
        expect(described.label).toBe("Deleted the nether map");
        expect(described.action).toBe("deleted");
    });

    it("joins several changes into one sentence rather than the word Updated", () => {
        const described = describeChanges([
            { path: "maps/nether.conf", status: "added" },
            { path: "core.conf", status: "modified" },
        ]);
        expect(described.label).toBe("Added the nether map, changed the core settings");
        expect(described.action).toBe("mixed");
        // The word this whole file exists to avoid.
        expect(described.label).not.toBe("Updated");
    });

    it("counts once naming them all would stop helping, and still names the first few", () => {
        const described = describeChanges(
            ["a", "b", "c", "d", "e"].map((name) => ({ path: `maps/${name}.conf`, status: "added" as const })),
        );
        expect(described.label).toBe("Added the a map, the b map and the c map and 2 more");
    });

    it("calls the first snapshot what it is, rather than reporting a creation nobody made", () => {
        const described = describeChanges(
            [
                { path: "core.conf", status: "added" },
                { path: "maps/overworld.conf", status: "added" },
            ],
            true,
        );
        expect(described.label).toBe("Started keeping history, with 2 config files");
        expect(described.action).toBe("started");
    });

    it("reads a list the way a person would", () => {
        expect(joinNames([])).toBe("");
        expect(joinNames(["one"])).toBe("one");
        expect(joinNames(["one", "two"])).toBe("one and two");
        expect(joinNames(["one", "two", "three"])).toBe("one, two and three");
    });
});

describe("the repository for a folder is derived, and lives beside the app's data", () => {
    it("puts every repository under the data directory, never inside the chosen folder", () => {
        const repository = repositoryPath("/data", "/home/me/bluemap/config", "linux");
        expect(repository.startsWith(historyRoot("/data"))).toBe(true);
        expect(repository.includes("/home/me/bluemap/config")).toBe(false);
    });

    it("gives the same folder the same identifier every time", () => {
        expect(projectId("/home/me/config", "linux")).toBe(projectId("/home/me/config", "linux"));
        expect(projectId("/home/me/config", "linux")).not.toBe(projectId("/home/me/other", "linux"));
    });

    it("folds case only on Windows, where two spellings really are one directory", () => {
        expect(projectId("C:\\Maps\\config", "win32")).toBe(projectId("c:\\maps\\config", "win32"));
        expect(projectId("/Maps/config", "linux")).not.toBe(projectId("/maps/config", "linux"));
    });

    it("keeps a readable prefix so the history folder is not a list of hashes", () => {
        expect(folderSlug("C:\\Servers\\Survival Server\\bluemap")).toBe("bluemap");
        expect(folderSlug("/srv/My Server/BlueMap Config/")).toBe("bluemap-config");
        expect(folderSlug("/")).toBe("config");
    });
});

describe("git's own output, parsed", () => {
    it("reads a status where the first commit has not happened yet", () => {
        const changes = parseStatus("A  core.conf\0A  maps/nether.conf\0");
        expect(changes).toEqual([
            { path: "core.conf", status: "added" },
            { path: "maps/nether.conf", status: "added" },
        ]);
    });

    it("reads modifications and deletions", () => {
        const changes = parseStatus("M  core.conf\0D  maps/nether.conf\0");
        expect(changes).toEqual([
            { path: "core.conf", status: "modified" },
            { path: "maps/nether.conf", status: "deleted" },
        ]);
    });

    it("survives a label and a body that contain newlines", () => {
        const unit = String.fromCharCode(31);
        const record = String.fromCharCode(30);
        const log =
            `abc123${unit}2026-01-02T03:04:05+00:00${unit}Deleted the nether map${unit}before the trip${unit}` +
            `Change-Action: deleted\nChanged-File: deleted maps/nether.conf${record}`;

        const [revision] = parseLog(log);
        expect(revision?.id).toBe("abc123");
        expect(revision?.label).toBe("Deleted the nether map");
        expect(revision?.action).toBe("deleted");
        expect(revision?.note).toBe("before the trip");
        expect(revision?.changes).toEqual([{ path: "maps/nether.conf", status: "deleted" }]);
    });
});

/* -------------------------------------------------------------------------- */
/* A machine with no git on it                                                */
/* -------------------------------------------------------------------------- */

/** Exactly what `execFile` reports when the binary is not there. */
const noGit: GitRunner = () =>
    Promise.resolve<GitResult>({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

describe("a machine with no git is an honest state, not a crash", () => {
    it("says history is unavailable and why, in words that do not mention git internals", async () => {
        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir: "/nowhere", git: noGit });

        const status = (await ipcMain.handlers.get("history:status")?.(noEvent)) as HistoryStatus;
        expect(status.available).toBe(false);
        expect(status.version).toBeNull();
        expect(status.reason).toContain("Git is not installed");
        // The sentence has to reassure as well as explain: the editor still works.
        expect(status.reason).toContain("Everything else works");
    });

    it("resolves rather than rejects on every channel, so no caller can be taken down by it", async () => {
        const { folder, dataDir } = await project();
        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const listing = (await ipcMain.handlers.get("history:list")?.(noEvent, folder)) as HistoryListing;
        expect(listing.available).toBe(false);
        expect(listing.revisions).toEqual([]);

        const snapshot = (await ipcMain.handlers.get("history:snapshot")?.(noEvent, folder)) as HistoryWrite;
        expect(snapshot.ok).toBe(false);

        const restored = (await ipcMain.handlers
            .get("history:restore")
            ?.(noEvent, folder, "abcdef1234567")) as RestoreResult;
        expect(restored.ok).toBe(false);
    });

    it("leaves the user's config folder exactly as it found it", async () => {
        const { folder, dataDir } = await project();
        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir, git: noGit });

        await ipcMain.handlers.get("history:snapshot")?.(noEvent, folder);

        expect(await exists(join(folder, ".git"))).toBe(false);
        expect(await readFile(join(folder, "core.conf"), "utf8")).toContain("accept-download");
    });
});

describe("the arguments the renderer sends are checked rather than trusted", () => {
    it("refuses a relative folder instead of resolving it against the working directory", async () => {
        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        const listing = (await ipcMain.handlers.get("history:list")?.(noEvent, "config")) as HistoryListing;
        expect(listing.available).toBe(false);
        expect(listing.reason).toContain("not a full path");
    });

    it("refuses a revision that is git syntax rather than a hash", async () => {
        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        for (const bad of ["HEAD@{1}", ":/message", "--", "main^{tree}", ""]) {
            const answer = (await ipcMain.handlers
                .get("history:restore")
                ?.(noEvent, "/tmp/whatever", bad)) as RestoreResult;
            expect(answer.ok, bad).toBe(false);
        }
    });

    it("registers and removes exactly the channels it declares", () => {
        const ipcMain = fakeIpcMain();
        const history = registerHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        expect([...ipcMain.handlers.keys()].sort()).toEqual([...HISTORY_CHANNELS].sort());
        history.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/* Against a real git                                                         */
/* -------------------------------------------------------------------------- */

describe.skipIf(!hasGit)("a real repository, on a real disk", () => {
    async function wired(): Promise<{
        folder: string;
        dataDir: string;
        snapshot: () => Promise<HistoryWrite>;
        list: () => Promise<HistoryListing>;
        restore: (id: string) => Promise<RestoreResult>;
        label: (id: string, text: string) => Promise<HistoryWrite>;
        diff: (id: string) => Promise<RevisionDiffResult>;
        discard: (keep: number) => Promise<HistoryWrite>;
    }> {
        const { folder, dataDir } = await project();
        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir });
        const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
            Promise.resolve(ipcMain.handlers.get(channel)?.(noEvent, ...args)) as Promise<T>;

        return {
            folder,
            dataDir,
            snapshot: () => call<HistoryWrite>("history:snapshot", folder),
            list: () => call<HistoryListing>("history:list", folder),
            restore: (id) => call<RestoreResult>("history:restore", folder, id),
            label: (id, text) => call<HistoryWrite>("history:label", folder, id, text),
            diff: (id) => call<RevisionDiffResult>("history:diff", folder, id),
            discard: (keep) => call<HistoryWrite>("history:discardOlder", folder, keep),
        };
    }

    it("records one revision per change, each saying what changed", async () => {
        const app = await wired();

        expect((await app.snapshot()).ok).toBe(true);
        await put(app.folder, "maps/nether.conf", 'world: "world"\ndimension: "minecraft:the_nether"\n');
        expect((await app.snapshot()).ok).toBe(true);
        await put(app.folder, "core.conf", "accept-download: true\n");
        expect((await app.snapshot()).ok).toBe(true);
        await rm(join(app.folder, "maps", "nether.conf"));
        expect((await app.snapshot()).ok).toBe(true);

        const listing = await app.list();
        expect(listing.available).toBe(true);
        expect(listing.revisions.map((revision) => revision.label)).toEqual([
            "Deleted the nether map",
            "Changed the core settings",
            "Added the nether map",
            "Started keeping history, with 2 config files",
        ]);
        expect(listing.revisions.map((revision) => revision.action)).toEqual([
            "deleted",
            "changed",
            "created",
            "started",
        ]);
    });

    it("records nothing at all when nothing changed", async () => {
        const app = await wired();
        expect((await app.snapshot()).ok).toBe(true);

        const second = await app.snapshot();
        expect(second.ok).toBe(true);
        expect(second.ok && second.revision).toBeNull();
        expect(second.ok && second.message).toContain("Nothing had changed");
        expect((await app.list()).revisions).toHaveLength(1);
    });

    it("never creates a .git inside the folder the user chose", async () => {
        const app = await wired();
        await app.snapshot();
        await put(app.folder, "webapp.conf", "enabled: true\n");
        await app.snapshot();

        expect(await exists(join(app.folder, ".git"))).toBe(false);
        // And the repository it did create is under the application's own data folder.
        const listing = await app.list();
        expect(listing.repository.startsWith(historyRoot(app.dataDir))).toBe(true);
        expect(await exists(join(listing.repository, ".git"))).toBe(true);
    });

    it("keeps the history local: no remote, ever", async () => {
        const app = await wired();
        await app.snapshot();
        expect((await app.list()).remotes).toEqual([]);
    });

    it("records a restore as a new revision rather than rewriting the branch", async () => {
        const app = await wired();
        await app.snapshot();
        await put(app.folder, "maps/nether.conf", 'world: "world"\n');
        await app.snapshot();
        await rm(join(app.folder, "maps", "nether.conf"));
        await app.snapshot();

        const before = await app.list();
        expect(before.revisions).toHaveLength(3);
        const withNether = before.revisions[1];
        expect(withNether?.label).toBe("Added the nether map");

        const restored = await app.restore(withNether?.id ?? "");
        expect(restored.ok).toBe(true);
        expect(await exists(join(app.folder, "maps", "nether.conf"))).toBe(true);

        const after = await app.list();
        // Four, not three: the restore is a revision of its own, and the three that were
        // there before it are all still there, in order.
        expect(after.revisions).toHaveLength(4);
        expect(after.revisions.slice(1).map((revision) => revision.id)).toEqual(
            before.revisions.map((revision) => revision.id),
        );
        expect(after.revisions[0]?.action).toBe("restored");
        expect(after.revisions[0]?.restoredFrom).toBe(withNether?.id);
        expect(after.revisions[0]?.label).toContain("Restored the config as it was");
    });

    it("lets an undo be undone, and that undo undone in turn", async () => {
        const app = await wired();
        await app.snapshot();
        await put(app.folder, "maps/nether.conf", 'world: "world"\n');
        await app.snapshot();
        await rm(join(app.folder, "maps", "nether.conf"));
        await app.snapshot();

        const start = await app.list();
        const withNether = start.revisions[1]?.id ?? "";
        const withoutNether = start.revisions[0]?.id ?? "";

        // Undo the deletion.
        await app.restore(withNether);
        expect(await exists(join(app.folder, "maps", "nether.conf"))).toBe(true);

        // Undo the undo: go back to the state the restore replaced.
        const back = await app.restore(withoutNether);
        expect(back.ok).toBe(true);
        expect(await exists(join(app.folder, "maps", "nether.conf"))).toBe(false);

        // And undo *that*, which is the property a destructive restore would have destroyed.
        const again = await app.restore(withNether);
        expect(again.ok).toBe(true);
        expect(await exists(join(app.folder, "maps", "nether.conf"))).toBe(true);

        const listing = await app.list();
        expect(listing.revisions).toHaveLength(6);
        // Every original revision is still reachable, and each undo is its own row.
        expect(listing.revisions.filter((revision) => revision.action === "restored")).toHaveLength(3);
        expect(listing.revisions.map((revision) => revision.id)).toContain(withNether);
        expect(listing.revisions.map((revision) => revision.id)).toContain(withoutNether);
    });

    /**
     * The state a restore overwrites is never a state the history has not seen.
     *
     * The usual case records nothing, because the newest revision already matches the disk.
     * This is the other case: somebody edited a file outside the editor, so the folder holds
     * something no revision describes. Restoring must record that first, or the one button
     * whose promise is that nothing gets lost would be the thing that lost it.
     */
    it("records what is on disk before writing over it, even when nobody asked it to", async () => {
        const app = await wired();
        await app.snapshot();

        // An edit made somewhere else entirely, never snapshotted.
        await put(app.folder, "core.conf", 'accept-download: false\nedited: "elsewhere"\n');

        const before = await app.list();
        expect(before.revisions).toHaveLength(1);

        const restored = await app.restore(before.revisions[0]?.id ?? "");
        expect(restored.ok).toBe(true);

        const after = await app.list();
        // Three: the original, the drift that was captured on the way in, and the restore.
        expect(after.revisions).toHaveLength(3);
        expect(after.revisions[1]?.label).toBe("Changed the core settings");

        // And that captured drift can itself be restored, so the outside edit is not lost.
        await app.restore(after.revisions[1]?.id ?? "");
        expect(await readFile(join(app.folder, "core.conf"), "utf8")).toContain('edited: "elsewhere"');
    });

    it("restores a deleted map's contents, not merely its name", async () => {
        const app = await wired();
        await app.snapshot();
        await put(app.folder, "maps/nether.conf", 'world: "world"\nsorting: 7\n');
        await app.snapshot();
        await rm(join(app.folder, "maps", "nether.conf"));
        await app.snapshot();

        const listing = await app.list();
        const target = listing.revisions.find((revision) => revision.label === "Added the nether map");
        await app.restore(target?.id ?? "");

        expect(await readFile(join(app.folder, "maps", "nether.conf"), "utf8")).toBe(
            'world: "world"\nsorting: 7\n',
        );
    });

    it("says which files a restore could not put back, rather than pretending it did", async () => {
        const app = await wired();
        // A config file BlueMap would load but this editor does not model, so the write
        // channel refuses it by name. The snapshot still records it; the restore says so.
        await put(app.folder, "extra.conf", "left: alone\n");
        await app.snapshot();
        await rm(join(app.folder, "extra.conf"));
        await app.snapshot();

        const listing = await app.list();
        const first = listing.revisions[listing.revisions.length - 1];
        const restored = await app.restore(first?.id ?? "");

        expect(restored.ok).toBe(true);
        expect(restored.ok && restored.skipped.map((entry) => entry.path)).toContain("extra.conf");
    });

    it("carries a user's own label on a revision without changing the revision", async () => {
        const app = await wired();
        await app.snapshot();
        const before = (await app.list()).revisions[0];

        const labelled = await app.label(before?.id ?? "", "before the server move");
        expect(labelled.ok).toBe(true);

        const after = (await app.list()).revisions[0];
        expect(after?.id).toBe(before?.id);
        expect(after?.note).toBe("before the server move");

        expect((await app.label(before?.id ?? "", "")).ok).toBe(true);
        expect((await app.list()).revisions[0]?.note).toBeNull();
    });

    it("shows what a revision changed as a real diff", async () => {
        const app = await wired();
        await app.snapshot();
        await put(app.folder, "core.conf", 'accept-download: true\ndata: "bluemap"\n');
        await app.snapshot();

        const listing = await app.list();
        const diff = await app.diff(listing.revisions[0]?.id ?? "");
        expect(diff.ok).toBe(true);
        expect(diff.ok && diff.files.map((file) => file.path)).toEqual(["core.conf"]);
        expect(diff.ok && diff.files[0]?.patch).toContain("+accept-download: true");
        expect(diff.ok && diff.files[0]?.patch).toContain("-accept-download: false");
    });

    it("opens the very first revision, which has nothing before it", async () => {
        const app = await wired();
        await app.snapshot();
        const listing = await app.list();

        const diff = await app.diff(listing.revisions[0]?.id ?? "");
        expect(diff.ok).toBe(true);
        expect(diff.ok && diff.files.map((file) => file.path).sort()).toEqual([
            "core.conf",
            "maps/overworld.conf",
        ]);
    });

    it("keeps the newest revisions when older ones are discarded, and frees the rest", async () => {
        const app = await wired();
        for (const value of ["a", "b", "c", "d", "e"]) {
            await put(app.folder, "core.conf", `accept-download: false\nmark: "${value}"\n`);
            await app.snapshot();
        }

        const before = await app.list();
        expect(before.revisions).toHaveLength(5);
        const newestLabel = before.revisions[0]?.label;
        await app.label(before.revisions[0]?.id ?? "", "keep me");

        const discarded = await app.discard(2);
        expect(discarded.ok).toBe(true);
        expect(discarded.ok && discarded.message).toContain("3 older revisions were removed");

        const after = await app.list();
        expect(after.revisions).toHaveLength(2);
        expect(after.revisions[0]?.label).toBe(newestLabel);
        // The label followed the revision through the rebuild rather than being lost with it.
        expect(after.revisions[0]?.note).toBe("keep me");

        // And the history still works afterwards: the next change is recorded normally.
        await put(app.folder, "core.conf", 'accept-download: false\nmark: "f"\n');
        expect((await app.snapshot()).ok).toBe(true);
        expect((await app.list()).revisions).toHaveLength(3);
    });

    it("removes nothing when the history is already short enough", async () => {
        const app = await wired();
        await app.snapshot();
        const answer = await app.discard(10);
        expect(answer.ok).toBe(true);
        expect(answer.ok && answer.message).toContain("nothing was removed");
        expect((await app.list()).revisions).toHaveLength(1);
    });

    it("refuses to discard everything, so a retention setting cannot empty a history", async () => {
        const app = await wired();
        await app.snapshot();
        await put(app.folder, "webapp.conf", "enabled: true\n");
        await app.snapshot();

        const ipcMain = fakeIpcMain();
        registerHistoryHandlers(ipcMain, { dataDir: app.dataDir });
        const answer = (await ipcMain.handlers
            .get("history:discardOlder")
            ?.(noEvent, app.folder, 0)) as HistoryWrite;

        expect(answer.ok).toBe(false);
        expect((await app.list()).revisions).toHaveLength(2);
    });

    /**
     * The clause the whole channel is shaped around.
     *
     * The save has already happened by the time a snapshot is taken - the config files are
     * on disk, written by `config:writeFiles`. This proves that a git which fails at the
     * commit produces a value the caller can ignore, never a rejection, and leaves the
     * files the user asked for exactly where they were written.
     */
    it("never turns a broken history into a broken save", async () => {
        const { folder, dataDir } = await project();

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
        registerHistoryHandlers(ipcMain, { dataDir, git: brokenCommit });

        // The user's save: written by the config channel, which this test stands in for.
        await put(folder, "webapp.conf", "enabled: true\n");

        const snapshot = (await ipcMain.handlers.get("history:snapshot")?.(noEvent, folder)) as HistoryWrite;

        expect(snapshot.ok).toBe(false);
        expect(snapshot.ok || snapshot.message).toContain("could not be recorded");
        // The save itself is untouched, which is the point.
        expect(await readFile(join(folder, "webapp.conf"), "utf8")).toBe("enabled: true\n");
        expect(await exists(join(folder, ".git"))).toBe(false);
    });

    it("remembers which folder a repository belongs to, so histories can be listed", async () => {
        const app = await wired();
        await app.snapshot();

        const index = await readIndex(app.dataDir);
        expect(index.projects.map((entry) => entry.folder)).toEqual([app.folder]);
        expect(index.projects[0]?.repository).toBe(repositoryPath(app.dataDir, app.folder));
        expect(index.projects[0]?.lastSnapshot).not.toBeNull();
    });
});

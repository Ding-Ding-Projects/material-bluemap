/**
 * The profile-list history channel, exercised end to end against a real git.
 *
 * Written the same way `project/ipc.test.ts` is: the properties this feature has to have - a
 * save that records exactly one revision, a repository that never appears inside a user
 * folder, a broken history that leaves a good save alone, a restore that is itself a new
 * revision - are properties of what git and the file system actually do, so the integration
 * block runs against the real binary and is skipped, loudly, on a machine that has none.
 *
 * The two things that *are* injected are the two a test cannot otherwise produce honestly: a
 * machine with no git installed, and a git that fails partway through a commit.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGit, type GitResult, type GitRunner, type RestoreResult } from "../history/index.js";

import {
    PROFILES_FILE,
    PROFILES_HISTORY_CHANNELS,
    profilesFolder,
    profilesHistoryRoot,
    profilesRepositoryPath,
    registerProfilesHistoryHandlers,
    type ProfilesHistoryListing,
    type ProfilesSaveResult,
    type ProfilesState,
} from "./index.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

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

const created: string[] = [];

async function tempDataDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "mb-profiles-ipc-data-"));
    created.push(dir);
    return dir;
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

function state(profiles: ProfilesState["profiles"], activeId: string | null = null): ProfilesState {
    return { version: 1, profiles, activeId };
}

function profile(id: string, name: string, url = ""): ProfilesState["profiles"][number] {
    return { id, name, url, trustCustomizations: false };
}

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
        const registered = registerProfilesHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        expect([...ipcMain.handlers.keys()].sort()).toEqual([...PROFILES_HISTORY_CHANNELS].sort());
        registered.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("refuses a save whose profiles are not an array", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers.get("profilesHistory:save")?.(noEvent, { profiles: "nope" })) as {
            ok: boolean;
            message?: string;
        };
        expect(saved.ok).toBe(false);
        expect(saved.message).toContain("array");
        expect(await exists(join(profilesFolder(dataDir), PROFILES_FILE))).toBe(false);
    });

    it("refuses a profile missing a required field, naming what was wrong", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers
            .get("profilesHistory:save")
            ?.(noEvent, { profiles: [{ id: "a", name: "A" }] })) as { ok: boolean; message?: string };
        expect(saved.ok).toBe(false);
        expect(saved.message).toContain("url");
    });

    it("refuses a revision that is git syntax rather than a hash", async () => {
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        for (const bad of ["HEAD@{1}", ":/message", "--", "main^{tree}", ""]) {
            const answer = (await ipcMain.handlers.get("profilesHistory:restore")?.(noEvent, bad)) as RestoreResult;
            expect(answer.ok, bad).toBe(false);
        }
    });

    it("reads an empty state when nothing has ever been saved", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const read = (await ipcMain.handlers.get("profilesHistory:read")?.(noEvent)) as ProfilesState;
        expect(read.profiles).toEqual([]);
        expect(read.activeId).toBeNull();
    });
});

/* -------------------------------------------------------------------------- */
/* A machine with no git on it                                                */
/* -------------------------------------------------------------------------- */

describe("a machine with no git is an honest state, not a lost save", () => {
    it("still saves the profile list, and says separately that it could not be recorded", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers
            .get("profilesHistory:save")
            ?.(noEvent, state([profile("home", "Home server", "https://example.test")]))) as ProfilesSaveResult;

        expect(saved.ok).toBe(true);
        expect(saved.historyOk).toBe(false);
        expect(saved.historyMessage).toContain("Git is not installed");
        expect(await readFile(join(profilesFolder(dataDir), PROFILES_FILE), "utf8")).toContain("Home server");
        expect(await exists(join(profilesFolder(dataDir), ".git"))).toBe(false);
    });

    it("resolves rather than rejects on every channel, so no caller can be taken down by it", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const listing = (await ipcMain.handlers.get("profilesHistory:list")?.(noEvent)) as ProfilesHistoryListing;
        expect(listing.available).toBe(false);
        expect(listing.revisions).toEqual([]);

        const restored = (await ipcMain.handlers
            .get("profilesHistory:restore")
            ?.(noEvent, "abcdef1234567")) as RestoreResult;
        expect(restored.ok).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Against a real git                                                         */
/* -------------------------------------------------------------------------- */

describe.skipIf(!hasGit)("a real history, on a real disk", { timeout: 60_000 }, () => {
    async function wired(): Promise<{
        dataDir: string;
        save: (value: ProfilesState) => Promise<ProfilesSaveResult>;
        list: () => Promise<ProfilesHistoryListing>;
        restore: (id: string) => Promise<RestoreResult>;
        read: () => Promise<ProfilesState>;
    }> {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerProfilesHistoryHandlers(ipcMain, { dataDir });
        const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
            Promise.resolve(ipcMain.handlers.get(channel)?.(noEvent, ...args)) as Promise<T>;

        return {
            dataDir,
            save: (value) => call<ProfilesSaveResult>("profilesHistory:save", value),
            list: () => call<ProfilesHistoryListing>("profilesHistory:list"),
            restore: (id) => call<RestoreResult>("profilesHistory:restore", id),
            read: () => call<ProfilesState>("profilesHistory:read"),
        };
    }

    it("records exactly one revision for one save", async () => {
        const app = await wired();

        const saved = await app.save(state([profile("home", "Home server", "https://example.test")]));
        expect(saved.historyOk).toBe(true);
        expect(saved.revision).not.toBeNull();

        const listing = await app.list();
        expect(listing.available).toBe(true);
        expect(listing.revisions).toHaveLength(1);
        expect(listing.revisions[0]?.label).toBe(
            "Started keeping the profile list's history, with 1 profile",
        );
        expect(listing.revisions[0]?.action).toBe("started");
    });

    it("adds exactly one more revision per further save, each saying what changed", async () => {
        const app = await wired();
        await app.save(state([profile("home", "Home server", "https://example.test")]));
        await app.save(
            state([profile("home", "Home server", "https://example.test"), profile("away", "Away server", "https://away.test")]),
        );
        await app.save(state([profile("away", "Away server", "https://away.test")]));

        const listing = await app.list();
        expect(listing.revisions).toHaveLength(3);
        expect(listing.revisions.map((revision) => revision.label)).toEqual([
            'Deleted the profile "Home server"',
            'Added the profile "Away server"',
            "Started keeping the profile list's history, with 1 profile",
        ]);
    });

    it("names an edited profile and an active-profile switch as their own revisions", async () => {
        const app = await wired();
        await app.save(state([profile("home", "Home server", "https://example.test")], "home"));
        await app.save(state([profile("home", "Home server", "https://renamed.test")], "home"));
        await app.save(state([profile("home", "Home server", "https://renamed.test")], null));

        const listing = await app.list();
        expect(listing.revisions.map((revision) => revision.label)).toEqual([
            "Switched off the active profile",
            'Changed the profile "Home server"',
            "Started keeping the profile list's history, with 1 profile",
        ]);
    });

    it("records nothing at all when a save changed nothing", async () => {
        const app = await wired();
        const value = state([profile("home", "Home server", "https://example.test")], "home");
        await app.save(value);

        const again = await app.save(value);
        expect(again.historyOk).toBe(true);
        expect(again.revision).toBeNull();
        expect(again.historyMessage).toContain("Nothing had changed");
        expect((await app.list()).revisions).toHaveLength(1);
    });

    it("never creates a .git inside app data's live store, and keeps the repository in its own family", async () => {
        const app = await wired();
        await app.save(state([profile("home", "Home server")]));

        expect(await exists(join(profilesFolder(app.dataDir), ".git"))).toBe(false);

        const listing = await app.list();
        expect(listing.repository).toBe(profilesRepositoryPath(app.dataDir));
        expect(listing.repository.startsWith(profilesHistoryRoot(app.dataDir))).toBe(true);
        expect(await exists(join(listing.repository, ".git"))).toBe(true);
    });

    it("restores a deleted profile, recorded as a new revision rather than a rewrite", async () => {
        const app = await wired();
        await app.save(state([profile("home", "Home server", "https://example.test")]));
        await app.save(state([]));

        const beforeRestore = await app.list();
        expect(beforeRestore.revisions).toHaveLength(2);

        const target = beforeRestore.revisions[1]; // the first save, oldest
        const restored = await app.restore(target?.id ?? "");
        expect(restored.ok).toBe(true);

        const read = await app.read();
        expect(read.profiles.map((p) => p.id)).toEqual(["home"]);

        // Append-only: the deletion revision is still there, and the restore added a new one
        // rather than erasing it.
        const after = await app.list();
        expect(after.revisions).toHaveLength(3);
        expect(after.revisions[0]?.restoredFrom).toBe(target?.id);
    });

    it("restores the restore, undoing the undo", async () => {
        const app = await wired();
        await app.save(state([profile("home", "Home server")]));
        await app.save(state([]));
        const afterDelete = await app.list();
        const deleteRevision = afterDelete.revisions[0];

        const first = await app.list();
        const created0 = first.revisions[first.revisions.length - 1];
        await app.restore(created0?.id ?? "");

        // Now restore back to the deleted state.
        const restoredBackToDelete = await app.restore(deleteRevision?.id ?? "");
        expect(restoredBackToDelete.ok).toBe(true);

        const read = await app.read();
        expect(read.profiles).toEqual([]);

        const listing = await app.list();
        expect(listing.revisions).toHaveLength(4);
    });

    it("a git that fails halfway leaves the save intact and says so", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        const failingCommit: GitRunner = async (args, options) => {
            if (args.includes("commit")) {
                return { ok: false, code: 1, stdout: "", stderr: "fatal: could not commit", spawnError: null };
            }
            return await runGit(args, options);
        };
        registerProfilesHistoryHandlers(ipcMain, { dataDir, git: failingCommit });
        const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
            Promise.resolve(ipcMain.handlers.get(channel)?.(noEvent, ...args)) as Promise<T>;

        const saved = await call<ProfilesSaveResult>(
            "profilesHistory:save",
            state([profile("home", "Home server", "https://example.test")]),
        );
        expect(saved.ok).toBe(true);
        expect(saved.historyOk).toBe(false);
        expect(saved.historyMessage).toContain("could not be recorded");
        expect(await readFile(join(profilesFolder(dataDir), PROFILES_FILE), "utf8")).toContain("Home server");
    });
});

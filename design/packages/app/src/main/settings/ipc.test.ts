/**
 * The application-settings history channel, exercised end to end against a real git.
 *
 * Written the same way `profiles/ipc.test.ts` and `project/ipc.test.ts` are - see either for
 * why the integration block runs against the real binary and is skipped, loudly, on a
 * machine that has none, and why the two things that *are* injected are a machine with no
 * git and a git that fails partway through a commit.
 */

import { afterAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGit, type GitResult, type GitRunner, type RestoreResult } from "../history/index.js";

import {
    APP_SETTINGS_FILE,
    APP_SETTINGS_HISTORY_CHANNELS,
    appSettingsFolder,
    appSettingsHistoryRoot,
    appSettingsRepositoryPath,
    registerAppSettingsHistoryHandlers,
    type AppSettingsHistoryListing,
    type AppSettingsSaveResult,
    type AppSettingsState,
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
    const dir = await mkdtemp(join(tmpdir(), "mb-settings-ipc-data-"));
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

function state(values: Record<string, unknown>): AppSettingsState {
    return { version: 1, values };
}

const gitProbe = await runGit(["--version"], { cwd: process.cwd() });
const hasGit = gitProbe.ok;

const noGit: GitRunner = () =>
    Promise.resolve<GitResult>({ ok: false, code: null, stdout: "", stderr: "", spawnError: "ENOENT" });

/* -------------------------------------------------------------------------- */
/* Registration and argument checking                                         */
/* -------------------------------------------------------------------------- */

describe("the channels this module owns", () => {
    it("registers and removes exactly the channels it declares", () => {
        const ipcMain = fakeIpcMain();
        const registered = registerAppSettingsHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        expect([...ipcMain.handlers.keys()].sort()).toEqual([...APP_SETTINGS_HISTORY_CHANNELS].sort());
        registered.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("refuses a save whose values are not an object", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers.get("settingsHistory:save")?.(noEvent, { values: "nope" })) as {
            ok: boolean;
            message?: string;
        };
        expect(saved.ok).toBe(false);
        expect(saved.message).toContain("object");
        expect(await exists(join(appSettingsFolder(dataDir), APP_SETTINGS_FILE))).toBe(false);
    });

    it("refuses a save whose values are an array rather than an object", async () => {
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        const saved = (await ipcMain.handlers.get("settingsHistory:save")?.(noEvent, { values: [1, 2] })) as {
            ok: boolean;
            message?: string;
        };
        expect(saved.ok).toBe(false);
    });

    it("refuses a revision that is git syntax rather than a hash", async () => {
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir: "/data", git: noGit });

        for (const bad of ["HEAD@{1}", ":/message", "--", "main^{tree}", ""]) {
            const answer = (await ipcMain.handlers.get("settingsHistory:restore")?.(noEvent, bad)) as RestoreResult;
            expect(answer.ok, bad).toBe(false);
        }
    });

    it("reads an empty state when nothing has ever been saved", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const read = (await ipcMain.handlers.get("settingsHistory:read")?.(noEvent)) as AppSettingsState;
        expect(read.values).toEqual({});
    });
});

/* -------------------------------------------------------------------------- */
/* A machine with no git on it                                                */
/* -------------------------------------------------------------------------- */

describe("a machine with no git is an honest state, not a lost save", () => {
    it("still saves the application settings, and says separately that it could not be recorded", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const saved = (await ipcMain.handlers
            .get("settingsHistory:save")
            ?.(noEvent, state({ appearance: { fontSize: 14 } }))) as AppSettingsSaveResult;

        expect(saved.ok).toBe(true);
        expect(saved.historyOk).toBe(false);
        expect(saved.historyMessage).toContain("Git is not installed");
        expect(await readFile(join(appSettingsFolder(dataDir), APP_SETTINGS_FILE), "utf8")).toContain("fontSize");
        expect(await exists(join(appSettingsFolder(dataDir), ".git"))).toBe(false);
    });

    it("resolves rather than rejects on every channel, so no caller can be taken down by it", async () => {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir, git: noGit });

        const listing = (await ipcMain.handlers.get("settingsHistory:list")?.(noEvent)) as AppSettingsHistoryListing;
        expect(listing.available).toBe(false);
        expect(listing.revisions).toEqual([]);

        const restored = (await ipcMain.handlers
            .get("settingsHistory:restore")
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
        save: (value: AppSettingsState) => Promise<AppSettingsSaveResult>;
        list: () => Promise<AppSettingsHistoryListing>;
        restore: (id: string) => Promise<RestoreResult>;
        read: () => Promise<AppSettingsState>;
    }> {
        const dataDir = await tempDataDir();
        const ipcMain = fakeIpcMain();
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir });
        const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
            Promise.resolve(ipcMain.handlers.get(channel)?.(noEvent, ...args)) as Promise<T>;

        return {
            dataDir,
            save: (value) => call<AppSettingsSaveResult>("settingsHistory:save", value),
            list: () => call<AppSettingsHistoryListing>("settingsHistory:list"),
            restore: (id) => call<RestoreResult>("settingsHistory:restore", id),
            read: () => call<AppSettingsState>("settingsHistory:read"),
        };
    }

    it("records exactly one revision for one save", async () => {
        const app = await wired();

        const saved = await app.save(state({ appearance: { fontSize: 14 } }));
        expect(saved.historyOk).toBe(true);
        expect(saved.revision).not.toBeNull();

        const listing = await app.list();
        expect(listing.available).toBe(true);
        expect(listing.revisions).toHaveLength(1);
        expect(listing.revisions[0]?.label).toBe(
            "Started keeping the application settings' history, with 1 setting",
        );
        expect(listing.revisions[0]?.action).toBe("started");
    });

    it("adds exactly one more revision per further save, each saying what changed", async () => {
        const app = await wired();
        await app.save(state({ appearance: { fontSize: 14 } }));
        await app.save(state({ appearance: { fontSize: 16 }, dockPlacement: { side: "right" } }));
        await app.save(state({ dockPlacement: { side: "right" } }));

        const listing = await app.list();
        expect(listing.revisions).toHaveLength(3);
        expect(listing.revisions.map((revision) => revision.label)).toEqual([
            "Removed appearance",
            "Added dockPlacement, changed appearance",
            "Started keeping the application settings' history, with 1 setting",
        ]);
    });

    it("records nothing at all when a save changed nothing", async () => {
        const app = await wired();
        const value = state({ appearance: { fontSize: 14 } });
        await app.save(value);

        const again = await app.save(value);
        expect(again.historyOk).toBe(true);
        expect(again.revision).toBeNull();
        expect(again.historyMessage).toContain("Nothing had changed");
        expect((await app.list()).revisions).toHaveLength(1);
    });

    it("never creates a .git inside the live settings store, and keeps the repository in its own family", async () => {
        const app = await wired();
        await app.save(state({ appearance: { fontSize: 14 } }));

        expect(await exists(join(appSettingsFolder(app.dataDir), ".git"))).toBe(false);

        const listing = await app.list();
        expect(listing.repository).toBe(appSettingsRepositoryPath(app.dataDir));
        expect(listing.repository.startsWith(appSettingsHistoryRoot(app.dataDir))).toBe(true);
        expect(await exists(join(listing.repository, ".git"))).toBe(true);
    });

    it("restores a removed setting, recorded as a new revision rather than a rewrite", async () => {
        const app = await wired();
        await app.save(state({ appearance: { fontSize: 14 } }));
        await app.save(state({}));

        const beforeRestore = await app.list();
        expect(beforeRestore.revisions).toHaveLength(2);

        const target = beforeRestore.revisions[1]; // the first save, oldest
        const restored = await app.restore(target?.id ?? "");
        expect(restored.ok).toBe(true);

        const read = await app.read();
        expect(read.values).toEqual({ appearance: { fontSize: 14 } });

        const after = await app.list();
        expect(after.revisions).toHaveLength(3);
        expect(after.revisions[0]?.restoredFrom).toBe(target?.id);
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
        registerAppSettingsHistoryHandlers(ipcMain, { dataDir, git: failingCommit });
        const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
            Promise.resolve(ipcMain.handlers.get(channel)?.(noEvent, ...args)) as Promise<T>;

        const saved = await call<AppSettingsSaveResult>("settingsHistory:save", state({ appearance: { fontSize: 14 } }));
        expect(saved.ok).toBe(true);
        expect(saved.historyOk).toBe(false);
        expect(saved.historyMessage).toContain("could not be recorded");
        expect(await readFile(join(appSettingsFolder(dataDir), APP_SETTINGS_FILE), "utf8")).toContain("fontSize");
    });
});

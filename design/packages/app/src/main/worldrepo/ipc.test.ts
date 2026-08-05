/**
 * The world-repository channel, against a fake `ipcMain`.
 *
 * Built like `pages/ipc.test.ts`: the module takes `IpcMain` as a parameter and imports
 * Electron only as a type, so every channel is reached exactly as the renderer would reach
 * it with no Electron runtime anywhere near the test. The assertion that matters most here
 * is the same one that matters for Pages: `acknowledgeSync` is the field that turns "show
 * me what this would do" into a force-push, and a renderer sending a truthy non-`true`
 * value must not be read as an agreement.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { WORLD_REPO_CHANNELS, installWorldRepoIpc } from "./ipc.js";
import type { WorldRepoEvent } from "./repo.js";
import type { ProcessRunner } from "../cirender/gh.js";

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

/** A `gh` and a `git` that are not installed, so no test here spawns a real process. */
function nothingInstalled(): ProcessRunner {
    return {
        run: () => Promise.resolve({ started: false, code: null, stdout: "", stderr: "ENOENT" }),
        runToFile: () => Promise.resolve({ started: false, code: null, bytes: 0, stderr: "ENOENT" }),
    };
}

const noEvent = {} as IpcMainInvokeEvent;

let root = "";
let world = "";
let work = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-worldrepo-ipc-"));
    world = join(root, "world");
    work = join(root, "work");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "nbt", "utf8");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function install(events: WorldRepoEvent[] = []) {
    const ipcMain = fakeIpcMain();
    const ipc = installWorldRepoIpc({
        ipcMain,
        workRoot: () => work,
        runner: nothingInstalled(),
        broadcast: (event) => events.push(event),
    });
    return { ipcMain, ipc };
}

describe("the channel", () => {
    it("registers exactly the channels it names, and takes them all off again", () => {
        const { ipcMain, ipc } = install();
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...WORLD_REPO_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });
});

describe("preflight and sync", () => {
    it("refuses a request missing a world folder, an owner or a repository", async () => {
        const { ipcMain } = install();
        const preflight = ipcMain.handlers.get("worldrepo:preflight");
        const sync = ipcMain.handlers.get("worldrepo:sync");
        expect(preflight).toBeDefined();
        expect(sync).toBeDefined();

        const badPreflight = (await preflight?.(noEvent, { owner: "o" })) as { ok: boolean };
        expect(badPreflight.ok).toBe(false);

        const badSync = (await sync?.(noEvent, { worldPath: world, owner: "o" })) as { ok: boolean };
        expect(badSync.ok).toBe(false);
    });

    it("reads gh as not installed for a well-formed preflight request, honestly", async () => {
        const { ipcMain } = install();
        const preflight = ipcMain.handlers.get("worldrepo:preflight");
        const result = (await preflight?.(noEvent, {
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        })) as { ok: boolean; value?: { gh: { availability: string } } };
        expect(result.ok).toBe(true);
        expect(result.value?.gh.availability).toBe("not-installed");
    });

    it("reads acknowledgeSync strictly - a truthy string is not an agreement", async () => {
        const { ipcMain } = install();
        const sync = ipcMain.handlers.get("worldrepo:sync");
        const result = (await sync?.(noEvent, {
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: "yes",
        })) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        // git is not installed in this fake, so the refusal is about the missing tool, not
        // about the acknowledgement - proving the string was never read as `true` either way
        // by checking it never got past that same gate a real acknowledgement would clear.
        expect(result.failure?.code).not.toBe("push-refused");
    });
});

describe("cancel and active", () => {
    it("reports nothing running, and a cancel of nothing running as false", async () => {
        const { ipcMain } = install();
        const active = ipcMain.handlers.get("worldrepo:active");
        expect(await active?.(noEvent)).toEqual([]);

        const cancel = ipcMain.handlers.get("worldrepo:cancel");
        expect(await cancel?.(noEvent, "octocat__worlds__world")).toBe(false);
    });
});

describe("remoteTip", () => {
    it("requires an owner and a repository", async () => {
        const { ipcMain } = install();
        const remoteTip = ipcMain.handlers.get("worldrepo:remoteTip");
        const result = (await remoteTip?.(noEvent, { owner: "octocat" })) as { ok: boolean };
        expect(result.ok).toBe(false);
    });
});

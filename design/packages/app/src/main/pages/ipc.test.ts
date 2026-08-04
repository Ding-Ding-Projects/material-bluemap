/**
 * The Pages channel, against a fake `ipcMain`.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel is reached exactly as the renderer would reach it with no Electron runtime anywhere
 * near the test.
 *
 * The assertion that matters most is the one about `acknowledgePublish`. It is the single
 * field that turns "show me what this would do" into "force-replace a branch on GitHub", and
 * a renderer sending the string `"yes"` must not have that read as somebody having looked at
 * the preflight and agreed.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { PAGES_CHANNELS, installPagesIpc } from "./ipc.js";
import type { PagesEvent, PagesPreflight, PagesResult, PagesStopResult } from "./hosting.js";
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
const RENDER = "world-abc123";

let root = "";
let storage = "";
let work = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-pages-ipc-"));
    storage = join(root, "maps");
    work = join(root, "work");
    const webRoot = join(storage, RENDER, "web");
    await mkdir(join(webRoot, "maps", "world", "tiles"), { recursive: true });
    await writeFile(join(webRoot, "settings.json"), JSON.stringify({ maps: ["world"] }), "utf8");
    await writeFile(join(webRoot, "maps", "world", "settings.json"), "{}", "utf8");
    await writeFile(join(webRoot, "maps", "world", "textures.json.gz"), "gz", "utf8");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function install(events: PagesEvent[] = []) {
    const ipcMain = fakeIpcMain();
    const ipc = installPagesIpc({
        ipcMain,
        storageDir: () => storage,
        workRoot: () => work,
        runner: nothingInstalled(),
        probe: () => Promise.resolve(null),
        sleep: () => Promise.resolve(),
        broadcast: (event) => events.push(event),
    });
    return { ipcMain, ipc };
}

describe("the channel", () => {
    it("registers exactly the channels it names, and takes them all off again", () => {
        const { ipcMain, ipc } = install();
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...PAGES_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("lists a render with a web root worth publishing", async () => {
        const { ipcMain } = install();
        const answer = (await ipcMain.handlers.get("pages:renders")?.(noEvent)) as {
            ok: boolean;
            value: readonly { renderId: string }[];
        };
        expect(answer.ok).toBe(true);
        expect(answer.value.map((row) => row.renderId)).toEqual([RENDER]);
    });

    it("refuses a request that names no repository, rather than publishing to nowhere", async () => {
        const { ipcMain } = install();
        for (const bad of [null, {}, { renderId: RENDER }, { renderId: RENDER, owner: "o" }]) {
            const answer = (await ipcMain.handlers.get("pages:preflight")?.(noEvent, bad)) as {
                ok: boolean;
                message: string;
            };
            expect(answer.ok).toBe(false);
            expect(answer.message).toContain("required");
        }
    });

    it("reads an acknowledgement as `true` and nothing else, however truthy it looks", async () => {
        const { ipcMain } = install();
        const publish = ipcMain.handlers.get("pages:publish");

        const stringly = (await publish?.(noEvent, {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: "yes",
        })) as PagesResult;
        expect(stringly.ok).toBe(false);
        expect(stringly.ok === false && stringly.failure.code).toBe("not-acknowledged");

        const numeric = (await publish?.(noEvent, {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: 1,
        })) as PagesResult;
        expect(numeric.ok === false && numeric.failure.code).toBe("not-acknowledged");
    });

    it("carries a real refusal back rather than a rejected promise", async () => {
        const { ipcMain } = install();
        const answer = (await ipcMain.handlers.get("pages:publish")?.(noEvent, {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        })) as PagesResult;

        expect(answer.ok).toBe(false);
        expect(answer.ok === false && answer.failure.code).toBe("gh-missing");
    });

    it("says which of the three things gh is, on a machine that has none of it", async () => {
        const { ipcMain } = install();
        const answer = (await ipcMain.handlers.get("pages:preflight")?.(noEvent, {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        })) as { ok: true; value: PagesPreflight };

        expect(answer.ok).toBe(true);
        expect(answer.value.gh.availability).toBe("not-installed");
        expect(answer.value.gitVersion).toBeNull();
        expect(answer.value.blockers.length).toBeGreaterThan(0);
        expect(answer.value.branch).toBe("gh-pages");
    });

    it("refuses to stop hosting something it was not told where to find", async () => {
        const { ipcMain } = install();
        const answer = (await ipcMain.handlers.get("pages:stop")?.(noEvent, {
            renderId: RENDER,
        })) as PagesStopResult;
        expect(answer.ok).toBe(false);
        expect(answer.ok === false && answer.failure.code).toBe("invalid-request");
    });

    it("answers false for cancelling something that is not running", async () => {
        const { ipcMain } = install();
        expect(await ipcMain.handlers.get("pages:cancel")?.(noEvent, RENDER)).toBe(false);
        expect(await ipcMain.handlers.get("pages:cancel")?.(noEvent, 7)).toBe(false);
        expect(await ipcMain.handlers.get("pages:active")?.(noEvent)).toEqual([]);
    });

    it("pushes its events rather than making the interface poll for them", async () => {
        const events: PagesEvent[] = [];
        const { ipcMain } = install(events);
        await ipcMain.handlers.get("pages:publish")?.(noEvent, {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(events.map((event) => event.type)).toContain("started");
        expect(events.map((event) => event.type)).toContain("failed");
    });

    it("remembers nothing about a render it has never published", async () => {
        const { ipcMain } = install();
        const answer = (await ipcMain.handlers.get("pages:published")?.(noEvent)) as {
            ok: boolean;
            value: readonly unknown[];
        };
        expect(answer.ok).toBe(true);
        expect(answer.value).toEqual([]);
    });
});

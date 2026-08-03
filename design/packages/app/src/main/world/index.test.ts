import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { WORLD_CHANNELS, registerWorldHandlers } from "./index.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Just enough of `ipcMain` to register against.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so the
 * channel can be exercised exactly as the renderer would reach it without an Electron
 * runtime anywhere near the test.
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

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-world-ipc-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("registerWorldHandlers", () => {
    it("registers exactly the channels it names, and takes them off again", () => {
        const ipcMain = fakeIpcMain();

        const world = registerWorldHandlers(ipcMain);
        expect([...ipcMain.handlers.keys()]).toEqual([...WORLD_CHANNELS]);

        // `ipcMain.handle` throws on a channel that already has a handler, so a
        // `dispose` that missed one would turn a reopened window into a crash.
        world.dispose();
        expect(ipcMain.handlers.size).toBe(0);
        expect(() => registerWorldHandlers(ipcMain)).not.toThrow();
    });

    it("answers world:inspect with the listing for the folder it was given", async () => {
        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain);
        await writeFile(join(root, "level.dat"), "");

        const answer = await ipcMain.handlers.get("world:inspect")?.(noEvent, root);

        expect(answer).toMatchObject({ folder: root, regionFiles: { "": 0 } });
    });

    it("refuses an argument that is not text, rather than coercing it into a path", async () => {
        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain);
        const handler = ipcMain.handlers.get("world:inspect");

        await expect(handler?.(noEvent, 7)).rejects.toThrow(/has to be given as text/);
        await expect(handler?.(noEvent, undefined)).rejects.toThrow(/has to be given as text/);
        await expect(handler?.(noEvent, { folder: root })).rejects.toThrow(/has to be given as text/);
    });
});

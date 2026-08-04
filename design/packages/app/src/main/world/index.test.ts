import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { WORLD_CHANNELS, registerWorldHandlers, type WorldIpcOptions } from "./index.js";

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

/* -------------------------------------------------------------------------- */
/* The Minecraft folders, and the worlds in them                              */
/* -------------------------------------------------------------------------- */

/**
 * A machine with a `.minecraft` in its home directory, and nowhere for the app to store
 * anything except a directory of this test's own.
 *
 * Every one of these is a parameter rather than something the module reads for itself,
 * which is what makes it possible to test a Windows layout from a Linux runner and to run
 * the whole channel with no Electron and no real user profile anywhere near it.
 */
function machineOptions(home: string, userData: string): WorldIpcOptions {
    return { platform: "linux", env: {}, home, userDataDirectory: userData, executableDirectory: null };
}

async function makeWorld(saves: string, name: string): Promise<void> {
    await mkdir(join(saves, name, "region"), { recursive: true });
    await writeFile(join(saves, name, "level.dat"), "");
    await writeFile(join(saves, name, "region", "r.0.0.mca"), "");
}

describe("the Minecraft folder channels", () => {
    it("lists the detected default folder, with the worlds in it", async () => {
        const home = join(root, "home", "ada");
        const saves = join(home, ".minecraft", "saves");
        await makeWorld(saves, "Bastion");

        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain, machineOptions(home, join(root, "userData")));

        const folders = (await ipcMain.handlers.get("world:folders")?.(noEvent)) as { id: string; state: string }[];
        expect(folders).toHaveLength(1);
        expect(folders[0]?.state).toBe("ok");

        const scan = await ipcMain.handlers.get("world:scan")?.(noEvent, folders[0]?.id);
        expect(scan).toMatchObject({ ok: true });
        expect((scan as { scan: { worlds: unknown[] } }).scan.worlds).toHaveLength(1);
    });

    it("answers with an empty list on a machine that has no Minecraft folder at all", async () => {
        // Not an error, and not a rejection: not having Minecraft installed is an ordinary
        // state that the interface says in words.
        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain, { platform: "linux", env: {}, home: "", userDataDirectory: join(root, "u") });

        expect(await ipcMain.handlers.get("world:folders")?.(noEvent)).toEqual([]);
    });

    it("mounts a second folder, scans it, and takes it off again without touching the disk", async () => {
        const home = join(root, "home", "ada");
        const other = join(root, "instances", "Modded");
        await makeWorld(join(other, "saves"), "Skyblock");

        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain, machineOptions(home, join(root, "userData")));

        const mounted = (await ipcMain.handlers.get("world:mount")?.(noEvent, other)) as {
            ok: boolean;
            folder: { id: string; resolution: string };
        };
        expect(mounted.ok).toBe(true);
        expect(mounted.folder.resolution).toBe("installation");

        const scan = await ipcMain.handlers.get("world:scan")?.(noEvent, mounted.folder.id);
        expect((scan as { scan: { worlds: { directoryName: string }[] } }).scan.worlds[0]?.directoryName).toBe(
            "Skyblock",
        );

        expect(await ipcMain.handlers.get("world:unmount")?.(noEvent, mounted.folder.id)).toBe(true);
        // The world is still exactly where it was: unmounting is not a deletion.
        expect(await ipcMain.handlers.get("world:scan")?.(noEvent, mounted.folder.id)).toMatchObject({ ok: false });
        await expect(
            writeFile(join(other, "saves", "Skyblock", "level.dat"), ""),
        ).resolves.toBeUndefined();
    });

    it("reports a folder it cannot read on that folder's own row, rather than failing the list", async () => {
        const home = join(root, "home", "ada");
        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain, machineOptions(home, join(root, "userData")));

        const answer = await ipcMain.handlers.get("world:scan")?.(noEvent, "mount:nothing");

        expect(answer).toMatchObject({ ok: false, folderId: "mount:nothing" });
    });

    it("refuses every argument that is not text", async () => {
        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain, machineOptions(join(root, "home"), join(root, "userData")));

        await expect(ipcMain.handlers.get("world:mount")?.(noEvent, 7)).rejects.toThrow(/has to be given as text/);
        await expect(ipcMain.handlers.get("world:unmount")?.(noEvent, null)).rejects.toThrow(/has to be given as text/);
        await expect(ipcMain.handlers.get("world:scan")?.(noEvent, {})).rejects.toThrow(/has to be given as text/);
        await expect(ipcMain.handlers.get("world:label")?.(noEvent, "id", 7)).rejects.toThrow(
            /has to be given as text/,
        );
    });

    it("says plainly that a build with nowhere to store the list cannot remember a mount", async () => {
        const other = join(root, "instances", "Modded");
        await makeWorld(join(other, "saves"), "Skyblock");

        const ipcMain = fakeIpcMain();
        registerWorldHandlers(ipcMain, { platform: "linux", env: {}, home: "", userDataDirectory: null });

        const answer = (await ipcMain.handlers.get("world:mount")?.(noEvent, other)) as {
            ok: boolean;
            message: string;
        };
        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("nowhere to remember");
    });
});

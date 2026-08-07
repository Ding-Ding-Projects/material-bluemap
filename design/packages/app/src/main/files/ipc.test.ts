import { afterAll, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DownloadConcurrencyStore } from "./downloadConcurrency.js";
import {
    FILES_CHANNELS,
    registerFileHandlers,
    type DownloadConcurrencyReadout,
    type DownloadConcurrencyWriteResult,
    type MapStorageDefaultReadout,
    type RenderMemoryReadout,
    type RenderMemoryWriteResult,
    type RevealRootReadout,
} from "./ipc.js";
import { RenderMemoryStore } from "./renderMemory.js";
import type { RevealHost, RevealResult, RevealRoot } from "./reveal.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/** Just enough of `ipcMain` to register against, exactly as `config/ipc.test.ts` does. */
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
const GB = 1024 * 1024 * 1024;

const created: string[] = [];

async function tempFolder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "mb-files-"));
    created.push(folder);
    return folder;
}

afterAll(async () => {
    for (const folder of created) await rm(folder, { recursive: true, force: true });
});

function fakeShell(): RevealHost & { readonly opened: string[]; readonly shown: string[] } {
    const opened: string[] = [];
    const shown: string[] = [];
    return {
        opened,
        shown,
        showItemInFolder(path: string): void {
            shown.push(path);
        },
        openPath(path: string): Promise<string> {
            opened.push(path);
            return Promise.resolve("");
        },
    };
}

async function harness(options: { readonly roots?: readonly RevealRoot[] } = {}): Promise<{
    readonly ipcMain: IpcMain & { readonly handlers: Map<string, Handler> };
    readonly shell: ReturnType<typeof fakeShell>;
    readonly store: RenderMemoryStore;
    readonly concurrencyStore: DownloadConcurrencyStore;
    readonly dispose: () => void;
}> {
    const ipcMain = fakeIpcMain();
    const shell = fakeShell();
    const dataDir = await tempFolder();
    const store = new RenderMemoryStore({ dataDir, totalMemoryBytes: 16 * GB });
    const concurrencyStore = new DownloadConcurrencyStore({ dataDir: await tempFolder() });

    const ipc = registerFileHandlers(ipcMain, {
        roots: () => options.roots ?? [],
        shell,
        documents: {
            reported: "C:\\Users\\ada\\OneDrive\\Documents",
            home: "C:\\Users\\ada",
            platform: "win32",
            directoryExists: () => true,
        },
        memory: store,
        downloadConcurrency: concurrencyStore,
    });

    return { ipcMain, shell, store, concurrencyStore, dispose: () => ipc.dispose() };
}

describe("registerFileHandlers", () => {
    it("registers every channel it names, and removes exactly those on dispose", async () => {
        const test = await harness();
        expect([...test.ipcMain.handlers.keys()].sort()).toEqual([...FILES_CHANNELS].sort());
        test.dispose();
        expect(test.ipcMain.handlers.size).toBe(0);
    });

    it("reveals a folder inside a root, and refuses one outside every root", async () => {
        const root = await tempFolder();
        const inside = join(root, "world");
        await mkdir(inside);
        const outside = await tempFolder();

        const test = await harness({ roots: [{ id: "maps", label: "the maps folder", path: root }] });
        const reveal = test.ipcMain.handlers.get("files:reveal");

        const allowed = (await reveal?.(noEvent, inside)) as RevealResult;
        expect(allowed.ok).toBe(true);

        const refused = (await reveal?.(noEvent, outside)) as RevealResult;
        expect(refused.ok).toBe(false);
        // A refusal is a value, never a rejection: a rejected `invoke` becomes an
        // unhandled promise in a component and the user sees nothing at all.
        if (refused.ok) return;
        expect(refused.reason).toContain("not inside a folder this app owns");
        test.dispose();
    });

    it("lists the roots so a surface can say what it is allowed to open", async () => {
        const root = await tempFolder();
        const test = await harness({ roots: [{ id: "maps", label: "the maps folder", path: root }] });
        const roots = (await test.ipcMain.handlers.get("files:revealRoots")?.(noEvent)) as readonly RevealRootReadout[];
        expect(roots).toEqual([{ id: "maps", label: "the maps folder", path: root }]);
        test.dispose();
    });

    it("reports the default map folder with the OneDrive explanation attached", async () => {
        const test = await harness();
        const answer = (await test.ipcMain.handlers.get("files:mapStorageDefault")?.(
            noEvent,
        )) as MapStorageDefaultReadout;

        expect(answer.directory).toBe("C:\\Users\\ada\\Documents\\Worldlens\\maps");
        expect(answer.documents.redirected).toBe(true);
        // The explanation travels with the path, so the setting cannot show one without
        // the other and the redirect is never silent.
        expect(answer.documents.explanation).toContain("OneDrive");
        test.dispose();
    });

    it("reports the memory ceiling with its units, its bounds and its actual arguments", async () => {
        const test = await harness();
        const readout = (await test.ipcMain.handlers.get("files:renderMemory")?.(noEvent)) as RenderMemoryReadout;

        expect(readout.mode).toBe("automatic");
        expect(readout.megabytes).toBe(8192);
        expect(readout.machineMegabytes).toBe(16384);
        expect(readout.jvmArgs).toEqual(["-Xmx8192m"]);
        expect(readout.explanation).toContain("MB");
        test.dispose();
    });

    it("stores a chosen ceiling and answers with the new readout", async () => {
        const test = await harness();
        const written = (await test.ipcMain.handlers.get("files:setRenderMemory")?.(noEvent, {
            mode: "manual",
            megabytes: 6144,
        })) as RenderMemoryWriteResult;

        expect(written.ok).toBe(true);
        if (!written.ok) return;
        expect(written.setting.megabytes).toBe(6144);
        expect(test.store.jvmArgs()).toEqual(["-Xmx6144m"]);
        test.dispose();
    });

    it("refuses a nonsense ceiling as a value rather than a rejection", async () => {
        const test = await harness();
        const setter = test.ipcMain.handlers.get("files:setRenderMemory");

        for (const bad of [undefined, null, "lots", { mode: "manual" }, { mode: "manual", megabytes: "4096" }]) {
            const answer = (await setter?.(noEvent, bad)) as RenderMemoryWriteResult;
            expect(answer.ok).toBe(false);
        }
        const tooBig = (await setter?.(noEvent, { mode: "manual", megabytes: 999999 })) as RenderMemoryWriteResult;
        expect(tooBig.ok).toBe(false);
        if (tooBig.ok) return;
        expect(tooBig.reason).toContain("more memory than this machine has");
        test.dispose();
    });

    it("reports the download concurrency with its bounds and its explanation", async () => {
        const test = await harness();
        const readout = (await test.ipcMain.handlers.get("files:downloadConcurrency")?.(
            noEvent,
        )) as DownloadConcurrencyReadout;

        expect(readout.workers).toBe(4);
        expect(readout.isDefault).toBe(true);
        expect(readout.defaultWorkers).toBe(4);
        expect(readout.minimumWorkers).toBe(1);
        expect(readout.maximumWorkers).toBe(16);
        expect(readout.explanation).toContain("4 parts");
        test.dispose();
    });

    it("stores a chosen concurrency and answers with the new readout", async () => {
        const test = await harness();
        const written = (await test.ipcMain.handlers.get("files:setDownloadConcurrency")?.(
            noEvent,
            8,
        )) as DownloadConcurrencyWriteResult;

        expect(written.ok).toBe(true);
        if (!written.ok) return;
        expect(written.setting.workers).toBe(8);
        expect(written.setting.isDefault).toBe(false);
        expect(test.concurrencyStore.concurrency()).toBe(8);
        test.dispose();
    });

    it("refuses a nonsense concurrency as a value rather than a rejection", async () => {
        const test = await harness();
        const setter = test.ipcMain.handlers.get("files:setDownloadConcurrency");

        for (const bad of [undefined, null, "lots", 0, -1, 99]) {
            const answer = (await setter?.(noEvent, bad)) as DownloadConcurrencyWriteResult;
            expect(answer.ok).toBe(false);
        }
        test.dispose();
    });
});

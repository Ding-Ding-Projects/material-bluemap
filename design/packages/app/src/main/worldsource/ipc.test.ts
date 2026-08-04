/**
 * The world-source channels, registered against a fake `ipcMain` with no Electron runtime.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel below is reached exactly as the renderer reaches it. The fetcher is a stub: what
 * is under test here is the contract at the boundary - that nothing rejects, that garbage
 * from the renderer becomes a sentence, and that `dispose` takes off precisely what
 * `register` put on.
 */

import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { WorldSourceFetcher } from "./fetcher.js";
import { WORLD_SOURCE_CHANNELS, registerWorldSourceHandlers } from "./ipc.js";

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

function stubFetcher(overrides: Partial<WorldSourceFetcher> = {}): WorldSourceFetcher {
    return {
        discover: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                release: {
                    owner: "cafepromenade",
                    repo: "Andyville-World",
                    tag: "andyville-backup-20260804-160001",
                    name: "Andyville world",
                    htmlUrl: "https://github.com/cafepromenade/Andyville-World/releases/tag/x",
                    sources: [],
                },
            }),
        ),
        fetch: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                downloadId: "d",
                archive: "a.zip",
                content: null,
                bytes: 1,
                sha256: "0".repeat(64),
                durationMs: 1,
                record: {} as never,
            }),
        ),
        cancel: vi.fn(() => true),
        activeDownloadIds: vi.fn(() => ["d"]),
        ...overrides,
    } as unknown as WorldSourceFetcher;
}

function register(fetcher: WorldSourceFetcher): ReturnType<typeof fakeIpcMain> {
    const ipcMain = fakeIpcMain();
    registerWorldSourceHandlers(ipcMain, {
        storageDir: () => "/tmp/does-not-matter",
        onEvent: () => undefined,
        fetcher,
    });
    return ipcMain;
}

describe("the world-source channels", () => {
    it("registers exactly the channels it names, and takes all of them off again", () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerWorldSourceHandlers(ipcMain, {
            storageDir: () => "/tmp/x",
            onEvent: () => undefined,
            fetcher: stubFetcher(),
        });
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...WORLD_SOURCE_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("parses a pasted link without touching the network, so a field can react per keystroke", async () => {
        const fetcher = stubFetcher();
        const ipcMain = register(fetcher);
        const answer = await ipcMain.handlers.get("worldsource:parse")?.(
            noEvent,
            "https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001",
        );
        expect(answer).toEqual({
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: "andyville-backup-20260804-160001",
        });
        expect(fetcher.discover).not.toHaveBeenCalled();
    });

    it("answers null for text that is not a repository, rather than throwing at a typist", async () => {
        const ipcMain = register(stubFetcher());
        expect(await ipcMain.handlers.get("worldsource:parse")?.(noEvent, "hal")).toBeNull();
        expect(await ipcMain.handlers.get("worldsource:parse")?.(noEvent, 42)).toBeNull();
    });

    it("turns a request object that is not one into a sentence, not a rejection", async () => {
        const ipcMain = register(stubFetcher());
        const discovered = (await ipcMain.handlers.get("worldsource:discover")?.(noEvent, null)) as {
            ok: boolean;
            message: string;
        };
        expect(discovered.ok).toBe(false);
        expect(discovered.message).toContain("owner and name");

        const fetched = (await ipcMain.handlers.get("worldsource:fetch")?.(noEvent, {
            owner: 7,
        })) as { ok: boolean; failure: { code: string } };
        expect(fetched.ok).toBe(false);
        expect(fetched.failure.code).toBe("invalid-request");
    });

    it("passes an empty tag through as 'latest' rather than as a tag called nothing", async () => {
        const fetcher = stubFetcher();
        const ipcMain = register(fetcher);
        await ipcMain.handlers.get("worldsource:fetch")?.(noEvent, {
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: "",
            asset: "",
        });
        expect(fetcher.fetch).toHaveBeenCalledWith({
            owner: "cafepromenade",
            repo: "Andyville-World",
        });
    });

    it("does not reject when the fetcher itself blows up", async () => {
        const ipcMain = register(
            stubFetcher({
                discover: vi.fn(() => Promise.reject(new Error("the release reader fell over"))),
                fetch: vi.fn(() => Promise.reject(new Error("the transfer fell over"))),
            } as Partial<WorldSourceFetcher>),
        );
        // A rejection would cross the bridge as a bare Error with a stack in it, and the
        // wizard would have to guess what to put on screen.
        const discovered = (await ipcMain.handlers.get("worldsource:discover")?.(noEvent, {
            owner: "o",
            repo: "r",
        })) as { ok: boolean; message: string };
        expect(discovered.ok).toBe(false);
        expect(discovered.message).toContain("the release reader fell over");

        const fetched = (await ipcMain.handlers.get("worldsource:fetch")?.(noEvent, {
            owner: "o",
            repo: "r",
        })) as { ok: boolean; failure: { code: string; detail: string | null } };
        expect(fetched.ok).toBe(false);
        expect(fetched.failure.code).toBe("network-failed");
        expect(fetched.failure.detail).toContain("the transfer fell over");
    });

    it("cancels by id and answers false for anything that is not one", async () => {
        const fetcher = stubFetcher();
        const ipcMain = register(fetcher);
        expect(await ipcMain.handlers.get("worldsource:cancel")?.(noEvent, "d")).toBe(true);
        expect(await ipcMain.handlers.get("worldsource:cancel")?.(noEvent, 5)).toBe(false);
        expect(fetcher.cancel).toHaveBeenCalledTimes(1);
    });

    it("lists what is in flight", async () => {
        const ipcMain = register(stubFetcher());
        expect(await ipcMain.handlers.get("worldsource:active")?.(noEvent)).toEqual(["d"]);
    });
});

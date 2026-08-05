/**
 * The Docker-world channels, registered against a fake `ipcMain` with no Electron runtime
 * and no Docker daemon. What is under test here is the contract at the boundary - that
 * nothing rejects, that garbage from the renderer becomes a sentence, and that `dispose`
 * takes off precisely what `register` put on.
 */

import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { DockerWorldFetcher } from "./fetch.js";
import { DOCKERWORLD_CHANNELS, registerDockerWorldHandlers } from "./ipc.js";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";

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

function stubFetcher(overrides: Partial<DockerWorldFetcher> = {}): DockerWorldFetcher {
    return {
        fetch: vi.fn(() => Promise.resolve({ ok: true as const, fetchId: "container:abc:/data/world", filesCopied: 3, filesUnchanged: 0 })),
        cancel: vi.fn(() => true),
        activeFetchIds: vi.fn(() => ["container:abc:/data/world"]),
        fingerprint: vi.fn(() => Promise.resolve({ ok: true as const, fingerprint: { regions: [] } })),
        ...overrides,
    } as unknown as DockerWorldFetcher;
}

function register(fetcher: DockerWorldFetcher): ReturnType<typeof fakeIpcMain> {
    const ipcMain = fakeIpcMain();
    registerDockerWorldHandlers(ipcMain, { fetcher });
    return ipcMain;
}

describe("channel registration", () => {
    it("registers exactly the declared channels", () => {
        const ipcMain = register(stubFetcher());
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...DOCKERWORLD_CHANNELS].sort());
    });

    it("dispose removes exactly what register added, nothing more and nothing less", () => {
        const ipcMain = fakeIpcMain();
        const dockerWorld = registerDockerWorldHandlers(ipcMain, { fetcher: stubFetcher() });
        expect(ipcMain.handlers.size).toBe(DOCKERWORLD_CHANNELS.length);
        dockerWorld.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });
});

describe("dockerworld:fetch", () => {
    it("refuses a request with no source", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:fetch") as Handler;
        const result = (await handler(noEvent, { destination: "/tmp/x" })) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("invalid-request");
    });

    it("refuses a request with no destination", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:fetch") as Handler;
        const result = (await handler(noEvent, { source: { kind: "volume", volumeName: "mc-world" } })) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("invalid-request");
    });

    it("passes a well-formed request straight through to the fetcher", async () => {
        const fetcher = stubFetcher();
        const ipcMain = register(fetcher);
        const handler = ipcMain.handlers.get("dockerworld:fetch") as Handler;
        const request = { source: { kind: "container", containerId: "abc", mountDestination: "/data/world" }, destination: "/tmp/x", acknowledgeLiveRisk: true };
        const result = (await handler(noEvent, request)) as { ok: boolean };
        expect(result.ok).toBe(true);
        expect(fetcher.fetch).toHaveBeenCalledWith({
            source: { kind: "container", containerId: "abc", mountDestination: "/data/world" },
            destination: "/tmp/x",
            acknowledgeLiveRisk: true,
        });
    });

    it("never rejects, even when the fetcher throws", async () => {
        const fetcher = stubFetcher({ fetch: vi.fn(() => Promise.reject(new Error("boom"))) });
        const ipcMain = register(fetcher);
        const handler = ipcMain.handlers.get("dockerworld:fetch") as Handler;
        const result = (await handler(noEvent, { source: { kind: "volume", volumeName: "v" }, destination: "/tmp/x" })) as {
            ok: boolean;
            failure?: { message: string };
        };
        expect(result.ok).toBe(false);
        expect(result.failure?.message).toContain("boom");
    });
});

describe("dockerworld:cancel and dockerworld:active", () => {
    it("cancel rejects a non-string id as false rather than throwing", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:cancel") as Handler;
        expect(await handler(noEvent, 42)).toBe(false);
    });

    it("cancel forwards a string id to the fetcher", async () => {
        const fetcher = stubFetcher();
        const ipcMain = register(fetcher);
        const handler = ipcMain.handlers.get("dockerworld:cancel") as Handler;
        expect(await handler(noEvent, "container:abc:/data/world")).toBe(true);
        expect(fetcher.cancel).toHaveBeenCalledWith("container:abc:/data/world");
    });

    it("active reports the fetcher's own in-flight ids", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:active") as Handler;
        expect(await handler(noEvent)).toEqual(["container:abc:/data/world"]);
    });
});

describe("dockerworld:fingerprint", () => {
    it("refuses a request with no source", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:fingerprint") as Handler;
        const result = (await handler(noEvent, {})) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("invalid-request");
    });

    it("passes a well-formed source straight through to the fetcher", async () => {
        const fetcher = stubFetcher();
        const ipcMain = register(fetcher);
        const handler = ipcMain.handlers.get("dockerworld:fingerprint") as Handler;
        const source = { kind: "volume", volumeName: "mc-world" };
        const result = (await handler(noEvent, source)) as { ok: boolean; fingerprint?: unknown };
        expect(result.ok).toBe(true);
        expect(fetcher.fingerprint).toHaveBeenCalledWith({ kind: "volume", volumeName: "mc-world" });
    });

    it("never rejects, even when the fetcher throws", async () => {
        const fetcher = stubFetcher({ fingerprint: vi.fn(() => Promise.reject(new Error("boom"))) });
        const ipcMain = register(fetcher);
        const handler = ipcMain.handlers.get("dockerworld:fingerprint") as Handler;
        const result = (await handler(noEvent, { kind: "volume", volumeName: "v" })) as {
            ok: boolean;
            failure?: { message: string };
        };
        expect(result.ok).toBe(false);
        expect(result.failure?.message).toContain("boom");
    });
});

describe("dockerworld:fingerprintsEqual", () => {
    it("is true for two fingerprints with the same regions, order-independent", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:fingerprintsEqual") as Handler;
        const a = { regions: [{ path: "r.0.0.mca", bytes: 10, modifiedAt: 1 }, { path: "r.1.0.mca", bytes: 20, modifiedAt: 2 }] };
        const b = { regions: [{ path: "r.1.0.mca", bytes: 20, modifiedAt: 2 }, { path: "r.0.0.mca", bytes: 10, modifiedAt: 1 }] };
        expect(await handler(noEvent, a, b)).toBe(true);
    });

    it("is false when a region's size differs", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:fingerprintsEqual") as Handler;
        const a = { regions: [{ path: "r.0.0.mca", bytes: 10, modifiedAt: 1 }] };
        const b = { regions: [{ path: "r.0.0.mca", bytes: 11, modifiedAt: 1 }] };
        expect(await handler(noEvent, a, b)).toBe(false);
    });

    it("treats malformed input as an empty fingerprint rather than throwing", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:fingerprintsEqual") as Handler;
        expect(await handler(noEvent, null, { regions: "not an array" })).toBe(true);
        expect(await handler(noEvent, { regions: [{ path: "r.0.0.mca", bytes: 10, modifiedAt: 1 }] }, undefined)).toBe(false);
    });
});

describe("dockerworld:list, dockerworld:inspectContainer, dockerworld:inspectVolume", () => {
    it("inspectContainer refuses a missing id", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:inspectContainer") as Handler;
        const result = (await handler(noEvent, "")) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("invalid-request");
    });

    it("inspectVolume refuses a missing name", async () => {
        const ipcMain = register(stubFetcher());
        const handler = ipcMain.handlers.get("dockerworld:inspectVolume") as Handler;
        const result = (await handler(noEvent, undefined)) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("invalid-request");
    });

    function output(partial: Partial<CommandOutput>): CommandOutput {
        return {
            ok: partial.ok ?? false,
            exitCode: partial.exitCode ?? null,
            stdout: partial.stdout ?? "",
            stderr: partial.stderr ?? "",
            spawnError: partial.spawnError ?? null,
        };
    }

    it("list reports the daemon being down through the injected runner, never the real docker binary", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ spawnError: "ENOENT" }));
        const ipcMain = fakeIpcMain();
        registerDockerWorldHandlers(ipcMain, { fetcher: stubFetcher(), runner });
        const handler = ipcMain.handlers.get("dockerworld:list") as Handler;
        const result = (await handler(noEvent)) as { ok: boolean; failure?: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.code).toBe("not-installed");
    });

    it("list reports both containers and volumes from the injected runner", async () => {
        const containerLine = JSON.stringify({ ID: "abc", Names: "mc-server", Image: "x", Status: "Up 1 minute" });
        const volumeLine = JSON.stringify({ Name: "mc-world", Driver: "local" });
        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") {
                return Promise.resolve(output({ ok: true, exitCode: 0, stdout: JSON.stringify({ Client: { Version: "27.4.0" }, Server: { Version: "27.4.0" } }) }));
            }
            if (args[0] === "ps") return Promise.resolve(output({ ok: true, exitCode: 0, stdout: `${containerLine}\n` }));
            if (args[0] === "volume") return Promise.resolve(output({ ok: true, exitCode: 0, stdout: `${volumeLine}\n` }));
            return Promise.resolve(output({ exitCode: 1, stderr: "unexpected call" }));
        };
        const ipcMain = fakeIpcMain();
        registerDockerWorldHandlers(ipcMain, { fetcher: stubFetcher(), runner });
        const handler = ipcMain.handlers.get("dockerworld:list") as Handler;
        const result = (await handler(noEvent)) as { ok: boolean; containers?: unknown[]; volumes?: unknown[] };
        expect(result.ok).toBe(true);
        expect(result.containers).toHaveLength(1);
        expect(result.volumes).toHaveLength(1);
    });
});

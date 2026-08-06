import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    PREVIEW_CHANNELS,
    installPreviewIpc,
    type PreviewAvailability,
    type PreviewEvent,
    type PreviewIpc,
    type PreviewNetworkReadout,
    type PreviewStartAnswer,
    type PreviewStatusAnswer,
} from "./ipc.js";
import { PreviewNetworkStore } from "./networkExposure.js";
import type { PreviewServerHandle, StartPreviewServerOptions } from "./server.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/** Just enough of `ipcMain` to register against, exactly as `files/ipc.test.ts` does. */
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

let storageDir = "";
const created: string[] = [];

beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "mb-preview-ipc-"));
    created.push(storageDir);
});

afterEach(async () => {
    for (const folder of created.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function makeRenderWorkspace(renderId: string): Promise<void> {
    await mkdir(join(storageDir, renderId, "web"), { recursive: true });
}

/** A stand-in `startPreviewServer` that never opens a real socket. */
function fakeStart(log: string[] = []) {
    let counter = 0;
    const fn = async (opts: StartPreviewServerOptions): Promise<PreviewServerHandle> => {
        counter += 1;
        log.push(`start:${opts.renderId}:${opts.host ?? "127.0.0.1"}`);
        return {
            renderId: opts.renderId,
            host: opts.host ?? "127.0.0.1",
            port: 48100 + counter,
            url: `http://127.0.0.1:${String(48100 + counter)}/`,
            requestedPort: 48100,
            usedRequestedPort: true,
            stop: async () => {
                log.push(`stop:${opts.renderId}`);
            },
        };
    };
    return fn;
}

function install(overrides: Partial<Parameters<typeof installPreviewIpc>[0]> = {}) {
    const ipcMain = fakeIpcMain();
    const events: PreviewEvent[] = [];
    const network = new PreviewNetworkStore({ dataDir: join(storageDir, "data") });
    const ipc = installPreviewIpc({
        ipcMain,
        storageDir: () => storageDir,
        activeRenderIds: () => [],
        network,
        broadcast: (event) => events.push(event),
        start: fakeStart(),
        now: () => "2026-01-01T00:00:00.000Z",
        ...overrides,
    });
    return { ipcMain, ipc, events, network };
}

async function call<T>(ipcMain: IpcMain & { handlers: Map<string, Handler> }, channel: string, ...args: unknown[]): Promise<T> {
    const handler = ipcMain.handlers.get(channel);
    if (handler === undefined) throw new Error(`no handler for ${channel}`);
    return (await handler(noEvent, ...args)) as T;
}

describe("registration", () => {
    it("registers every channel it promises to, and dispose removes exactly those", async () => {
        const { ipcMain, ipc } = install();
        for (const channel of PREVIEW_CHANNELS) expect(ipcMain.handlers.has(channel)).toBe(true);
        await ipc.dispose();
        for (const channel of PREVIEW_CHANNELS) expect(ipcMain.handlers.has(channel)).toBe(false);
    });
});

describe("availability, per route", () => {
    it("is available for a render whose workspace exists on disk", async () => {
        await makeRenderWorkspace("world-a");
        const { ipcMain } = install();
        const answer = await call<PreviewAvailability>(ipcMain, "preview:availability", "world-a");
        expect(answer.ok).toBe(true);
    });

    it("refuses an unknown render id by name", async () => {
        const { ipcMain } = install();
        const answer = await call<PreviewAvailability>(ipcMain, "preview:availability", "never-rendered");
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.reason).toContain("No render was found");
    });

    it("reports the GitHub-runners route as unavailable, honestly, with its own reason", async () => {
        await makeRenderWorkspace("world-ci");
        const { ipcMain } = install({ githubActiveRenderIds: () => ["world-ci"] });
        const answer = await call<PreviewAvailability>(ipcMain, "preview:availability", "world-ci");
        expect(answer.ok).toBe(false);
        if (!answer.ok) {
            expect(answer.reason).toContain("GitHub's own servers");
            expect(answer.reason).toContain("Pages");
        }
    });

    it("refuses a request with no render id", async () => {
        const { ipcMain } = install();
        const answer = await call<PreviewAvailability>(ipcMain, "preview:availability", 42);
        expect(answer.ok).toBe(false);
    });
});

describe("starting", () => {
    it("starts, reports the real answer, and broadcasts a started event", async () => {
        await makeRenderWorkspace("world-a");
        const { ipcMain, events } = install();
        const answer = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-a" });
        expect(answer.ok).toBe(true);
        if (answer.ok) {
            expect(answer.renderId).toBe("world-a");
            expect(answer.host).toBe("127.0.0.1");
            expect(answer.url).toContain("http://127.0.0.1:");
        }
        expect(events).toHaveLength(1);
        expect(events[0]?.type).toBe("started");
    });

    it("passes the network opt-in through to the server only when explicitly requested", async () => {
        await makeRenderWorkspace("world-a");
        const log: string[] = [];
        const { ipcMain } = install({ start: fakeStart(log) });
        await call(ipcMain, "preview:start", { renderId: "world-a", allowNetwork: true });
        expect(log[0]).toBe("start:world-a:0.0.0.0");
    });

    it("defaults to loopback when allowNetwork is not passed at all", async () => {
        await makeRenderWorkspace("world-a");
        const log: string[] = [];
        const { ipcMain } = install({ start: fakeStart(log) });
        await call(ipcMain, "preview:start", { renderId: "world-a" });
        expect(log[0]).toBe("start:world-a:127.0.0.1");
    });

    it("is idempotent for the same render id already running", async () => {
        await makeRenderWorkspace("world-a");
        const log: string[] = [];
        const { ipcMain } = install({ start: fakeStart(log) });
        const first = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-a" });
        const second = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-a" });
        expect(first).toEqual(second);
        expect(log.filter((entry) => entry.startsWith("start:"))).toHaveLength(1);
    });

    it("refuses a different render while one is already being hosted, naming which one", async () => {
        await makeRenderWorkspace("world-a");
        await makeRenderWorkspace("world-b");
        const { ipcMain } = install();
        await call(ipcMain, "preview:start", { renderId: "world-a" });
        const second = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-b" });
        expect(second.ok).toBe(false);
        if (!second.ok) expect(second.reason).toContain("world-a");
    });

    it("refuses to start hosting a GitHub-runner render still in flight", async () => {
        await makeRenderWorkspace("world-ci");
        const { ipcMain } = install({ githubActiveRenderIds: () => ["world-ci"] });
        const answer = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-ci" });
        expect(answer.ok).toBe(false);
    });

    it("turns a real start failure into a typed refusal and broadcasts it, never throwing", async () => {
        await makeRenderWorkspace("world-a");
        const failing = async (): Promise<PreviewServerHandle> => {
            throw new Error("EADDRINUSE somehow survived the fallback");
        };
        const { ipcMain, events } = install({ start: failing });
        const answer = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-a" });
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.reason).toContain("EADDRINUSE");
        expect(events[0]?.type).toBe("failed");
    });
});

describe("opening in the system browser", () => {
    it("never opens anything when nothing is running", async () => {
        const opened: string[] = [];
        const { ipcMain } = install({ openExternal: async (url) => (opened.push(url), true) });
        const result = await call<boolean>(ipcMain, "preview:openInBrowser");
        expect(result).toBe(false);
        expect(opened).toEqual([]);
    });

    it("opens exactly this server's own URL, never one supplied by the caller", async () => {
        await makeRenderWorkspace("world-a");
        const opened: string[] = [];
        const { ipcMain } = install({
            openExternal: async (url) => {
                opened.push(url);
                return true;
            },
        });
        const started = await call<PreviewStartAnswer>(ipcMain, "preview:start", { renderId: "world-a" });
        // The channel takes no argument at all - only the started handle's own URL can
        // possibly be opened, which is the whole safety argument in `ipc.ts`'s doc comment.
        const result = await call<boolean>(ipcMain, "preview:openInBrowser", "https://evil.example/");
        expect(result).toBe(true);
        expect(started.ok).toBe(true);
        if (started.ok) expect(opened).toEqual([started.url]);
    });

    it("reports false when no opener was configured at all", async () => {
        await makeRenderWorkspace("world-a");
        const { ipcMain } = install({ openExternal: undefined });
        await call(ipcMain, "preview:start", { renderId: "world-a" });
        expect(await call<boolean>(ipcMain, "preview:openInBrowser")).toBe(false);
    });
});

describe("stopping and status", () => {
    it("reports not-running before anything starts", async () => {
        const { ipcMain } = install();
        const status = await call<PreviewStatusAnswer>(ipcMain, "preview:status");
        expect(status.running).toBe(false);
    });

    it("status reflects a running server and whether the render is still active", async () => {
        await makeRenderWorkspace("world-a");
        const { ipcMain } = install({ activeRenderIds: () => ["world-a"] });
        await call(ipcMain, "preview:start", { renderId: "world-a" });
        const status = await call<PreviewStatusAnswer>(ipcMain, "preview:status");
        expect(status.running).toBe(true);
        expect(status.renderId).toBe("world-a");
        expect(status.renderActive).toBe(true);
    });

    it("stops cleanly, broadcasts stopped, and status goes back to not-running", async () => {
        await makeRenderWorkspace("world-a");
        const log: string[] = [];
        const { ipcMain, events } = install({ start: fakeStart(log) });
        await call(ipcMain, "preview:start", { renderId: "world-a" });
        const stopped = await call<boolean>(ipcMain, "preview:stop");
        expect(stopped).toBe(true);
        expect(log).toContain("stop:world-a");
        expect(events.map((event) => event.type)).toEqual(["started", "stopped"]);
        const status = await call<PreviewStatusAnswer>(ipcMain, "preview:status");
        expect(status.running).toBe(false);
    });

    it("stopping when nothing is running answers false rather than throwing", async () => {
        const { ipcMain } = install();
        expect(await call<boolean>(ipcMain, "preview:stop")).toBe(false);
    });

    it("dispose stops a server left running, so quitting the app leaves no listener", async () => {
        await makeRenderWorkspace("world-a");
        const log: string[] = [];
        const { ipcMain, ipc } = install({ start: fakeStart(log) });
        await call(ipcMain, "preview:start", { renderId: "world-a" });
        expect(ipc.isRunning()).toBe(true);
        await ipc.dispose();
        expect(log).toContain("stop:world-a");
        expect(ipc.isRunning()).toBe(false);
    });
});

describe("the network-exposure default", () => {
    it("starts off, and reports itself as the default", async () => {
        const { ipcMain } = install();
        const readout = await call<PreviewNetworkReadout>(ipcMain, "preview:networkDefault");
        expect(readout.allowNetwork).toBe(false);
        expect(readout.isDefault).toBe(true);
    });

    it("persists an explicit change and reports it as no longer the default", async () => {
        const { ipcMain } = install();
        const written = await call<PreviewNetworkReadout>(ipcMain, "preview:setNetworkDefault", true);
        expect(written.allowNetwork).toBe(true);
        expect(written.isDefault).toBe(false);
        const reread = await call<PreviewNetworkReadout>(ipcMain, "preview:networkDefault");
        expect(reread.allowNetwork).toBe(true);
    });
});

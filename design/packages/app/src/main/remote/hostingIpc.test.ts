/**
 * The hosting channels, registered against a fake `ipcMain` with no Electron runtime.
 *
 * What is under test at this boundary is the contract: nothing rejects, a build with no
 * orchestrator answers a named "not configured" failure rather than throwing, `dispose`
 * removes exactly what `register` added, and a garbage request from the renderer becomes a
 * refusal rather than a crash.
 */

import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { REMOTE_HOSTING_CHANNELS, registerRemoteHostingHandlers } from "./hostingIpc.js";
import type { RemoteHostingOrchestrator } from "./hosting.js";
import { testTarget } from "./fakes.js";

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

function fakeOrchestrator(overrides: Partial<RemoteHostingOrchestrator> = {}): RemoteHostingOrchestrator {
    return {
        host: vi.fn(() => Promise.resolve({ ok: true, hostingId: "x", record: {} })),
        records: vi.fn(() => Promise.resolve([])),
        readRecord: vi.fn(() => Promise.resolve(null)),
        refresh: vi.fn(() => Promise.resolve(null)),
        stopHosting: vi.fn(() => Promise.resolve({ ok: true, report: { hostingId: "x", target: "t", containerRemoved: true, filesRemoved: true, notes: [] } })),
        ...overrides,
    } as unknown as RemoteHostingOrchestrator;
}

const VALID_REQUEST = {
    target: { id: "box", host: "render.example", user: "renderer", port: 2222 },
    hostingId: "overworld-abc",
    renderId: "overworld-abc",
    maps: [{ id: "overworld", world: "/world" }],
    publish: { hostPort: 8100, bindMode: "public" },
};

describe("registerRemoteHostingHandlers", () => {
    it("registers exactly the channels it declares, and dispose removes exactly those", () => {
        const ipcMain = fakeIpcMain();
        const registered = registerRemoteHostingHandlers(ipcMain, {});
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...REMOTE_HOSTING_CHANNELS].sort());
        registered.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("answers a named failure rather than throwing when no orchestrator is configured", async () => {
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, {});
        const start = ipcMain.handlers.get("hosting:start");
        const result = (await start?.(noEvent, VALID_REQUEST)) as { ok: boolean; failure?: { message: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.message).toContain("not configured");

        const stop = ipcMain.handlers.get("hosting:stop");
        const stopResult = (await stop?.(noEvent, "anything")) as { ok: boolean };
        expect(stopResult.ok).toBe(false);
    });

    it("refuses a malformed start request without ever reaching the orchestrator", async () => {
        const orchestrator = fakeOrchestrator();
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, { orchestrator });
        const start = ipcMain.handlers.get("hosting:start");

        const result = (await start?.(noEvent, { target: {} })) as { ok: boolean };
        expect(result.ok).toBe(false);
        expect(orchestrator.host).not.toHaveBeenCalled();
    });

    it("refuses an invalid target before ever calling host()", async () => {
        const orchestrator = fakeOrchestrator();
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, { orchestrator });
        const start = ipcMain.handlers.get("hosting:start");

        const result = (await start?.(noEvent, { ...VALID_REQUEST, target: { id: "x" } })) as {
            ok: boolean;
            failure?: { message: string };
        };
        expect(result.ok).toBe(false);
        expect(orchestrator.host).not.toHaveBeenCalled();
    });

    it("forwards a valid request to host() with the validated target", async () => {
        const orchestrator = fakeOrchestrator();
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, { orchestrator });
        const start = ipcMain.handlers.get("hosting:start");

        await start?.(noEvent, VALID_REQUEST);
        expect(orchestrator.host).toHaveBeenCalledTimes(1);
        const call = (orchestrator.host as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(call.hostingId).toBe("overworld-abc");
        expect(call.target.host).toBe("render.example");
    });

    it("never rejects when the orchestrator itself throws", async () => {
        const orchestrator = fakeOrchestrator({
            host: vi.fn(() => Promise.reject(new Error("boom"))),
        });
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, { orchestrator });
        const start = ipcMain.handlers.get("hosting:start");

        const result = (await start?.(noEvent, VALID_REQUEST)) as { ok: boolean; failure?: { detail: string } };
        expect(result.ok).toBe(false);
        expect(result.failure?.detail).toContain("boom");
    });

    it("forwards stop() to the orchestrator and rejects an empty hosting id", async () => {
        const orchestrator = fakeOrchestrator();
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, { orchestrator });
        const stop = ipcMain.handlers.get("hosting:stop");

        const empty = (await stop?.(noEvent, "")) as { ok: boolean };
        expect(empty.ok).toBe(false);
        expect(orchestrator.stopHosting).not.toHaveBeenCalled();

        const real = (await stop?.(noEvent, "overworld-abc")) as { ok: boolean };
        expect(real.ok).toBe(true);
        expect(orchestrator.stopHosting).toHaveBeenCalledWith("overworld-abc");
    });

    it("forwards records/record/refresh to the orchestrator, answering safe defaults with no orchestrator", async () => {
        const ipcMain = fakeIpcMain();
        registerRemoteHostingHandlers(ipcMain, {});
        expect(await ipcMain.handlers.get("hosting:records")?.(noEvent)).toEqual([]);
        expect(await ipcMain.handlers.get("hosting:record")?.(noEvent, "x")).toBeNull();
        expect(await ipcMain.handlers.get("hosting:refresh")?.(noEvent, "x")).toBeNull();
    });

    it("uses the real testTarget shape without tripping validation", () => {
        // Guards against the fixture in fakes.ts and the request shape above drifting apart.
        expect(testTarget().host).toBe("render.example");
    });
});

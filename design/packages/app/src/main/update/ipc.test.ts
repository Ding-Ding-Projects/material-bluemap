import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { UPDATE_CHANNELS, installUpdateIpc, registerUpdateHandlers } from "./ipc.js";
import { UpdateController, type UpdateEngine, type UpdateTimers } from "./controller.js";
import { FEED_TOKEN_VARIABLE, resolveFeed } from "./feed.js";
import type { UpdateState } from "./state.js";
import type { UpdateRestartResult } from "./controller.js";

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

class FakeEngine implements UpdateEngine {
    installs = 0;
    private readonly listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    setFeedURL(): void {}
    checkForUpdates(): void {}
    quitAndInstall(): void {
        this.installs += 1;
    }
    on(event: string, listener: (...args: never[]) => void): unknown {
        const existing = this.listeners.get(event) ?? [];
        existing.push(listener as (...args: unknown[]) => void);
        this.listeners.set(event, existing);
        return this;
    }
    emit(event: string, ...args: unknown[]): void {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
}

const noTimers: UpdateTimers = { setTimeout: () => 0, clearTimeout: () => {} };

const feed = resolveFeed({
    packaged: true,
    platform: "win32",
    arch: "x64",
    version: "0.1.0",
    repository: "Ding-Ding-Projects/material-bluemap",
    environment: { [FEED_TOKEN_VARIABLE]: "s3cret-token" },
});

describe("registerUpdateHandlers", () => {
    it("registers every channel it names, and removes exactly those on dispose", () => {
        const ipcMain = fakeIpcMain();
        const engine = new FakeEngine();
        const controller = new UpdateController({
            currentVersion: "0.1.0",
            feed,
            engine,
            renderInProgress: () => false,
            onChange: () => {},
            timers: noTimers,
        });

        const ipc = registerUpdateHandlers(ipcMain, { controller });
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...UPDATE_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("answers with the state, and never with the credential", async () => {
        const ipcMain = fakeIpcMain();
        const engine = new FakeEngine();
        const installed = installUpdateIpc(ipcMain, {
            currentVersion: "0.1.0",
            feed,
            engine,
            renderInProgress: () => false,
            broadcast: () => {},
            timers: noTimers,
        });

        const state = (await ipcMain.handlers.get("update:state")?.(noEvent)) as UpdateState;
        expect(state.currentVersion).toBe("0.1.0");
        expect(state.feedUrl).toContain("update.electronjs.org");
        // The header exists in the feed configuration and must never reach a renderer,
        // a screenshot or an issue. Asserted rather than left to reviewer discipline.
        expect(JSON.stringify(state)).not.toContain("s3cret-token");
        installed.dispose();
    });

    it("pushes every change to the broadcast rather than making the banner poll", async () => {
        const ipcMain = fakeIpcMain();
        const engine = new FakeEngine();
        const seen: UpdateState[] = [];
        const installed = installUpdateIpc(ipcMain, {
            currentVersion: "0.1.0",
            feed,
            engine,
            renderInProgress: () => false,
            broadcast: (state) => seen.push(state),
            timers: noTimers,
        });

        expect(seen.length).toBeGreaterThan(0);
        await ipcMain.handlers.get("update:check")?.(noEvent);
        engine.emit("update-downloaded", {}, "notes", "0.2.0", new Date(), null);

        expect(seen[seen.length - 1]?.status).toBe("ready");
        installed.dispose();
    });

    it("answers a restart with a refusal value rather than rejecting", async () => {
        const ipcMain = fakeIpcMain();
        const engine = new FakeEngine();
        const installed = installUpdateIpc(ipcMain, {
            currentVersion: "0.1.0",
            feed,
            engine,
            renderInProgress: () => true,
            broadcast: () => {},
            timers: noTimers,
        });
        engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);

        // A rejected `invoke` becomes an unhandled promise inside a component, and the
        // user sees nothing happen at all - indistinguishable from a broken button.
        const result = (await ipcMain.handlers.get("update:restart")?.(noEvent)) as UpdateRestartResult;
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("render-in-progress");
        expect(engine.installs).toBe(0);
        installed.dispose();
    });

    it("installs when nothing is in the way", async () => {
        const ipcMain = fakeIpcMain();
        const engine = new FakeEngine();
        const installed = installUpdateIpc(ipcMain, {
            currentVersion: "0.1.0",
            feed,
            engine,
            renderInProgress: () => false,
            broadcast: () => {},
            timers: noTimers,
        });
        engine.emit("update-downloaded", {}, null, "0.2.0", new Date(), null);

        const result = (await ipcMain.handlers.get("update:restart")?.(noEvent)) as UpdateRestartResult;
        expect(result).toEqual({ ok: true, version: "0.2.0" });
        expect(engine.installs).toBe(1);
        installed.dispose();
    });
});

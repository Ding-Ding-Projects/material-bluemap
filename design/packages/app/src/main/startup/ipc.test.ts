import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, BrowserWindow, Clipboard, Dialog, IpcMain } from "electron";
import { installStartupIpc } from "./ipc.js";
import { StartupIssueStore } from "./store.js";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "worldlens-startup-ipc-"));
    roots.push(root);
    const store = new StartupIssueStore(root);
    store.record({
        category: "configuration",
        phase: "settings",
        title: "Settings unavailable",
        message: "The file could not be read.",
    });

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
        handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
            if (handlers.has(channel)) throw new Error(`duplicate ${channel}`);
            handlers.set(channel, handler);
        }),
    } as unknown as IpcMain;
    const app = {
        relaunch: vi.fn(),
        exit: vi.fn(),
        getPath: vi.fn(() => root),
    } as unknown as App;
    const clipboard = { writeText: vi.fn() } as unknown as Clipboard;
    const dialog = {
        showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
    } as unknown as Dialog;

    const startup = installStartupIpc({
        ipcMain,
        app,
        dialog,
        clipboard,
        store,
        resolveWindow: () => null,
    });
    return { app, clipboard, dialog, handlers, startup, store };
}

describe("startup diagnostics IPC", () => {
    it("registers one complete, additive recovery bridge", async () => {
        const { handlers } = await fixture();
        expect([...handlers.keys()].sort()).toEqual([
            "startup:copy",
            "startup:export",
            "startup:read",
            "startup:retry",
        ]);
        await expect(handlers.get("startup:read")?.()).resolves.toMatchObject({
            current: [expect.objectContaining({ phase: "settings" })],
        });
    });

    it("copies the full Markdown export rather than only the newest line", async () => {
        const { clipboard, startup } = await fixture();
        await expect(startup.copy()).resolves.toEqual({
            ok: true,
            message: "Startup diagnostics were copied.",
        });
        expect(vi.mocked(clipboard.writeText)).toHaveBeenCalledWith(
            expect.stringContaining("# Worldlens startup diagnostics"),
        );
        expect(vi.mocked(clipboard.writeText)).toHaveBeenCalledWith(
            expect.stringContaining("Settings unavailable"),
        );
    });

    it("guards restart re-entry so repeated clicks relaunch once", async () => {
        const { app, startup } = await fixture();
        await Promise.all([startup.retry(), startup.retry(), startup.retry()]);
        expect(vi.mocked(app.relaunch)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(app.exit)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(app.exit)).toHaveBeenCalledWith(0);
    });

    it("uses the caller's window for export when one exists", async () => {
        const { dialog, handlers } = await fixture();
        const parent = {} as BrowserWindow;
        const event = { sender: {} };
        const exportHandler = handlers.get("startup:export");
        expect(exportHandler).toBeDefined();
        // The fixture resolves no parent through IPC, so this proves the no-parent overload.
        await exportHandler?.(event, "json");
        expect(vi.mocked(dialog.showSaveDialog)).toHaveBeenCalledTimes(1);

        // The direct path accepts an owning window; use a second fixture because export is
        // single-flight only while a choice is still open.
        const second = await fixture();
        await second.startup.export("markdown", parent);
        expect(vi.mocked(second.dialog.showSaveDialog)).toHaveBeenCalledWith(
            parent,
            expect.objectContaining({ title: "Export Worldlens startup diagnostics" }),
        );
    });
});

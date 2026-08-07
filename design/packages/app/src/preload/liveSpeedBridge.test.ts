/**
 * The packaged live-speed seam, from the object the preload really exposes through the
 * renderer's real resolver to the IPC channel the main process registers.
 *
 * The component tests inject a WorldBridge and therefore cannot catch a stale preload that
 * simply omitted `adjustRenderSpeed`. This one loads the actual preload module, retrieves the
 * exact object handed to `contextBridge.exposeInMainWorld`, gives that object to the UI's real
 * `resolveWorldBridge`, and calls the resolved method. A missing export, a stale resolver or a
 * changed channel name makes this fail before a packaged app can turn it into the generic
 * "unsupported" sentence.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
    webUtils: { getPathForFile: vi.fn(() => "") },
}));

import { contextBridge, ipcRenderer } from "electron";
import "./index.js";

interface ResolvedBridge {
    adjustRenderSpeed(renderId: string, level: 1 | 2 | 3 | 4 | 5): Promise<unknown>;
}

let exposed: unknown;
let resolveWorldBridge: () => ResolvedBridge | null;

beforeAll(async () => {
    const call = vi.mocked(contextBridge.exposeInMainWorld).mock.calls[0];
    expect(call?.[0]).toBe("worldlens");
    exposed = call?.[1];

    (globalThis as { worldlens?: unknown }).worldlens = exposed;
    const url = new URL("../../../ui/src/components/world/worldBridge.ts", import.meta.url).href;
    const module = await import(/* @vite-ignore */ url) as {
        resolveWorldBridge(): ResolvedBridge | null;
    };
    resolveWorldBridge = module.resolveWorldBridge;
});

beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
});

describe("the actual preload-exposed live-speed bridge", () => {
    it("survives the UI's real resolver and invokes render:adjustSpeed with both arguments", async () => {
        const outcome = {
            ok: true,
            renderId: "local-42",
            level: 4,
            route: "local",
            appliedNow: true,
            needsRestart: true,
            reason: "applied",
            message: "priority changed",
            detail: null,
        };
        vi.mocked(ipcRenderer.invoke).mockResolvedValue(outcome);

        const resolved = resolveWorldBridge();
        expect(resolved).not.toBeNull();
        await expect(resolved!.adjustRenderSpeed("local-42", 4)).resolves.toEqual(outcome);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("render:adjustSpeed", "local-42", 4);
    });
});

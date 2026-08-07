/**
 * `worldrepo:*` was registered in the main process and never reached the preload - eleven
 * channels the renderer had no way to call, and a broadcast nothing forwarded. This is the
 * test that fails if `window.worldlens.worldRepo` stops matching those channels, the
 * same way `downloadsRouting.test.ts` guards the downloads bridge: it takes the actual
 * object the preload hands to `contextBridge.exposeInMainWorld` and checks which channel,
 * and which argument shape, each method invokes.
 *
 * `worldSourceBridge.test.ts` and `downloadsRouting.test.ts` split "the mapping" from "the
 * wiring" because the two can drift independently; `worldRepo` has no mapping seam of its
 * own - every type here is a restatement, not a transform - so one test file covers both:
 * the channel names are the contract, and every argument shape is asserted against exactly
 * what `main/worldrepo/ipc.ts` reads back out with `readTarget`/`readSync`/etc.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
    webUtils: { getPathForFile: vi.fn(() => "") },
}));

import { contextBridge, ipcRenderer } from "electron";
// Side-effect import: evaluating the preload runs its one top-level statement,
// `exposeInMainWorld("worldlens", bridge)`, against the mock above.
import "./index.js";

/** Only the `worldRepo` namespace this test drives, cast off the exposed bridge object. */
interface WorldRepoBridgeUnderTest {
    worldRepo: {
        owners(): Promise<unknown>;
        preflight(target: unknown): Promise<unknown>;
        sync(request: unknown): Promise<unknown>;
        remove(target: unknown): Promise<unknown>;
        cancel(key: string): Promise<boolean>;
        active(): Promise<readonly string[]>;
        records(): Promise<unknown>;
        resume(target: unknown): Promise<unknown>;
        remoteTip(owner: string, repo: string, branch?: string): Promise<unknown>;
        adoptionProbe(request: unknown): Promise<unknown>;
        adoptionPlan(request: unknown): Promise<unknown>;
        onWorldRepoEvent(listener: (event: unknown) => void): () => void;
    };
}

let bridge: WorldRepoBridgeUnderTest;

beforeAll(() => {
    const calls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("worldlens");
    bridge = calls[0]?.[1] as WorldRepoBridgeUnderTest;
});

beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcRenderer.on).mockReset();
    vi.mocked(ipcRenderer.off).mockReset();
});

describe("window.worldlens.worldRepo routes to worldrepo:*", () => {
    it("owners() asks worldrepo:owners with no argument", async () => {
        await bridge.worldRepo.owners();
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:owners");
    });

    it("preflight(target) sends the target object as-is, matching readTarget's expectations", async () => {
        const target = { worldPath: "C:\\worlds\\andyville", owner: "cafepromenade", repo: "Andyville-World" };
        await bridge.worldRepo.preflight(target);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:preflight", target);
    });

    it("sync(request) sends the sync request as-is", async () => {
        const request = {
            worldPath: "C:\\worlds\\andyville",
            owner: "cafepromenade",
            repo: "Andyville-World",
            acknowledgeSync: true,
        };
        await bridge.worldRepo.sync(request);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:sync", request);
    });

    it("remove(target) sends the target object as-is", async () => {
        const target = { worldPath: "C:\\worlds\\andyville", owner: "cafepromenade", repo: "Andyville-World" };
        await bridge.worldRepo.remove(target);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:remove", target);
    });

    it("cancel(key) sends the bare key, matching worldrepo:cancel's positional argument", async () => {
        await bridge.worldRepo.cancel("cafepromenade/Andyville-World");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:cancel", "cafepromenade/Andyville-World");
    });

    it("active() asks worldrepo:active with no argument", async () => {
        await bridge.worldRepo.active();
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:active");
    });

    it("records() asks worldrepo:records with no argument", async () => {
        await bridge.worldRepo.records();
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:records");
    });

    it("resume(target) sends the target object as-is", async () => {
        const target = { worldPath: "C:\\worlds\\andyville", owner: "cafepromenade", repo: "Andyville-World" };
        await bridge.worldRepo.resume(target);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:resume", target);
    });

    it("remoteTip bundles owner/repo/branch into the one object worldrepo:remoteTip reads", async () => {
        await bridge.worldRepo.remoteTip("cafepromenade", "Andyville-World", "world");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:remoteTip", {
            owner: "cafepromenade",
            repo: "Andyville-World",
            branch: "world",
        });
    });

    it("adoptionProbe(request) sends the candidates/branch/maxProbes object as-is", async () => {
        const request = { candidates: [{ owner: "o", repo: "r" }], branch: "world", maxProbes: 24 };
        await bridge.worldRepo.adoptionProbe(request);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:adoptionProbe", request);
    });

    it("adoptionPlan(request) sends the owner/repo/branch object as-is", async () => {
        const request = { owner: "cafepromenade", repo: "Andyville-World", branch: "world" };
        await bridge.worldRepo.adoptionPlan(request);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldrepo:adoptionPlan", request);
    });

    it("onWorldRepoEvent subscribes to worldrepo:event and forwards payloads", () => {
        const received: unknown[] = [];
        const unsubscribe = bridge.worldRepo.onWorldRepoEvent((event) => received.push(event));

        expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
        expect(vi.mocked(ipcRenderer.on).mock.calls[0]?.[0]).toBe("worldrepo:event");

        // Simulate the main process broadcasting, the way `WORLD_REPO_EVENT_CHANNEL` does.
        const forward = vi.mocked(ipcRenderer.on).mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
        const payload = {
            type: "phase",
            key: "cafepromenade/Andyville-World",
            phase: "pushing",
            at: "2026-08-06T00:00:00.000Z",
        };
        forward({}, payload);
        expect(received).toEqual([payload]);

        expect(typeof unsubscribe).toBe("function");
        unsubscribe();
        expect(ipcRenderer.off).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.off).toHaveBeenCalledWith("worldrepo:event", forward);
    });
});

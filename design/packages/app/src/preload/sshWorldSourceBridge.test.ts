/**
 * `worldsource:ssh:*` was registered in the main process and never reached the preload -
 * nine channels plus a `worldsource:ssh:event` broadcast the wizard had no way to reach.
 * Same shape as `worldRepoBridge.test.ts` beside this one: the actual object the preload
 * hands to `contextBridge.exposeInMainWorld` is taken apart and each method's channel and
 * positional-argument shape is asserted against exactly what `main/worldsource/sshIpc.ts`'s
 * handlers read - several of these take more than one positional argument (`survey` takes
 * three), which is exactly the kind of detail a test that only checked "some channel fired"
 * would miss.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
    webUtils: { getPathForFile: vi.fn(() => "") },
}));

import { contextBridge, ipcRenderer } from "electron";
// Side-effect import: evaluating the preload runs its one top-level statement,
// `exposeInMainWorld("materialBluemap", bridge)`, against the mock above.
import "./index.js";

/** Only the `sshWorldSource` namespace this test drives, cast off the exposed bridge object. */
interface SshWorldSourceBridgeUnderTest {
    sshWorldSource: {
        validate(target: unknown): Promise<unknown>;
        detect(target: unknown): Promise<unknown>;
        trustHostKey(target: unknown, fingerprint: string): Promise<unknown>;
        checkPath(path: string, kind: string): Promise<unknown>;
        survey(target: unknown, path: string, kind: string): Promise<unknown>;
        diff(previous: unknown, current: unknown): Promise<unknown>;
        fetch(request: unknown): Promise<unknown>;
        cancel(id: string): Promise<boolean>;
        active(): Promise<readonly string[]>;
        onSshWorldSourceEvent(listener: (event: unknown) => void): () => void;
    };
}

const TARGET = { id: "backyard-server", host: "192.168.1.20", user: "bob" };

let bridge: SshWorldSourceBridgeUnderTest;

beforeAll(() => {
    const calls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("materialBluemap");
    bridge = calls[0]?.[1] as SshWorldSourceBridgeUnderTest;
});

beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcRenderer.on).mockReset();
    vi.mocked(ipcRenderer.off).mockReset();
});

describe("window.materialBluemap.sshWorldSource routes to worldsource:ssh:*", () => {
    it("validate(target) sends the target as the sole argument", async () => {
        await bridge.sshWorldSource.validate(TARGET);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:validate", TARGET);
    });

    it("detect(target) sends the target as the sole argument", async () => {
        await bridge.sshWorldSource.detect(TARGET);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:detect", TARGET);
    });

    it("trustHostKey(target, fingerprint) sends both as separate positional arguments", async () => {
        await bridge.sshWorldSource.trustHostKey(TARGET, "SHA256:abc123");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:trustHostKey", TARGET, "SHA256:abc123");
    });

    it("checkPath(path, kind) sends both as separate positional arguments", async () => {
        await bridge.sshWorldSource.checkPath("/srv/minecraft/world", "posix");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith(
            "worldsource:ssh:checkPath",
            "/srv/minecraft/world",
            "posix",
        );
    });

    it("survey(target, path, kind) sends all three as separate positional arguments", async () => {
        await bridge.sshWorldSource.survey(TARGET, "/srv/minecraft/world", "posix");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith(
            "worldsource:ssh:survey",
            TARGET,
            "/srv/minecraft/world",
            "posix",
        );
    });

    it("diff(previous, current) sends both surveys as separate positional arguments", async () => {
        const previous = [{ path: "region/r.0.0.mca", size: 100, mtimeMs: 1 }];
        const current = [{ path: "region/r.0.0.mca", size: 200, mtimeMs: 2 }];
        await bridge.sshWorldSource.diff(previous, current);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:diff", previous, current);
    });

    it("fetch(request) sends the whole request object as one argument", async () => {
        const request = { target: TARGET, remotePath: "/srv/minecraft/world", localPath: "C:\\maps\\world" };
        await bridge.sshWorldSource.fetch(request);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:fetch", request);
    });

    it("cancel(id) sends the bare id", async () => {
        await bridge.sshWorldSource.cancel("fetch-7");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:cancel", "fetch-7");
    });

    it("active() asks worldsource:ssh:active with no argument", async () => {
        await bridge.sshWorldSource.active();
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("worldsource:ssh:active");
    });

    it("onSshWorldSourceEvent subscribes to worldsource:ssh:event and forwards payloads", () => {
        const received: unknown[] = [];
        const unsubscribe = bridge.sshWorldSource.onSshWorldSourceEvent((event) => received.push(event));

        expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
        expect(vi.mocked(ipcRenderer.on).mock.calls[0]?.[0]).toBe("worldsource:ssh:event");

        const forward = vi.mocked(ipcRenderer.on).mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void;
        const payload = { kind: "line", id: "fetch-7", message: "receiving region/r.0.0.mca" };
        forward({}, payload);
        expect(received).toEqual([payload]);

        expect(typeof unsubscribe).toBe("function");
        unsubscribe();
        expect(ipcRenderer.off).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.off).toHaveBeenCalledWith("worldsource:ssh:event", forward);
    });
});

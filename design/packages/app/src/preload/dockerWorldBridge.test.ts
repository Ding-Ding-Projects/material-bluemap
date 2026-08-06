/**
 * `registerDockerWorldHandlers` was never called anywhere - not from the preload, not even
 * from `main/index.ts` - the deepest of the three breaks this task fixes. 83 tests already
 * covered `dockerworld:*`'s logic in isolation; none of them proved the handlers were ever
 * actually registered against a running `ipcMain`, or that the preload could reach them.
 * This is the second half: it takes the actual object the preload hands to
 * `contextBridge.exposeInMainWorld` and checks which `dockerworld:*` channel, and which
 * argument shape, each method invokes. `main/index.ts`'s own `registerDockerWorldHandlers`
 * call is the first half and has no unit test of its own - it is one line inside
 * `createWindow`, exercised the same way every other `start*()` call there is: by the app
 * actually starting.
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

/** Only the `dockerWorld` namespace this test drives, cast off the exposed bridge object. */
interface DockerWorldBridgeUnderTest {
    dockerWorld: {
        list(): Promise<unknown>;
        inspectContainer(id: string): Promise<unknown>;
        inspectVolume(name: string): Promise<unknown>;
        fetch(request: unknown): Promise<unknown>;
        cancel(fetchId: string): Promise<boolean>;
        active(): Promise<readonly string[]>;
        fingerprint(source: unknown): Promise<unknown>;
        fingerprintsEqual(a: unknown, b: unknown): Promise<boolean>;
    };
}

let bridge: DockerWorldBridgeUnderTest;

beforeAll(() => {
    const calls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("materialBluemap");
    bridge = calls[0]?.[1] as DockerWorldBridgeUnderTest;
});

beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined);
});

describe("window.materialBluemap.dockerWorld routes to dockerworld:*", () => {
    it("list() asks dockerworld:list with no argument", async () => {
        await bridge.dockerWorld.list();
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:list");
    });

    it("inspectContainer(id) sends the bare id", async () => {
        await bridge.dockerWorld.inspectContainer("c0ffee123456");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:inspectContainer", "c0ffee123456");
    });

    it("inspectVolume(name) sends the bare name", async () => {
        await bridge.dockerWorld.inspectVolume("minecraft_world");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:inspectVolume", "minecraft_world");
    });

    it("fetch(request) sends the whole request object as one argument", async () => {
        const request = {
            source: { kind: "volume", volumeName: "minecraft_world" },
            destination: "C:\\maps\\world",
        };
        await bridge.dockerWorld.fetch(request);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:fetch", request);
    });

    it("cancel(fetchId) sends the bare id", async () => {
        await bridge.dockerWorld.cancel("volume:minecraft_world");
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:cancel", "volume:minecraft_world");
    });

    it("active() asks dockerworld:active with no argument", async () => {
        await bridge.dockerWorld.active();
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:active");
    });

    it("fingerprint(source) sends the bare source", async () => {
        const source = { kind: "container", containerId: "c0ffee123456", mountDestination: "/data" };
        await bridge.dockerWorld.fingerprint(source);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:fingerprint", source);
    });

    it("fingerprintsEqual(a, b) sends both fingerprints as separate positional arguments", async () => {
        const a = { regions: [{ path: "region/r.0.0.mca", bytes: 100, modifiedAt: 1 }] };
        const b = { regions: [{ path: "region/r.0.0.mca", bytes: 200, modifiedAt: 2 }] };
        await bridge.dockerWorld.fingerprintsEqual(a, b);
        expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith("dockerworld:fingerprintsEqual", a, b);
    });
});

import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { DockerReport } from "./docker.js";
import { RUNTIME_CHANNELS, registerRuntimeHandlers, summariseDocker, type RuntimeModesSummary } from "./ipc.js";
import type { ContainerReattacher, ContainerScan } from "./reattach.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Just enough of `ipcMain` to register against.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so the
 * channels can be exercised exactly as the renderer would reach them with no Electron
 * runtime anywhere near the test.
 */
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

const AVAILABLE: DockerReport = {
    status: "available",
    clientVersion: "27.4.0",
    serverVersion: "27.4.0",
    message: "Docker 27.4.0 is installed and its daemon (27.4.0) is running.",
    detail: null,
};

const DAEMON_DOWN: DockerReport = {
    status: "daemon-unreachable",
    clientVersion: "27.4.0",
    serverVersion: null,
    message: "Docker 27.4.0 is installed, but its daemon is not running. Start Docker and try again.",
    detail: "Cannot connect to the Docker daemon.",
};

describe("the runtime channels", () => {
    it("registers exactly the channels it names, and takes all of them off again", () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerRuntimeHandlers(ipcMain, { probe: () => Promise.resolve(AVAILABLE) });
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...RUNTIME_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("answers with the Docker state as a code beside its sentence", async () => {
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, { probe: () => Promise.resolve(DAEMON_DOWN) });
        const answer = await ipcMain.handlers.get("runtime:docker")?.(noEvent);
        expect(answer).toEqual(summariseDocker(DAEMON_DOWN));
        expect((answer as { available: boolean }).available).toBe(false);
    });

    it("offers local as available always, and Docker only when it really is", async () => {
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, { probe: () => Promise.resolve(DAEMON_DOWN) });
        const answer = (await ipcMain.handlers.get("runtime:modes")?.(noEvent)) as RuntimeModesSummary;

        expect(answer.preferred).toBe("local");
        const local = answer.modes.find((mode) => mode.id === "local");
        const docker = answer.modes.find((mode) => mode.id === "docker");
        expect(local?.available).toBe(true);
        expect(docker?.available).toBe(false);
        // The whole point of the distinction: the sentence says which of the two states
        // this is, so nobody is sent to install software they already have.
        expect(docker?.message).toContain("daemon is not running");
    });

    it("does not reject when the probe itself blows up", async () => {
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, {
            probe: () => Promise.reject(new Error("the probe fell over")),
        });
        const answer = (await ipcMain.handlers.get("runtime:docker")?.(noEvent)) as {
            status: string;
            detail: string | null;
        };
        expect(answer.status).toBe("unusable");
        expect(answer.detail).toBe("the probe fell over");
    });

    it("asks again every time, because Docker can be started while the app is open", async () => {
        const answers = [DAEMON_DOWN, AVAILABLE];
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, {
            probe: () => Promise.resolve(answers.shift() ?? AVAILABLE),
        });
        const first = (await ipcMain.handlers.get("runtime:docker")?.(noEvent)) as { available: boolean };
        const second = (await ipcMain.handlers.get("runtime:docker")?.(noEvent)) as { available: boolean };
        expect(first.available).toBe(false);
        expect(second.available).toBe(true);
    });

    it("names the image a container run would use", async () => {
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, {
            probe: () => Promise.resolve(AVAILABLE),
            image: "eclipse-temurin:21-jre",
        });
        const answer = (await ipcMain.handlers.get("runtime:modes")?.(noEvent)) as RuntimeModesSummary;
        expect(answer.dockerImage).toBe("eclipse-temurin:21-jre");
    });
});

/**
 * A reattacher with only the three methods the channels touch.
 *
 * Cast rather than constructed, because building a real one needs a store, a temporary
 * directory and a daemon access - none of which this file is about. What is under test
 * here is the channel: that it exists in every build, that it never rejects, and that a
 * build without a reattacher answers rather than throws.
 */
function fakeReattacher(
    overrides: Partial<Record<"scan" | "resume" | "cancel" | "dismiss", unknown>>,
): ContainerReattacher {
    return {
        scan: () => Promise.resolve({ offers: [], strays: [] }),
        resume: (renderId: string) =>
            Promise.resolve({ ok: true, renderId, action: "collected", dataRoot: "", message: "" }),
        cancel: () => true,
        dismiss: () => Promise.resolve(true),
        activeRenderIds: () => [],
        ...overrides,
    } as unknown as ContainerReattacher;
}

describe("the container channels", () => {
    it("answers with an empty scan in a build with no reattacher, rather than not existing", async () => {
        // A channel that exists in one build and not another is a renderer that has to
        // guess which build it is in.
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, { probe: () => Promise.resolve(AVAILABLE) });
        expect(await ipcMain.handlers.get("runtime:containers")?.(noEvent)).toEqual({
            offers: [],
            strays: [],
        });
        expect(await ipcMain.handlers.get("runtime:cancelContainer")?.(noEvent, "x")).toBe(false);
    });

    it("hands the scan through as it is", async () => {
        const scan: ContainerScan = {
            offers: [
                {
                    renderId: "world-abc123",
                    containerName: "worldlens-world-abc123",
                    mode: "docker",
                    where: "this computer",
                    mapIds: ["overworld"],
                    startedAt: "2026-08-04T10:00:00.000Z",
                    state: "running",
                    action: "attach",
                    canResume: true,
                    suggestRestart: false,
                    message: "still going",
                },
            ],
            strays: [],
        };
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, {
            probe: () => Promise.resolve(AVAILABLE),
            reattacher: fakeReattacher({ scan: () => Promise.resolve(scan) }),
        });
        expect(await ipcMain.handlers.get("runtime:containers")?.(noEvent)).toEqual(scan);
    });

    it("does not reject when a scan or a reattach blows up", async () => {
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, {
            probe: () => Promise.resolve(AVAILABLE),
            reattacher: fakeReattacher({
                scan: () => Promise.reject(new Error("the daemon fell over")),
                resume: () => Promise.reject(new Error("and again")),
            }),
        });

        const scan = (await ipcMain.handlers.get("runtime:containers")?.(noEvent)) as ContainerScan;
        expect(scan.offers).toEqual([]);
        expect(scan.strays[0]?.message).toContain("the daemon fell over");

        const resumed = (await ipcMain.handlers.get("runtime:reattach")?.(noEvent, "x")) as {
            ok: boolean;
            message: string;
        };
        expect(resumed.ok).toBe(false);
        expect(resumed.message).toBe("and again");
    });

    it("refuses anything that is not a render id without going near the reattacher", async () => {
        let asked = 0;
        const ipcMain = fakeIpcMain();
        registerRuntimeHandlers(ipcMain, {
            probe: () => Promise.resolve(AVAILABLE),
            reattacher: fakeReattacher({
                cancel: () => {
                    asked += 1;
                    return true;
                },
            }),
        });
        expect(await ipcMain.handlers.get("runtime:cancelContainer")?.(noEvent, 7)).toBe(false);
        expect(await ipcMain.handlers.get("runtime:dismissContainer")?.(noEvent, null)).toBe(false);
        expect(asked).toBe(0);
    });
});

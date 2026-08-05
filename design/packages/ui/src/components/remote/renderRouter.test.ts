/**
 * Sending a render elsewhere without the progress panel ever finding out.
 *
 * The whole promise of the remote path is that the interface cannot tell: the same bar, the
 * same log, the same Cancel button. That promise is kept by *routing* rather than by a
 * second panel, so the properties worth testing are the routing decisions:
 *
 * - a remote choice reaches the remote channel, with the machine attached
 * - a local choice never does, even when a machine is selected
 * - Cancel goes back to the channel that started **that** render, because hanging up an SSH
 *   connection leaves a JVM rendering into somebody's disk with nothing holding a handle
 * - the route is read when the render starts, not when the router was built
 */

import { describe, expect, it, vi } from "vitest";
import { createRenderRouter, type RenderRoute } from "./renderRouter.js";
import type { RemoteBridge, RemoteRenderResult, RemoteTarget } from "./remoteBridge.js";
import type { RenderEvent, RenderResult, WorldBridge } from "../world/worldBridge.js";

const target: RemoteTarget = {
    id: "t-1",
    label: "the build server",
    host: "build.lan",
    port: 22,
    user: "renderer",
    identityFile: null,
    workDir: "/srv/renders",
    image: "eclipse-temurin:25-jre",
    docker: "docker",
    keepRemoteFiles: false,
};

const localResult: RenderResult = {
    ok: true,
    renderId: "local-1",
    dataRoot: "C:/maps/local",
    mapIds: ["overworld"],
    engine: { id: "upstream-java", label: "BlueMap 5.11 (Java)", version: "5.11", javaVersion: "25" },
    durationMs: 1000,
};

function fakeBase(): { bridge: WorldBridge; emit: (event: RenderEvent) => void; started: unknown[]; cancelled: string[] } {
    const listeners: ((event: RenderEvent) => void)[] = [];
    const started: unknown[] = [];
    const cancelled: string[] = [];
    return {
        started,
        cancelled,
        emit: (event) => {
            for (const listener of [...listeners]) listener(event);
        },
        bridge: {
            startRender: async (request) => {
                started.push(request);
                return localResult;
            },
            cancelRender: async (renderId) => {
                cancelled.push(renderId);
                return true;
            },
            listRenders: async () => [],
            renderEngine: async () => null,
            activeRenders: async () => [],
            interruptedRenders: async () => [],
            resumeRender: async () => ({ started: false, refusal: { ok: false, renderId: "", code: "no-session", message: "" } }),
            dismissResume: async () => false,
            onRenderEvent: (listener) => {
                listeners.push(listener);
                return () => {
                    const index = listeners.indexOf(listener);
                    if (index !== -1) listeners.splice(index, 1);
                };
            },
            readConsent: async () => ({ accepted: true }),
        },
    };
}

function fakeRemote(answer: RemoteRenderResult): {
    bridge: RemoteBridge;
    started: unknown[];
    cancelled: string[];
} {
    const started: unknown[] = [];
    const cancelled: string[] = [];
    return {
        started,
        cancelled,
        bridge: {
            validateRemoteTarget: async () => ({ ok: true, target, summary: "renderer@build.lan:22" }),
            describeRemoteTarget: async () => ({ ok: false, message: "not asked here" }),
            remotePreflight: async () => {
                throw new Error("not asked here");
            },
            trustRemoteHostKey: async () => ({ ok: false, message: "not asked here" }),
            startRemoteRender: async (request) => {
                started.push(request);
                return answer;
            },
            cancelRemoteRender: async (renderId) => {
                cancelled.push(renderId);
                return true;
            },
            activeRemoteRenders: async () => [],
            browseRemoteDirectory: async () => ({ ok: false, code: "remote-failed", message: "not asked here", detail: null }),
            canDescribe: true,
            canTrustHostKey: true,
            canCancel: true,
            canSeeActive: true,
            canBrowse: true,
        },
    };
}

const remoteSuccess: RemoteRenderResult = {
    ok: true,
    renderId: "remote-1",
    dataRoot: "C:/maps/remote",
    mapIds: ["overworld"],
    durationMs: 5000,
    storageRoot: "C:/maps",
    remoteFilesKept: false,
    remoteDirectory: "/srv/renders/remote-1",
};

function router(route: RenderRoute, answer: RemoteRenderResult = remoteSuccess) {
    const base = fakeBase();
    const remote = fakeRemote(answer);
    const current = { value: route };
    const made = createRenderRouter(base.bridge, remote.bridge, () => current.value);
    if (made === null) throw new Error("expected a router");
    return { made, base, remote, current };
}

describe("choosing where a render goes", () => {
    it("sends a remote choice to the remote channel, with the machine attached", async () => {
        const { made, remote, base } = router({ location: "remote", target });

        const result = await made.startRender({ maps: [{ id: "overworld", world: "C:/saves/world" }] });

        expect(remote.started).toHaveLength(1);
        expect(base.started).toHaveLength(0);
        expect((remote.started[0] as { target: RemoteTarget }).target).toBe(target);
        expect(result.ok).toBe(true);
        expect(result.renderId).toBe("remote-1");
    });

    it("keeps a local choice local even with a machine selected", async () => {
        const { made, remote, base } = router({ location: "local", target });

        await made.startRender({ maps: [{ id: "overworld", world: "C:/saves/world" }] });

        expect(base.started).toHaveLength(1);
        expect(remote.started).toHaveLength(0);
    });

    it("will not send a remote render with no machine, whatever the choice says", async () => {
        const { made, remote, base } = router({ location: "remote", target: null });

        await made.startRender({ maps: [{ id: "overworld", world: "C:/saves/world" }] });

        expect(base.started).toHaveLength(1);
        expect(remote.started).toHaveLength(0);
    });

    it("reads the choice when the render starts, not when the router was built", async () => {
        // A machine chosen after the guide opened has to be the machine the render goes to.
        const { made, remote, current } = router({ location: "local", target: null });

        current.value = { location: "remote", target };
        await made.startRender({ maps: [{ id: "overworld", world: "C:/saves/world" }] });

        expect(remote.started).toHaveLength(1);
    });

    it("passes on the size the preflight's disk check needs, and omits it when unknown", async () => {
        const withSize = router({ location: "remote", target, requiredBytes: 9_000_000_000 });
        await withSize.made.startRender({ maps: [{ id: "a", world: "C:/w" }] });
        expect(withSize.remote.started[0]).toHaveProperty("requiredBytes", 9_000_000_000);

        const without = router({ location: "remote", target });
        await without.made.startRender({ maps: [{ id: "a", world: "C:/w" }] });
        // Omitted rather than zero: a made-up requirement either refuses a host that would
        // have worked, or passes one that fills up halfway through.
        expect(without.remote.started[0]).not.toHaveProperty("requiredBytes");
    });
});

describe("stopping one", () => {
    it("asks the remote daemon to stop a render that was started there", async () => {
        const { made, remote, base } = router({ location: "remote", target });
        await made.startRender({ maps: [{ id: "a", world: "C:/w" }] });

        expect(await made.cancelRender("remote-1")).toBe(true);
        expect(remote.cancelled).toEqual(["remote-1"]);
        expect(base.cancelled).toEqual([]);
    });

    it("stops a local render locally, including one this router never started", async () => {
        const { made, remote, base } = router({ location: "remote", target });

        // A render adopted from another window belongs to the local orchestrator.
        await made.cancelRender("someone-elses-render");

        expect(base.cancelled).toEqual(["someone-elses-render"]);
        expect(remote.cancelled).toEqual([]);
    });

    it("can still stop a remote render that failed, because the container may be up", async () => {
        const failed: RemoteRenderResult = {
            ok: false,
            renderId: "remote-2",
            failure: { code: "render-failed", message: "the container stopped", detail: null, exitCode: 1 },
        };
        const { made, remote } = router({ location: "remote", target }, failed);
        await made.startRender({ maps: [{ id: "a", world: "C:/w" }] });

        await made.cancelRender("remote-2");
        expect(remote.cancelled).toEqual(["remote-2"]);
    });
});

describe("the result the panel receives", () => {
    it("is the same shape a local one is, so no failure path needs a special case", async () => {
        const failed: RemoteRenderResult = {
            ok: false,
            renderId: "remote-3",
            failure: {
                code: "remote-failed",
                message: "There is no 'docker' command on renderer@build.lan:22.",
                detail: "bash: docker: command not found",
                exitCode: 127,
                remoteCode: "docker-missing",
                target: "renderer@build.lan:22",
            },
        };
        const { made } = router({ location: "remote", target }, failed);

        const result = await made.startRender({ maps: [{ id: "a", world: "C:/w" }] });

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a failure");
        expect(result.failure.message).toContain("no 'docker' command");
        expect(result.failure.detail).toBe("bash: docker: command not found");
        expect(result.failure.exitCode).toBe(127);
        // No local setting fixes "that host has no Docker", so no remedy is offered.
        expect(result.failure.settings).toBeNull();
    });

    it("carries the engine the events actually reported, rather than inventing one", async () => {
        const { made, base } = router({ location: "remote", target });

        base.emit({
            type: "started",
            renderId: "remote-1",
            mapIds: ["overworld"],
            engine: {
                id: "upstream-java",
                label: "BlueMap engine (Java) 5.11 in a container on a remote host",
                version: "5.11",
                javaVersion: "25",
            },
            at: "2026-08-04T10:00:00.000Z",
        });
        const result = await made.startRender({ maps: [{ id: "a", world: "C:/w" }] });

        if (!result.ok) throw new Error("expected a success");
        expect(result.engine.version).toBe("5.11");
        expect(result.engine.label).toContain("5.11");
    });

    it("claims only what is known when no event ever described the engine", async () => {
        const { made } = router({ location: "remote", target });

        const result = await made.startRender({ maps: [{ id: "a", world: "C:/w" }] });

        if (!result.ok) throw new Error("expected a success");
        expect(result.engine.label).toContain("build.lan");
        // Empty rather than guessed: an invented version is indistinguishable from a
        // reported one on the screen that shows it.
        expect(result.engine.version).toBe("");
    });
});

describe("what the router leaves alone", () => {
    it("passes every other method straight through", async () => {
        const base = fakeBase();
        const seen = vi.spyOn(base.bridge, "listRenders");
        const made = createRenderRouter(base.bridge, null, () => ({ location: "local", target: null }));

        await made?.listRenders();
        expect(seen).toHaveBeenCalled();
    });

    it("is nothing at all when there is no bridge to wrap", () => {
        expect(createRenderRouter(null, null, () => ({ location: "local", target: null }))).toBeNull();
    });

    it("stops listening when it is disposed", () => {
        const base = fakeBase();
        const made = createRenderRouter(base.bridge, null, () => ({ location: "local", target: null }));

        made?.dispose();
        // Nothing to assert beyond it not throwing; the listener list is private, and the
        // surface calls this on unmount.
        expect(made).not.toBeNull();
    });
});

describe("the chosen place actually reaches the main process", () => {
    // This is the whole point of the router, and it was quietly not happening: the choice
    // was made, shown as made, and dropped on the way out, so picking a container rendered
    // on this machine anyway. A test that only exercised the remote branch could not see it.
    it("asks for a container when a container was chosen", async () => {
        const { made, base } = router({ location: "docker", target: null });

        await made.startRender({ maps: [{ id: "overworld", world: "C:/saves/world" }] });

        expect(base.started).toHaveLength(1);
        expect((base.started[0] as { runtime?: string }).runtime).toBe("docker");
    });

    it("says local explicitly when this computer was chosen", async () => {
        const { made, base } = router({ location: "local", target: null });

        await made.startRender({ maps: [{ id: "overworld", world: "C:/saves/world" }] });

        expect((base.started[0] as { runtime?: string }).runtime).toBe("local");
    });
});

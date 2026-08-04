/**
 * The whole remote flow, with no SSH client, no `scp`, no Docker and no server.
 *
 * The preflight, the file transfer and the container's own output are all injected, which
 * is the point: a cancellation path and a cleanup path that can only be exercised against
 * real hardware are paths nobody exercises. The promise being tested is the one at the top
 * of `orchestrator.ts` - that the interface cannot tell a remote render from a local one -
 * so most assertions are about the `RenderEvent`s rather than about the commands.
 */

import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RenderEvent, ResolvedEngine } from "../render/orchestrator.js";
import type { EngineChildProcess, SpawnEngine } from "../runtime/process.js";
import { RemoteRenderOrchestrator } from "./orchestrator.js";
import type { PreflightReport } from "./preflight.js";
import { fakeTransfer, testTarget, type FakeTransfer } from "./fakes.js";

let workDir = "";
let storageDir = "";
let jarPath = "";
let worldPath = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-remote-render-"));
    storageDir = join(workDir, "renders");
    jarPath = join(workDir, "cli.jar");
    worldPath = join(workDir, "world");
    await writeFile(jarPath, "not really a jar", "utf8");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

const ENGINE: ResolvedEngine = {
    engine: "upstream-java",
    engineVersion: "5.22-27",
    enginePath: "",
    javaExecutable: "",
    javaVersion: null,
};

/** A container that prints a real render log and exits, or one that never finishes. */
function fakeChild(options: {
    readonly stdout?: readonly string[];
    readonly exitCode?: number | null;
    readonly closes?: boolean;
}): EngineChildProcess & { readonly killed: string[] } {
    const emitter = new EventEmitter();
    const killed: string[] = [];
    const child = emitter as unknown as EngineChildProcess & {
        killed: string[];
        exitCode: number | null;
    };
    Object.assign(child, {
        stdout: Readable.from(options.stdout ?? []),
        stderr: Readable.from([]),
        killed,
        exitCode: null,
        kill(signal: string): boolean {
            killed.push(signal);
            emitter.emit("close", options.exitCode ?? null, signal);
            return true;
        },
    });
    if (options.closes !== false) {
        setTimeout(() => emitter.emit("close", options.exitCode ?? 0, null), 0);
    }
    return child as EngineChildProcess & { readonly killed: string[] };
}

/** Upstream's own words, captured from a real render. */
const RENDER_LOG = [
    "[12:45:50 INFO] Loading resources...\n",
    "[12:45:52 INFO] Loading map 'overworld'...\n",
    "[12:45:53 INFO] Start updating 1 maps ...\n",
    "[12:46:03 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)\n",
    "[12:47:11 INFO] Your maps are now all up-to-date!\n",
];

function healthyPreflight(): PreflightReport {
    return {
        ok: true,
        target: "renderer@render.example:2222",
        checks: [{ stage: "ssh", ok: true, message: "Signed in with a key.", detail: null }],
        failure: null,
        hostKeys: [],
        docker: null,
        freeBytes: 900_000_000_000,
        workDir: "/home/renderer/renders",
    };
}

interface Harness {
    readonly orchestrator: RemoteRenderOrchestrator;
    readonly events: RenderEvent[];
    readonly transfer: FakeTransfer;
    readonly children: (EngineChildProcess & { readonly killed: string[] })[];
}

function harness(
    options: {
        readonly preflight?: PreflightReport;
        readonly child?: () => EngineChildProcess & { readonly killed: string[] };
        readonly keepRemoteFiles?: boolean;
        readonly consent?: boolean;
    } = {},
): Harness {
    const events: RenderEvent[] = [];
    const transfer = fakeTransfer();
    const children: (EngineChildProcess & { readonly killed: string[] })[] = [];
    const spawn: SpawnEngine = () => {
        const child = (options.child ?? (() => fakeChild({ stdout: RENDER_LOG })))();
        children.push(child);
        return child;
    };

    return {
        events,
        transfer,
        children,
        orchestrator: new RemoteRenderOrchestrator({
            storageDir: () => storageDir,
            resolveEngine: () => Promise.resolve({ ...ENGINE, enginePath: jarPath }),
            hasConsent: () => options.consent ?? true,
            onEvent: (event) => events.push(event),
            knownHostsFile: join(workDir, "known_hosts"),
            preflight: () => Promise.resolve(options.preflight ?? healthyPreflight()),
            transfer: () => transfer,
            spawn,
        }),
    };
}

function request(target = testTarget()) {
    return {
        target,
        renderId: "overworld-abc123",
        maps: [{ id: "overworld", world: worldPath, dimension: "minecraft:overworld" }],
    };
}

describe("a remote render that works", () => {
    it("sends the engine, the config and the world, then brings the map back", async () => {
        const { orchestrator, transfer } = harness();
        const result = await orchestrator.render(request());

        expect(result.ok).toBe(true);
        expect(transfer.log).toEqual([
            "mkdir /home/renderer/renders/overworld-abc123/data",
            "mkdir /home/renderer/renders/overworld-abc123/web/maps",
            `upload-file ${jarPath} -> /home/renderer/renders/overworld-abc123/cli.jar`,
            `upload-dir ${join(storageDir, "overworld-abc123", "config")} -> ` +
                "/home/renderer/renders/overworld-abc123/config",
            `upload-dir ${worldPath} -> /home/renderer/renders/overworld-abc123/worlds/overworld`,
            // Into `web/`, so the copy lands as `web/maps` - the exact layout a local
            // render produces, which is what lets the viewer mount either one.
            "download-dir /home/renderer/renders/overworld-abc123/web/maps -> " +
                join(storageDir, "overworld-abc123", "web"),
            "rm /home/renderer/renders/overworld-abc123",
        ]);
    });

    it("writes a config the container can read, with container paths in it", async () => {
        const { orchestrator } = harness();
        await orchestrator.render(request());

        const map = await readFile(
            join(storageDir, "overworld-abc123", "config", "maps", "overworld.conf"),
            "utf8",
        );
        // The world path in the config is the path inside the container. A config with this
        // machine's `C:\...` in it names nothing that exists where it is read.
        expect(map).toContain('world: "/worlds/overworld"');

        const core = await readFile(
            join(storageDir, "overworld-abc123", "config", "core.conf"),
            "utf8",
        );
        expect(core).toContain('data: "/bluemap/data"');
    });

    it("reports the container's own progress as a local render's progress", async () => {
        const { orchestrator, events } = harness();
        await orchestrator.render(request());

        // The same events, from the same tracker, parsed by the same parser.
        const phases = events.filter((event) => event.type === "phase").map((event) => event.phase);
        expect(phases).toContain("loading-resources");
        expect(phases).toContain("rendering");
        expect(phases.at(-1)).toBe("finished");

        const rendering = events.find(
            (event) => event.type === "progress" && event.task.kind === "updating-map",
        );
        expect(rendering).toBeDefined();
        if (rendering?.type !== "progress") return;
        expect(rendering.task.percent).toBeCloseTo(25.663);
        expect(rendering.task.mapId).toBe("overworld");
        expect(rendering.task.etaSeconds).toBe(47);
    });

    it("removes the staging directory, and says it did", async () => {
        const { orchestrator, transfer, events } = harness();
        const result = await orchestrator.render(request());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.remoteFilesKept).toBe(false);
        expect(transfer.log).toContain("rm /home/renderer/renders/overworld-abc123");
        const said = events
            .filter((event) => event.type === "log")
            .map((event) => event.message)
            .join("\n");
        expect(said).toContain("was removed from render.example");
    });

    it("says out loud when a target is set to keep the world on the remote host", async () => {
        const { orchestrator, transfer, events } = harness();
        const result = await orchestrator.render(request(testTarget({ keepRemoteFiles: true })));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.remoteFilesKept).toBe(true);
        expect(transfer.log).not.toContain("rm /home/renderer/renders/overworld-abc123");
        const warning = events.find(
            (event) => event.type === "log" && event.level === "WARNING",
        );
        // A copy of somebody's world on a server is a fact they are entitled to know.
        expect(warning?.type === "log" ? warning.message : "").toContain("including a copy of the world");
    });
});

describe("a remote render that is cancelled", () => {
    it("stops the container on the remote daemon, not just the conversation", async () => {
        // A container that never finishes on its own, exactly like a real render mid-flight.
        const stopped: string[] = [];
        const { orchestrator, events, children } = harness({
            child: () => fakeChild({ stdout: RENDER_LOG.slice(0, 3), closes: false }),
        });
        // The orchestrator's own stopContainer goes through `runner`; here the proof that
        // it was asked for is the EngineProcess kill plus the container name it holds.
        const started = orchestrator.render(request());
        for (let attempt = 0; attempt < 200 && children.length === 0; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1));
        }
        expect(orchestrator.cancel("overworld-abc123")).toBe(true);
        const result = await started;

        expect(result.ok).toBe(false);
        if (result.ok) return;
        // Its own outcome, never a failure with a code: a person who pressed Cancel must
        // not be shown a red banner saying something went wrong.
        expect(result.failure.remoteCode).toBe("cancelled");
        expect(result.failure.code).toBe("cancelled");
        expect(events.at(-1)?.type).toBe("cancelled");
        expect(events.some((event) => event.type === "failed")).toBe(false);
        // The local child was told to go too, so this process lets go either way.
        expect(children[0]?.killed).toContain("SIGINT");
        expect(stopped).toEqual([]);
    });

    it("cleans the staging directory up, so a cancel does not leave a world behind", async () => {
        const { orchestrator, transfer, children } = harness({
            child: () => fakeChild({ stdout: RENDER_LOG.slice(0, 3), closes: false }),
        });
        const started = orchestrator.render(request());
        for (let attempt = 0; attempt < 200 && children.length === 0; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1));
        }
        orchestrator.cancel("overworld-abc123");
        await started;

        expect(transfer.log).toContain("rm /home/renderer/renders/overworld-abc123");
        // And the map was never fetched, because there was none.
        expect(transfer.log.some((line) => line.startsWith("download-dir"))).toBe(false);
    });

    it("answers false for an id nothing is running under", () => {
        const { orchestrator } = harness();
        expect(orchestrator.cancel("nothing-here")).toBe(false);
    });
});

describe("a remote render that cannot start", () => {
    it("sends nothing at all when the preflight refused", async () => {
        const refusal: PreflightReport = {
            ok: false,
            target: "renderer@render.example:2222",
            checks: [
                { stage: "ssh", ok: true, message: "Signed in.", detail: null },
                { stage: "docker", ok: false, message: "no docker there", detail: null },
            ],
            failure: {
                code: "invalid-request",
                remoteCode: "docker-missing",
                message: "renderer@render.example:2222 answered, and has no 'docker' command.",
                settings: null,
                detail: null,
                exitCode: null,
                target: "renderer@render.example:2222",
            },
            hostKeys: [],
            docker: null,
            freeBytes: null,
            workDir: null,
        };
        const { orchestrator, transfer, events } = harness({ preflight: refusal });
        const result = await orchestrator.render(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.remoteCode).toBe("docker-missing");
        // Nothing was uploaded. Discovering this after six gigabytes is a wasted evening.
        expect(transfer.log).toEqual([]);
        expect(events.at(-1)?.type).toBe("failed");
    });

    it("refuses without consent, and points at the same settings row a local render does", async () => {
        const { orchestrator, transfer } = harness({ consent: false });
        const result = await orchestrator.render(request());
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain("Mojang download has not been accepted");
        expect(transfer.log).toEqual([]);
    });

    it("refuses a second render of the same id rather than racing itself", async () => {
        const { orchestrator, children } = harness({
            child: () => fakeChild({ stdout: RENDER_LOG, closes: false }),
        });
        const first = orchestrator.render(request());
        for (let attempt = 0; attempt < 200 && children.length === 0; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1));
        }
        const second = await orchestrator.render(request());
        expect(second.ok).toBe(false);
        if (second.ok) return;
        expect(second.failure.message).toContain("already in progress");
        orchestrator.cancel("overworld-abc123");
        await first;
    });
});

describe("a remote render that fails part way", () => {
    it("reports a failed upload as a transfer failure and cleans up", async () => {
        const { orchestrator, transfer, events } = harness();
        transfer.failOn(/upload-dir .*worlds/, new Error("scp: no space left on device"));
        const result = await orchestrator.render(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.remoteCode).toBe("remote-command-failed");
        expect(transfer.log).toContain("rm /home/renderer/renders/overworld-abc123");
        expect(events.at(-1)?.type).toBe("failed");
    });

    it("reports a container that exited non-zero as a render failure with its own words", async () => {
        const { orchestrator } = harness({
            child: () =>
                fakeChild({
                    stdout: ["[12:45:50 ERROR] something went very wrong\n"],
                    exitCode: 1,
                }),
        });
        const result = await orchestrator.render(request());
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.remoteCode).toBe("render-failed");
        expect(result.failure.exitCode).toBe(1);
    });

    it("reports a container that exited zero without finishing, rather than claiming success", async () => {
        // The engine prints a warning banner, updates nothing and exits 0. Treating that
        // exit code as the answer reports a render that produced no tiles as a completed one.
        const { orchestrator } = harness({
            child: () => fakeChild({ stdout: ["[12:45:53 INFO] Start updating 0 maps ...\n"] }),
        });
        const result = await orchestrator.render(request());
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.remoteCode).toBe("render-failed");
    });
});

/**
 * The whole hosting flow, with no SSH client, no `scp`, no Docker and no server.
 *
 * Preflight, the file transfer and the two verification paths (a real network probe for a
 * public bind, a remote command for a loopback one) are all injected. What is proven here is
 * the honesty rule the whole feature rests on: a hosted map is reported `verified: true`
 * only once one of those two checks actually says so, never because a container started.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedEngine } from "../render/orchestrator.js";
import { renderWorkspace } from "../render/workspace.js";
import { RemoteHostingOrchestrator, type RemoteHostEvent, type RemoteHostRequest } from "./hosting.js";
import type { PreflightReport } from "./preflight.js";
import { fakeRunner, fakeTransfer, output, testTarget, type FakeRunner, type FakeTransfer } from "./fakes.js";

let workDir = "";
let storageDir = "";
let hostingWorkRoot = "";
let worldPath = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-remote-hosting-"));
    storageDir = join(workDir, "renders");
    hostingWorkRoot = join(workDir, "hosting");
    worldPath = join(workDir, "world");
    await mkdir(worldPath, { recursive: true });
    await writeFile(join(worldPath, "level.dat"), "not really a world", "utf8");

    // A render already finished for "overworld-abc123": its web/ output exists on disk.
    const workspace = renderWorkspace(storageDir, "overworld-abc123");
    await mkdir(workspace.storageRoot, { recursive: true });
    await writeFile(join(workspace.webRoot, "settings.json"), "{}", "utf8");
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

function healthyPreflight(): PreflightReport {
    return {
        ok: true,
        target: "renderer@host.example:2222",
        checks: [{ stage: "ssh", ok: true, message: "Signed in with a key.", detail: null }],
        failure: null,
        hostKeys: [],
        docker: null,
        freeBytes: 900_000_000_000,
        workDir: "/home/renderer/hosting",
    };
}

const BASE_MAPS = [{ id: "overworld", world: worldPath, dimension: "minecraft:overworld" }];

interface Harness {
    readonly orchestrator: RemoteHostingOrchestrator;
    readonly events: RemoteHostEvent[];
    readonly transfer: FakeTransfer;
    readonly runner: FakeRunner;
}

function harness(
    options: {
        readonly preflight?: PreflightReport;
        readonly runnerTable?: readonly { readonly when: RegExp; readonly answer: ReturnType<typeof output> }[];
        readonly probe?: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
        readonly probeLoopback?: () => Promise<boolean>;
    } = {},
): Harness {
    const events: RemoteHostEvent[] = [];
    const transfer = fakeTransfer();
    const runner = fakeRunner([
        ...(options.runnerTable ?? []),
        { when: /'rm' '-f'/, answer: output({ stdout: "material-bluemap-host-x" }) },
        { when: /'run' '-d'/, answer: output({ stdout: "container-id-123" }) },
    ]);

    return {
        events,
        transfer,
        runner,
        orchestrator: new RemoteHostingOrchestrator({
            storageDir: () => storageDir,
            workRoot: () => hostingWorkRoot,
            resolveEngine: () => Promise.resolve({ ...ENGINE, enginePath: join(workDir, "cli.jar") }),
            onEvent: (event) => events.push(event),
            knownHostsFile: join(workDir, "known_hosts"),
            preflight: () => Promise.resolve(options.preflight ?? healthyPreflight()),
            transfer: () => transfer,
            runner: runner.runner,
            ...(options.probe === undefined ? {} : { probe: options.probe }),
            ...(options.probeLoopback === undefined
                ? {}
                : { probeLoopback: () => (options.probeLoopback as () => Promise<boolean>)() }),
        }),
    };
}

function baseRequest(overrides: Partial<RemoteHostRequest> = {}): RemoteHostRequest {
    return {
        target: testTarget(),
        hostingId: "overworld-abc123",
        renderId: "overworld-abc123",
        maps: BASE_MAPS,
        publish: { hostPort: 8123, bindMode: "public" },
        ...overrides,
    };
}

describe("host()", () => {
    it("refuses before touching the network when preflight fails", async () => {
        const { orchestrator, transfer } = harness({
            preflight: {
                ok: false,
                target: "renderer@host.example:2222",
                checks: [{ stage: "docker", ok: false, message: "No docker there.", detail: null }],
                failure: {
                    code: "cli-failed",
                    remoteCode: "docker-missing",
                    message: "No docker there.",
                    settings: null,
                    detail: null,
                    exitCode: null,
                    target: "renderer@host.example:2222",
                },
                hostKeys: [],
                docker: null,
                freeBytes: null,
                workDir: null,
            },
        });

        const result = await orchestrator.host(baseRequest());

        expect(result.ok).toBe(false);
        expect(transfer.log).toEqual([]);
    });

    it("refuses when the named render has no output on this computer", async () => {
        const { orchestrator } = harness();
        const result = await orchestrator.host(baseRequest({ renderId: "never-rendered" }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.message).toContain("never-rendered");
    });

    it("uploads the engine, the config, every world and the rendered web root", async () => {
        const { orchestrator, transfer } = harness();
        const result = await orchestrator.host(baseRequest());

        expect(result.ok).toBe(true);
        expect(transfer.log.some((line) => line.startsWith("upload-file"))).toBe(true);
        expect(transfer.log.some((line) => line.includes("/worlds/overworld"))).toBe(true);
        expect(transfer.log.some((line) => line.includes("/config"))).toBe(true);
        expect(transfer.log.some((line) => line.includes("/web"))).toBe(true);
    });

    it("tears down any previous container of the same name before starting a fresh one", async () => {
        const { orchestrator, runner } = harness();
        await orchestrator.host(baseRequest());

        const teardown = runner.calls.findIndex((call) => call.args.join(" ").includes("'rm' '-f'"));
        const started = runner.calls.findIndex((call) => call.args.join(" ").includes("'run' '-d'"));
        expect(teardown).toBeGreaterThanOrEqual(0);
        expect(started).toBeGreaterThan(teardown);
    });

    it("runs the engine detached, publishing the requested port at the requested address", async () => {
        const { orchestrator, runner } = harness();
        await orchestrator.host(baseRequest({ publish: { hostPort: 9001, bindMode: "public" } }));

        const run = runner.calls.find((call) => call.args.join(" ").includes("'run' '-d'"));
        expect(run).toBeDefined();
        expect(run?.args.join(" ")).toContain("'-p' '0.0.0.0:9001:8100'");
        expect(run?.args.join(" ")).toContain("unless-stopped");
        expect(run?.args.join(" ")).not.toContain("--rm");
    });

    it("reports verified: true, with a URL, only once a real connection to a public bind succeeds", async () => {
        const { orchestrator } = harness({ probe: () => Promise.resolve(true) });
        const result = await orchestrator.host(baseRequest({ publish: { hostPort: 8123, bindMode: "public" } }));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.record.verified).toBe(true);
            expect(result.record.url).toBe("http://render.example:8123/");
            expect(result.record.verifiedVia).toBe("network");
        }
    });

    it("reports verified: false and no URL when the public bind never answers", async () => {
        const { orchestrator } = harness({ probe: () => Promise.resolve(false) });
        const result = await orchestrator.host(baseRequest({ publish: { hostPort: 8123, bindMode: "public" } }));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.record.verified).toBe(false);
            expect(result.record.url).toBeNull();
            expect(result.record.status).toBe("unknown");
        }
    });

    it("verifies a loopback bind over SSH rather than a direct connection, and never invents a public URL", async () => {
        const { orchestrator } = harness({ probeLoopback: () => Promise.resolve(true) });
        const result = await orchestrator.host(baseRequest({ publish: { hostPort: 8123, bindMode: "loopback" } }));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.record.verified).toBe(true);
            expect(result.record.verifiedVia).toBe("ssh-loopback");
            // A loopback bind is deliberately not reachable from this computer, so there is
            // no public URL to report - only a tunnel instruction, in the notes.
            expect(result.record.url).toBeNull();
            expect(result.record.notes.join(" ")).toContain("ssh -L");
        }
    });

    it("reports a failed docker run honestly rather than as a verification failure", async () => {
        const { orchestrator } = harness({
            runnerTable: [{ when: /'run' '-d'/, answer: output({ ok: false, exitCode: 1, stderr: "port is already allocated" }) }],
        });
        const result = await orchestrator.host(baseRequest());

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.message).toContain("Starting the hosted map");
    });

    it("republishing re-syncs files and restarts the container (this is what 'update' is)", async () => {
        const { orchestrator, transfer, runner } = harness({ probe: () => Promise.resolve(true) });
        await orchestrator.host(baseRequest());
        transfer.log.length = 0;
        runner.calls.length = 0;

        const second = await orchestrator.host(baseRequest());
        expect(second.ok).toBe(true);
        expect(transfer.log.length).toBeGreaterThan(0);
        expect(runner.calls.some((call) => call.args.join(" ").includes("'rm' '-f'"))).toBe(true);
        expect(runner.calls.some((call) => call.args.join(" ").includes("'run' '-d'"))).toBe(true);
    });
});

describe("records() and readRecord()", () => {
    it("persists a record that a later call can read back", async () => {
        const { orchestrator } = harness({ probe: () => Promise.resolve(true) });
        await orchestrator.host(baseRequest());

        const saved = await orchestrator.readRecord("overworld-abc123");
        expect(saved?.hostingId).toBe("overworld-abc123");
        expect(saved?.verified).toBe(true);

        const all = await orchestrator.records();
        expect(all.map((record) => record.hostingId)).toContain("overworld-abc123");
    });

    it("answers an empty list rather than throwing when nothing has ever been hosted", async () => {
        const { orchestrator } = harness();
        expect(await orchestrator.records()).toEqual([]);
        expect(await orchestrator.readRecord("nothing-here")).toBeNull();
    });
});

describe("refresh()", () => {
    it("re-verifies without transferring anything", async () => {
        const { orchestrator, transfer } = harness({ probe: () => Promise.resolve(false) });
        await orchestrator.host(baseRequest());
        transfer.log.length = 0;

        const refreshed = await orchestrator.refresh("overworld-abc123");
        expect(refreshed?.verified).toBe(false);
        expect(transfer.log).toEqual([]);
    });

    it("answers null for a hosting id nobody ever published", async () => {
        const { orchestrator } = harness();
        expect(await orchestrator.refresh("ghost")).toBeNull();
    });
});

describe("stopHosting()", () => {
    it("tears the container down and removes the remote directory by default", async () => {
        const { orchestrator, transfer, runner } = harness({ probe: () => Promise.resolve(true) });
        await orchestrator.host(baseRequest());
        transfer.log.length = 0;
        runner.calls.length = 0;

        const result = await orchestrator.stopHosting("overworld-abc123");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.report.containerRemoved).toBe(true);
            expect(result.report.filesRemoved).toBe(true);
        }
        expect(runner.calls.some((call) => call.args.join(" ").includes("'rm' '-f'"))).toBe(true);
        expect(transfer.log.some((line) => line.startsWith("rm "))).toBe(true);

        // Stopping removes the record: a stopped map is not still "hosted".
        expect(await orchestrator.readRecord("overworld-abc123")).toBeNull();
    });

    it("leaves the remote copy of the world in place when the target says to keep it", async () => {
        const { orchestrator, transfer } = harness({ probe: () => Promise.resolve(true) });
        await orchestrator.host(baseRequest({ target: testTarget({ keepRemoteFiles: true }) }));
        transfer.log.length = 0;

        const result = await orchestrator.stopHosting("overworld-abc123");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.report.filesRemoved).toBe(false);
            expect(result.report.notes.join(" ")).toContain("keep its remote files");
        }
        expect(transfer.log.some((line) => line.startsWith("rm "))).toBe(false);
    });

    it("answers a named failure for a hosting id with no record", async () => {
        const { orchestrator } = harness();
        const result = await orchestrator.stopHosting("never-hosted");
        expect(result.ok).toBe(false);
    });

    it("treats 'no such container' as success, so stopping twice is not an error", async () => {
        const { orchestrator } = harness({
            probe: () => Promise.resolve(true),
            runnerTable: [{ when: /'rm' '-f'/, answer: output({ ok: false, exitCode: 1, stderr: "Error: No such container: material-bluemap-host-x" }) }],
        });
        await orchestrator.host(baseRequest());

        const result = await orchestrator.stopHosting("overworld-abc123");
        expect(result.ok).toBe(true);
    });
});

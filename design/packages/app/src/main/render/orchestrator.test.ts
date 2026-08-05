import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMapHandler } from "./LocalMapHandler.js";
import { RenderOrchestrator, EngineUnavailableError, classifyRunFailure } from "./orchestrator.js";
import type { RenderEvent, RenderRequest, ResolvedEngine } from "./orchestrator.js";
import type { SpawnCli } from "./runner.js";

let root = "";
let storageDir = "";
let worldDir = "";

const ENGINE: ResolvedEngine = {
    engine: "upstream-java",
    engineVersion: "5.22-27",
    enginePath: "/jars/cli-5.22-27-shadow.jar",
    javaExecutable: "/jdk/bin/java",
    javaVersion: "25.0.3",
};

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-render-"));
    storageDir = join(root, "maps");
    worldDir = join(root, "world");
    await mkdir(worldDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function request(overrides: Partial<RenderRequest> = {}): RenderRequest {
    return { maps: [{ id: "overworld", world: worldDir, name: "Overworld" }], ...overrides };
}

/**
 * A stand-in CLI that writes whatever lines it is given and exits with a chosen code.
 *
 * It also writes the tiles a real render would, because the orchestrator's success path
 * mounts a directory and the test then asks the handler to serve out of it.
 */
async function fakeCli(options: {
    readonly lines: readonly string[];
    readonly exitCode?: number;
    readonly sleepMs?: number;
    readonly marker?: string;
}): Promise<string> {
    const script = join(root, `fake-${String(Math.random()).slice(2)}.mjs`);
    const body = [
        "import { writeFileSync } from 'node:fs';",
        `const lines = ${JSON.stringify(options.lines)};`,
        "for (const line of lines) process.stdout.write(line + '\\n');",
    ];
    if (options.sleepMs !== undefined) {
        body.push(
            `setTimeout(() => {`,
            options.marker === undefined
                ? ""
                : `    writeFileSync(${JSON.stringify(options.marker)}, 'ran to completion');`,
            `    process.exit(${String(options.exitCode ?? 0)});`,
            `}, ${String(options.sleepMs)});`,
        );
    } else {
        body.push(`process.exit(${String(options.exitCode ?? 0)});`);
    }
    await writeFile(script, body.join("\n"), "utf8");
    return script;
}

function spawnScript(script: string, seen: string[][]): SpawnCli {
    return (command, args, options) => {
        seen.push([command, ...args]);
        return nodeSpawn(process.execPath, [script], {
            cwd: options.cwd,
            env: options.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
    };
}

const COMPLETE_RENDER = [
    "[12:35:08 INFO] Loading resources...",
    "[12:35:09 INFO] Resources loaded.",
    "[12:35:09 INFO] Initializing Storage: 'file' (Type: 'bluemap:file')",
    "[12:35:09 INFO] Loading map 'overworld'...",
    "[12:35:09 INFO] Start updating 1 maps ...",
    "[12:35:19 INFO] updating map 'overworld': 100.0%",
    "[12:35:19 INFO] Your maps are now all up-to-date!",
    "[12:35:19 INFO] Stopping...",
    "[12:35:19 INFO] Saving...",
    "[12:35:19 INFO] Stopped.",
];

/* -------------------------------------------------------------------------- */
/* Consent                                                                    */
/* -------------------------------------------------------------------------- */

describe("consent", () => {
    it("fails with a typed reason and spawns nothing", async () => {
        let spawned = 0;
        let engineResolved = 0;
        const events: RenderEvent[] = [];

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => false,
            resolveEngine: () => {
                engineResolved += 1;
                return Promise.resolve(ENGINE);
            },
            onEvent: (event) => events.push(event),
            spawn: (() => {
                spawned += 1;
                throw new Error("the orchestrator must not spawn without consent");
            }) as unknown as SpawnCli,
        });

        const result = await orchestrator.render(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("consent-required");
        expect(result.failure.exitCode).toBeNull();

        // The interface can render it as "consent required" and send somebody
        // somewhere real, rather than showing a licence on top of their task.
        expect(result.failure.settings).toEqual({
            surface: "settings",
            anchor: "mojang-download-consent",
            missing: true,
        });
        expect(result.failure.message).toContain("Settings");

        expect(spawned).toBe(0);
        // Not even a JDK probe: the gate is first, so the answer is instant and nothing
        // has been downloaded, created or launched on the person's behalf.
        expect(engineResolved).toBe(0);
        // Nothing was written either. The storage directory does not exist at all.
        expect(existsSync(storageDir)).toBe(false);

        const failed = events.filter((event) => event.type === "failed");
        expect(failed).toHaveLength(1);
        expect(events.some((event) => event.type === "started")).toBe(false);
    });

    it("is read at the moment of the render, so accepting later just works", async () => {
        let accepted = false;
        const script = await fakeCli({ lines: COMPLETE_RENDER });
        const seen: string[][] = [];
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => accepted,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, seen),
        });

        expect((await orchestrator.render(request())).ok).toBe(false);
        accepted = true;
        expect((await orchestrator.render(request())).ok).toBe(true);
        expect(seen).toHaveLength(1);
    }, 20_000);

    it("reports consent required if the CLI itself complains, whatever the exit code", () => {
        const failure = classifyRunFailure(
            {
                exitCode: 2,
                signal: null,
                upToDate: false,
                mapsScheduled: null,
                consentMissing: true,
            },
            "[WARNING] You must accept the required file download in order for BlueMap to work!",
        );
        expect(failure?.code).toBe("consent-required");
    });
});

/* -------------------------------------------------------------------------- */
/* A completed render                                                         */
/* -------------------------------------------------------------------------- */

describe("a completed render", () => {
    it("writes the config, records the engine and mounts the result", async () => {
        const script = await fakeCli({ lines: COMPLETE_RENDER });
        const seen: string[][] = [];
        const mounts = new LocalMapHandler();
        const events: RenderEvent[] = [];

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            mounts,
            spawn: spawnScript(script, seen),
            onEvent: (event) => events.push(event),
            appVersion: "0.1.0",
        });

        const result = await orchestrator.render(request({ renderId: "test-render" }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.renderId).toBe("test-render");
        expect(result.dataRoot).toBe("/local/test-render");
        expect(result.mapIds).toEqual(["overworld"]);

        // Requirement: the app says which engine rendered a map, and never switches
        // silently. This is the string a details surface shows.
        expect(result.engine.label).toBe("BlueMap engine (Java) 5.22-27 on Java 25.0.3");
        expect(result.engine.id).toBe("upstream-java");

        // The config the CLI was pointed at is on disk with every path absolute.
        const workspace = join(storageDir, "test-render");
        const core = await readFile(join(workspace, "config", "core.conf"), "utf8");
        expect(core).toContain("accept-download: true");
        expect(core).toContain(JSON.stringify(join(workspace, "data")));
        // Metrics are off unless a caller asks: the only thing consented to was Mojang.
        expect(core).toContain("metrics: false");

        const mapConf = await readFile(join(workspace, "config", "maps", "overworld.conf"), "utf8");
        expect(mapConf).toContain(`world: ${JSON.stringify(worldDir)}`);

        // The child was spawned with the JVM and jar it was given, pointed at that
        // config folder, with the workspace as its working directory.
        expect(seen[0]?.[0]).toBe("/jdk/bin/java");
        expect(seen[0]).toContain(join(workspace, "config"));

        // The provenance record survives the process that wrote it.
        const record = JSON.parse(await readFile(join(workspace, "render.json"), "utf8")) as {
            engine: string;
            engineVersion: string;
            javaVersion: string;
            outcome: string;
            appVersion: string;
        };
        expect(record).toMatchObject({
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            outcome: "finished",
            appVersion: "0.1.0",
        });

        expect(mounts.getMount("test-render")?.webRoot).toBe(join(workspace, "web"));

        const types = events.map((event) => event.type);
        expect(types[0]).toBe("started");
        expect(types.at(-1)).toBe("finished");
        expect(events.some((event) => event.type === "progress")).toBe(true);
    }, 20_000);

    it("streams progress with the map, percent, estimate and phase", async () => {
        const script = await fakeCli({
            lines: [
                "[12:36:13 INFO] Start updating 1 maps ...",
                "[12:36:23 INFO] updating map 'overworld': 8.535% (ETA: 3 minutes)",
                "[12:36:33 INFO] updating map 'overworld': 100.0%",
                "[12:36:33 INFO] Your maps are now all up-to-date!",
                "[12:36:33 INFO] Stopped.",
            ],
        });
        const events: RenderEvent[] = [];
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
            onEvent: (event) => events.push(event),
        });

        await orchestrator.render(request({ renderId: "streamed" }));

        const progress = events.flatMap((event) => (event.type === "progress" ? [event] : []));
        expect(progress).toHaveLength(2);
        expect(progress[0]).toMatchObject({
            renderId: "streamed",
            phase: "rendering",
            task: { mapId: "overworld", percent: 8.535, etaSeconds: 180, etaText: "3 minutes" },
        });
        expect(progress[1]?.task).toMatchObject({ percent: 100, etaSeconds: null });

        const phases = events.flatMap((event) => (event.type === "phase" ? [event.phase] : []));
        expect(phases).toEqual(["rendering", "finished"]);
    }, 20_000);
});

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

describe("failures", () => {
    it("reports a render that updated nothing, even though the CLI exits zero", async () => {
        // The real capture: a map pointed at a missing world prints a warning banner,
        // then "Start updating 0 maps ...", then "up-to-date!", then exits 0.
        const script = await fakeCli({
            lines: [
                "[12:45:57 INFO] Loading resources...",
                "[12:45:58 WARNING] ",
                "################################",
                " There is a problem with your BlueMap setup!",
                "",
                " 'C:\\nope' does not exist or is no directory!",
                "################################",
                "[12:45:58 INFO] Start updating 0 maps ...",
                "[12:45:58 INFO] Your maps are now all up-to-date!",
                "[12:45:58 INFO] Stopped.",
            ],
            exitCode: 0,
        });

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
        });

        const result = await orchestrator.render(request({ renderId: "empty" }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-maps-rendered");
        expect(result.failure.exitCode).toBe(0);
        expect(result.failure.detail).toContain("does not exist or is no directory!");
        expect(result.record?.outcome).toBe("failed");
    }, 20_000);
});

describe("filing evidence with the repair module", () => {
    it("calls rememberFailure with the run's own diagnostics on a genuine failure", async () => {
        const script = await fakeCli({
            lines: [
                "[12:45:57 INFO] Loading resources...",
                "[12:45:58 WARNING] ",
                "################################",
                " There is a problem with your BlueMap setup!",
                "",
                " 'C:\\nope' does not exist or is no directory!",
                "################################",
                "[12:45:58 INFO] Start updating 0 maps ...",
                "[12:45:58 INFO] Your maps are now all up-to-date!",
                "[12:45:58 INFO] Stopped.",
            ],
            exitCode: 0,
        });

        const remembered: unknown[] = [];
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
            rememberFailure: (evidence) => remembered.push(evidence),
        });

        const result = await orchestrator.render(request({ renderId: "remembered" }));
        expect(result.ok).toBe(false);

        expect(remembered).toHaveLength(1);
        const evidence = remembered[0] as {
            subject: string;
            mode: string;
            command: string;
            args: string[];
            exitCode: number | null;
            mapsScheduled: number | null;
            setupProblems: string[];
            javaExecutable: string;
            javaVersion: string | null;
            requiredJavaFeature: number;
            worlds: { mapId: string; path: string }[];
            hostConfigDir: string;
        };
        expect(evidence.subject).toBe("render");
        expect(evidence.mode).toBe("local");
        expect(evidence.command).toBe(ENGINE.javaExecutable);
        expect(evidence.args).toContain(ENGINE.enginePath);
        expect(evidence.exitCode).toBe(0);
        expect(evidence.mapsScheduled).toBe(0);
        expect(evidence.setupProblems.join("\n")).toContain("does not exist or is no directory!");
        expect(evidence.javaExecutable).toBe(ENGINE.javaExecutable);
        expect(evidence.javaVersion).toBe(ENGINE.javaVersion);
        expect(evidence.requiredJavaFeature).toBeGreaterThan(0);
        expect(evidence.worlds).toEqual([{ mapId: "overworld", path: worldDir }]);
        expect(evidence.hostConfigDir.length).toBeGreaterThan(0);
    }, 20_000);

    it("never files evidence for a cancellation, which is not a failure", async () => {
        const script = await fakeCli({
            lines: COMPLETE_RENDER,
            sleepMs: 5_000,
        });

        const remembered: unknown[] = [];
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
            rememberFailure: (evidence) => remembered.push(evidence),
        });

        const renderId = "cancel-no-evidence";
        const started = orchestrator.render(request({ renderId }));
        // Give the child a moment to actually be spawned before asking it to cancel.
        await new Promise((resolve) => setTimeout(resolve, 200));
        orchestrator.cancel(renderId);
        const result = await started;

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("cancelled");
        expect(remembered).toHaveLength(0);
    }, 20_000);

    it("does not let a throwing rememberFailure turn a reported failure into a crash", async () => {
        const script = await fakeCli({
            lines: [
                "[12:45:57 INFO] Loading resources...",
                "[12:45:58 INFO] Start updating 0 maps ...",
                "[12:45:58 INFO] Your maps are now all up-to-date!",
                "[12:45:58 INFO] Stopped.",
            ],
            exitCode: 0,
        });

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
            rememberFailure: () => {
                throw new Error("the repair module's own registry is full");
            },
        });

        const result = await orchestrator.render(request({ renderId: "throwing-remember" }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("no-maps-rendered");
    }, 20_000);

    it("is a plain no-op when this build has no rememberFailure wired at all", async () => {
        const script = await fakeCli({
            lines: [
                "[12:45:57 INFO] Loading resources...",
                "[12:45:58 INFO] Start updating 0 maps ...",
                "[12:45:58 INFO] Your maps are now all up-to-date!",
                "[12:45:58 INFO] Stopped.",
            ],
            exitCode: 0,
        });

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
        });

        const result = await orchestrator.render(request({ renderId: "no-remember-option" }));
        expect(result.ok).toBe(false);
    }, 20_000);
});

describe("failures", () => {
    it("reports a world folder that is not there, before spawning anything", async () => {
        let spawned = 0;
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: (() => {
                spawned += 1;
                throw new Error("must not spawn");
            }) as unknown as SpawnCli,
        });

        const result = await orchestrator.render({
            maps: [{ id: "overworld", world: join(root, "no-such-world") }],
            renderId: "missing",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("world-not-found");
        expect(result.failure.detail).toBe(join(root, "no-such-world"));
        expect(spawned).toBe(0);
    });

    it("separates a missing jar from a missing JDK", async () => {
        const jarMissing = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () =>
                Promise.reject(new EngineUnavailableError("jar", "looked in: /a\n  /b")),
        });
        const jarResult = await jarMissing.render(request());
        expect(jarResult.ok).toBe(false);
        if (!jarResult.ok) expect(jarResult.failure.code).toBe("cli-jar-missing");

        const javaMissing = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () =>
                Promise.reject(new EngineUnavailableError("java", "no Java 25 found")),
        });
        const javaResult = await javaMissing.render(request());
        expect(javaResult.ok).toBe(false);
        if (!javaResult.ok) {
            expect(javaResult.failure.code).toBe("java-unavailable");
            expect(javaResult.failure.settings?.anchor).toBe("java-runtime");
        }
    });

    it("rejects a request that could never render, without touching the disk", async () => {
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.reject(new Error("must not be reached")),
        });

        const empty = await orchestrator.render({ maps: [] });
        expect(empty.ok).toBe(false);
        if (!empty.ok) expect(empty.failure.code).toBe("invalid-request");

        // A map id becomes a directory name and a URL path segment.
        const traversal = await orchestrator.render({
            maps: [{ id: "../escape", world: worldDir }],
        });
        expect(traversal.ok).toBe(false);
        if (!traversal.ok) expect(traversal.failure.code).toBe("invalid-request");

        expect(existsSync(storageDir)).toBe(false);
    });

    it("refuses a second render of the same id while one is in flight", async () => {
        const script = await fakeCli({ lines: COMPLETE_RENDER, sleepMs: 1_500 });
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
        });

        const first = orchestrator.render(request({ renderId: "busy" }));
        // Wait until it is genuinely in flight rather than racing the first await.
        await new Promise<void>((resolve) => {
            const wait = setInterval(() => {
                if (orchestrator.activeRenderIds().includes("busy")) {
                    clearInterval(wait);
                    resolve();
                }
            }, 10);
        });

        const second = await orchestrator.render(request({ renderId: "busy" }));
        expect(second.ok).toBe(false);
        if (!second.ok) expect(second.failure.code).toBe("already-running");

        orchestrator.cancel("busy");
        await first;
    }, 20_000);
});

describe("classifyRunFailure", () => {
    const base = { signal: null, upToDate: true, mapsScheduled: 1, consentMissing: false } as const;

    it("passes a genuine success", () => {
        expect(classifyRunFailure({ ...base, exitCode: 0 }, null)).toBeNull();
    });

    it("fails a non-zero exit", () => {
        expect(classifyRunFailure({ ...base, exitCode: 2 }, "boom")?.code).toBe("cli-failed");
    });

    it("fails an exit that never happened", () => {
        const failure = classifyRunFailure(
            { ...base, exitCode: null, signal: "SIGINT" },
            null,
        );
        expect(failure?.code).toBe("cli-failed");
        expect(failure?.message).toContain("could not be started");
    });

    it("fails a run that never said the maps were up to date", () => {
        expect(classifyRunFailure({ ...base, exitCode: 0, upToDate: false }, null)?.code).toBe(
            "cli-failed",
        );
    });
});

/* -------------------------------------------------------------------------- */
/* Cancellation                                                               */
/* -------------------------------------------------------------------------- */

describe("cancellation", () => {
    it("stops a running render and records that it was cancelled", async () => {
        const marker = join(root, "ran-to-completion.txt");
        const script = await fakeCli({
            lines: [
                "[12:36:13 INFO] Start updating 1 maps ...",
                "[12:36:23 INFO] updating map 'overworld': 8.535% (ETA: 3 minutes)",
            ],
            sleepMs: 60_000,
            marker,
        });

        const events: RenderEvent[] = [];
        const mounts = new LocalMapHandler();
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            mounts,
            spawn: spawnScript(script, []),
            onEvent: (event) => events.push(event),
        });

        const startedAt = Date.now();
        const running = orchestrator.render(request({ renderId: "stoppable" }));
        await new Promise<void>((resolve) => {
            const wait = setInterval(() => {
                if (events.some((event) => event.type === "progress")) {
                    clearInterval(wait);
                    resolve();
                }
            }, 10);
        });

        expect(orchestrator.cancel("stoppable")).toBe(true);
        const result = await running;

        expect(Date.now() - startedAt).toBeLessThan(10_000);
        expect(existsSync(marker)).toBe(false);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");

        // Cancelling is not an error, and is not reported as one.
        expect(events.some((event) => event.type === "cancelled")).toBe(true);
        expect(events.some((event) => event.type === "failed")).toBe(false);

        // A cancelled render is not mounted: its map is half-written, and serving it as
        // though it were finished shows torn terrain with no explanation.
        expect(mounts.getMount("stoppable")).toBeNull();

        const record = JSON.parse(
            await readFile(join(storageDir, "stoppable", "render.json"), "utf8"),
        ) as { outcome: string };
        expect(record.outcome).toBe("cancelled");

        expect(orchestrator.activeRenderIds()).toEqual([]);
    }, 30_000);

    it("cancelling an id that is not running says so rather than pretending", () => {
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
        });
        expect(orchestrator.cancel("nothing-here")).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Restoring earlier renders                                                  */
/* -------------------------------------------------------------------------- */

describe("mountExisting", () => {
    it("mounts a finished render from a previous session", async () => {
        const script = await fakeCli({ lines: COMPLETE_RENDER });
        const first = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, []),
        });
        await first.render(request({ renderId: "yesterday" }));

        const mounts = new LocalMapHandler();
        const relaunched = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.reject(new Error("not needed to mount")),
            mounts,
        });

        const record = await relaunched.mountExisting("yesterday");
        expect(record?.outcome).toBe("finished");
        expect(mounts.getMount("yesterday")?.engineLabel).toBe(
            "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
        );
        expect(await readdir(storageDir)).toContain("yesterday");
    }, 20_000);

    it("refuses to mount a render that never finished", async () => {
        const script = await fakeCli({ lines: ["[12:00:00 INFO] Start updating 0 maps ..."] });
        const mounts = new LocalMapHandler();
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            mounts,
            spawn: spawnScript(script, []),
        });
        await orchestrator.render(request({ renderId: "broken" }));

        expect(await orchestrator.mountExisting("broken")).toBeNull();
        expect(mounts.getMount("broken")).toBeNull();
        expect(await orchestrator.mountExisting("never-existed")).toBeNull();
    }, 20_000);
});

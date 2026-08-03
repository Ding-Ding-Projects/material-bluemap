import { spawn as nodeSpawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RenderOrchestrator } from "./orchestrator.js";
import type { ResolvedEngine } from "./orchestrator.js";
import {
    findInterruptedRenders,
    isResumable,
    observedStatus,
    planResume,
    reconcile,
    resumeRequestFor,
} from "./resume.js";
import type { SpawnCli } from "./runner.js";
import { RenderSessionStore, newRenderSession, readRenderSession, sessionFile } from "./session.js";
import type { RenderSession } from "./session.js";

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

const COMPLETE_RENDER = [
    "[12:35:09 INFO] Loading map 'overworld'...",
    "[12:35:09 INFO] Start updating 1 maps ...",
    "[12:35:19 INFO] updating map 'overworld': 100.0%",
    "[12:35:19 INFO] Your maps are now all up-to-date!",
];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-resume-"));
    storageDir = join(root, "maps");
    worldDir = join(root, "world");
    await mkdir(worldDir, { recursive: true });
    await mkdir(storageDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function session(overrides: Partial<RenderSession> = {}): RenderSession {
    return {
        ...newRenderSession({
            renderId: "world-abc123",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
            configDir: join(storageDir, "world-abc123", "config"),
            outputRoot: join(storageDir, "world-abc123", "web"),
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            startedAt: "2026-08-03T10:00:00.000Z",
            ownerInstance: "instance-a",
            ownerPid: 4242,
        }),
        ...overrides,
    };
}

/** A stand-in CLI: prints its lines, optionally lingers so it can be cancelled. */
async function fakeCli(lines: readonly string[], sleepMs?: number): Promise<string> {
    const script = join(root, `fake-${String(Math.random()).slice(2)}.mjs`);
    const body = [
        `const lines = ${JSON.stringify(lines)};`,
        "for (const line of lines) process.stdout.write(line + '\\n');",
        sleepMs === undefined
            ? "process.exit(0);"
            : `setTimeout(() => process.exit(0), ${String(sleepMs)});`,
    ];
    await writeFile(script, body.join("\n"), "utf8");
    return script;
}

function spawnScript(script: string): SpawnCli {
    return (_command, _args, options) =>
        nodeSpawn(process.execPath, [script], {
            cwd: options.cwd,
            env: options.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
}

/* -------------------------------------------------------------------------- */
/* Detecting a render whose app never came back                               */
/* -------------------------------------------------------------------------- */

describe("detecting an interrupted render", () => {
    it("reads a session still marked running by a previous launch as interrupted", () => {
        const stored = session({ status: "running", ownerInstance: "instance-a" });
        expect(observedStatus(stored, "instance-b")).toBe("interrupted");
        expect(isResumable(stored, "instance-b")).toBe(true);
    });

    it("leaves a render this launch is actually running alone", () => {
        const stored = session({ status: "running", ownerInstance: "instance-a" });
        expect(observedStatus(stored, "instance-a")).toBe("running");
        expect(isResumable(stored, "instance-a")).toBe(false);
    });

    it("writes the correction back so the file stops claiming it is running", async () => {
        const previous = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await previous.start({
            renderId: "world-abc123",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        // The app dies here. Nothing writes an ending.

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        const found = await findInterruptedRenders(relaunched);

        expect(found).toHaveLength(1);
        expect(found[0]?.summary.reason).toBe("process-gone");

        const onDisk = await readRenderSession(sessionFile(storageDir, "world-abc123"));
        expect(onDisk?.status).toBe("interrupted");
        expect(onDisk?.reason).toBe("process-gone");
    });

    it("is idempotent, so a second launch finds the same thing and changes nothing", async () => {
        const previous = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await previous.start({
            renderId: "r",
            maps: [{ id: "overworld", world: worldDir }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });

        const second = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        await findInterruptedRenders(second);
        const afterFirst = await readRenderSession(sessionFile(storageDir, "r"));

        const third = new RenderSessionStore({ storageDir, instanceId: "instance-c" });
        const found = await findInterruptedRenders(third);
        const afterSecond = await readRenderSession(sessionFile(storageDir, "r"));

        expect(found).toHaveLength(1);
        expect(afterSecond).toEqual(afterFirst);
    });

    it("does not offer a render that finished", async () => {
        const store = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await store.start({
            renderId: "r",
            maps: [{ id: "overworld", world: worldDir }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        await store.complete("r");

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        expect(await findInterruptedRenders(relaunched)).toEqual([]);
    });

    it("does not offer one that was declined, unless asked for it", async () => {
        const store = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await store.start({
            renderId: "r",
            maps: [{ id: "overworld", world: worldDir }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        await store.interrupt("r", "cancelled");
        await store.dismiss("r");

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        expect(await findInterruptedRenders(relaunched)).toEqual([]);
        expect(await findInterruptedRenders(relaunched, { includeDismissed: true })).toHaveLength(1);
    });

    it("does not reconcile a session that already ended", () => {
        const ended = session({ status: "interrupted", reason: "cancelled" });
        expect(reconcile(ended, "instance-b", "2026-08-03T11:00:00.000Z")).toBeNull();
    });

    it("keeps the last progress it saw, so the offer can say how far it got", async () => {
        const previous = new RenderSessionStore({
            storageDir,
            instanceId: "instance-a",
            progressIntervalMs: 0,
        });
        await previous.start({
            renderId: "r",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        await previous.progress("r", {
            kind: "updating-map",
            mapId: "overworld",
            description: "updating map 'overworld'",
            percent: 62.4,
            etaSeconds: 114,
            etaText: "1.9 minutes",
        });

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        const [found] = await findInterruptedRenders(relaunched);

        expect(found?.summary.percent).toBeCloseTo(62.4);
        expect(found?.summary.message).toContain("62.4%");
        expect(found?.summary.message).toContain("updating map 'overworld'");
        expect(found?.summary.engine).toBe("BlueMap engine (Java) 5.22-27 on Java 25.0.3");
    });
});

/* -------------------------------------------------------------------------- */
/* Cancelled is not crashed                                                   */
/* -------------------------------------------------------------------------- */

describe("cancelled against crashed", () => {
    it("keeps the reason, and says the right thing about each", async () => {
        const cancelledStore = new RenderSessionStore({ storageDir, instanceId: "a" });
        await cancelledStore.start({
            renderId: "cancelled-render",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        await cancelledStore.interrupt("cancelled-render", "cancelled");

        const crashedStore = new RenderSessionStore({ storageDir, instanceId: "a" });
        await crashedStore.start({
            renderId: "crashed-render",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        // No ending written: the app is gone.

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "b" });
        const found = await findInterruptedRenders(relaunched);
        const byId = new Map(found.map((entry) => [entry.summary.renderId, entry.summary]));

        expect(byId.get("cancelled-render")?.reason).toBe("cancelled");
        expect(byId.get("cancelled-render")?.message).toContain("You stopped rendering");
        expect(byId.get("crashed-render")?.reason).toBe("process-gone");
        expect(byId.get("crashed-render")?.message).toContain("was cut off");

        // Both are still offered: the tiles that finished are finished either way.
        expect(found).toHaveLength(2);
    });

    it("records a failure as its own reason, carrying the failure code", async () => {
        const store = new RenderSessionStore({ storageDir, instanceId: "a" });
        await store.start({
            renderId: "r",
            maps: [{ id: "overworld", world: worldDir }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        await store.interrupt("r", "failed", "cli-failed");

        const stored = await readRenderSession(sessionFile(storageDir, "r"));
        expect(stored?.reason).toBe("failed");
        expect(stored?.detail).toBe("cli-failed");
    });
});

/* -------------------------------------------------------------------------- */
/* Planning the resume                                                        */
/* -------------------------------------------------------------------------- */

describe("planResume", () => {
    it("re-runs the same maps and never asks for a full re-render", () => {
        const decision = planResume(session({ status: "interrupted", reason: "cancelled" }));
        expect(decision.ok).toBe(true);
        if (!decision.ok) return;

        expect(decision.request.renderId).toBe("world-abc123");
        expect(decision.request.force).toBe(false);
        expect(decision.request.maps).toEqual([
            {
                id: "overworld",
                world: worldDir,
                name: "Overworld",
                dimension: "minecraft:overworld",
            },
        ]);
    });

    it("refuses a render that finished, and says there is nothing to resume", () => {
        const decision = planResume(session({ status: "completed" }));
        expect(decision.ok).toBe(false);
        if (decision.ok) return;
        expect(decision.code).toBe("not-interrupted");
        expect(decision.message).toContain("finished");
    });

    it("refuses when there is no session at all", () => {
        const decision = planResume(null);
        expect(decision.ok).toBe(false);
        if (decision.ok) return;
        expect(decision.code).toBe("no-session");
    });

    it("refuses while the render is already going", () => {
        const decision = planResume(session({ status: "interrupted", reason: "cancelled" }), {
            running: true,
        });
        expect(decision.ok).toBe(false);
        if (decision.ok) return;
        expect(decision.code).toBe("already-running");
    });

    it("refuses a settings change, and explains what would happen if it did not", () => {
        const decision = planResume(session({ status: "interrupted", reason: "cancelled" }), {
            // The same map id, pointed at a different dimension since the render died.
            maps: [
                {
                    id: "overworld",
                    world: worldDir,
                    name: "Overworld",
                    dimension: "minecraft:the_nether",
                },
            ],
        });

        expect(decision.ok).toBe(false);
        if (decision.ok) return;
        expect(decision.code).toBe("config-changed");
        expect(decision.message).toContain("half one and half the other");
        expect(decision.message).toContain("start a fresh render");
    });

    it("allows a resume whose settings are unchanged", () => {
        const decision = planResume(session({ status: "interrupted", reason: "cancelled" }), {
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
        });
        expect(decision.ok).toBe(true);
    });

    it("builds a request that carries every map, not only the first", () => {
        const many = session({
            status: "interrupted",
            reason: "process-gone",
            maps: [
                { id: "overworld", world: worldDir, name: "Overworld", dimension: "minecraft:overworld" },
                { id: "nether", world: worldDir, name: "Nether", dimension: "minecraft:the_nether" },
            ],
        });
        expect(resumeRequestFor(many).maps).toHaveLength(2);
    });
});

/* -------------------------------------------------------------------------- */
/* Through the orchestrator, with a real child process                        */
/* -------------------------------------------------------------------------- */

describe("the orchestrator writes sessions a later launch can read", () => {
    it("marks a cancelled render interrupted, with the cancellation as its reason", async () => {
        const script = await fakeCli(
            [
                "[12:35:09 INFO] Start updating 1 maps ...",
                "[12:35:12 INFO] updating map 'overworld': 8.5% (ETA: 3 minutes)",
            ],
            30_000,
        );
        const sessions = new RenderSessionStore({
            storageDir,
            instanceId: "instance-a",
            progressIntervalMs: 0,
        });
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script),
            sessions,
        });

        const rendering = orchestrator.render({
            renderId: "cancel-me",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
        });

        // Wait until the session exists, then stop it the way a person would.
        for (let attempt = 0; attempt < 200; attempt++) {
            if (orchestrator.activeRenderIds().includes("cancel-me")) break;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        orchestrator.cancel("cancel-me");
        await rendering;

        const stored = await readRenderSession(sessionFile(storageDir, "cancel-me"));
        expect(stored?.status).toBe("interrupted");
        expect(stored?.reason).toBe("cancelled");

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        const [offered] = await findInterruptedRenders(relaunched);
        expect(offered?.summary.renderId).toBe("cancel-me");
        expect(offered?.summary.reason).toBe("cancelled");
    }, 20_000);

    it("marks a finished render completed, and offers nothing on the next launch", async () => {
        const script = await fakeCli(COMPLETE_RENDER);
        const sessions = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script),
            sessions,
        });

        const result = await orchestrator.render({
            renderId: "finish-me",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
        });
        expect(result.ok).toBe(true);

        const relaunched = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        expect(await findInterruptedRenders(relaunched)).toEqual([]);
    }, 20_000);

    it("resumes with the recorded settings and does not pass -f", async () => {
        const script = await fakeCli(COMPLETE_RENDER);
        const seen: string[][] = [];
        const sessions = new RenderSessionStore({ storageDir, instanceId: "instance-b" });
        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: (command, args, options) => {
                seen.push([command, ...args]);
                return spawnScript(script)(command, args, options);
            },
            sessions,
        });

        // A render left behind by a previous launch.
        const previous = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await previous.start({
            renderId: "carry-on",
            maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
            configDir: join(storageDir, "carry-on", "config"),
            outputRoot: join(storageDir, "carry-on", "web"),
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            startedAt: "2026-08-03T10:00:00.000Z",
        });

        const [interrupted] = await findInterruptedRenders(sessions);
        expect(interrupted).toBeDefined();
        const decision = planResume(interrupted?.session ?? null);
        expect(decision.ok).toBe(true);
        if (!decision.ok) return;

        const result = await orchestrator.render(decision.request);
        expect(result.ok).toBe(true);
        expect(seen[0]).toBeDefined();
        expect(seen[0]).not.toContain("-f");
        expect(seen[0]).toContain("-r");

        // And the session that was offered is now a completed one, so it is not offered
        // again on the launch after this.
        expect(await findInterruptedRenders(sessions)).toEqual([]);
    }, 20_000);
});

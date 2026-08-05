/**
 * Driving this package's own render orchestrator - `ensureJava`, the HOCON config
 * writer, `CliRun` and `provenance.ts` - end to end against a real JVM and a real
 * BlueMap CLI jar.
 *
 * Every other render test in this directory proves its logic against a mock. `runner.
 * test.ts` drives `CliRun` against a fake `spawn`; `config.test.ts` writes HOCON and
 * reads it back as text; `engine.test.ts` pins `upstreamJavaEngine` against mocked
 * `resolveCliJar` and `ensureJava`; `orchestrator.test.ts` drives `RenderOrchestrator`
 * with an injected `spawn`. All of that is real coverage of real logic, and none of it
 * has ever asked `RenderOrchestrator.render()` to actually find a JVM on a real
 * machine, launch it, wait for a real render to finish, and read back a `render.json`
 * it wrote to a real disk. CI's `test-world` job renders a real world with a real JVM
 * too, but by shelling out to `java -jar` directly - it proves the *engine*, not this
 * package's own orchestration of it.
 *
 * This is that missing proof. It generates a small synthetic world with
 * `packages/worldgen` (no Minecraft, nothing downloaded, deterministic), then asks a
 * real `RenderOrchestrator` - the exact class `main/index.ts` wires into the app - to
 * render it, with `resolveEngine: upstreamJavaEngine(...)` doing real JDK discovery
 * and a real jar lookup, and `CliRun` spawning a real `java -jar` child process no
 * differently than a person clicking Render would.
 *
 * ## Opt-in, like `packages/engine`'s `resourcepack-e2e.test.ts`
 *
 * Rendering triggers upstream's own first-run behaviour: the CLI downloads Mojang's
 * client jar for its textures the moment `accept-download: true` is in `core.conf` -
 * which `RenderOrchestrator.render()` always writes for a local render, once this
 * app's own `hasConsent()` gate (a separate, in-app question) has said yes. So running
 * this test is itself giving that consent on the runner's behalf, exactly as
 * `resourcepack-e2e.test.ts`'s `BLUEMAP_ACCEPT_DOWNLOAD` does. Two variables, not one,
 * so a `.env` file with an old `MBM_REAL_RENDER=1` left in it after a copy-paste can
 * never silently carry a consent that was only ever given once, deliberately.
 *
 * To run it by hand:
 *
 *   node tools/build-jars.mjs --only cli          # if vendor/BlueMap has no cli jar yet
 *   cd design
 *   MBM_REAL_RENDER=1 MBM_REAL_RENDER_CONSENT=1 npx vitest run \
 *     packages/app/src/main/render/orchestrator.realJvm.test.ts
 *
 * A JVM already on `PATH` or `JAVA_HOME` is used as found; nothing here provisions one
 * (see `provision.realNetwork.test.ts` in `../java/` for that half).
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderOrchestrator } from "./orchestrator.js";
import type { RenderEvent } from "./orchestrator.js";
import { renderWorkspace } from "./workspace.js";
import { readRenderRecord } from "./provenance.js";
import { upstreamJavaEngine } from "./engine.js";
import { findRepoRoot, resolveCliJar } from "../java/index.js";
import type { BlueMapJar } from "../java/index.js";

const here = dirname(fileURLToPath(import.meta.url));

function findCliJar(): BlueMapJar | null {
    try {
        return resolveCliJar();
    } catch {
        return null;
    }
}

function hasJava(): boolean {
    try {
        execFileSync("java", ["-version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

const cliJar = findCliJar();
const javaPresent = hasJava();
const runnable = cliJar !== null && javaPresent;

const RUN_ENV = "MBM_REAL_RENDER";
const CONSENT_ENV = "MBM_REAL_RENDER_CONSENT";
const runRequested = process.env[RUN_ENV] === "1";
const consentGiven = process.env[CONSENT_ENV] === "1";
const shouldRun = runnable && runRequested && consentGiven;

if (!shouldRun) {
    // Printed at collection time, before any test runner output can bury it: a proof
    // that never ran must never be mistakable for one that passed quietly.
    const reasons: string[] = [];
    if (!runnable) {
        reasons.push(
            cliJar === null
                ? "no BlueMap CLI jar was found (build one with: node tools/build-jars.mjs --only cli)"
                : "no `java` was found on PATH",
        );
    }
    if (runnable && !(runRequested && consentGiven)) {
        reasons.push(
            `opt-in not given (set ${RUN_ENV}=1 and ${CONSENT_ENV}=1; currently ` +
                `${RUN_ENV}=${process.env[RUN_ENV] ?? "<unset>"}, ${CONSENT_ENV}=${process.env[CONSENT_ENV] ?? "<unset>"})`,
        );
    }
    console.info(
        `[orchestrator.realJvm] The real-JVM render through RenderOrchestrator DID NOT RUN: ${reasons.join("; ")}.`,
    );
}

describe.skipIf(!shouldRun)("RenderOrchestrator against a real JVM and a real jar", () => {
    it(
        "renders a real generated world through ensureJava -> config writer -> runner -> provenance, not by invoking the jar directly",
        { timeout: 5 * 60 * 1000 },
        async () => {
            const workspace = mkdtempSync(join(tmpdir(), "material-bluemap-real-jvm-"));
            const worldOut = join(workspace, "world-out");
            const storageDir = join(workspace, "renders");
            const javaDataDir = join(workspace, "app-data");
            mkdirSync(worldOut, { recursive: true });
            mkdirSync(storageDir, { recursive: true });
            mkdirSync(javaDataDir, { recursive: true });

            try {
                // A small, fast-rendering world - this is a proof that the orchestrator's
                // own wiring works end to end, not a second copy of the 1000x1000 figures
                // the article already cites from CI and the hand-built jar.
                const repoRoot = findRepoRoot(here);
                expect(repoRoot, "repo root (vendor/BlueMap/settings.gradle.kts) was not found").not.toBeNull();
                const worldgenCli = join(repoRoot as string, "design", "packages", "worldgen", "dist", "cli.js");

                const seed = 918273;
                execFileSync(
                    "node",
                    [worldgenCli, "--seed", String(seed), "--size", "128", "--out", worldOut, "--no-zip", "--quiet"],
                    { stdio: "inherit" },
                );

                const worldName = readdirSync(worldOut).find((entry) => entry.startsWith("test-world-seed-"));
                expect(worldName, `no test-world-seed-* folder under ${worldOut}`).toBeDefined();
                const worldFolder = join(worldOut, worldName as string);

                const events: RenderEvent[] = [];
                const orchestrator = new RenderOrchestrator({
                    storageDir,
                    // This app's own consent gate, distinct from BlueMap's own
                    // accept-download the orchestrator writes into core.conf - see the
                    // file header on why running this test at all is the real consent.
                    hasConsent: () => true,
                    resolveEngine: upstreamJavaEngine({ dataDir: javaDataDir }),
                    onEvent: (event) => events.push(event),
                });

                const result = await orchestrator.render({
                    maps: [{ id: "overworld", world: worldFolder, name: "Overworld" }],
                });

                if (!result.ok) {
                    throw new Error(
                        `Real-JVM render failed: ${result.failure.code} - ${result.failure.message}`,
                    );
                }

                expect(result.ok).toBe(true);
                expect(result.engine.id).toBe("upstream-java");
                expect(result.record.engine).toBe("upstream-java");
                expect(result.record.outcome).toBe("finished");
                expect(result.record.javaVersion).not.toBeNull();

                // The record on disk, not only the in-memory value returned above: this
                // is what a later launch of the app reads back to mount the render and
                // to answer "what rendered this" months later.
                const ws = renderWorkspace(storageDir, result.renderId);
                const onDisk = await readRenderRecord(ws.recordFile);
                expect(onDisk).not.toBeNull();
                expect(onDisk?.engine).toBe("upstream-java");
                expect(onDisk?.outcome).toBe("finished");

                // Real tiles, real bytes, produced by the app's own config writer and
                // runner rather than a hand-invoked `java -jar`. Hires geometry lands at
                // `tiles/0/x<n>/z<n>.prbm.gz`; `tiles/1`, `2`, ... hold the lowres images -
                // the same layout `test-world`'s CI job counts with `find ... -name
                // '*.prbm*'`.
                const mapStorage = join(ws.storageRoot, "overworld");
                expect(statSync(mapStorage).isDirectory()).toBe(true);
                const tilesRoot = join(mapStorage, "tiles");
                expect(statSync(tilesRoot).isDirectory()).toBe(true);

                const countTiles = (dir: string): number => {
                    let count = 0;
                    for (const entry of readdirSync(dir, { withFileTypes: true })) {
                        const path = join(dir, entry.name);
                        if (entry.isDirectory()) {
                            count += countTiles(path);
                        } else if (entry.name.includes(".prbm")) {
                            count += 1;
                        }
                    }
                    return count;
                };
                const tileCount = countTiles(tilesRoot);
                expect(tileCount).toBeGreaterThan(0);

                // The lifecycle the interface actually reads events for.
                expect(events.some((event) => event.type === "started")).toBe(true);
                expect(events.some((event) => event.type === "finished")).toBe(true);
                expect(events.some((event) => event.type === "failed")).toBe(false);

                console.info(
                    `[orchestrator.realJvm] real render finished: engine ${result.engine.label}, ` +
                        `${String(tileCount)} hires tiles, ${String(result.durationMs)}ms, ` +
                        `renderId ${result.renderId}`,
                );
            } finally {
                rmSync(workspace, { recursive: true, force: true });
            }
        },
    );
});

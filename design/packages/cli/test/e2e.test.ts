/**
 * The end-to-end proof issue #42 asks for: run the real CLI entry against a fixture map
 * directory (a real `packages/worldgen`-generated world, a real self-authored resource
 * pack — see `test/fixtures/resourcePack.ts`), then actually curl a tile/settings route
 * off the server it starts.
 *
 * Two levels, on purpose:
 *
 *   1. `runCli` (in-process) — the real orchestration `index.ts` calls, minus the
 *      `process.exit` wrapper, so the render and the running server can be inspected and
 *      torn down cleanly from a test. This is the bulk of the coverage: render lifecycle,
 *      real routes, the render-trigger route, graceful server shutdown.
 *   2. One subprocess spawn of the actual built `dist/index.js` — the literal executable a
 *      user or the Dockerfile runs, shebang included. This needs `pnpm --filter
 *      @material-bluemap/cli run build` to have already produced `dist/`, the same
 *      constraint `tools/oracle`'s harness documents for the engine's own `dist/`
 *      ("a run measures whatever was last compiled, NOT what is in src/"); it is not
 *      rebuilt here because doing so on every test run would make this one test dominate
 *      the whole suite's running time.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWorld } from "@material-bluemap/worldgen";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, type CliResult } from "../src/cli.js";
import { writeFixtureResourcePack } from "./fixtures/resourcePack.js";

let root: string;
let originalCwd: string;
const cleanups: Array<() => Promise<void> | void> = [];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-cli-e2e-"));
    // `resolveConfigPath` deliberately resolves relative config values (the real default
    // webroot "web", the real default data folder "data") against process.cwd() — see its
    // own doc comment: this is upstream's real, documented "sharp edge" (design/HANDOFF.md),
    // reproduced faithfully rather than smoothed over. That means a genuine end-to-end run
    // MUST happen from inside the isolated temp root, or it writes "web"/"data" straight
    // into whatever directory happened to be current — which, run from this workspace's own
    // root, is this shared repository's own working tree. (Caught for real once already:
    // this test wrote a stray design/web/ before this chdir existed.)
    originalCwd = process.cwd();
    process.chdir(root);
});

afterEach(async () => {
    process.chdir(originalCwd);
    while (cleanups.length > 0) await cleanups.pop()!();
    await rm(root, { recursive: true, force: true });
});

/** Bootstraps a config folder, then points it at a real fixture world + resource pack. */
async function prepareFixtureConfig(): Promise<{ configFolder: string }> {
    const configFolder = join(root, "config");

    // phase 1: let the real CLI write its own defaults (this is the same "generate on an
    // empty folder" path config.test.ts covers in isolation)
    await runCli(["-c", configFolder], "0.0.0-test");

    // phase 2: point it at a real, tiny, worldgen-generated world and a real, self-authored
    // resource pack, so a render has something real to do without needing Minecraft or the
    // network. `ignore-missing-light-data: true` is a genuine, documented finding from
    // manually verifying this pipeline: worldgen's chunks report hasLightData() = true but
    // do not compute the same complete light propagation a real vanilla world's saved light
    // data has, and BlueMap's own strict default (`ignore-missing-light-data: false`) — this
    // CLI's honest, faithful default — skips meshing a chunk it cannot trust the light of.
    // That is not a bug in this CLI; it is upstream's real safety behaviour, applied
    // faithfully to a synthetic fixture that cannot fully satisfy it.
    const generated = await generateWorld({ seed: 991827, size: 16, outDir: join(root, "world-src") });
    const packDir = join(root, "config", "packs", "fixture");
    await writeFixtureResourcePack(packDir);

    // map ids (and so file stems) are lowercase — see config.ts's own note on
    // BlueMapConfigManager.MAPS_CONFIG_FOLDER_NAME + "/overworld" — only the map's
    // *display name* field inside the file is capitalised ("Overworld").
    const overworldConfPath = join(configFolder, "maps", "overworld.conf");
    const original = await readFile(overworldConfPath, "utf-8");
    const edited = original
        .replace(/world: "world"/, `world: "${generated.worldFolder.replace(/\\/g, "\\\\")}"`)
        .replace(/ignore-missing-light-data: false/, "ignore-missing-light-data: true");
    await writeFile(overworldConfPath, edited);

    // one map is enough for this proof; nether/end would each need their own world folder
    await rm(join(configFolder, "maps", "nether.conf"));
    await rm(join(configFolder, "maps", "end.conf"));

    return { configFolder };
}

async function teardown(result: CliResult): Promise<void> {
    await result.server?.close();
    if (result.renderManager !== null) {
        result.renderManager.stop();
        await result.renderManager.awaitShutdown();
    }
}

describe("e2e: runCli renders a real fixture map and serves real routes", () => {
    it("renders real hires tiles, then a separate -w run serves them and the render-trigger route", async () => {
        const { configFolder } = await prepareFixtureConfig();

        const renderResult = await runCli(["-c", configFolder, "-r"], "0.0.0-test");
        cleanups.push(() => teardown(renderResult));
        expect(renderResult.exitCode).toBe(0);
        expect(renderResult.server).toBeNull();

        // webroot defaults to "web", resolved against process.cwd() (root, via the chdir
        // above) — not against configFolder, matching resolveConfigPath's own documented
        // behaviour.
        expect(existsSync(join(root, "web", "settings.json"))).toBe(true);

        const serveResult = await runCli(["-c", configFolder, "-w"], "0.0.0-test");
        cleanups.push(() => teardown(serveResult));
        expect(serveResult.server).not.toBeNull();
        const server = serveResult.server!;
        const base = `http://127.0.0.1:${String(server.port)}`;
        // every route below gets a bounded timeout on purpose: this exact test caught a
        // real bug — a `-w`-only run built a RenderManager for RenderUpdateHandler but
        // never started its worker pool (only the `-r` render path did), so a POST to
        // /maps/{id}/update queued a task nothing would ever drain, and this test's own
        // final awaitIdle() hung for the full 30s suite timeout rather than failing fast
        // and naming which request never returned. Fixed in cli.ts; the timeouts stay as
        // a guard against the same class of regression reporting as an opaque suite hang.
        const fetchNow = (path: string, init?: RequestInit): Promise<Response> => fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5_000) });

        // the webapp's own top-level settings.json (a real, upstream-shaped document,
        // field for field, per WebFilesManager.Settings — see webapp.ts's own doc comment)
        const settingsResponse = await fetchNow("/settings.json");
        expect(settingsResponse.status).toBe(200);
        const settings = (await settingsResponse.json()) as { maps: string[] };
        expect(settings.maps).toEqual(["overworld"]);

        // the map's own settings.json, served through MapStorageHandler off a real MapStorage
        expect((await fetchNow("/maps/overworld/settings.json")).status).toBe(200);

        // a real hires tile the render above actually wrote (tile (0,0) sits inside the
        // one generated chunk; see packages/server's render-driver.test.ts for the same
        // "which tile" reasoning)
        const tileResponse = await fetchNow("/maps/overworld/tiles/0/x0/z0.prbm.gz");
        expect(tileResponse.status).toBe(200);
        expect((await tileResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

        // the webapp bundle itself (copy-webapp.mjs's real, upstream-licensed output)
        expect((await fetchNow("/index.html")).status).toBe(200);

        // live endpoints answer the honest "nothing live yet" stubs rather than 404ing
        expect(await (await fetchNow("/maps/overworld/live/players.json")).json()).toEqual({ players: [] });

        // the render-trigger route this CLI adds on top of upstream (RenderUpdateHandler):
        // GET reports real status, POST schedules a REAL, ACTUALLY-PROCESSED update
        const statusBefore = (await (await fetchNow("/maps/overworld/update")).json()) as { running: boolean };
        expect(typeof statusBefore.running).toBe("boolean");

        const triggerResponse = await fetchNow("/maps/overworld/update", { method: "POST" });
        expect(triggerResponse.status).toBe(202);
        expect(await triggerResponse.json()).toEqual({ scheduled: true });

        // an unmounted map id still 404s rather than falling through to the static handler
        expect((await fetchNow("/maps/does-not-exist/settings.json")).status).toBe(404);

        // proves the triggered update is not just queued but genuinely drains — the exact
        // thing the missing renderManager.start() above broke
        await serveResult.renderManager!.awaitIdle();
        expect(serveResult.renderManager!.getScheduledRenderTaskCount()).toBe(0);
    }, 30_000);
});

describe("e2e: the actual built executable (dist/index.js), spawned as a real subprocess", () => {
    const cliEntry = join(import.meta.dirname, "..", "dist", "index.js");
    const built = existsSync(cliEntry);

    function run(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [cliEntry, ...args], { cwd });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
            child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
            child.on("error", reject);
            child.on("close", (code) => resolve({ code, stdout, stderr }));
        });
    }

    it.skipIf(!built)("--help prints the real flag list and exits 0", async () => {
        const result = await run(["--help"], root);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("--render");
        expect(result.stdout).toContain("--webserver");
    });

    it.skipIf(!built)("no arguments generates a config folder and exits 1, never 0, having done nothing", async () => {
        const result = await run([], root);
        expect(result.code).toBe(1);
        expect(existsSync(join(root, "config", "core.conf"))).toBe(true);
    });

    it.skipIf(!built)("a genuinely unrecognised flag exits 1 with the parse error named", async () => {
        const result = await run(["--this-flag-does-not-exist"], root);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("this-flag-does-not-exist");
    });

    if (!built) {
        console.warn(`[e2e.test.ts] ${cliEntry} does not exist — run "pnpm --filter @material-bluemap/cli run build" first. Subprocess tests skipped, not passed.`);
    }
});

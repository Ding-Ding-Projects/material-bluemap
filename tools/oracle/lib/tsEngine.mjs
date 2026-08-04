/**
 * The ported half of the harness: run this project's TypeScript engine over the same
 * world, in its own process, and turn whatever comes back into a result the comparison
 * can reason about.
 *
 * The engine not being able to render yet is an ANSWER, not a crash. `render-ts.mjs`
 * reports `unavailable` with the exact missing exports, and that travels through here
 * unchanged so the report can say "the TypeScript engine produced no output" and name
 * why.
 *
 * ## The engine is compiled first, every run
 *
 * `render-ts.mjs` imports the engine's built `dist/`, because it runs as its own node
 * process and node does not read TypeScript. That means a run measures whatever was last
 * compiled, NOT what is in `src/` — and the two are different for exactly as long as
 * somebody is editing the mesher, which is the whole time this harness is useful.
 *
 * This has already cost a real diagnosis: a session fixed the textures-file number
 * spelling and the missing-chunk preload, re-ran the gate, and read back a report
 * byte-identical to the one from before the fixes — the same first-differing offset, the
 * same file sizes. The natural conclusion is "the fix did nothing", and the fix was fine;
 * `dist/` was three hours old. A harness whose failure mode is *silently grading the wrong
 * tree* is worse than one that refuses to run, so the build below is not a convenience.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { log, run } from "./util.mjs";

/**
 * Compiles the engine so the render below imports what `src/` currently says.
 *
 * A build failure is thrown rather than swallowed: `unavailable` means "the engine cannot
 * render yet", which is a fact about the port's progress that the report is entitled to
 * state calmly. Source that does not compile is a different thing entirely, and reporting
 * it as "produced no output" would hide a broken tree behind a sentence about Phase D.
 */
async function buildEngine(repoRoot) {
    log("[oracle] compiling the TypeScript engine (so this run grades src/, not a stale dist/)");
    const built = await run("pnpm", ["--filter", "./packages/engine", "run", "build"], {
        cwd: join(repoRoot, "design"),
        capture: true,
        // `pnpm` is a `.cmd` shim on Windows, which CreateProcess will not run directly
        shell: process.platform === "win32",
    });
    if (built.code !== 0) {
        throw new Error(
            "the TypeScript engine does not compile, so there is nothing to grade:\n" +
                (built.stderr || built.stdout).trim(),
        );
    }
}

/**
 * @returns {Promise<{status: "rendered"|"unavailable"|"error", mapDirectory?: string,
 *                    tiles?: number, reason?: string, missing?: string[], stack?: string}>}
 */
export async function renderWithTypeScriptEngine({
    repoRoot,
    worldDirectory,
    workDirectory,
    mapId,
    mapName,
    dimension,
    clientJar,
}) {
    await buildEngine(repoRoot);

    const storageRoot = join(workDirectory, "ported", "web", "maps");
    await rm(join(workDirectory, "ported"), { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });

    const driver = join(repoRoot, "tools", "oracle", "render-ts.mjs");
    const engineEntry = join(repoRoot, "design", "packages", "engine", "dist", "index.js");

    const args = [
        driver,
        "--engine",
        engineEntry,
        "--world",
        worldDirectory,
        "--storage-root",
        storageRoot,
        "--map-id",
        mapId,
        "--map-name",
        mapName,
        "--dimension",
        dimension,
    ];
    if (clientJar !== null && clientJar !== undefined) args.push("--client-jar", clientJar);

    log("[oracle] rendering with the TypeScript engine");
    const result = await run(process.execPath, args, { capture: true });

    const line = result.stdout.trim().split("\n").filter(Boolean).pop();
    if (line === undefined) {
        return {
            status: "error",
            reason:
                `the TypeScript render driver exited ${result.code} without reporting a ` +
                `result${result.stderr.trim() === "" ? "" : ": " + lastLines(result.stderr, 5)}`,
            storageRoot,
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(line);
    } catch {
        return {
            status: "error",
            reason: `the TypeScript render driver printed something that is not json: ${line.slice(0, 400)}`,
            storageRoot,
        };
    }

    return {
        ...parsed,
        storageRoot,
        mapDirectory: parsed.mapDirectory ?? join(storageRoot, mapId),
    };
}

function lastLines(text, count) {
    const lines = text.trimEnd().split("\n");
    return lines.slice(Math.max(0, lines.length - count)).join(" | ");
}

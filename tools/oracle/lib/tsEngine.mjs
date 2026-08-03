/**
 * The ported half of the harness: run this project's TypeScript engine over the same
 * world, in its own process, and turn whatever comes back into a result the comparison
 * can reason about.
 *
 * The engine not being able to render yet is an ANSWER, not a crash. `render-ts.mjs`
 * reports `unavailable` with the exact missing exports, and that travels through here
 * unchanged so the report can say "the TypeScript engine produced no output" and name
 * why.
 */

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { log, run } from "./util.mjs";

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

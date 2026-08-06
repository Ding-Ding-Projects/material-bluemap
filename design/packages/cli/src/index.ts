#!/usr/bin/env node
/**
 * The standalone BlueMap server CLI's real executable entry point.
 *
 * Everything is in `cli.ts`/`config.ts`/`resources.ts`/`maps.ts`/`render.ts`/`webapp.ts`/
 * `serve.ts` so it can be exercised by a test without spawning a process — this file's own
 * job is exactly what upstream's `public static void main` does after computing a result:
 * decide the process's exit code, and set up the one thing a test harness should not have
 * to (signal handling for a running webserver).
 */

import { readFile } from "node:fs/promises";
import { runCli, type CliResult } from "./cli.js";

interface PackageJson {
    readonly version: string;
}

async function readAppVersion(): Promise<string> {
    const text = await readFile(new URL("../package.json", import.meta.url), "utf-8");
    return (JSON.parse(text) as PackageJson).version;
}

async function shutdown(result: CliResult): Promise<void> {
    // upstream: `BlueMapCLI`'s `shutdown` runnable closes the watchers before touching the
    // render manager — a watcher's `close()` only tears down its own file-watch and pending
    // timers, so order relative to the render manager does not matter here, but doing it
    // first keeps this in the same order as the Java source it mirrors.
    await result.watch?.close();
    await result.server?.close();
    if (result.renderManager !== null) {
        result.renderManager.stop();
        await result.renderManager.awaitShutdown();
    }
}

async function main(): Promise<void> {
    const appVersion = await readAppVersion();
    const result = await runCli(process.argv.slice(2), appVersion);

    if (result.server !== null || result.watch !== null) {
        // upstream: the webserver keeps the JVM alive on its own listening socket, and
        // `-u`/`--watch` keeps it alive on its `MapUpdateService` watcher threads; Node has
        // neither for a bare timer/watch-service, so an unref'd interval/timeout (see
        // `render.ts`) does not itself hold the event loop open — nothing needs to here,
        // since returning without calling `process.exit()` already leaves the event loop
        // running for as long as anything unref'd or ref'd is pending. This just makes
        // Ctrl+C / a container stop signal shut down cleanly instead of the process being
        // killed out from under an in-flight watch or render.
        const onSignal = (): void => {
            void shutdown(result).then(() => process.exit(0));
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
        return;
    }

    await shutdown(result);
    process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
    console.error("[bluemap-cli] unhandled error:", error);
    process.exitCode = 1;
});

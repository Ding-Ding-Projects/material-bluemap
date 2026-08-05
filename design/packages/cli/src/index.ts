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
    await result.server?.close();
    if (result.renderManager !== null) {
        result.renderManager.stop();
        await result.renderManager.awaitShutdown();
    }
}

async function main(): Promise<void> {
    const appVersion = await readAppVersion();
    const result = await runCli(process.argv.slice(2), appVersion);

    if (result.server !== null) {
        // upstream: the webserver keeps the JVM alive on its own listening socket; Node's
        // http.Server does the same automatically. This just makes Ctrl+C / a container
        // stop signal shut down cleanly instead of the socket being cut out from under it.
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

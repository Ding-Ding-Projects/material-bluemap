/**
 * A small stand-in for upstream's `Logger` (`core/src/main/java/.../core/logger/Logger.java`),
 * which is not ported anywhere in this monorepo yet. Upstream's CLI configures it before
 * anything else runs: `-b`/`--verbose` swaps the global logger for a colored console one,
 * `-l <file>`/`-a` add a file sink. This is a deliberately bounded reproduction of exactly
 * that surface — info/warning/error to stderr (never stdout, which `--version`/`--help`
 * and every command's own JSON/text output use), plus an optional append-or-truncate file
 * sink — not a general logging framework.
 */

import { appendFile, writeFile } from "node:fs/promises";

export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string, cause?: unknown): void;
}

function timestamp(): string {
    return new Date().toISOString();
}

/** Builds the CLI's logger: always writes to stderr, and to `logFile` when one is given. */
export function createLogger(options: { logFile?: string | null; append?: boolean } = {}): Logger {
    const logFile = options.logFile ?? null;
    let fileReady: Promise<void> | null = null;

    function toFile(line: string): void {
        if (logFile === null) return;
        fileReady ??= options.append === true ? Promise.resolve() : writeFile(logFile, "");
        fileReady = fileReady.then(() => appendFile(logFile, line + "\n")).catch((error: unknown) => {
            // A logging failure must never crash the process it is trying to describe.
            console.error(`[logger] failed to write to ${logFile}:`, error);
        });
    }

    function emit(level: string, message: string): void {
        const line = `[${timestamp()}] [${level}] ${message}`;
        console.error(line);
        toFile(line);
    }

    return {
        info: (message) => emit("INFO", message),
        warn: (message) => emit("WARN", message),
        error: (message, cause) => emit("ERROR", cause === undefined ? message : `${message} ${describeCause(cause)}`),
    };
}

function describeCause(cause: unknown): string {
    if (cause instanceof Error) return `- ${cause.message}`;
    return `- ${String(cause)}`;
}

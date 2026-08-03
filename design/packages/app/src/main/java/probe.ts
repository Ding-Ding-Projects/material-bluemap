/**
 * Asking a `java` executable what it is.
 *
 * The whole discovery layer routes through here so there is exactly one place that
 * knows the awkward details: that `-version` writes to stderr, that
 * `-XshowSettings:properties` is a non-standard flag some JVMs reject, and that an
 * executable which is missing, unreadable or not actually a JVM must come back as a
 * described rejection rather than an exception.
 *
 * The runner is injectable so tests never launch a process, and so a future
 * sandboxed or elevated launch path can be swapped in without touching the callers.
 */

import { execFile } from "node:child_process";
import type { JavaVersionInfo } from "./version.js";
import { parseJavaHome, parseJavaVersion } from "./version.js";

export interface JavaProbeOutput {
    /** True when the process ran and exited 0. */
    readonly ok: boolean;
    readonly stdout: string;
    readonly stderr: string;
    /** Why the launch itself failed (ENOENT, EACCES, a non-zero exit), or null. */
    readonly error: string | null;
}

/** Runs `executable` with `args` and reports what came back. Never throws. */
export type JavaRunner = (
    executable: string,
    args: readonly string[],
) => Promise<JavaProbeOutput>;

/**
 * How long a version probe is given before it is treated as a failure.
 *
 * A JVM prints its version in milliseconds. A probe that has not answered in ten
 * seconds is a broken install, a stale network mount or a binary waiting on
 * something that will never arrive, and hanging the app's startup on it is worse
 * than reporting the candidate as unusable.
 */
export const PROBE_TIMEOUT_MS = 10_000;

/** The default runner: a real child process, with a bounded wait and bounded output. */
export const execFileRunner: JavaRunner = (executable, args) =>
    new Promise<JavaProbeOutput>((resolve) => {
        execFile(
            executable,
            [...args],
            { timeout: PROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
            (error, stdout, stderr) => {
                resolve({
                    ok: error === null,
                    stdout: typeof stdout === "string" ? stdout : "",
                    stderr: typeof stderr === "string" ? stderr : "",
                    error: error === null ? null : error.message,
                });
            },
        );
    });

export interface JavaProbeReport {
    readonly executable: string;
    /** Null when the executable could not be identified as a JVM. */
    readonly version: JavaVersionInfo | null;
    /** The JVM's own `java.home`, when it was willing to say. */
    readonly home: string | null;
    /** Null on success; otherwise a sentence naming what went wrong. */
    readonly failure: string | null;
}

/** Keeps a failure message readable when a JVM decides to print a stack trace. */
function firstLines(text: string, count = 3): string {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, count)
        .join(" | ");
}

/**
 * Identifies a `java` executable.
 *
 * Two invocations, in this order:
 *
 * 1. `-XshowSettings:properties -version`, which prints the version *and* the
 *    JVM's own `java.home`. One launch answers both questions, and `java.home` is
 *    the only trustworthy way to find the home of a `java` reached through `PATH`,
 *    a symlink or a version-manager shim.
 * 2. plain `-version`, if the first is refused. `-XshowSettings` is a `-X` extension
 *    rather than a specification-mandated flag, so a JVM is entitled not to have it,
 *    and losing the home is much better than rejecting a working JDK over a flag.
 */
export async function probeJava(
    executable: string,
    runner: JavaRunner = execFileRunner,
): Promise<JavaProbeReport> {
    const detailed = await runner(executable, ["-XshowSettings:properties", "-version"]);
    const detailedOutput = `${detailed.stderr}\n${detailed.stdout}`;
    const detailedVersion = parseJavaVersion(detailedOutput);
    if (detailedVersion !== null) {
        return {
            executable,
            version: detailedVersion,
            home: parseJavaHome(detailedOutput),
            failure: null,
        };
    }

    const plain = await runner(executable, ["-version"]);
    const plainOutput = `${plain.stderr}\n${plain.stdout}`;
    const plainVersion = parseJavaVersion(plainOutput);
    if (plainVersion !== null) {
        return { executable, version: plainVersion, home: null, failure: null };
    }

    // Report the launch failure when there was one, because "ENOENT" and "printed
    // something that is not a version" are different problems with different fixes.
    if (plain.error !== null) {
        return {
            executable,
            version: null,
            home: null,
            failure: `could not be run (${plain.error})`,
        };
    }

    const noise = firstLines(plainOutput);
    return {
        executable,
        version: null,
        home: null,
        failure:
            noise.length === 0
                ? "ran but printed no version"
                : `ran but printed no recognizable version: ${noise}`,
    };
}

/**
 * Finding a usable JVM on whatever machine the app happens to be running on.
 *
 * The order is `JAVA_HOME`, then `java` on `PATH`, then the copy the app provisioned
 * for itself, and it is that way round on purpose. Someone who has set `JAVA_HOME`
 * has told their whole machine which JDK to use, and an application that quietly
 * prefers its own private copy over that instruction is overriding a decision it was
 * not asked to make. The app's own copy is the last resort precisely because it is
 * the one nobody chose.
 *
 * Every candidate is *run* before it is accepted. A path is not evidence: `JAVA_HOME`
 * outlives the JDK it pointed at, a `java` on `PATH` may be a shim for a version
 * manager that resolves differently per directory, and a folder named `jdk-25` can
 * contain a JDK 17. Nothing here concludes anything from a name.
 *
 * Rejections are collected rather than discarded. When no JVM is suitable the caller
 * needs to say *why* — "JAVA_HOME points at Java 17" is actionable, "no Java found"
 * on a machine with three JDKs installed is baffling.
 */

import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

/**
 * Path handling for the platform being asked about, not the one we are running on.
 *
 * These functions take a `platform` argument, so they must not use node's native
 * `join` and `delimiter`. On Linux the native delimiter is `:`, which splits a
 * Windows `PATH` straight through its drive letters: `C:\jdkin` becomes `C` and
 * `\jdkin`, and every candidate is nonsense. It is latent in the app, which only
 * ever asks about the platform it is on, but it made the tests pass on Windows and
 * fail on the CI runner, and a function that ignores its own parameter is a trap
 * for whoever calls it next.
 */
function pathApi(platform: NodeJS.Platform): { join: (...parts: string[]) => string; delimiter: string } {
    return platform === "win32"
        ? { join: (...parts) => win32.join(...parts), delimiter: win32.delimiter }
        : { join: (...parts) => posix.join(...parts), delimiter: posix.delimiter };
}
import type { JavaProbeReport, JavaRunner } from "./probe.js";
import { execFileRunner, probeJava } from "./probe.js";
import { provisionedJavaExecutable } from "./installation.js";
import type { JavaVersionInfo } from "./version.js";
import { REQUIRED_JAVA_FEATURE, satisfiesRequirement, tooOldReason } from "./version.js";

/** Where a JVM came from. Reported to the user so the choice is never a mystery. */
export type JavaSource = "JAVA_HOME" | "PATH" | "provisioned";

export interface JavaInstallation {
    readonly source: JavaSource;
    readonly executable: string;
    /** The JVM's own `java.home`, when it reported one. */
    readonly home: string | null;
    readonly version: JavaVersionInfo;
}

export interface JavaRejection {
    readonly source: JavaSource;
    readonly executable: string;
    /** A sentence, not a code: it goes straight into a message a person reads. */
    readonly reason: string;
}

export interface JavaDiscovery {
    /** The first candidate that ran and was new enough, or null. */
    readonly installation: JavaInstallation | null;
    /** Every candidate that was looked at and turned down, in the order tried. */
    readonly rejected: readonly JavaRejection[];
    /** The feature version that was being required, so a message can quote it. */
    readonly required: number;
}

export interface DiscoverJavaOptions {
    /** `userData`. Only needed to find a previously provisioned copy. */
    readonly dataDir?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly required?: number;
    /** Injected in tests so no process is ever launched. */
    readonly runner?: JavaRunner;
    /** Injected in tests so no filesystem is ever touched. */
    readonly exists?: (path: string) => boolean;
}

interface Candidate {
    readonly source: JavaSource;
    readonly executable: string;
}

function executableName(platform: NodeJS.Platform): string {
    return platform === "win32" ? "java.exe" : "java";
}

/**
 * `PATH` is case-insensitive on Windows and Node preserves whatever case the process
 * was given, so `env.PATH` alone misses a `Path` that was set by the shell.
 */
function pathVariable(env: NodeJS.ProcessEnv): string {
    for (const [key, value] of Object.entries(env)) {
        if (key.toLowerCase() === "path" && typeof value === "string") return value;
    }
    return "";
}

/**
 * Resolves `java` on `PATH` by walking the entries rather than by launching the bare
 * name and letting the OS resolve it.
 *
 * Two reasons. The resolved absolute path is worth reporting — "which java is it
 * going to use" is the first question anyone asks when a render behaves oddly. And
 * launching a bare command name on Windows searches the current directory in some
 * configurations, which is a way to run a `java.exe` that a downloaded archive
 * happened to leave in the working directory.
 */
export function javaOnPath(
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
    exists: (path: string) => boolean,
): string | null {
    const name = executableName(platform);
    const path = pathApi(platform);
    for (const entry of pathVariable(env).split(path.delimiter)) {
        const directory = entry.trim().replace(/^"(.*)"$/, "$1");
        if (directory.length === 0) continue;
        const candidate = path.join(directory, name);
        if (exists(candidate)) return candidate;
    }
    return null;
}

/** The `java` a `JAVA_HOME` points at, if that path exists at all. */
export function javaFromHome(
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
    exists: (path: string) => boolean,
): { executable: string; missing: string | null } | null {
    const home = env["JAVA_HOME"];
    if (typeof home !== "string" || home.trim().length === 0) return null;

    const executable = pathApi(platform).join(home.trim(), "bin", executableName(platform));
    if (!exists(executable)) return { executable, missing: home.trim() };
    return { executable, missing: null };
}

function toRejection(source: JavaSource, report: JavaProbeReport, required: number): JavaRejection {
    if (report.version === null) {
        return {
            source,
            executable: report.executable,
            reason: report.failure ?? "could not be identified as a Java runtime",
        };
    }
    return {
        source,
        executable: report.executable,
        reason: tooOldReason(report.version, required),
    };
}

/**
 * Runs the search.
 *
 * Stops at the first candidate that is new enough; everything tried before it is
 * returned as a rejection so the caller can explain the outcome either way. Never
 * downloads anything: provisioning is a separate, explicitly requested step, because
 * a couple of hundred megabytes should not leave the machine as a side effect of
 * looking for something.
 */
export async function discoverJava(options: DiscoverJavaOptions = {}): Promise<JavaDiscovery> {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const required = options.required ?? REQUIRED_JAVA_FEATURE;
    const runner = options.runner ?? execFileRunner;
    const exists = options.exists ?? existsSync;

    const candidates: Candidate[] = [];
    const rejected: JavaRejection[] = [];

    const fromHome = javaFromHome(env, platform, exists);
    if (fromHome !== null) {
        if (fromHome.missing !== null) {
            // Worth its own rejection rather than silence: a stale JAVA_HOME is a
            // machine-configuration problem the user can fix in one step, and it is
            // invisible if the app just moves on to PATH and works anyway.
            rejected.push({
                source: "JAVA_HOME",
                executable: fromHome.executable,
                reason: `JAVA_HOME is set to ${fromHome.missing} but there is no java executable there`,
            });
        } else {
            candidates.push({ source: "JAVA_HOME", executable: fromHome.executable });
        }
    }

    const onPath = javaOnPath(env, platform, exists);
    if (onPath !== null) candidates.push({ source: "PATH", executable: onPath });

    if (options.dataDir !== undefined) {
        const provisioned = provisionedJavaExecutable(options.dataDir, exists);
        if (provisioned !== null) candidates.push({ source: "provisioned", executable: provisioned });
    }

    const seen = new Set<string>();
    for (const candidate of candidates) {
        // The same JDK routinely appears as both JAVA_HOME and PATH. Probing it twice
        // doubles startup cost and produces two identical rejection lines.
        if (seen.has(candidate.executable)) continue;
        seen.add(candidate.executable);

        const report = await probeJava(candidate.executable, runner);
        if (report.version !== null && satisfiesRequirement(report.version, required)) {
            return {
                installation: {
                    source: candidate.source,
                    executable: candidate.executable,
                    home: report.home,
                    version: report.version,
                },
                rejected,
                required,
            };
        }
        rejected.push(toRejection(candidate.source, report, required));
    }

    return { installation: null, rejected, required };
}

/** Renders a discovery failure as something a person can act on. */
export function describeDiscoveryFailure(discovery: JavaDiscovery): string {
    const head = `No Java ${String(discovery.required)} or newer was found.`;
    if (discovery.rejected.length === 0) {
        return `${head} JAVA_HOME is not set and no java executable is on PATH.`;
    }
    const lines = discovery.rejected.map(
        (rejection) => `  ${rejection.source}: ${rejection.executable} - ${rejection.reason}`,
    );
    return `${head} Checked:\n${lines.join("\n")}`;
}

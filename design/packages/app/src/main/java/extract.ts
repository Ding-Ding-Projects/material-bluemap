/**
 * Unpacking a JDK archive without ever leaving something that looks finished but is not.
 *
 * Extraction is the step where a cancelled download does its real damage. If bytes go
 * straight into the final directory, an interrupted run leaves a tree that has a
 * `bin/java` in it and is missing half of `lib`, which then fails at launch with a
 * linker error that has nothing to do with the actual cause. So extraction happens
 * into a sibling staging directory, the result is checked for a real `bin/java`, and
 * only then is it moved into place with a rename. A rename on one filesystem is
 * atomic, so the destination either does not exist or is complete.
 *
 * Stale staging directories from earlier interrupted runs are swept before each
 * attempt, because "resumable" must not mean "accumulates a 400 MB directory per
 * failed try".
 *
 * `tar` does the unpacking on every platform. Windows 10 1803 and later ship bsdtar
 * as `System32\tar.exe`, and bsdtar reads zip as well as tar.gz, so one code path
 * covers Temurin's `.zip` on Windows and `.tar.gz` everywhere else with no archive
 * library in the dependency tree. The Windows path is resolved through `SystemRoot`
 * rather than through `PATH`: a machine with Git or MSYS installed has a GNU `tar`
 * on `PATH` in some shells, and GNU tar cannot read zip at all.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { javaExecutableIn } from "./installation.js";

export interface CommandResult {
    readonly ok: boolean;
    readonly stdout: string;
    readonly stderr: string;
    readonly error: string | null;
}

export type CommandRunner = (
    command: string,
    args: readonly string[],
    cwd: string,
) => Promise<CommandResult>;

/** Extraction of a 200 MB archive on a slow disk. Generous, but not unbounded. */
export const EXTRACT_TIMEOUT_MS = 10 * 60 * 1000;

export const execFileCommandRunner: CommandRunner = (command, args, cwd) =>
    new Promise<CommandResult>((resolve) => {
        execFile(
            command,
            [...args],
            { cwd, timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
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

/**
 * The `tar` to use.
 *
 * On Windows this is deliberately the absolute `System32\tar.exe` and not whatever
 * `PATH` resolves to, for the reason in the file header: the GNU tar that Git for
 * Windows and MSYS put on `PATH` cannot read the `.zip` Temurin publishes, and the
 * failure is a confusing "unrecognized archive format" rather than anything that
 * points at the real problem.
 */
export function tarExecutable(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
    exists: (path: string) => boolean = existsSync,
): string {
    if (platform !== "win32") return "tar";
    const systemRoot = env["SystemRoot"] ?? env["windir"] ?? "C:\\Windows";
    const bundled = join(systemRoot, "System32", "tar.exe");
    return exists(bundled) ? bundled : "tar";
}

export interface ExtractOptions {
    readonly platform?: NodeJS.Platform;
    readonly env?: NodeJS.ProcessEnv;
    readonly runCommand?: CommandRunner;
    readonly exists?: (path: string) => boolean;
}

/** Unpacks `archive` into an existing `destination` directory. */
export async function extractArchive(
    archive: string,
    destination: string,
    options: ExtractOptions = {},
): Promise<void> {
    const platform = options.platform ?? process.platform;
    const runCommand = options.runCommand ?? execFileCommandRunner;
    const tar = tarExecutable(platform, options.env ?? process.env, options.exists ?? existsSync);

    const result = await runCommand(tar, ["-xf", archive, "-C", destination], destination);
    if (!result.ok) {
        const detail = [result.error, result.stderr.trim()].filter(Boolean).join(": ");
        throw new Error(
            `Failed to extract ${basename(archive)} with ${tar}${detail.length === 0 ? "" : ` - ${detail}`}`,
        );
    }
}

export interface DirectoryReader {
    readonly exists: (path: string) => boolean;
    readonly readdir: (path: string) => string[];
    readonly isDirectory: (path: string) => boolean;
}

const nodeDirectoryReader: DirectoryReader = {
    exists: existsSync,
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => {
        try {
            return statSync(path).isDirectory();
        } catch {
            return false;
        }
    },
};

/**
 * Finds the JDK home inside a freshly extracted tree.
 *
 * Temurin archives wrap everything in a single versioned directory (`jdk-25.0.4+7/`),
 * and on macOS the home is another two levels down at `Contents/Home` because the
 * archive is an app bundle. Hard-coding either shape breaks on the other, and
 * hard-coding the version string breaks on the next patch release, so the tree is
 * searched for an actual `bin/java` instead.
 *
 * Returns null when there is no `bin/java` anywhere it looked, which is the signal
 * that the archive was not what it claimed to be. That has to fail loudly: an
 * extraction that produced no runnable JVM must never be renamed into place.
 */
export function findJavaHome(
    root: string,
    platform: NodeJS.Platform = process.platform,
    reader: DirectoryReader = nodeDirectoryReader,
): string | null {
    const looksLikeHome = (candidate: string): boolean =>
        reader.exists(javaExecutableIn(candidate, platform));

    if (looksLikeHome(root)) return root;

    for (const entry of reader.readdir(root)) {
        const child = join(root, entry);
        if (!reader.isDirectory(child)) continue;
        if (looksLikeHome(child)) return child;

        // macOS bundles: <root>/jdk-25.0.4+7/Contents/Home
        const bundleHome = join(child, "Contents", "Home");
        if (reader.isDirectory(bundleHome) && looksLikeHome(bundleHome)) return bundleHome;
    }
    return null;
}

/** The prefix every staging directory carries, so stale ones are recognizable. */
export const STAGING_PREFIX = ".incomplete-";

/**
 * Deletes staging directories left by interrupted runs.
 *
 * Only siblings of `destination` whose name is `<destination-name>.incomplete-*` are
 * touched, so nothing else in the app's data directory can be caught by this.
 */
export function sweepStagingDirectories(destination: string): string[] {
    const parent = dirname(destination);
    const prefix = `${basename(destination)}${STAGING_PREFIX}`;
    let entries: string[];
    try {
        entries = readdirSync(parent);
    } catch {
        return [];
    }

    const removed: string[] = [];
    for (const entry of entries) {
        if (!entry.startsWith(prefix)) continue;
        const path = join(parent, entry);
        rmSync(path, { recursive: true, force: true });
        removed.push(path);
    }
    return removed;
}

export interface InstallArchiveOptions extends ExtractOptions {
    /** Injected in tests; defaults to the real filesystem. */
    readonly reader?: DirectoryReader;
}

export interface InstalledArchive {
    /** The final JDK home, which now contains a real `bin/java`. */
    readonly home: string;
    /** Staging directories from earlier interrupted runs that were cleaned up. */
    readonly sweptStaging: readonly string[];
}

/**
 * Extracts an archive and installs it at `destination`, atomically.
 *
 * The sequence is: sweep stale staging, extract into fresh staging, locate a real
 * `bin/java`, remove any previous install, rename the located home into place, delete
 * the staging remainder. `destination` only ever comes into existence as a rename of
 * a tree that has already been shown to contain a runnable JVM.
 */
export async function installArchive(
    archive: string,
    destination: string,
    options: InstallArchiveOptions = {},
): Promise<InstalledArchive> {
    const platform = options.platform ?? process.platform;
    const reader = options.reader ?? nodeDirectoryReader;

    const sweptStaging = sweepStagingDirectories(destination);
    const staging = `${destination}${STAGING_PREFIX}${randomBytes(6).toString("hex")}`;
    mkdirSync(staging, { recursive: true });

    try {
        await extractArchive(archive, staging, options);

        const home = findJavaHome(staging, platform, reader);
        if (home === null) {
            throw new Error(
                `${basename(archive)} extracted without a bin/${platform === "win32" ? "java.exe" : "java"}; ` +
                    "the archive is not a JDK. Nothing was installed.",
            );
        }

        // Removing the old install is the one destructive moment, and it is deliberately
        // as late as possible: everything that could fail has already succeeded, so the
        // window in which neither the old nor the new install exists is a single rename.
        rmSync(destination, { recursive: true, force: true });
        mkdirSync(dirname(destination), { recursive: true });
        renameSync(home, destination);

        return { home: destination, sweptStaging };
    } finally {
        rmSync(staging, { recursive: true, force: true });
    }
}

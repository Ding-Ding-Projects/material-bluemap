/**
 * Moving a world's bytes from wherever Docker has them to a folder this app can render.
 *
 * Three ways in, from `resolve.ts`'s three routes:
 *
 * - `bind-direct` reads a host path straight off a filesystem - this machine's own, or a
 *   remote one through the same `FileTransfer` the SSH lane already built. Region files
 *   rarely change between renders, so this is genuinely incremental: `localIncrementalCopy`
 *   compares size and modification time and copies only what differs, and a remote fetch
 *   gets the same property for free from rsync's `-a`, which does the same comparison.
 * - `container-copy` and `volume-copy` go through `docker cp` or a disposable helper
 *   container - Docker's own read, not this app's - into a **staging** directory, and only
 *   the placement step from staging into the destination is incremental. That is an honest
 *   limitation, not an oversight: Docker has no notion of "copy only what changed," so the
 *   read itself is always whole. What incrementality buys here is that a scheduled render
 *   which finds a volume unchanged does not rewrite files downstream of the destination -
 *   a git-tracked copy, a render cache - even though the `docker cp` still ran.
 *
 * **Never deletes.** Every copy here only adds and updates files; nothing removes a file
 * from the destination that disappeared at the source. A world that shrank (a region pruned,
 * a dimension removed) leaves a stale file behind rather than losing data to a bug in a
 * comparison - the file is inert and the next full re-render is undisturbed by its presence.
 * This is also why no destructive-action gate is needed anywhere in this module: nothing
 * it does is destructive.
 */

import { mkdir, readdir, stat, copyFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { CommandRunner } from "../runtime/command.js";
import type { FileTransfer } from "../remote/transfer.js";
import { DEFAULT_DOCKER_IMAGE } from "../runtime/plan.js";
import * as failures from "./failure.js";
import type { DockerWorldFailure } from "./failure.js";

export interface CopyProgress {
    readonly filesDone: number;
    readonly filesTotal: number;
    readonly currentFile: string | null;
}

export interface CopyResult {
    readonly filesCopied: number;
    readonly filesUnchanged: number;
}

/**
 * Recursively copies `source` into `destination`, touching only files that are missing or
 * whose size or modification time differ. Both directories must already be reachable on this
 * process's own filesystem - this is the local half; a remote host goes through
 * `FileTransfer` instead (see {@link copyRemoteBindMount} below).
 */
export async function localIncrementalCopy(
    source: string,
    destination: string,
    onProgress?: (progress: CopyProgress) => void,
    signal?: AbortSignal,
): Promise<CopyResult> {
    const files = await listFiles(source);
    let filesCopied = 0;
    let filesUnchanged = 0;

    for (let index = 0; index < files.length; index++) {
        signal?.throwIfAborted();
        const relPath = files[index] as string;
        const from = join(source, relPath);
        const to = join(destination, relPath);
        onProgress?.({ filesDone: index, filesTotal: files.length, currentFile: relPath });

        const [sourceStat, destStat] = await Promise.all([stat(from), statOrNull(to)]);
        const unchanged =
            destStat !== null &&
            destStat.size === sourceStat.size &&
            sameModTime(destStat.mtimeMs, sourceStat.mtimeMs);
        if (unchanged) {
            filesUnchanged += 1;
            continue;
        }

        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, to);
        filesCopied += 1;
    }

    onProgress?.({ filesDone: files.length, filesTotal: files.length, currentFile: null });
    return { filesCopied, filesUnchanged };
}

/**
 * Two filesystems rarely agree to the millisecond - FAT-family and some copy tools round to
 * two seconds. A two-second window is loose enough to absorb that and tight enough that a
 * genuine edit, which is seconds to minutes away from the last fetch at the very least, is
 * never mistaken for a no-op.
 */
function sameModTime(a: number, b: number): boolean {
    return Math.abs(a - b) <= 2000;
}

async function statOrNull(path: string): Promise<Stats | null> {
    try {
        return await stat(path);
    } catch {
        return null;
    }
}

/** Every regular file under `root`, as paths relative to it. */
async function listFiles(root: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (directory: string): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const full = join(directory, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile()) {
                found.push(relative(root, full));
            }
        }
    };
    await walk(root);
    return found;
}

/**
 * A remote bind mount's host path, brought here through the same `FileTransfer` (rsync when
 * both ends have it, scp otherwise) the SSH render lane already built and tested. Reusing it
 * rather than a second implementation is the point: a world fetched this way gets the exact
 * same "resumable when rsync is there, honest about it when it is not" behaviour a render's
 * own transfer does.
 */
export async function copyRemoteBindMount(
    transfer: FileTransfer,
    remotePath: string,
    destination: string,
    onLine?: (line: string) => void,
    signal?: AbortSignal,
): Promise<void> {
    await mkdir(destination, { recursive: true });
    await transfer.downloadDirectory(remotePath, destination, {
        ...(onLine === undefined ? {} : { onLine }),
        ...(signal === undefined ? {} : { signal }),
    });
}

export interface DockerReadOptions {
    readonly runner: CommandRunner;
    readonly docker?: string;
}

/**
 * `docker cp <container>:<path> <staging>` - Docker's own read, which works whether the
 * container is running or stopped and regardless of storage driver, because it operates on
 * the container's filesystem view rather than on whatever backs it. The staging directory is
 * on **whichever machine `runner` runs on**: local for a local daemon, the remote host for
 * one reached over SSH, matching where `docker cp` itself executes.
 */
export async function dockerCopyToStaging(
    containerId: string,
    containerPath: string,
    stagingPath: string,
    options: DockerReadOptions,
    signal?: AbortSignal,
): Promise<DockerWorldFailure | null> {
    const docker = options.docker ?? "docker";
    // A trailing "/." copies the *contents* of containerPath into staging, matching the
    // contract every other copy in this module keeps: the source becomes the destination
    // rather than nesting one level inside it.
    const source = `${containerId}:${containerPath.endsWith("/") ? containerPath : `${containerPath}/`}.`;
    const output = await options.runner(docker, ["cp", source, stagingPath], {
        // A world copy is deliberately not a short probe. Cancellation, not the probe's
        // fifteen-second ceiling, owns how long this child may live.
        timeoutMs: 0,
        ...(signal === undefined ? {} : { signal }),
    });
    if (output.ok) return null;
    if (output.spawnError !== null)
        return failures.notInstalled(`There is no '${docker}' command to copy with.`);
    return failures.copyFailed(
        `'docker cp' could not read ${containerPath} from ${containerId}.`,
        firstLine(output.stderr),
    );
}

/**
 * The disposable-container idiom for a bare volume: bind the volume and a host staging
 * directory into one throwaway container and let a plain `cp -a` inside it do the copy, with
 * no pipe and no second command needed. Uses the same image renders already pull
 * ({@link DEFAULT_DOCKER_IMAGE}) so this never costs a second image download on a machine
 * that already renders with Docker.
 */
export async function volumeCopyToStaging(
    volumeName: string,
    stagingPath: string,
    options: DockerReadOptions & { readonly image?: string },
    signal?: AbortSignal,
): Promise<DockerWorldFailure | null> {
    const docker = options.docker ?? "docker";
    const image = options.image ?? DEFAULT_DOCKER_IMAGE;
    const output = await options.runner(
        docker,
        [
            "run",
            "--rm",
            "-v",
            `${volumeName}:/mb-source:ro`,
            "-v",
            `${stagingPath}:/mb-staging`,
            image,
            "sh",
            "-c",
            "cp -a /mb-source/. /mb-staging/",
        ],
        {
            timeoutMs: 0,
            ...(signal === undefined ? {} : { signal }),
        },
    );
    if (output.ok) return null;
    if (output.spawnError !== null)
        return failures.notInstalled(`There is no '${docker}' command to copy with.`);
    return failures.copyFailed(
        `Copying the volume '${volumeName}' failed.`,
        firstLine(output.stderr),
    );
}

function firstLine(text: string): string | null {
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    return line === undefined || line === "" ? null : line;
}

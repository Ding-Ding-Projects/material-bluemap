/**
 * Turning "this mount, on this container" into a place a world can actually be copied from.
 *
 * A bind mount's `Source` is a host path, but *whose* host is doing the arithmetic matters:
 *
 * - **a remote Linux Docker host, reached over SSH** - `Source` is a real path on that
 *   machine's own filesystem, reachable exactly as any other remote path is, through the
 *   `CommandRunner` and `FileTransfer` this module is handed.
 * - **a local daemon on this machine** - `Source` is a real path *only* when the daemon runs
 *   directly on the host OS. Docker Desktop on Windows runs containers inside a Linux VM, and
 *   a bind mount's `Source` there is frequently a path inside that VM (or written in a form
 *   this process cannot open), not a Windows path this process can `fs.stat`.
 * - **a named volume, anywhere** - its `Mountpoint` is the *daemon's* path, and reading it
 *   directly needs root on a native Linux host or is not reachable at all behind Desktop's
 *   VM.
 *
 * So nothing here trusts a reported path by assuming what kind of host produced it. Every
 * bind-mount source is **tried** directly - `fs.stat` locally, `test -d` over the remote
 * runner - and only trusted once that check answers yes. Everything else, and anything that
 * check answers no to, falls back to `docker cp`, which works identically regardless of
 * storage driver or host OS because Docker itself does the reading.
 */

import { stat } from "node:fs/promises";
import type { CommandRunner } from "../runtime/command.js";
import * as failures from "./failure.js";
import { inspectContainer, inspectVolume, type DockerContainerDetail, type DockerMount } from "./inventory.js";
import type { InventoryResult } from "./inventory.js";

/**
 * How a world will actually be read out.
 *
 * - `bind-direct`  the mount's host path answered a directory check, on whichever machine
 *                   is doing the asking. Read straight off that filesystem; no Docker
 *                   command touches the bytes at all.
 * - `container-copy`  a specific container has the world mounted (bind or volume) but its
 *                   host path is not directly reachable. `docker cp` reads it through the
 *                   container's filesystem view instead, whether or not that container is
 *                   running.
 * - `volume-copy`  a bare volume, named without reference to any particular container.
 *                   Nothing in the container's Mounts can be trusted here because there is
 *                   no container; a disposable helper container is started just long enough
 *                   to bind the volume and a staging directory together.
 */
export type DockerWorldRoute = "bind-direct" | "container-copy" | "volume-copy";

export interface DockerWorldCandidate {
    readonly route: DockerWorldRoute;
    readonly containerId: string | null;
    readonly containerName: string | null;
    readonly volumeName: string | null;
    /** Path inside the container or volume that the world is expected to be at. */
    readonly containerPath: string;
    /** The host path to read directly. Populated only when `route` is `"bind-direct"`. */
    readonly hostPath: string | null;
    /** Whether the owning container is running right now. False when there is no container (a bare volume). */
    readonly running: boolean;
}

export interface ResolveOptions {
    /** How Docker commands are run - local, or `sshCommandRunner(...)` for a remote host. */
    readonly runner?: CommandRunner;
    readonly docker?: string;
    /**
     * Checks whether a directory exists at the resolved side of the mount.
     *
     * Defaults to `fs.stat` for a local resolve. A remote resolve must supply one that runs
     * `test -d` through the same `CommandRunner` the Docker calls use - see
     * `remoteDirectoryExists` below - because `fs.stat` only ever looks at this machine.
     */
    readonly directoryExists?: (path: string) => Promise<boolean>;
}

async function localDirectoryExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/** A `directoryExists` check that runs `test -d` on the far end of `runner`, for a remote Docker host. */
export function remoteDirectoryExists(runner: CommandRunner): (path: string) => Promise<boolean> {
    return async (path: string): Promise<boolean> => {
        const output = await runner("test", ["-d", path], {});
        return output.ok;
    };
}

/** Every mount on a container that could plausibly be a Minecraft world: bind mounts and named volumes, never `tmpfs`. */
export function candidateMounts(detail: DockerContainerDetail): readonly DockerMount[] {
    return detail.mounts.filter((mount) => mount.type === "bind" || mount.type === "volume");
}

/** Resolves one container's mount into a candidate, choosing the route as described above. */
export async function resolveContainerMount(
    id: string,
    destination: string,
    options: ResolveOptions = {},
): Promise<InventoryResult<DockerWorldCandidate>> {
    const detail = await inspectContainer(id, { ...(options.runner === undefined ? {} : { runner: options.runner }), ...(options.docker === undefined ? {} : { docker: options.docker }) });
    if (!detail.ok) return detail;

    const mount = detail.value.mounts.find((entry) => entry.destination === destination);
    if (mount === undefined) {
        return {
            ok: false,
            failure: failures.invalidRequest(`'${detail.value.name}' has no mount at ${destination}.`),
        };
    }

    const directoryExists = options.directoryExists ?? localDirectoryExists;
    const hostPathReachable = mount.source !== "" && (await directoryExists(mount.source));

    return {
        ok: true,
        value: {
            route: hostPathReachable ? "bind-direct" : "container-copy",
            containerId: detail.value.id,
            containerName: detail.value.name,
            volumeName: mount.volumeName,
            containerPath: mount.destination,
            hostPath: hostPathReachable ? mount.source : null,
            running: detail.value.running,
        },
    };
}

/**
 * Resolves a bare volume - one picked without reference to any container - into a candidate.
 *
 * Always `volume-copy`: a volume's own `Mountpoint` is the *daemon's* path, and trusting it
 * as directly readable is exactly the assumption this module's own doc comment says not to
 * make. A helper container reads it instead; see `copy.ts`.
 */
export async function resolveVolume(
    name: string,
    options: ResolveOptions = {},
): Promise<InventoryResult<DockerWorldCandidate>> {
    const detail = await inspectVolume(name, { ...(options.runner === undefined ? {} : { runner: options.runner }), ...(options.docker === undefined ? {} : { docker: options.docker }) });
    if (!detail.ok) return detail;

    return {
        ok: true,
        value: {
            route: "volume-copy",
            containerId: null,
            containerName: null,
            volumeName: detail.value.name,
            containerPath: "/",
            hostPath: null,
            running: false,
        },
    };
}

/** One sentence naming the live-read risk, for a candidate whose `running` is true. Null otherwise. */
export function livenessWarning(candidate: DockerWorldCandidate): string | null {
    if (!candidate.running) return null;
    const who = candidate.containerName ?? "This container";
    return (
        `${who} is running right now. Reading its world while the server may be writing to it can ` +
        "produce a torn region file - one that opens without error and corrupts a render later, with " +
        "nothing at copy time to say so. Stop the server first, point this at a backup instead, or " +
        "accept that risk explicitly."
    );
}

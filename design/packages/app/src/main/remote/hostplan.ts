/**
 * Where a hosted map lives on the remote host, and the exact command that serves it.
 *
 * A remote render (`plan.ts`) sends a world, runs it through the engine, brings the tiles
 * home, and removes everything it staged. Hosting is the mirror image of the upload half and
 * the opposite of the cleanup half: the world still has to go there - the engine builds a
 * real `BmMap` on every start, `-w` included, and that construction opens the world's own
 * region files whether or not anything is re-rendered (see `packages/cli/src/maps.ts`,
 * `buildMaps`) - but the *tiles* travel too, in the other direction, and the container this
 * plan describes is never meant to stop on its own.
 *
 * The staging layout is exactly `plan.ts`'s: `remotePaths` and `remoteWorldPath` are reused
 * unchanged rather than restated, because they already describe the right shape -
 * `config/`, `data/`, `web/` (with `web/maps` the storage root), `worlds/<mapId>/`,
 * `cli.jar` - and a second copy of that arithmetic is a second place for the two to drift.
 * What is genuinely different is only:
 *
 * - the container is started detached (`-d --restart unless-stopped`), never `--rm`, because
 *   this one is meant to outlive the SSH session that started it, on purpose;
 * - a port is published, deliberately, to an address the caller chooses out loud;
 * - the engine runs `-w` rather than `-r -s`.
 */

import { CONTAINER_CONFIG_DIR, CONTAINER_DATA_DIR, CONTAINER_JAR, CONTAINER_WEB_ROOT, containerWorldPath, mountArgument, type BindMount } from "../runtime/mounts.js";
import { containerName, engineArguments } from "../runtime/plan.js";
import { remoteWorldPath, type RemoteRenderPaths } from "./plan.js";
import type { RemoteTarget } from "./target.js";

/** The port the engine listens on **inside** the container. Never the host-published one. */
export const REMOTE_HOSTING_CONTAINER_PORT = 8100;

/**
 * Where the docker daemon publishes the port, on the remote host's own interfaces.
 *
 * `loopback` is the safe default: the port only answers on `127.0.0.1` on the remote
 * machine, reachable from elsewhere only through an SSH tunnel (`ssh -L`) the person opens
 * themselves. `public` binds every interface (`0.0.0.0`) on that host, which is the whole
 * point of hosting a map for somebody else to see - and is a deliberate, informed choice,
 * never a default, because it puts the map straight on the internet over plain HTTP.
 */
export type RemoteHostingBindMode = "loopback" | "public";

export interface RemoteHostingPublish {
    /** The port on the remote host. Chosen by the person; never invented here. */
    readonly hostPort: number;
    readonly bindMode: RemoteHostingBindMode;
}

/** The address `docker run -p` binds to, on the remote host. */
export function publishBindAddress(publish: RemoteHostingPublish): string {
    return publish.bindMode === "loopback" ? "127.0.0.1" : "0.0.0.0";
}

/**
 * The container name for a hosted map. A different prefix from a render's own
 * ({@link containerName} from `runtime/plan.ts` is reused, not restated) so the two are never
 * confused in `docker ps` on a host that does both.
 */
export function remoteHostingContainerName(hostingId: string): string {
    return containerName("worldlens-host", hostingId);
}

export interface RemoteServeDockerRunOptions {
    readonly target: RemoteTarget;
    readonly paths: RemoteRenderPaths;
    readonly containerName: string;
    /** The map ids being served, in the order the config lists them. */
    readonly mapIds: readonly string[];
    readonly publish: RemoteHostingPublish;
    readonly jvmArgs?: readonly string[];
    /** `--user`, e.g. `1000:1000`. */
    readonly user?: string | null;
    readonly memory?: string | null;
}

/**
 * The whole `docker run` that starts (or restarts) a hosted map, as the remote shell will
 * receive it.
 *
 * `-d --restart unless-stopped`, never `--rm`: a hosted map is meant to keep answering after
 * this application closes and after the remote host reboots, until somebody deliberately
 * stops it. That is the one line in this function that a render's own
 * `remoteDockerRunArguments` could never share, because a render container living past the
 * render it belongs to is exactly the bug `--rm` exists to prevent there.
 *
 * The world is still mounted, read-only, for every map: the engine opens it on every start
 * (see this file's own top comment), `-w` included. The already-rendered tiles are mounted
 * read-write at `/bluemap/web`, because the upstream webapp writer touches files under there
 * even when nothing is re-rendered.
 */
export function remoteServeDockerRunArguments(options: RemoteServeDockerRunOptions): string[] {
    const { paths } = options;
    const mounts: BindMount[] = [
        { hostPath: paths.configDir, containerPath: CONTAINER_CONFIG_DIR, readOnly: false },
        { hostPath: paths.dataDir, containerPath: CONTAINER_DATA_DIR, readOnly: false },
        { hostPath: paths.webRoot, containerPath: CONTAINER_WEB_ROOT, readOnly: false },
        { hostPath: paths.jarPath, containerPath: CONTAINER_JAR, readOnly: true },
    ];
    for (const mapId of options.mapIds) {
        mounts.push({
            hostPath: remoteWorldPath(paths, mapId),
            containerPath: containerWorldPath(mapId),
            // Read-only, always - the same rule a render mounts a world under. Serving a map
            // never has a reason to write into somebody's save.
            readOnly: true,
        });
    }

    const bindIp = publishBindAddress(options.publish);
    const args: string[] = [
        options.target.docker,
        "run",
        "-d",
        "--restart",
        "unless-stopped",
        "--name",
        options.containerName,
    ];
    if (options.memory !== undefined && options.memory !== null && options.memory !== "") {
        args.push("-m", options.memory);
    }
    if (options.user !== undefined && options.user !== null && options.user !== "") {
        args.push("--user", options.user);
    }
    args.push("-p", `${bindIp}:${String(options.publish.hostPort)}:${String(REMOTE_HOSTING_CONTAINER_PORT)}`);
    for (const mount of mounts) args.push("-v", mountArgument(mount));
    args.push("-w", "/bluemap");
    args.push(options.target.image);
    args.push("java");
    args.push(
        ...engineArguments({
            role: "web-server",
            configDir: CONTAINER_CONFIG_DIR,
            jarPath: CONTAINER_JAR,
            ...(options.jvmArgs === undefined ? {} : { jvmArgs: options.jvmArgs }),
        }),
    );
    return args;
}

/**
 * Tears a hosted container down in one command: stops it if running, removes it either way.
 *
 * `docker rm -f` rather than `stop` followed by `rm`, for two reasons at once: it is one
 * round trip instead of two over a network that may be slow, and it is what makes both
 * "stop hosting" and "republish onto the same name" idempotent - a container that is already
 * gone, or was never started, answers the same "No such container" either command would, and
 * the caller treats that as success rather than a failure to report.
 */
export function remoteHostingTeardownArguments(target: RemoteTarget, name: string): string[] {
    return [target.docker, "rm", "-f", name];
}

/** `docker ps`, filtered to this one container, so its running state can be read back. */
export function remoteHostingStatusArguments(target: RemoteTarget, name: string): string[] {
    return [target.docker, "ps", "--filter", `name=^/${name}$`, "--format", "{{.Status}}"];
}

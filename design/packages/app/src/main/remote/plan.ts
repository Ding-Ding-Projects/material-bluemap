/**
 * Where a remote render's files live, and the exact command that renders them.
 *
 * Everything about the container is taken from `runtime/plan.ts` rather than restated:
 * the CLI flags (`engineArguments`), the container paths (`CONTAINER_CONFIG_DIR`,
 * `CONTAINER_JAR`, `containerWorldPath`), the `-v` spelling (`mountArgument`), the
 * container naming rule (`containerName`) and the polite stop (`stopContainerArguments`).
 * A remote render is a `docker run` on somebody else's machine, and a second opinion about
 * what that command should be is a second thing to get wrong.
 *
 * What is genuinely different is only this: the "host" paths in the mounts are paths on the
 * **remote** machine, so `runtime/mounts.ts`'s `requireMountSource` is deliberately not
 * called. That checker refuses `/home` and `/var` outright, which is correct for a laptop
 * being asked to share a folder with a container and wrong for a server whose accounts live
 * in exactly those places. `target.ts` applies the remote-appropriate rules instead, and
 * every path below is built from the work directory it already checked, so nothing here is
 * assembling a path out of anything a person typed.
 *
 * ```
 * <workDir>/<renderId>/
 *   config/    written here, uploaded, mounted at /bluemap/config
 *   data/      the client jar and the engine's logs, on the remote disk
 *   web/       the tiles. `web/maps` is what comes home.
 *   worlds/<mapId>/   the world, mounted read-only at /worlds/<mapId>
 *   cli.jar    the engine, mounted read-only at /bluemap/cli.jar
 * ```
 */

import {
    CONTAINER_CONFIG_DIR,
    CONTAINER_DATA_DIR,
    CONTAINER_JAR,
    CONTAINER_WEB_ROOT,
    containerWorldPath,
    mountArgument,
    type BindMount,
} from "../runtime/mounts.js";
import {
    DOCKER_STOP_GRACE_SECONDS,
    containerName,
    engineArguments,
    stopContainerArguments,
} from "../runtime/plan.js";
import type { RemoteTarget } from "./target.js";

export interface RemoteRenderPaths {
    /** `<workDir>/<renderId>` on the remote host. */
    readonly root: string;
    readonly configDir: string;
    readonly dataDir: string;
    readonly webRoot: string;
    /** `<webRoot>/maps`, which is the directory that comes home. */
    readonly storageRoot: string;
    readonly worldsDir: string;
    readonly jarPath: string;
}

/**
 * The staging layout for one render on one host.
 *
 * `workDir` must already be absolute - `preflight.ts` resolves `~` against the remote
 * account's real home before this is called, because a container bind mount cannot expand
 * a tilde and `docker run -v '~/x:/y'` silently creates a directory called `~`.
 */
export function remotePaths(workDir: string, renderId: string): RemoteRenderPaths {
    const root = `${workDir.replace(/\/+$/, "")}/${renderId}`;
    const webRoot = `${root}/web`;
    return {
        root,
        configDir: `${root}/config`,
        dataDir: `${root}/data`,
        webRoot,
        storageRoot: `${webRoot}/maps`,
        worldsDir: `${root}/worlds`,
        jarPath: `${root}/cli.jar`,
    };
}

/** Where one map's world folder is staged on the remote host. */
export function remoteWorldPath(paths: RemoteRenderPaths, mapId: string): string {
    return `${paths.worldsDir}/${mapId}`;
}

export interface RemoteDockerRunOptions {
    readonly target: RemoteTarget;
    readonly paths: RemoteRenderPaths;
    readonly containerName: string;
    /** The map ids being rendered, in the order the config lists them. */
    readonly mapIds: readonly string[];
    readonly jvmArgs?: readonly string[];
    readonly force?: boolean;
    readonly fixEdges?: boolean;
    /** `--user`, e.g. `1000:1000`. */
    readonly user?: string | null;
    readonly memory?: string | null;
}

/**
 * The whole `docker run`, as the remote shell will receive it.
 *
 * `--rm` and `--init` for the same reasons the local path uses them: no orphaned container
 * on a machine nobody is watching, and a real init at PID 1 so the daemon's SIGTERM
 * actually reaches the JVM when a render is cancelled. Without `--init` the JVM is PID 1,
 * ignores SIGTERM by default, and every cancellation waits out the full stop timeout before
 * the container is killed - losing the shutdown that saves the tiles already rendered.
 *
 * Nothing is published. A remote render has no web server: the tiles come home and are
 * served by this app, and opening a port on somebody's server as a side effect of pressing
 * Render is not a thing this app does.
 */
export function remoteDockerRunArguments(options: RemoteDockerRunOptions): string[] {
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
            // Read-only, always. A render reads chunks and writes tiles; nothing about it
            // should be able to write into a copy of somebody's save.
            readOnly: true,
        });
    }

    const args: string[] = [options.target.docker, "run", "--rm", "--init", "--name", options.containerName];
    if (options.memory !== undefined && options.memory !== null && options.memory !== "") {
        args.push("-m", options.memory);
    }
    if (options.user !== undefined && options.user !== null && options.user !== "") {
        args.push("--user", options.user);
    }
    for (const mount of mounts) args.push("-v", mountArgument(mount));
    args.push("-w", "/bluemap");
    args.push(options.target.image);
    args.push("java");
    args.push(
        ...engineArguments({
            role: "render",
            configDir: CONTAINER_CONFIG_DIR,
            jarPath: CONTAINER_JAR,
            ...(options.jvmArgs === undefined ? {} : { jvmArgs: options.jvmArgs }),
            ...(options.force === undefined ? {} : { force: options.force }),
            ...(options.fixEdges === undefined ? {} : { fixEdges: options.fixEdges }),
            maps: options.mapIds,
        }),
    );
    return args;
}

/**
 * The command that stops the container **on the remote daemon**.
 *
 * This is the whole of remote cancellation, and it is why cancelling has to be more than
 * dropping the SSH connection. Killing `ssh` kills the local client; the daemon on the
 * other machine owns the container's lifetime and never hears about it, so the JVM carries
 * on rendering into somebody's disk with nothing left holding a handle to it. Asking the
 * daemon is the only thing that actually stops it.
 */
export function remoteStopArguments(
    target: RemoteTarget,
    name: string,
    graceSeconds = DOCKER_STOP_GRACE_SECONDS,
): string[] {
    return [target.docker, ...stopContainerArguments(name, graceSeconds)];
}

/** The container name for a remote render. Prefixed so it is obvious on a shared host. */
export function remoteContainerName(renderId: string): string {
    return containerName("material-bluemap-remote", renderId);
}

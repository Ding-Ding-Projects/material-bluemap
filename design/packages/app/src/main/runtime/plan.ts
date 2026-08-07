/**
 * The exact command a render or a web server is started with, either way round.
 *
 * One shape, {@link EngineLaunch}, describes both: a `java -jar` on this machine and a
 * `docker run` that ends in the same `java -jar` inside a container. Everything
 * downstream - the process runner, the progress reader, cancellation, the failure
 * evidence - reads that shape and never asks which mode it came from. That is what makes
 * the promise in the documentation true rather than aspirational: progress, logs,
 * failures and cancellation cannot behave differently on the Docker path, because there
 * is no second path for them to behave differently on.
 *
 * ## What Docker changes, and what it does not
 *
 * It changes **isolation**: the container sees the world folder read-only, the output
 * folder, the config and the jar, and nothing else on this computer. It changes **which
 * Java runs**: the image supplies the JVM, so a machine with no JDK, or with one too old,
 * can still render. It changes **the version of everything else the JVM leans on** - libc,
 * fontconfig - which is occasionally the difference between a crash and a render.
 *
 * It does not make anything faster. The container runs on the same cores, reads the same
 * disk and gets the same memory; on Windows and macOS it runs inside a Linux virtual
 * machine, where the world folder is reached through a file-sharing layer, and a render
 * of a large world is usually *slower* than the same render run locally. Anybody choosing
 * Docker for speed has chosen it for the one thing it cannot do.
 *
 * ## Why the jar is mounted rather than baked into an image
 *
 * The engine this app runs is the jar built from the vendored upstream source that ships
 * beside it. Baking it into an image would mean building and versioning an image per
 * engine build, and would make "which engine rendered this map" a question about a
 * container tag. Mounting it read-only into a stock JRE image keeps one answer to that
 * question - the jar's own version - and means the image is interchangeable.
 */

import { posix } from "node:path";
import {
    CONTAINER_CONFIG_DIR,
    CONTAINER_JAR,
    containerWorldPath,
    mountArguments,
    requireMountSource,
    type BindMount,
    type MountSourceOptions,
} from "./mounts.js";

export type RuntimeMode = "local" | "docker";

/** What the engine is being started for. */
export type RuntimeRole = "render" | "web-server";

/**
 * Local, always, unless somebody chooses otherwise.
 *
 * Docker is opt-in because it is a second large dependency, because it is slower for the
 * common case, and because a default that silently requires a daemon is a default that
 * fails on most machines.
 */
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "local";

/**
 * The image a container run uses when nobody names one.
 *
 * A stock Temurin JRE at the feature version this app requires of a local JDK, so the two
 * paths run the same Java. A JRE rather than a JDK: the engine is a jar, nothing here
 * compiles, and the JRE image is roughly half the download.
 */
export const DEFAULT_DOCKER_IMAGE = "eclipse-temurin:25-jre";

/** How long `docker stop` waits for the JVM before the daemon kills the container. */
export const DOCKER_STOP_GRACE_SECONDS = 8;

export interface EngineLaunch {
    readonly mode: RuntimeMode;
    readonly role: RuntimeRole;
    /** The binary to spawn: the JVM locally, `docker` otherwise. */
    readonly command: string;
    readonly args: readonly string[];
    /** The working directory for the spawned process, on this machine. */
    readonly cwd: string;
    /** Empty for a local run. */
    readonly mounts: readonly BindMount[];
    /** The container's name, so it can be stopped by name. Null for a local run. */
    readonly containerName: string | null;
    /** The config folder as the *engine* sees it. */
    readonly engineConfigDir: string;
    /** The config folder on this machine, which is what the repair pass may edit. */
    readonly hostConfigDir: string;
    /**
     * Where a person can open the web server, from this machine.
     *
     * Null for a render. For a web server this is always a host address - never the
     * container's own - because a URL that only resolves inside a container is a URL
     * nobody can click.
     */
    readonly url: string | null;
    /** The port on this machine the web server answers on, or null for a render. */
    readonly hostPort: number | null;
}

/** The CLI flags for a role, in upstream's own spelling. */
export interface EngineArgumentOptions {
    readonly role: RuntimeRole;
    /** The config folder as the engine will see it. */
    readonly configDir: string;
    readonly jarPath: string;
    readonly jvmArgs?: readonly string[];
    /** Render only these map ids (`-m`). */
    readonly maps?: readonly string[];
    /** `-f`: re-render everything rather than only what changed. */
    readonly force?: boolean;
    /** `-e`: re-render map edges. */
    readonly fixEdges?: boolean;
}

/**
 * `java [jvmArgs] -jar <jar> -c <config> ...`, identical in both modes.
 *
 * `-r -s` renders and writes the webapp's `settings.json`; `-w` starts upstream's own web
 * server and blocks. `-g` is deliberately never passed in either role: it would unpack
 * upstream's webapp - its own `index.html`, bundle and `sql.php` - into the web root, and
 * this app ships its own viewer.
 */
export function engineArguments(options: EngineArgumentOptions): string[] {
    const args: string[] = [...(options.jvmArgs ?? [])];
    args.push("-jar", options.jarPath);
    args.push("-c", options.configDir);
    if (options.role === "render") {
        args.push("-r", "-s");
        if (options.force === true) args.push("-f");
        if (options.fixEdges === true) args.push("-e");
        if (options.maps !== undefined && options.maps.length > 0) {
            args.push("-m", options.maps.join(","));
        }
    } else {
        args.push("-w");
    }
    return args;
}

export interface LocalLaunchOptions extends EngineArgumentOptions {
    /** Absolute path to the `java` executable, from the Java toolchain layer. */
    readonly javaExecutable: string;
    /** The child's working directory. Never defaulted; see `render/workspace.ts`. */
    readonly cwd: string;
    /** For a web server: the loopback port it was configured to listen on. */
    readonly port?: number | null;
}

export function planLocalLaunch(options: LocalLaunchOptions): EngineLaunch {
    const port = options.port ?? null;
    return {
        mode: "local",
        role: options.role,
        command: options.javaExecutable,
        args: engineArguments(options),
        cwd: options.cwd,
        mounts: [],
        containerName: null,
        engineConfigDir: options.configDir,
        hostConfigDir: options.configDir,
        url: options.role === "web-server" && port !== null ? `http://127.0.0.1:${String(port)}/` : null,
        hostPort: options.role === "web-server" ? port : null,
    };
}

export interface DockerWorld {
    /** The map id, which is already validated as a safe path segment. */
    readonly mapId: string;
    readonly hostPath: string;
}

export interface DockerPublish {
    /** The port on this machine. */
    readonly hostPort: number;
    /** The port inside the container, which is what `webserver.conf` names. */
    readonly containerPort: number;
    /** Which host address to publish on. Loopback unless somebody asks for more. */
    readonly hostIp?: string;
}

export interface DockerLaunchOptions {
    readonly role: RuntimeRole;
    readonly image?: string;
    /** Must match Docker's own name grammar; see {@link containerName}. */
    readonly containerName: string;
    /** The engine jar on this machine. Mounted read-only. */
    readonly jarPath: string;
    /** The config folder written with *container* paths inside it. */
    readonly hostConfigDir: string;
    readonly hostDataDir: string;
    readonly hostWebRoot: string;
    readonly worlds: readonly DockerWorld[];
    readonly jvmArgs?: readonly string[];
    readonly maps?: readonly string[];
    readonly force?: boolean;
    readonly fixEdges?: boolean;
    readonly publish?: DockerPublish;
    /** `-m`, e.g. `4g`. Null leaves the container with the daemon's default. */
    readonly memory?: string | null;
    /**
     * `--user`, e.g. `1000:1000`.
     *
     * On Linux a container writing as root leaves root-owned tiles in a folder the
     * person's own account then cannot delete - a render that succeeds and leaves the
     * output unusable. On Windows and macOS the sharing layer maps ownership itself and
     * this is left null.
     */
    readonly user?: string | null;
    /** The `docker` binary. A parameter so a test can name one that does not exist. */
    readonly docker?: string;
    /** The working directory for the `docker` client itself, on this machine. */
    readonly cwd: string;
    readonly mountOptions?: MountSourceOptions;
}

/**
 * Builds the whole `docker run`, mounts included.
 *
 * Throws {@link MountRefusedError} when a folder may not be shared - a home directory, a
 * drive root, a system folder. That is a refusal rather than a silent omission on
 * purpose: quietly dropping a mount produces a container that starts, renders nothing and
 * reports a missing world, which sends somebody looking for a corrupt save.
 */
export function planDockerLaunch(options: DockerLaunchOptions): EngineLaunch {
    const mountOptions = options.mountOptions ?? {};
    const mounts: BindMount[] = [
        {
            hostPath: requireMountSource(options.hostConfigDir, mountOptions),
            containerPath: CONTAINER_CONFIG_DIR,
            // Read-write: upstream's config loader writes any file it finds missing, and
            // a read-only config folder turns that into a startup crash rather than a
            // default being filled in.
            readOnly: false,
        },
        {
            hostPath: requireMountSource(options.hostDataDir, mountOptions),
            containerPath: "/bluemap/data",
            readOnly: false,
        },
        {
            hostPath: requireMountSource(options.hostWebRoot, mountOptions),
            containerPath: "/bluemap/web",
            readOnly: false,
        },
        {
            // The jar is a file rather than a directory, and Docker binds a file just as
            // happily. Read-only, because nothing should ever write to the engine.
            hostPath: requireMountSource(options.jarPath, mountOptions),
            containerPath: CONTAINER_JAR,
            readOnly: true,
        },
    ];

    for (const world of options.worlds) {
        mounts.push({
            hostPath: requireMountSource(world.hostPath, mountOptions),
            containerPath: containerWorldPath(world.mapId),
            // Read-only, always. A render reads chunks and writes tiles; nothing about it
            // should be able to write into somebody's save.
            readOnly: true,
        });
    }

    const args: string[] = ["run", "--rm", "--name", options.containerName];

    // `--init` puts a real init process at PID 1, which is what forwards the daemon's
    // SIGTERM to the JVM on `docker stop`. Without it the JVM is PID 1, ignores SIGTERM
    // by default, and every cancellation waits out the full stop timeout before the
    // container is killed - losing the shutdown that saves the tiles already rendered.
    args.push("--init");

    if (options.memory !== undefined && options.memory !== null && options.memory !== "") {
        args.push("-m", options.memory);
    }
    if (options.user !== undefined && options.user !== null && options.user !== "") {
        args.push("--user", options.user);
    }

    const publish = options.publish;
    if (publish !== undefined) {
        // Bound to an address on this machine rather than published to every interface.
        // `-p 8100:8100` on a laptop in a cafe puts somebody's world map on the local
        // network; `-p 127.0.0.1:8100:8100` does not.
        const hostIp = publish.hostIp ?? "127.0.0.1";
        args.push("-p", `${hostIp}:${String(publish.hostPort)}:${String(publish.containerPort)}`);
    }

    args.push(...mountArguments(mounts));
    args.push("-w", "/bluemap");
    args.push(options.image ?? DEFAULT_DOCKER_IMAGE);
    args.push("java");
    args.push(
        ...engineArguments({
            role: options.role,
            configDir: CONTAINER_CONFIG_DIR,
            jarPath: CONTAINER_JAR,
            ...(options.jvmArgs === undefined ? {} : { jvmArgs: options.jvmArgs }),
            ...(options.maps === undefined ? {} : { maps: options.maps }),
            ...(options.force === undefined ? {} : { force: options.force }),
            ...(options.fixEdges === undefined ? {} : { fixEdges: options.fixEdges }),
        }),
    );

    const hostPort = publish?.hostPort ?? null;
    const hostIp = publish?.hostIp ?? "127.0.0.1";
    return {
        mode: "docker",
        role: options.role,
        command: options.docker ?? "docker",
        args,
        cwd: options.cwd,
        mounts,
        containerName: options.containerName,
        engineConfigDir: CONTAINER_CONFIG_DIR,
        hostConfigDir: options.hostConfigDir,
        url:
            options.role === "web-server" && hostPort !== null
                ? `http://${hostIp}:${String(hostPort)}/`
                : null,
        hostPort: options.role === "web-server" ? hostPort : null,
    };
}

/** Docker's own grammar for a container name: `[a-zA-Z0-9][a-zA-Z0-9_.-]*`. */
const CONTAINER_NAME_TAIL = /[^a-zA-Z0-9_.-]+/g;

/**
 * A container name for a render, derived from its id.
 *
 * Names rather than ids because a name is what `docker stop`, `docker logs` and a person
 * reading `docker ps` all use, and an unnamed container can only be stopped by finding
 * the id of a process this app has already lost track of.
 */
export function containerName(prefix: string, renderId: string): string {
    const cleaned = `${prefix}-${renderId}`.replace(CONTAINER_NAME_TAIL, "-").replace(/^[^a-zA-Z0-9]+/, "");
    const name = cleaned === "" ? "worldlens" : cleaned;
    return name.slice(0, 60);
}

/** The command that stops a container politely, giving the JVM time to save. */
export function stopContainerArguments(name: string, graceSeconds = DOCKER_STOP_GRACE_SECONDS): string[] {
    return ["stop", "--time", String(graceSeconds), name];
}

/** The container path a world folder is mounted at, for the config written for a run. */
export function containerWorldPathFor(mapId: string): string {
    return posix.normalize(containerWorldPath(mapId));
}

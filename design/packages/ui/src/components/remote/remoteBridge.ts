/**
 * The seam between "where does this render run" and the main process.
 *
 * Every type here is a structural mirror of one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
 * `backupBridge.ts` restates its own: this package compiles and runs in three places and
 * only one of them has a preload. Importing across that boundary would drag `node:child_process`,
 * an SSH client and a known_hosts writer into the renderer's bundle, which is exactly what
 * the preload was split out to prevent.
 *
 * ## Nothing here invents a capability
 *
 * There are **two** bridges, resolved separately, because they answer two different
 * questions and a build can have one and not the other:
 *
 * - {@link resolveRemoteBridge} — can a render be handed to a machine over SSH?
 * - {@link resolveRuntimeBridge} — can this app say what Docker is doing on *this* machine,
 *   and can it hand a render to a local container?
 *
 * Each method is probed one at a time and reported as a flag, exactly as the backup bridge
 * does. A surface built on this shows what really works and says plainly what the rest
 * needs; it never presents a control that throws on press.
 *
 * ## There is no password anywhere on this bridge
 *
 * Not as a field, not as an argument, not as a return value. A remote target is a host, a
 * port, a user name and the **path** to a key file that this application never opens.
 * {@link RemoteTarget} is therefore safe to persist by construction, and
 * `sanitiseTarget` in `remoteTargets.ts` drops anything that arrives claiming to be a
 * secret, whatever wrote it.
 */

/* -------------------------------------------------------------------------- */
/* Docker, on this machine                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The five states `main/runtime/docker.ts` distinguishes.
 *
 * They are five rather than two because "Docker is not available" is the sentence somebody
 * reads after installing Docker Desktop and not starting it, and it sends them to download
 * software they already have. Each state gets its own sentence and its own next step in
 * `dockerStates.ts`.
 */
export type DockerStatus =
    | "available"
    | "daemon-unreachable"
    | "not-installed"
    | "refused"
    | "unusable";

export interface DockerSummary {
    readonly status: DockerStatus;
    readonly available: boolean;
    /** The `docker` binary's own version. Reported even when the daemon is down. */
    readonly clientVersion: string | null;
    /** The daemon's version. Non-null only when the daemon answered. */
    readonly serverVersion: string | null;
    readonly message: string;
    /** Docker's own words, when it had any. */
    readonly detail: string | null;
}

/** Where a render can run, as the main process names it. */
export type RuntimeMode = "local" | "docker";

export interface RuntimeModeSummary {
    readonly id: RuntimeMode;
    readonly available: boolean;
    readonly message: string;
    readonly detail: string | null;
}

export interface RuntimeModesSummary {
    readonly preferred: RuntimeMode;
    readonly modes: readonly RuntimeModeSummary[];
    /** The image a container run would use, so the surface can name it. */
    readonly dockerImage: string;
}

/* -------------------------------------------------------------------------- */
/* A machine on the other end of a wire                                       */
/* -------------------------------------------------------------------------- */

export interface RemoteTarget {
    readonly id: string;
    readonly label: string;
    readonly host: string;
    readonly port: number;
    readonly user: string;
    /**
     * Absolute path to the private key to offer, or null to use the SSH agent.
     *
     * A path, never contents. This application does not read the file and will not
     * create one.
     */
    readonly identityFile: string | null;
    readonly workDir: string;
    readonly image: string;
    readonly docker: string;
    readonly keepRemoteFiles: boolean;
}

export type ValidateAnswer =
    | { readonly ok: true; readonly target: RemoteTarget; readonly summary: string }
    | { readonly ok: false; readonly message: string };

/** What a remote render will and will not do with somebody's data, in words. */
export interface RemoteDisclosure {
    readonly target: string;
    readonly sends: readonly string[];
    readonly neverSends: readonly string[];
    readonly leavesBehind: string;
    readonly authentication: string;
}

/* -------------------------------------------------------------------------- */
/* Preflight                                                                  */
/* -------------------------------------------------------------------------- */

export type PreflightStage = "ssh" | "host-key" | "docker" | "disk";

export interface PreflightCheck {
    readonly stage: PreflightStage;
    readonly ok: boolean;
    readonly message: string;
    readonly detail: string | null;
}

/** One key a host is offering, with the fingerprint a person can compare by eye. */
export interface HostKeyOffer {
    readonly type: string;
    readonly base64: string;
    /** `SHA256:...`, in OpenSSH's own spelling. */
    readonly fingerprint: string;
    readonly line: string;
}

export interface RemoteFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly exitCode: number | null;
    /** The precise reason, which is what decides whether anything can be offered. */
    readonly remoteCode?: string;
    readonly target?: string | null;
}

export interface PreflightReport {
    readonly ok: boolean;
    readonly target: string;
    readonly checks: readonly PreflightCheck[];
    readonly failure: RemoteFailure | null;
    /**
     * The keys the host is offering, when an **unknown** host key stopped it.
     *
     * Empty in every other case, including a refusal for a *changed* key. The main
     * process deliberately sends none there, because a fingerprint on screen is a
     * fingerprint with an accept button beside it.
     */
    readonly hostKeys: readonly HostKeyOffer[];
    readonly docker: DockerSummary | null;
    readonly freeBytes: number | null;
    readonly workDir: string | null;
}

export type TrustAnswer = { readonly ok: boolean; readonly message: string };

/* -------------------------------------------------------------------------- */
/* Rendering there                                                            */
/* -------------------------------------------------------------------------- */

export interface RemoteRenderSuccess {
    readonly ok: true;
    readonly renderId: string;
    readonly dataRoot: string;
    readonly mapIds: readonly string[];
    readonly durationMs: number;
    readonly storageRoot: string;
    readonly remoteFilesKept: boolean;
    readonly remoteDirectory: string;
}

export interface RemoteRenderFailed {
    readonly ok: false;
    readonly renderId: string;
    readonly failure: RemoteFailure;
}

export type RemoteRenderResult = RemoteRenderSuccess | RemoteRenderFailed;

/* -------------------------------------------------------------------------- */
/* Browsing a remote folder, Explorer-style                                   */
/* -------------------------------------------------------------------------- */

export type RemoteOs = "linux" | "windows";

/**
 * What is known about whether a folder is a Minecraft world, from the cheap signal alone.
 *
 * Mirrors `RemoteWorldSignal` in `main/remote/browse.ts`. Never a single boolean: a folder
 * with only `level.dat` or only a region folder is real evidence, and reporting it as "not
 * a world" with no further word would throw away the one fact that could tell somebody they
 * are one save away from finding it.
 */
export interface RemoteWorldSignal {
    readonly hasLevelDat: boolean;
    readonly regionDimensions: readonly string[];
    readonly looksLikeWorld: boolean;
}

export interface RemoteEntry {
    readonly name: string;
    readonly directory: boolean;
    readonly symlink: boolean;
    readonly sizeBytes: number | null;
    readonly modifiedAt: string | null;
    readonly world: RemoteWorldSignal;
}

export interface RemoteDirectoryListing {
    readonly path: string;
    readonly os: RemoteOs;
    readonly separator: "/" | "\\";
    readonly entries: readonly RemoteEntry[];
    readonly truncated: boolean;
    readonly totalEntries: number;
}

export type RemoteBrowseFailureCode =
    | "not-found"
    | "not-a-directory"
    | "permission-denied"
    | "symlink-loop"
    | "unreachable"
    | "remote-failed";

export type RemoteBrowseOutcome =
    | { readonly ok: true; readonly listing: RemoteDirectoryListing }
    | {
          readonly ok: false;
          readonly code: RemoteBrowseFailureCode;
          readonly message: string;
          readonly detail: string | null;
      };

/* -------------------------------------------------------------------------- */
/* The bridges                                                                */
/* -------------------------------------------------------------------------- */

export interface RemoteBridge {
    validateRemoteTarget(target: unknown): Promise<ValidateAnswer>;
    describeRemoteTarget(target: unknown): Promise<RemoteDisclosure | { ok: false; message: string }>;
    remotePreflight(target: unknown, requiredBytes?: number): Promise<PreflightReport>;
    /** Records a key the person has just been shown and accepted. Fingerprint only. */
    trustRemoteHostKey(target: unknown, fingerprint: string): Promise<TrustAnswer>;
    startRemoteRender(request: unknown): Promise<RemoteRenderResult>;
    cancelRemoteRender(renderId: string): Promise<boolean>;
    activeRemoteRenders(): Promise<readonly string[]>;
    /** Lists one remote folder, for the Explorer-style browser. */
    browseRemoteDirectory(target: unknown, path: string): Promise<RemoteBrowseOutcome>;
    /** True when the disclosure ("what is sent, what is never sent") can be asked for. */
    readonly canDescribe: boolean;
    /** True when an unknown host key can actually be recorded from here. */
    readonly canTrustHostKey: boolean;
    /** True when a remote render in flight can be stopped from here. */
    readonly canCancel: boolean;
    /** True when the ids in flight right now can be asked for. */
    readonly canSeeActive: boolean;
    /** True when this build can actually list a remote folder. */
    readonly canBrowse: boolean;
}

export interface RuntimeBridge {
    /** What Docker is doing on this computer, in five distinguishable states. */
    dockerRuntime(): Promise<DockerSummary>;
    /** Where a render can run, and whether each place can take one right now. */
    runtimeModes(): Promise<RuntimeModesSummary>;
    /**
     * The modes `startRender` actually honours in this build.
     *
     * Separate from {@link runtimeModes} on purpose, and this distinction is the whole
     * reason the method exists. "Docker is running on this machine" and "this build can
     * hand a render to a container" are two different claims, and a surface that reads
     * the first as the second offers a choice that silently renders locally instead -
     * which is worse than not offering it, because the person believes they chose.
     *
     * A promise, not a plain array: the real answer crosses IPC from
     * `render:runtimeModes`, and a synchronous property here could only ever be a
     * hand-duplicated guess taken before that answer arrives.
     */
    renderModes(): Promise<readonly RuntimeMode[]>;
    /** True when Docker's own state can be read at all. */
    readonly canProbeDocker: boolean;
}

/** The preload shape, probed one method at a time. */
type Host = Partial<{
    validateRemoteTarget: (target: unknown) => Promise<unknown>;
    describeRemoteTarget: (target: unknown) => Promise<unknown>;
    remotePreflight: (target: unknown, requiredBytes?: number) => Promise<unknown>;
    trustRemoteHostKey: (target: unknown, fingerprint: string) => Promise<unknown>;
    startRemoteRender: (request: unknown) => Promise<unknown>;
    cancelRemoteRender: (renderId: string) => Promise<boolean>;
    activeRemoteRenders: () => Promise<readonly string[]>;
    browseRemoteDirectory: (target: unknown, path: string) => Promise<unknown>;
    dockerRuntime: () => Promise<unknown>;
    runtimeModes: () => Promise<unknown>;
    renderRuntimeModes: () => Promise<unknown>;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

function host(): Host | undefined {
    return (globalThis as { materialBluemap?: Host }).materialBluemap;
}

/**
 * The remote bridge, or `null` when this build cannot hand a render to another machine.
 *
 * All or nothing for the three a remote render cannot happen without: checking the target's
 * shape, running the preflight, and starting the render. A bridge with `startRemoteRender`
 * and no `remotePreflight` would upload gigabytes to a host nobody had checked has Docker,
 * which is the exact failure the preflight exists to prevent; a bridge with no
 * `validateRemoteTarget` would send a hand-typed host straight into an `ssh` argument.
 * Both are worse than a surface that says the desktop application is what does this.
 */
export function resolveRemoteBridge(): RemoteBridge | null {
    const found = host();
    if (found === undefined) return null;

    const { validateRemoteTarget, remotePreflight, startRemoteRender } = found;
    if (
        !isFunction(validateRemoteTarget) ||
        !isFunction(remotePreflight) ||
        !isFunction(startRemoteRender)
    ) {
        return null;
    }

    const canDescribe = isFunction(found.describeRemoteTarget);
    const canTrustHostKey = isFunction(found.trustRemoteHostKey);
    const canCancel = isFunction(found.cancelRemoteRender);
    const canSeeActive = isFunction(found.activeRemoteRenders);
    const canBrowse = isFunction(found.browseRemoteDirectory);

    return {
        validateRemoteTarget: async (target) =>
            (await validateRemoteTarget(target)) as ValidateAnswer,
        remotePreflight: async (target, requiredBytes) =>
            (await remotePreflight(target, requiredBytes)) as PreflightReport,
        startRemoteRender: async (request) =>
            (await startRemoteRender(request)) as RemoteRenderResult,
        describeRemoteTarget: async (target) => {
            const describe = found.describeRemoteTarget;
            if (!isFunction(describe)) {
                return {
                    ok: false as const,
                    message:
                        "This build cannot say in advance what a remote render sends. The desktop application is what answers that.",
                };
            }
            return (await describe(target)) as RemoteDisclosure;
        },
        // A refusal rather than a silent success. Recording a host key is the one
        // security decision on this surface, and a build that cannot record one must say
        // so rather than let somebody press a button that changes nothing.
        trustRemoteHostKey: async (target, fingerprint) => {
            const trust = found.trustRemoteHostKey;
            if (!isFunction(trust)) {
                return {
                    ok: false,
                    message:
                        "This build cannot record a host key. The desktop application owns the file that keys are written to.",
                };
            }
            return (await trust(target, fingerprint)) as TrustAnswer;
        },
        // False rather than a rejection, exactly as the backup bridge answers: "this build
        // cannot stop it" and "there was nothing to stop" both leave the render running,
        // and `canCancel` is what says which of the two it is.
        cancelRemoteRender: async (renderId) => {
            const cancel = found.cancelRemoteRender;
            return isFunction(cancel) ? await cancel(renderId) : false;
        },
        // An empty list rather than a rejection: not being able to ask what is in flight
        // and nothing being in flight lead to the same screen. What must never happen is a
        // build inventing one.
        activeRemoteRenders: async () => {
            const active = found.activeRemoteRenders;
            return isFunction(active) ? await active() : [];
        },
        // A plain "not supported" answer rather than a rejection, exactly as every other
        // optional method on this bridge does: a build with no listing channel is a real,
        // ordinary answer the browser renders as "type the path instead", not an exception.
        browseRemoteDirectory: async (target, path) => {
            const browse = found.browseRemoteDirectory;
            if (!isFunction(browse)) {
                return {
                    ok: false,
                    code: "remote-failed",
                    message:
                        "This build cannot browse a remote folder. The desktop application is what lists it over ssh.",
                    detail: null,
                };
            }
            return (await browse(target, path)) as RemoteBrowseOutcome;
        },
        canDescribe,
        canTrustHostKey,
        canCancel,
        canSeeActive,
        canBrowse,
    };
}

/** The modes a build claims `startRender` honours, read defensively. */
async function readRenderModes(found: Host): Promise<readonly RuntimeMode[]> {
    const read = found.renderRuntimeModes;
    if (!isFunction(read)) return ["local"];
    let answer: unknown;
    try {
        answer = await read();
    } catch {
        return ["local"];
    }
    if (!Array.isArray(answer)) return ["local"];
    const modes = answer.filter((mode): mode is RuntimeMode => mode === "local" || mode === "docker");
    // Local is always in the list. A build that renders at all renders locally, and an
    // empty list would present a wizard whose last button has nowhere to send the work.
    return modes.includes("local") ? modes : ["local", ...modes];
}

/**
 * The runtime bridge, or `null` when this build cannot say anything about Docker.
 *
 * Unlike the remote bridge this one is *not* all-or-nothing on its probe methods: a build
 * that can run a render locally still needs a truthful answer to "where can this run", and
 * the answer "on this machine, as a program, and this build cannot see whether Docker is
 * here" is a real answer. What it must never do is claim Docker is unavailable when it
 * simply never looked.
 */
export function resolveRuntimeBridge(): RuntimeBridge | null {
    const found = host();
    if (found === undefined) return null;

    const probeDocker = found.dockerRuntime;
    const probeModes = found.runtimeModes;
    const canProbeDocker = isFunction(probeDocker);

    return {
        dockerRuntime: async () => {
            if (!isFunction(probeDocker)) {
                return {
                    status: "unusable" as const,
                    available: false,
                    clientVersion: null,
                    serverVersion: null,
                    message:
                        "This build cannot check Docker. The desktop application is what runs 'docker version' and reads the answer.",
                    detail: null,
                };
            }
            return (await probeDocker()) as DockerSummary;
        },
        runtimeModes: async () => {
            if (!isFunction(probeModes)) {
                return {
                    preferred: "local" as const,
                    dockerImage: "",
                    modes: [],
                };
            }
            return (await probeModes()) as RuntimeModesSummary;
        },
        renderModes: () => readRenderModes(found),
        canProbeDocker,
    };
}

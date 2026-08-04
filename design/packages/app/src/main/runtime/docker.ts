/**
 * Whether Docker is here, and whether it will actually do anything.
 *
 * These are two questions and the whole reason this file exists is that they get
 * answered as one. "Docker is not available" is the sentence a person reads after
 * installing Docker Desktop and not starting it, and it sends them to download an
 * installer for software they already have. So the states below are distinct, each
 * carries its own sentence, and the sentence names the next thing to do:
 *
 * ```
 * not-installed        there is no `docker` command on this account's PATH
 * daemon-unreachable   the command is there; the engine behind it is not running
 * refused              the daemon is there; this account may not talk to it
 * unusable             it ran and said something this app does not recognise
 * available            a container can be started right now
 * ```
 *
 * The probe is `docker version --format {{json .}}`, which is the one command that
 * answers both halves at once: the client section comes from the binary and the server
 * section comes from the daemon. With the daemon down, Docker prints the client half to
 * stdout, an explanation to stderr, and exits non-zero - so a client version is reported
 * even in the failure states, which is what lets the settings screen say "Docker 27.4.0
 * is installed but its daemon is not running" rather than a bare negative.
 */

import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "./command.js";

export type DockerStatus =
    | "available"
    | "daemon-unreachable"
    | "not-installed"
    | "refused"
    | "unusable";

export interface DockerReport {
    readonly status: DockerStatus;
    /** The `docker` binary's own version, when it was willing to say. */
    readonly clientVersion: string | null;
    /** The daemon's version. Non-null only when the daemon answered. */
    readonly serverVersion: string | null;
    /** One sentence for a person, naming the state and the next thing to do. */
    readonly message: string;
    /** Docker's own words, when it had any. Null when there is nothing more to say. */
    readonly detail: string | null;
}

/** True when a container can be started right now. */
export function dockerUsable(report: DockerReport): boolean {
    return report.status === "available";
}

/**
 * Sentences the daemon prints when it is not there.
 *
 * Windows and Linux say it differently and both spellings are in the wild:
 * `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`
 * on Windows, `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` on
 * Linux. Matching only one of them is how a Windows user gets told Docker is broken.
 */
const DAEMON_DOWN =
    /cannot connect to the docker daemon|is the docker daemon running|the system cannot find the file specified|open \/\/\.\/pipe\/|dial unix|connect: connection refused|error during connect/i;

/** The daemon is up and this account is not in the group that may talk to it. */
const PERMISSION_DENIED = /permission denied|got permission denied while trying to connect|access is denied/i;

interface DockerVersionJson {
    readonly Client?: { readonly Version?: unknown };
    readonly Server?: { readonly Version?: unknown };
}

/** The version out of `docker version --format {{json .}}`, or null when it is not there. */
function versionsFrom(stdout: string): { client: string | null; server: string | null } {
    const trimmed = stdout.trim();
    if (trimmed === "") return { client: null, server: null };
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        // Docker printed something that is not the JSON it was asked for. That is not a
        // reason to report Docker as broken - the exit code decides that - so the
        // versions are simply unknown.
        return { client: null, server: null };
    }
    if (typeof parsed !== "object" || parsed === null) return { client: null, server: null };
    const document = parsed as DockerVersionJson;
    const client = document.Client?.Version;
    const server = document.Server?.Version;
    return {
        client: typeof client === "string" && client !== "" ? client : null,
        server: typeof server === "string" && server !== "" ? server : null,
    };
}

/** One line, so a daemon that answers in paragraphs does not become the whole screen. */
function firstLine(text: string): string | null {
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    return line === undefined || line === "" ? null : line;
}

export interface ProbeDockerOptions {
    /** The binary to run. A parameter so a test can name one that does not exist. */
    readonly docker?: string;
    readonly runner?: CommandRunner;
    readonly timeoutMs?: number;
}

/**
 * Asks Docker what it is. Never rejects.
 *
 * Pure with respect to the runner: everything below is a decision about one
 * {@link CommandOutput}, so {@link readDockerVersion} can be tested exhaustively without
 * a Docker installation anywhere near the test machine.
 */
export async function probeDocker(options: ProbeDockerOptions = {}): Promise<DockerReport> {
    const docker = options.docker ?? "docker";
    const runner = options.runner ?? execFileCommandRunner;
    const output = await runner(
        docker,
        ["version", "--format", "{{json .}}"],
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    );
    return readDockerVersion(output, docker);
}

/** What one `docker version` result means. */
export function readDockerVersion(output: CommandOutput, docker = "docker"): DockerReport {
    const { client, server } = versionsFrom(output.stdout);
    const said = firstLine(output.stderr);

    if (output.spawnError !== null) {
        // ENOENT is the ordinary case and the only one that means "not installed".
        // EACCES on the binary itself is a different problem and says so.
        if (output.spawnError === "ENOENT") {
            return {
                status: "not-installed",
                clientVersion: null,
                serverVersion: null,
                message: `There is no '${docker}' command on this account's PATH, so nothing can be run in a container. Rendering locally does not need it.`,
                detail: null,
            };
        }
        return {
            status: "unusable",
            clientVersion: null,
            serverVersion: null,
            message: `The '${docker}' command could not be started (${output.spawnError}).`,
            detail: said,
        };
    }

    if (output.ok && server !== null) {
        return {
            status: "available",
            clientVersion: client,
            serverVersion: server,
            message:
                client === null
                    ? "Docker is installed and its daemon is running."
                    : `Docker ${client} is installed and its daemon (${server}) is running.`,
            detail: null,
        };
    }

    const installed = client === null ? "Docker is installed" : `Docker ${client} is installed`;
    const haystack = `${output.stderr}\n${output.stdout}`;

    if (PERMISSION_DENIED.test(haystack)) {
        return {
            status: "refused",
            clientVersion: client,
            serverVersion: null,
            message: `${installed}, but this account is not allowed to talk to its daemon.`,
            detail: said,
        };
    }

    if (DAEMON_DOWN.test(haystack)) {
        return {
            status: "daemon-unreachable",
            clientVersion: client,
            serverVersion: null,
            message: `${installed}, but its daemon is not running. Start Docker and try again.`,
            detail: said,
        };
    }

    if (output.ok) {
        // Exit zero with no server section. Recent Docker builds do this when the daemon
        // is unreachable and `--format` swallowed the error, so it is reported as the
        // daemon being down rather than as an unknown state.
        return {
            status: "daemon-unreachable",
            clientVersion: client,
            serverVersion: null,
            message: `${installed}, but it did not report a running daemon.`,
            detail: said,
        };
    }

    return {
        status: "unusable",
        clientVersion: client,
        serverVersion: null,
        message: `${installed}, but 'docker version' failed${
            output.exitCode === null ? "" : ` with exit code ${String(output.exitCode)}`
        }.`,
        detail: said,
    };
}

/**
 * Whether an image is already on this machine.
 *
 * Only ever used to *explain* a failure, never to gate a run: `docker run` pulls an
 * image it does not have, and refusing to start because an image is missing would turn a
 * first run into an error instead of a download.
 */
export async function dockerImagePresent(
    image: string,
    options: ProbeDockerOptions = {},
): Promise<boolean> {
    const runner = options.runner ?? execFileCommandRunner;
    const output = await runner(options.docker ?? "docker", ["image", "inspect", image], {});
    return output.ok;
}

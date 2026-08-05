/**
 * Why a world could not be reached in Docker, in a form the interface can act on.
 *
 * Same contract as `download/failure.ts` and `remote/failure.ts`: a code the interface
 * switches on, a message a person can read without opening a log, and a `detail` field for
 * the evidence that would otherwise crowd the sentence out.
 */

export type DockerWorldFailureCode =
    /** The request itself is not actionable: no container/volume id, a bad path. */
    | "invalid-request"
    /** There is no `docker` command on this account's PATH (or the remote host's). */
    | "not-installed"
    /** Docker is there; its daemon is not answering. */
    | "daemon-unreachable"
    /** The daemon is there; this account may not talk to it. */
    | "refused"
    /** Docker answered with something this app does not recognise. */
    | "unusable"
    /** The named container or volume does not exist. */
    | "not-found"
    /** What was found at the resolved path is not a Minecraft world. */
    | "not-a-world"
    /** The owning container is running and the caller has not accepted that risk. */
    | "live-world-not-acknowledged"
    /** The copy itself failed - `docker cp`, a helper container, or the file transfer. */
    | "copy-failed"
    /** The destination folder could not be created or written. */
    | "storage-unwritable"
    /** The person cancelled it. */
    | "cancelled";

export interface DockerWorldFailure {
    readonly code: DockerWorldFailureCode;
    /** One sentence naming what is wrong, in words a person can act on. */
    readonly message: string;
    /** Supporting evidence: Docker's own words, a path, an exit code. */
    readonly detail: string | null;
}

function failure(code: DockerWorldFailureCode, message: string, detail: string | null = null): DockerWorldFailure {
    return { code, message, detail };
}

export function invalidRequest(message: string): DockerWorldFailure {
    return failure("invalid-request", message);
}

export function notInstalled(message: string): DockerWorldFailure {
    return failure("not-installed", message);
}

export function daemonUnreachable(message: string): DockerWorldFailure {
    return failure("daemon-unreachable", message);
}

export function refused(message: string): DockerWorldFailure {
    return failure("refused", message);
}

export function unusable(message: string, detail: string | null = null): DockerWorldFailure {
    return failure("unusable", message, detail);
}

export function containerNotFound(id: string): DockerWorldFailure {
    return failure("not-found", `There is no container called '${id}'.`);
}

export function volumeNotFound(name: string): DockerWorldFailure {
    return failure("not-found", `There is no volume called '${name}'.`);
}

export function notAWorld(where: string, detail: string): DockerWorldFailure {
    return failure(
        "not-a-world",
        `${where} was copied out, but it is not a Minecraft world: no level.dat and no region files were found in it.`,
        detail,
    );
}

/**
 * The one refusal in this file with no override: a running server may still be writing the
 * exact region files being read, and reading them anyway can produce a torn `.mca` file -
 * one that opens, because zlib does not notice a chunk written mid-copy, and corrupts a
 * render three layers away from anything that would point back here. See `dockerworld/`'s
 * own module doc for what a safe route would look like and why this project does not have
 * one yet.
 */
export function liveWorldNotAcknowledged(containerName: string): DockerWorldFailure {
    return failure(
        "live-world-not-acknowledged",
        `'${containerName}' is running right now, so its world may be being written to while it is read. ` +
            "That can produce a torn region file that opens and corrupts a render later, with nothing at " +
            "copy time to say so. Stop the server first, point this at a backup instead, or accept that " +
            "risk explicitly before fetching a live world.",
    );
}

export function copyFailed(message: string, detail: string | null = null): DockerWorldFailure {
    return failure("copy-failed", message, detail);
}

export function storageUnwritable(directory: string, detail: string): DockerWorldFailure {
    return failure("storage-unwritable", `The destination folder could not be written: ${directory}`, detail);
}

export function cancelled(): DockerWorldFailure {
    return failure("cancelled", "The fetch was cancelled.");
}

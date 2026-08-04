/**
 * Why a remote render did not happen, in a form the interface can act on.
 *
 * The rule this folder was built under is that a remote render is reported *exactly* as a
 * local one - the same events, the same progress, the same cancellation, the same failure
 * object. That is what {@link RemoteFailure} is: a `RenderFailure`, structurally, with one
 * field added.
 *
 * ## Why the codes are doubled rather than replaced
 *
 * `RenderFailureCode` lives in `render/failure.ts` and the interface already switches on
 * it. A remote render can fail for reasons that vocabulary has no word for - the host did
 * not answer, its Docker is not installed, its disk is full, its key changed since last
 * time - and every one of them has a *different* fix. Collapsing them into one code would
 * put "cannot reach the host" and "Docker is not installed there" behind the same sentence,
 * which is precisely the failure this project keeps refusing to ship.
 *
 * So the object carries both:
 *
 * - `code` is the existing `RenderFailureCode`, so an interface that has never heard of a
 *   remote target still renders the failure and still routes it correctly;
 * - `remoteCode` is the precise reason, for an interface that has;
 * - `message` always names the real thing that is wrong and what would fix it, whichever
 *   of the two the reader looks at.
 *
 * The mapping into `code` is deliberate and narrow:
 *
 * | remoteCode                                   | code             | why |
 * |----------------------------------------------|------------------|-----|
 * | anything found before the engine was started | `invalid-request`| nothing was spawned, nothing changed, the request cannot be carried out as stated |
 * | a transfer or a container that failed        | `cli-failed`     | work was started somewhere and stopped |
 * | the person pressed Cancel                    | `cancelled`      | not an error, and must never be shown as one |
 *
 * `settings` is null throughout. The anchors in `render/failure.ts` name local settings -
 * the Mojang consent row, the Java runtime, the map storage folder - and none of them is
 * where a remote target is configured. Inventing an anchor the shell cannot resolve would
 * be a dead link at the exact moment somebody knows what they want to change, so the
 * message carries the fix in words instead.
 */

import type { RenderFailure, RenderFailureCode } from "../render/failure.js";

export type RemoteFailureCode =
    /** The target itself is not usable: no host, a port out of range, a relative work dir. */
    | "invalid-target"
    /** There is no `ssh` on this computer. Nothing was attempted. */
    | "ssh-missing"
    /** The host did not answer: DNS, a refused connection, a timeout, no route. */
    | "unreachable"
    /**
     * The host offered a key this app has never seen.
     *
     * A decision for the person, never a default. See `hostkey.ts`.
     */
    | "host-key-unknown"
    /**
     * The host offered a key that is **not** the one recorded for it.
     *
     * Never repaired automatically and never offered as a checkbox: this is what a
     * machine-in-the-middle looks like, and it is also what a rebuilt server looks like.
     * The two are indistinguishable from here, so the app refuses and says so.
     */
    | "host-key-changed"
    /** The key could not be read at all, so there is nothing to show or to trust. */
    | "host-key-unavailable"
    /** SSH connected and would not let this account in. No password is ever offered. */
    | "auth-refused"
    /** There is no `docker` on the remote host's PATH. */
    | "docker-missing"
    /** Docker is installed there and its daemon is not running. */
    | "docker-daemon-down"
    /** The daemon is there and the remote account may not talk to it. */
    | "docker-refused"
    /** Docker answered with something this app does not recognise. */
    | "docker-unusable"
    /** The remote work directory has less free space than the render needs. */
    | "not-enough-disk"
    /** A file or folder did not make it there, or the map did not make it back. */
    | "transfer-failed"
    /** A command run over SSH failed for a reason that is not one of the above. */
    | "remote-command-failed"
    /** The container ran and the render did not succeed. */
    | "render-failed"
    /** The person cancelled it. */
    | "cancelled";

/**
 * A `RenderFailure` with the precise reason attached.
 *
 * Assignable to `RenderFailure` wherever one is expected, which is how a remote render's
 * `failed` event is the same event a local render's is.
 */
export interface RemoteFailure extends RenderFailure {
    readonly remoteCode: RemoteFailureCode;
    /** The target this is about, as `user@host:port`, for a message. Never a key path. */
    readonly target: string | null;
}

interface FailureExtra {
    readonly detail?: string;
    readonly exitCode?: number;
    readonly target?: string;
}

function build(
    remoteCode: RemoteFailureCode,
    code: RenderFailureCode,
    message: string,
    extra: FailureExtra = {},
): RemoteFailure {
    return {
        code,
        remoteCode,
        message,
        settings: null,
        detail: extra.detail ?? null,
        exitCode: extra.exitCode ?? null,
        target: extra.target ?? null,
    };
}

/** Nothing was started, so the failure cost nothing and changed nothing on either machine. */
function beforeAnything(
    remoteCode: RemoteFailureCode,
    message: string,
    extra: FailureExtra = {},
): RemoteFailure {
    return build(remoteCode, "invalid-request", message, extra);
}

export function invalidTarget(message: string, detail?: string): RemoteFailure {
    return beforeAnything("invalid-target", message, detail === undefined ? {} : { detail });
}

export function sshMissing(sshBinary: string): RemoteFailure {
    return beforeAnything(
        "ssh-missing",
        `There is no '${sshBinary}' command on this computer, so nothing can be sent to a remote host. ` +
            "Windows ships OpenSSH as an optional feature; installing it is what this needs.",
    );
}

export function unreachable(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "unreachable",
        `${target} did not answer. Check the host name and port, and that the machine is on and reachable from here.`,
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function hostKeyUnknown(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "host-key-unknown",
        `${target} offered a host key this app has not seen before. Nothing was sent. ` +
            "Check the fingerprint against the machine itself, then accept it - accepting a key " +
            "without checking it is what a machine-in-the-middle relies on.",
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function hostKeyChanged(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "host-key-changed",
        `${target} offered a different host key from the one recorded for it. Nothing was sent. ` +
            "This is what a rebuilt server looks like and it is also what an intercepted " +
            "connection looks like; the two cannot be told apart from here, so the recorded key " +
            "has to be removed deliberately before this target will connect again.",
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function hostKeyUnavailable(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "host-key-unavailable",
        `${target} would not offer a host key, so there is nothing to check and nothing to trust.`,
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function authRefused(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "auth-refused",
        `${target} refused the key. This app never sends a password, so the fix is on the key: ` +
            "add the public half to that account's authorized_keys, load the private half into " +
            "your SSH agent, or name the identity file on the target.",
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function dockerMissing(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "docker-missing",
        `${target} answered, and has no 'docker' command. Install Docker there; nothing else about ` +
            "the connection is wrong.",
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function dockerDaemonDown(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "docker-daemon-down",
        `Docker is installed on ${target} and its daemon is not running. Start it there and try again.`,
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function dockerRefused(target: string, detail: string | null): RemoteFailure {
    return beforeAnything(
        "docker-refused",
        `Docker is running on ${target} and that account may not talk to its daemon. Add the account ` +
            "to the docker group there, or point this target at one that is already in it.",
        { target, ...(detail === null ? {} : { detail }) },
    );
}

export function dockerUnusable(target: string, message: string, detail: string | null): RemoteFailure {
    return beforeAnything("docker-unusable", `${target}: ${message}`, {
        target,
        ...(detail === null ? {} : { detail }),
    });
}

export function notEnoughDisk(
    target: string,
    directory: string,
    freeBytes: number,
    neededBytes: number,
): RemoteFailure {
    return beforeAnything(
        "not-enough-disk",
        `${target} has ${gigabytes(freeBytes)} free under ${directory} and this render needs about ` +
            `${gigabytes(neededBytes)}. Free some space there, or point the target at a bigger volume.`,
        { target, detail: `${String(freeBytes)} bytes free, ${String(neededBytes)} bytes wanted` },
    );
}

export function transferFailed(target: string, what: string, detail: string | null): RemoteFailure {
    return build("transfer-failed", "cli-failed", `${what} did not make it between here and ${target}.`, {
        target,
        ...(detail === null ? {} : { detail }),
    });
}

export function remoteCommandFailed(
    target: string,
    what: string,
    exitCode: number | null,
    detail: string | null,
): RemoteFailure {
    return build(
        "remote-command-failed",
        "cli-failed",
        `${what} failed on ${target}${exitCode === null ? "" : ` (exit code ${String(exitCode)})`}.`,
        {
            target,
            ...(exitCode === null ? {} : { exitCode }),
            ...(detail === null ? {} : { detail }),
        },
    );
}

export function renderFailed(
    target: string,
    exitCode: number | null,
    detail: string | null,
): RemoteFailure {
    return build(
        "render-failed",
        "cli-failed",
        `The render container on ${target} did not finish successfully` +
            `${exitCode === null ? "" : ` (exit code ${String(exitCode)})`}.`,
        {
            target,
            ...(exitCode === null ? {} : { exitCode }),
            ...(detail === null ? {} : { detail }),
        },
    );
}

export function cancelled(): RemoteFailure {
    return build("cancelled", "cancelled", "The remote render was cancelled.");
}

/** Decimal gigabytes, because that is what a disk is sold and reported in. */
function gigabytes(bytes: number): string {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

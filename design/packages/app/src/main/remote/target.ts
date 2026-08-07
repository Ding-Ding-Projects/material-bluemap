/**
 * The machine a render is being handed to, and everything this app is willing to know
 * about it.
 *
 * ## There is no password field, and there is nowhere to put one
 *
 * That is the design, not an omission to be filled in later. This app never asks for a
 * password, never stores one, never passes one to `ssh`, and the SSH options it builds
 * (`PasswordAuthentication=no`, `KbdInteractiveAuthentication=no`, `BatchMode=yes`) make it
 * impossible for the client to fall back to one even if a host offers it. A password that
 * exists somewhere is a password that ends up in a config file, a log line, a crash report
 * or a screenshot; the way to not leak one is to not have one.
 *
 * Authentication is therefore a key the person already has:
 *
 * - **an agent** (the default). The key never leaves the agent, this app never sees it,
 *   and a passphrase-protected key works without anybody typing the passphrase here.
 * - **an identity file**, named by *path*. The app records where the key is; it never
 *   reads it, never copies it, never writes one, and never puts its contents anywhere.
 *
 * {@link RemoteTarget} accordingly holds a path and a boolean, and nothing that is itself
 * a secret. Persisting one of these is safe by construction.
 *
 * ## Why the validation is this strict
 *
 * Every field below ends up in an `ssh` or `scp` argument, and the work directory ends up
 * inside a `docker run -v` and inside a remote shell command. A host called `-oProxyCommand=...`
 * is an option rather than a host; a user with a space in it splits an argument; a work
 * directory with a `:` in it ends the source half of a mount specification early and mounts
 * something else. None of those are hypothetical - they are the shapes that make an
 * argument mean something other than it appears to - so each is refused by name here,
 * before anything is spawned.
 */

import { DEFAULT_DOCKER_IMAGE } from "../runtime/plan.js";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";

/**
 * The image a remote render uses when nobody names one.
 *
 * The same stock JRE the local Docker path uses, taken from `runtime/plan.ts` rather than
 * restated, so a remote render and a local containerised one cannot drift onto different
 * Javas without somebody noticing.
 */
export { DEFAULT_DOCKER_IMAGE as DEFAULT_REMOTE_IMAGE };

export interface RemoteTarget {
    /** Stable id for this target, used in messages and as a settings key. */
    readonly id: string;
    /** What to call it on screen. Never used to build a command. */
    readonly label: string;
    readonly host: string;
    readonly port: number;
    readonly user: string;
    /**
     * Absolute path to the **private** key to offer, or null to use the agent.
     *
     * A path, never contents. This app does not read the file, and will not create one.
     */
    readonly identityFile: string | null;
    /**
     * Where on the remote host a render's staging directory is created.
     *
     * Absolute, POSIX, and somewhere the remote account owns. Everything this render sends
     * lives under `<workDir>/<renderId>/` and is removed afterwards unless
     * {@link keepRemoteFiles} says otherwise.
     */
    readonly workDir: string;
    /** The container image. */
    readonly image: string;
    /** The remote `docker` binary. A field so a host with a wrapper can name it. */
    readonly docker: string;
    /**
     * Leave the staging directory behind after a render.
     *
     * Off by default. On, for somebody debugging a render on a machine they own - and the
     * interface says out loud that the world stays there when it is on.
     */
    readonly keepRemoteFiles: boolean;
}

export type PartialRemoteTarget = Partial<Record<keyof RemoteTarget, unknown>>;

export const DEFAULT_SSH_PORT = 22;

/** Where a render stages by default: under the remote account's own home, not `/tmp`. */
export const DEFAULT_WORK_DIR = "~/.worldlens/renders";

/**
 * A host name, an IPv4 address, or an IPv6 address in brackets.
 *
 * Deliberately no leading hyphen and no `@`, `:`, whitespace or shell metacharacter: a
 * "host" beginning with `-` is read by `ssh` as an option, which is how a host field
 * becomes a way to set `ProxyCommand`.
 */
const HOST = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)$/;

/** POSIX-ish account names, plus the trailing `$` a Windows machine account carries. */
const USER = /^[A-Za-z_][A-Za-z0-9._-]{0,31}\$?$/;

/** Anything that would end an argument early or start a new command. */
const DANGEROUS = /[\s;&|<>()$`"'\\*?!#\u0000-\u001F]/;

export type TargetCheck =
    | { readonly ok: true; readonly target: RemoteTarget }
    | { readonly ok: false; readonly failure: RemoteFailure };

/**
 * Reads a target out of whatever the settings screen stored, proving every field.
 *
 * Nothing here touches a network or a disk, so the whole grammar is exhaustively testable
 * from any machine - which matters, because these refusals are what stand between a
 * settings field and an `ssh` argument.
 */
export function validateTarget(value: PartialRemoteTarget): TargetCheck {
    const id = text(value["id"]);
    if (id === null || DANGEROUS.test(id)) {
        return refuse("This remote target has no usable id.");
    }

    const host = text(value["host"]);
    if (host === null) return refuse("A host name or address is required.");
    if (!HOST.test(host)) {
        return refuse(
            `'${host}' is not a host name or address. A host beginning with '-' is read by ssh as ` +
                "an option rather than a machine, so it is refused here.",
        );
    }

    const user = text(value["user"]);
    if (user === null) return refuse("A user name to sign in as is required.");
    if (!USER.test(user)) {
        return refuse(`'${user}' is not an account name that can be written into an ssh argument.`);
    }

    const rawPort = value["port"];
    const port = rawPort === undefined || rawPort === null ? DEFAULT_SSH_PORT : Number(rawPort);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        return refuse(`${String(rawPort)} is not a port number.`);
    }

    const workDir = text(value["workDir"]) ?? DEFAULT_WORK_DIR;
    const checkedWorkDir = checkWorkDir(workDir);
    if (!checkedWorkDir.ok) return refuse(checkedWorkDir.reason);

    const identityFile = text(value["identityFile"]);
    if (identityFile !== null && /[\u0000-\u001F]/.test(identityFile)) {
        return refuse("The identity file path contains a control character, so it is not a path.");
    }

    const image = text(value["image"]);
    if (image !== null && DANGEROUS.test(image)) {
        return refuse(`'${image}' is not a container image name.`);
    }

    const docker = text(value["docker"]) ?? "docker";
    if (DANGEROUS.test(docker)) {
        return refuse(`'${docker}' is not a command name.`);
    }

    // Nothing named `password`, `passphrase` or `secret` is ever carried forward, whatever
    // a stored target happens to hold. A field that was written by an older build, by hand,
    // or by an import is dropped here rather than travelling into an ssh invocation.
    return {
        ok: true,
        target: {
            id,
            label: text(value["label"]) ?? `${user}@${host}`,
            host,
            port,
            user,
            identityFile,
            workDir: checkedWorkDir.path,
            image: image ?? DEFAULT_DOCKER_IMAGE,
            docker,
            keepRemoteFiles: value["keepRemoteFiles"] === true,
        },
    };
}

/** `user@host:port`, for a message. Never carries a key path or anything secret. */
export function describeTarget(target: RemoteTarget): string {
    return `${target.user}@${target.host}:${String(target.port)}`;
}

/** `user@host`, which is the form `ssh` and `scp` actually take. */
export function destination(target: RemoteTarget): string {
    return `${target.user}@${target.host}`;
}

type WorkDirCheck =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly reason: string };

/**
 * The staging directory, checked as a remote POSIX path.
 *
 * `runtime/mounts.ts` has a checker for this and it is deliberately **not** reused: its
 * refusal list is about *this* computer, and it refuses `/home` and `/var` outright, which
 * is where a remote account's own directory actually is. Running a laptop's rules over a
 * server's filesystem would refuse the only sensible place to stage and permit nothing.
 *
 * What is refused here is what would be dangerous *there*: a filesystem root, the system
 * directories a render has no business writing into, a `..` that survives normalisation,
 * and the characters that would break out of a mount specification or a shell word.
 */
export function checkWorkDir(value: string): WorkDirCheck {
    const given = value.trim();
    if (given === "") return { ok: false, reason: "The remote work directory is empty." };
    if (/[\u0000-\u001F]/.test(given)) {
        return { ok: false, reason: "The remote work directory contains a control character." };
    }
    if (given.includes(":")) {
        return {
            ok: false,
            reason:
                `${given} contains a ':', which ends the source half of a container mount early ` +
                "and would silently mount something else.",
        };
    }
    if (DANGEROUS.test(given)) {
        return {
            ok: false,
            reason: `${given} contains a character that cannot appear in a remote path this app builds.`,
        };
    }
    // `~` and `~/...` only. `~someone` addresses another account's home, which is not a
    // place this app should be creating directories in.
    const rooted = given.startsWith("/") || given === "~" || given.startsWith("~/");
    if (!rooted) {
        return {
            ok: false,
            reason: `${given} is not a full path. Give a path from the root, or one under '~/'.`,
        };
    }
    const segments = given.split("/");
    if (segments.includes("..")) {
        return { ok: false, reason: `${given} contains a '..' step.` };
    }
    const normalised = given.length > 1 ? given.replace(/\/+$/, "") : given;
    if (normalised === "/") {
        return { ok: false, reason: "A render will not stage into the root of the remote filesystem." };
    }
    for (const root of REFUSED_REMOTE_ROOTS) {
        if (normalised === root || normalised.startsWith(`${root}/`)) {
            return {
                ok: false,
                reason: `${given} is inside ${root}, which is a system directory on the remote host.`,
            };
        }
    }
    return { ok: true, path: normalised };
}

/**
 * Remote directories a render never stages into.
 *
 * Shorter than the local list on purpose. `/home` and `/var` are missing because that is
 * where a server's own accounts and its ordinary scratch space live, and a render staging
 * under `/home/renderer/...` or `/var/lib/worldlens` is doing exactly the right
 * thing. What is here is what a bind mount of it would hand the container.
 */
const REFUSED_REMOTE_ROOTS = ["/bin", "/boot", "/dev", "/etc", "/lib", "/proc", "/sbin", "/sys", "/usr"];

function text(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

function refuse(message: string): TargetCheck {
    return { ok: false, failure: failures.invalidTarget(message) };
}

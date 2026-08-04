/**
 * What a container is allowed to see of this computer.
 *
 * A bind mount is a hole in the isolation Docker is being used for, so every one of them
 * is named here and nothing else is passed in. The container gets four kinds of path and
 * no others:
 *
 * ```
 * <workspace>/config-container  ->  /bluemap/config   read-write   the config written for this run
 * <workspace>/data              ->  /bluemap/data     read-write   resource packs, the client jar, logs
 * <workspace>/web               ->  /bluemap/web      read-write   the tiles, which are the output
 * <cli.jar>                     ->  /bluemap/cli.jar  read-only    the engine itself
 * <world>                       ->  /worlds/<mapId>   read-only    the world being rendered
 * ```
 *
 * **The world is mounted read-only, always.** A render reads chunks and writes tiles;
 * nothing about it should be able to write into somebody's save. Read-only is the
 * difference between an engine bug corrupting a region file and an engine bug producing
 * an error message.
 *
 * ## The refusals are the point
 *
 * {@link checkMountSource} refuses a home directory, a directory *containing* home, a
 * drive or filesystem root, and the well-known system directories. That is not
 * hypothetical tidiness: a user who points the world picker at `C:\Users\them` instead of
 * `C:\Users\them\...\saves\world` would otherwise hand a container their entire profile -
 * documents, browser data, SSH keys - because one folder was chosen one level too high.
 * The check costs nothing and the mistake it prevents is unrecoverable.
 *
 * ## Why `-v` and not `--mount`
 *
 * `--mount` splits its options on commas, so a perfectly ordinary Windows folder called
 * `Saves, old` produces a mount specification Docker parses as three broken options. `-v`
 * splits on colons instead, and a colon cannot appear in a Windows path except as the
 * drive separator - which {@link mountArgument} allows and every other colon is refused
 * by {@link checkMountSource}. One escape hazard, checked, beats the other one, ignored.
 */

import { posix, win32 } from "node:path";

export interface BindMount {
    /** The path on this computer, absolute and already checked. */
    readonly hostPath: string;
    /** Where it appears inside the container. Always a POSIX path. */
    readonly containerPath: string;
    readonly readOnly: boolean;
}

/** Everything the engine sees inside a container lives under here. */
export const CONTAINER_ROOT = "/bluemap";
export const CONTAINER_CONFIG_DIR = `${CONTAINER_ROOT}/config`;
export const CONTAINER_DATA_DIR = `${CONTAINER_ROOT}/data`;
export const CONTAINER_WEB_ROOT = `${CONTAINER_ROOT}/web`;
export const CONTAINER_JAR = `${CONTAINER_ROOT}/cli.jar`;

/**
 * Worlds go outside `/bluemap`, one directory per map.
 *
 * Separate so a world can never collide with a path the engine writes to. The map id is
 * already validated as `[a-z0-9][a-z0-9_-]*` by the render config writer, so it cannot
 * introduce a slash or a `..` here.
 */
export function containerWorldPath(mapId: string): string {
    return posix.join("/worlds", mapId);
}

export type MountCheck =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly reason: string };

/** A Windows drive prefix - the only colon a mount source may contain. */
const DRIVE_PREFIX = /^[A-Za-z]:[\\/]/;

/**
 * Directories that are never a world, an output folder or a config folder, and that
 * would hand a container far more than it needs.
 *
 * Lower-cased and compared without a trailing separator. The Windows list is compared
 * case-insensitively because the filesystem is; the POSIX list is not, because `/etc` and
 * `/ETC` are two different directories there.
 */
const WINDOWS_SYSTEM_ROOTS = ["c:\\windows", "c:\\program files", "c:\\program files (x86)", "c:\\users"];
const POSIX_SYSTEM_ROOTS = ["/etc", "/usr", "/bin", "/sbin", "/lib", "/boot", "/dev", "/proc", "/sys", "/var", "/home", "/users", "/root", "/system", "/library"];

export interface MountSourceOptions {
    /** Which path grammar to read the path with. Defaults to the host's own. */
    readonly platform?: NodeJS.Platform;
    /** The account's home directory, so it and its parents can be refused by name. */
    readonly home?: string | null;
}

function withoutTrailingSeparator(value: string): string {
    // Never below a root: `C:\` and `/` must survive as themselves, because the whole
    // point of keeping them is to refuse them by name a moment later.
    let end = value.length;
    while (end > 1 && (value.charAt(end - 1) === "/" || value.charAt(end - 1) === "\\")) end--;
    const trimmed = value.slice(0, end);
    return DRIVE_PREFIX.test(value) && trimmed.length === 2 ? value.slice(0, 3) : trimmed;
}

/** True when `parent` is `child` or contains it, in the given grammar. */
function contains(parent: string, child: string, caseInsensitive: boolean): boolean {
    const separator = parent.includes("\\") ? "\\" : "/";
    const left = caseInsensitive ? parent.toLowerCase() : parent;
    const right = caseInsensitive ? child.toLowerCase() : child;
    if (left === right) return true;
    return right.startsWith(left.endsWith(separator) ? left : left + separator);
}

/**
 * Decides whether a directory may be handed to a container, and normalises it.
 *
 * Nothing here touches a disk. It is a decision about a string, so it is exhaustively
 * testable for every platform from any platform - which matters, because the Windows
 * refusals are the ones that protect a Windows user and CI runs on Linux.
 */
export function checkMountSource(hostPath: string, options: MountSourceOptions = {}): MountCheck {
    const given = hostPath.trim();
    if (given === "") {
        return { ok: false, reason: "An empty path was offered as a folder to share with the container." };
    }
    // A control character cannot be typed into a path deliberately; one here means the
    // string came from somewhere other than a folder picker, and it would be written
    // straight into a `docker run` argument.
    if (/[\u0000-\u001F]/.test(given)) {
        return { ok: false, reason: `${given} contains a control character, so it does not name a folder.` };
    }

    const platform = options.platform ?? process.platform;
    const path = platform === "win32" ? win32 : posix;

    if (!path.isAbsolute(given)) {
        return {
            ok: false,
            reason: `${given} is not a full path. A container is only ever given folders named from the root of the file system.`,
        };
    }

    // Checked before normalising, because `win32.normalize` collapses the leading pair of
    // a share-less UNC path: `\\fileserver` comes back as `\fileserver`, which then looks
    // like an ordinary rooted path and would be shared whole. A real UNC path names a
    // server *and* a share.
    if (platform === "win32" && /^[\\/]{2}/.test(given)) {
        const segments = given
            .slice(2)
            .split(/[\\/]/)
            .filter((segment) => segment !== "");
        if (segments.length < 2) {
            return {
                ok: false,
                reason: `${given} names a whole file server rather than a folder on it. A container is given the world, the output folder and the config, never an entire share.`,
            };
        }
    }

    const normalised = withoutTrailingSeparator(path.normalize(given));

    // A colon past the drive prefix would end the source half of `src:dst:ro` early and
    // silently mount something else. There is no legal Windows path with one, and a POSIX
    // path with one cannot be expressed as a `-v` argument at all.
    const afterDrive = DRIVE_PREFIX.test(normalised) ? normalised.slice(2) : normalised;
    if (afterDrive.includes(":")) {
        return {
            ok: false,
            reason: `${given} contains a ':', which cannot be written in a container mount. Move or rename the folder.`,
        };
    }

    // A `..` that survived normalisation is one that climbs past the root it started
    // from, so where it points cannot be decided from the string at all. Split rather
    // than searched, because a folder genuinely called `saves..old` is not a traversal.
    if (normalised.split(/[\\/]/).includes("..")) {
        return { ok: false, reason: `${given} still contains a '..' step after being resolved.` };
    }

    const isWindowsShape = DRIVE_PREFIX.test(normalised) || normalised.startsWith("\\\\");
    const caseInsensitive = isWindowsShape;

    // A drive root, a filesystem root, or a bare UNC server share.
    if (normalised === "/" || /^[A-Za-z]:[\\/]?$/.test(normalised) || /^\\\\[^\\]+\\?$/.test(normalised)) {
        return {
            ok: false,
            reason: `${given} is the root of a whole drive. A container is given the world, the output folder and the config, never an entire disk.`,
        };
    }

    const home = options.home ?? null;
    if (home !== null && home.trim() !== "") {
        const normalisedHome = withoutTrailingSeparator(path.normalize(home.trim()));
        if (contains(normalised, normalisedHome, caseInsensitive)) {
            return {
                ok: false,
                reason: `${given} is your home folder, or contains it. Choose the world folder itself rather than the folder it lives in - sharing a home folder with a container shares everything in it.`,
            };
        }
    }

    const roots = isWindowsShape ? WINDOWS_SYSTEM_ROOTS : POSIX_SYSTEM_ROOTS;
    for (const root of roots) {
        if (contains(normalised, root, caseInsensitive) && !contains(root, normalised, caseInsensitive)) {
            return {
                ok: false,
                reason: `${given} contains ${root}, which is a system folder. A container is given only the folders a render needs.`,
            };
        }
        if (caseInsensitive ? normalised.toLowerCase() === root : normalised === root) {
            return {
                ok: false,
                reason: `${given} is a system folder. A container is given only the folders a render needs.`,
            };
        }
    }

    return { ok: true, path: normalised };
}

/** Raised when a folder cannot be handed to a container. Carries the sentence. */
export class MountRefusedError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = "MountRefusedError";
    }
}

/** The checked source, or an error carrying the reason it was refused. */
export function requireMountSource(hostPath: string, options: MountSourceOptions = {}): string {
    const checked = checkMountSource(hostPath, options);
    if (!checked.ok) throw new MountRefusedError(checked.reason);
    return checked.path;
}

/** One `-v` argument: `source:target` with `:ro` when the mount is read-only. */
export function mountArgument(mount: BindMount): string {
    return `${mount.hostPath}:${mount.containerPath}${mount.readOnly ? ":ro" : ""}`;
}

/** Every `-v <spec>` pair, in the order the mounts were given. */
export function mountArguments(mounts: readonly BindMount[]): string[] {
    return mounts.flatMap((mount) => ["-v", mountArgument(mount)]);
}

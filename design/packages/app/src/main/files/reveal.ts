/**
 * Showing a folder this app wrote, in the file manager, without becoming a way to open
 * anything at all.
 *
 * The app writes rendered tiles, config folders, downloaded worlds and backup staging
 * directories, and until now offered no route to any of them: the honest answer to "where
 * did my map go" was a path in a settings row that somebody had to copy and paste. A
 * "reveal in Explorer" channel closes that, and it is also the single most dangerous shape
 * of IPC channel in a desktop application - `shell.openPath` will happily launch an
 * executable, and a renderer that can name the path is a renderer that can run it.
 *
 * So this is an **allowlist**, not a traversal check. Refusing `..` alone would still let a
 * compromised or merely buggy renderer name `C:\Windows\System32\cmd.exe`, which contains no
 * traversal at all. The rule is the other way round: the path must resolve to somewhere
 * inside a directory this application owns, and everything else is refused by name.
 *
 * ## Links are the other way out, and they do not look like traversal
 *
 * `<storage>\maps\evil` may be a junction to `C:\Windows`. Comparing the strings would pass
 * it; opening it would open `C:\Windows`. Both sides are therefore resolved through
 * `realpath` *before* they are compared, so what is checked is the directory that will
 * actually be opened rather than the name that was typed.
 *
 * ## Nothing here throws
 *
 * Every refusal is a value carrying a sentence. A rejected `invoke` in the renderer becomes
 * an unhandled promise inside a component and the user sees nothing happen at all, which is
 * indistinguishable from a broken button.
 */

import { posix, win32 } from "node:path";

/** One directory this application owns, and may therefore be asked to open. */
export interface RevealRoot {
    /** Stable identifier, so a result can say which root allowed it. */
    readonly id: string;
    /** What to call it on screen, e.g. "the map storage folder". */
    readonly label: string;
    /** Absolute. A relative root would allow whatever the working directory happens to be. */
    readonly path: string;
}

/** The two methods this module needs from Electron's `shell`, named rather than imported. */
export interface RevealHost {
    /** Opens the containing folder and selects the item. */
    showItemInFolder(path: string): void;
    /** Opens the path itself. Resolves with `""` on success, or with an error message. */
    openPath(path: string): Promise<string>;
}

export type RevealResult =
    | {
          readonly ok: true;
          /** The real path that was opened, after links were resolved. */
          readonly path: string;
          /** `folder` when the folder itself was opened; `item` when it was selected inside its parent. */
          readonly opened: "folder" | "item";
          /** Which allowlisted root permitted it. */
          readonly root: string;
      }
    | { readonly ok: false; readonly reason: string };

export interface RevealOptions {
    /**
     * The directories this app owns, read fresh on every call.
     *
     * A function rather than a list because the storage directory moves while the app is
     * running: `render:setStorageDirectory` changes it, and a captured list would keep
     * allowing the old folder and start refusing the new one.
     */
    readonly roots: () => readonly RevealRoot[];
    readonly host: RevealHost;
    /** Injected so the allowlist is testable with no real links and no real file system. */
    readonly realPath?: ((path: string) => Promise<string>) | undefined;
    /** Resolves to `"directory"`, `"file"`, or null when there is nothing there. */
    readonly kind?: ((path: string) => Promise<"directory" | "file" | null>) | undefined;
    readonly platform?: NodeJS.Platform | undefined;
}

/** Control characters and the NUL that would truncate a path inside a native call. */
const FORBIDDEN = /[\u0000-\u001F]/;

/**
 * True when `candidate` is `root` itself or sits inside it.
 *
 * Pure, and exported, because this is the whole security property and it deserves its own
 * tests. The comparison is by path *segment*, never by string prefix: `C:\data\maps-evil`
 * starts with `C:\data\maps` and is a completely different directory.
 *
 * The grammar comes from the `platform` argument rather than from `node:path`'s own
 * platform-shaped exports. Using the host's would make this function unable to answer a
 * question about any platform but the one it is running on - and `relative` on Windows is
 * case-insensitive, so a POSIX case would quietly pass on a Windows machine and fail on the
 * Linux runner, which is the worst possible place to find out.
 */
export function isInsideRoot(root: string, candidate: string, platform?: NodeJS.Platform): boolean {
    const windows = (platform ?? process.platform) === "win32";
    const path = windows ? win32 : posix;
    const normalize = (value: string): string => (windows ? value.replace(/[\\/]+/g, "\\").toLowerCase() : value);

    const normalizedRoot = normalize(root);
    const normalizedCandidate = normalize(candidate);
    if (normalizedRoot === "" || normalizedCandidate === "") return false;
    if (normalizedRoot === normalizedCandidate) return true;

    const step = path.relative(normalizedRoot, normalizedCandidate);
    if (step === "") return true;
    // `..` leaves the root; an absolute answer means a different drive or share entirely.
    if (step === ".." || step.startsWith(`..${windows ? "\\" : "/"}`)) return false;
    return !path.isAbsolute(step);
}

const defaultKind = async (path: string): Promise<"directory" | "file" | null> => {
    const { stat } = await import("node:fs/promises");
    try {
        const stats = await stat(path);
        return stats.isDirectory() ? "directory" : "file";
    } catch {
        return null;
    }
};

const defaultRealPath = async (path: string): Promise<string> => {
    const { realpath } = await import("node:fs/promises");
    return await realpath(path);
};

/**
 * Opens a path in the file manager, or says why it will not.
 *
 * The order of the checks matters. The shape checks come first because they need no disk
 * at all; the allowlist check comes before anything is opened; and the existence check
 * comes before the allowlist only in the sense that `realpath` needs the path to exist -
 * a path that is not there is refused for being absent, which is the truthful reason.
 */
export async function revealInFileManager(target: unknown, options: RevealOptions): Promise<RevealResult> {
    if (typeof target !== "string") {
        return { ok: false, reason: "No folder was named, so there was nothing to open." };
    }
    const given = target.trim();
    if (given === "") {
        return { ok: false, reason: "No folder was named, so there was nothing to open." };
    }
    if (FORBIDDEN.test(given)) {
        return { ok: false, reason: "That path contains a character that cannot be part of a file name." };
    }
    const platform = options.platform ?? process.platform;
    const absolute = platform === "win32" ? win32.isAbsolute(given) : posix.isAbsolute(given);
    if (!absolute) {
        return {
            ok: false,
            reason:
                `${given} is not a full path, so where it points depends on where the app was started. ` +
                "Only folders this app wrote can be opened, and they are named in full.",
        };
    }

    const roots = options.roots();
    if (roots.length === 0) {
        return {
            ok: false,
            reason: "This build has no folders of its own to open yet, so there was nothing to show.",
        };
    }

    const realPath = options.realPath ?? defaultRealPath;
    const kind = options.kind ?? defaultKind;

    let resolved: string;
    try {
        resolved = await realPath(given);
    } catch {
        return {
            ok: false,
            reason: `There is nothing at ${given}, so there was nothing to open. It may have been moved or deleted.`,
        };
    }

    let allowed: RevealRoot | null = null;
    for (const root of roots) {
        if (root.path.trim() === "") continue;
        let realRoot: string;
        try {
            realRoot = await realPath(root.path);
        } catch {
            // A root that is not there yet - a storage folder before the first render -
            // simply allows nothing. It is not an error, and it must not refuse the others.
            continue;
        }
        if (isInsideRoot(realRoot, resolved, platform)) {
            allowed = root;
            break;
        }
    }

    if (allowed === null) {
        return {
            ok: false,
            reason:
                `${given} is not inside a folder this app owns, so it was not opened. ` +
                `Only ${roots.map((root) => root.label).join(", ")} can be opened from here.`,
        };
    }

    const what = await kind(resolved);
    if (what === null) {
        return { ok: false, reason: `There is nothing at ${given}, so there was nothing to open.` };
    }

    if (what === "file") {
        // Selected inside its parent rather than launched. `showItemInFolder` opens the
        // file manager; `openPath` on a `.exe` would run it, which is the one thing this
        // channel must never be able to do.
        options.host.showItemInFolder(resolved);
        return { ok: true, path: resolved, opened: "item", root: allowed.id };
    }

    const problem = await options.host.openPath(resolved).catch((error: unknown) => String(error));
    if (problem !== "") {
        return { ok: false, reason: `${given} could not be opened: ${problem}` };
    }
    return { ok: true, path: resolved, opened: "folder", root: allowed.id };
}

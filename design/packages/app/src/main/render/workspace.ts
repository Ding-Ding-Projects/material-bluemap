/**
 * Where a render lives on disk.
 *
 * Every render gets one directory and everything it produces stays inside it:
 *
 * ```
 * <storageDir>/<renderId>/
 *   config/            core.conf, webapp.conf, webserver.conf, maps/*.conf, storages/file.conf
 *   config-container/  the same set, written with the *container's* paths inside it
 *   data/              the Mojang client jar, extracted resources, the CLI's own log
 *   web/               settings.json and maps/<id>/... - what gets served
 *   render.json        which engine rendered this, when, and how it ended
 * ```
 *
 * The two config folders are deliberately separate rather than one folder rewritten per
 * run. `config/` names `C:\Users\me\saves\world`; `config-container/` names
 * `/worlds/overworld`, because those paths are what exist inside the container. Writing
 * both into one directory would mean a local render after a container one reading a config
 * full of Linux paths that do not exist on this machine, and reporting a missing world for
 * a world that is right there.
 *
 * The runner also uses the workspace as the child process's working directory. That is
 * belt and braces rather than redundancy: the CLI resolves relative paths against its
 * working directory, so a path this port ever failed to make absolute would land in
 * `<workspace>/` instead of wherever the app happens to have been launched from. The
 * failure mode being guarded against is not hypothetical - running the CLI from the
 * repository root once dropped 47 MB of tiles into `/web` and a 38 MB Mojang client jar
 * into `/data` at the top of the tree.
 */

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { basename, join, posix, resolve, win32 } from "node:path";

export interface RenderWorkspace {
    readonly renderId: string;
    /** `<storageDir>/<renderId>`, absolute. */
    readonly root: string;
    readonly configDir: string;
    /**
     * `<root>/config-container` - the config a containerised run reads.
     *
     * Written on this machine, mounted at `/bluemap/config`, and holding container paths.
     * See the note at the top of the file for why it is not the same folder as `configDir`.
     */
    readonly containerConfigDir: string;
    readonly dataDir: string;
    readonly webRoot: string;
    /** `<webRoot>/maps` - the storage root the engine writes tiles into. */
    readonly storageRoot: string;
    /** `<root>/render.json` - the provenance record. */
    readonly recordFile: string;
}

export function renderWorkspace(storageDir: string, renderId: string): RenderWorkspace {
    const root = resolve(storageDir, renderId);
    const webRoot = join(root, "web");
    return {
        renderId,
        root,
        configDir: join(root, "config"),
        containerConfigDir: join(root, "config-container"),
        dataDir: join(root, "data"),
        webRoot,
        storageRoot: join(webRoot, "maps"),
        recordFile: join(root, "render.json"),
    };
}

/**
 * The id for a world, stable across renders of the same world.
 *
 * Stability is the point. BlueMap's whole model is incremental: `-r` re-renders only
 * the chunks that changed since last time, and it knows what changed from the render
 * state it left in the storage folder. An id derived from a timestamp or a counter
 * would give every render a fresh empty folder and turn a two-second update into a
 * full re-render of the world, every time.
 *
 * The readable half is for the person looking at the folder in a file manager; the hash
 * is what makes it unique, because two worlds called `world` in different directories
 * are two different worlds and must not share a storage folder.
 */
export function renderIdForWorld(worldPath: string): string {
    const absolute = resolve(worldPath);
    // Case-folded before hashing: Windows and macOS both treat `C:\World` and
    // `c:\world` as the same folder, so hashing them to different ids would silently
    // full-re-render a world whose path was typed with different capitalisation.
    const digest = createHash("sha256").update(absolute.toLowerCase()).digest("hex").slice(0, 12);
    const leaf = slug(basename(absolute));
    return leaf.length > 0 ? `${leaf}-${digest}` : digest;
}

function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
}

/**
 * Every render workspace already on disk.
 *
 * A directory listing rather than an index file. An index would be a second thing that
 * can disagree with the first, and the disagreement always resolves the same way: the
 * directories are what actually exist. An empty or unreadable storage directory is
 * simply no renders, which is the correct answer on a first launch.
 */
export async function listRenderIds(storageDir: string): Promise<string[]> {
    try {
        const entries = await readdir(storageDir, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }
}

/**
 * Expands the storage directory the setup step stored.
 *
 * `packages/ui/.../setup/mapStorage.ts` keeps the person's choice in the renderer, and
 * its default is a token form - `%APPDATA%\Worldlens\maps` on Windows, `~/...`
 * elsewhere - because the renderer has no home directory to resolve against. That file
 * states the contract plainly: "the main process expands it when a render starts". This
 * is that expansion, and it is the only place it happens.
 *
 * A value that is already absolute is passed through untouched, which is what happens
 * for anyone who typed their own path.
 *
 * The `platform` decides the path grammar, not just which token to look for. Using the
 * host's own `node:path` here would make this function unable to answer a question
 * about any platform but the one it is running on: `resolve("/mnt/big/maps")` on
 * Windows returns `C:\mnt\big\maps`, which is a different directory on a different
 * drive, invented out of the current working directory.
 */
export function expandStorageDirectory(
    value: string,
    environment: {
        readonly home: string;
        readonly appData?: string | undefined;
        readonly platform?: NodeJS.Platform | undefined;
    },
): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new Error("The map storage directory is empty.");

    const platform = environment.platform ?? process.platform;
    const path = platform === "win32" ? win32 : posix;
    let expanded = trimmed;

    if (platform === "win32") {
        const appData = environment.appData ?? path.join(environment.home, "AppData", "Roaming");
        expanded = expanded.replace(/%APPDATA%/gi, appData);
        expanded = expanded.replace(/%USERPROFILE%/gi, environment.home);
    }

    if (expanded === "~") expanded = environment.home;
    else if (expanded.startsWith("~/") || (platform === "win32" && expanded.startsWith("~\\"))) {
        expanded = path.join(environment.home, expanded.slice(2));
    }

    if (!path.isAbsolute(expanded)) {
        throw new Error(
            `The map storage directory must be an absolute path; '${value}' is not, ` +
                "and expanding it produced " +
                `'${expanded}'.`,
        );
    }
    // `normalize`, never `resolve`: the path is already absolute, and `resolve` would
    // otherwise reach for the working directory the moment that stopped being true.
    return path.normalize(expanded);
}

/**
 * The default storage directory: `<userData>/maps`.
 *
 * The same place `defaultMapStorageDir` in the setup step names, arrived at from the
 * other side. On Windows Electron's `userData` **is** `%APPDATA%\Worldlens`, so
 * the two agree by construction rather than by both hard-coding the same string.
 */
export function defaultStorageDirectory(userData: string): string {
    return join(userData, "maps");
}

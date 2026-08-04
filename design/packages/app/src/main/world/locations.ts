/**
 * Where Minecraft keeps its worlds, without asking anybody to type a path.
 *
 * Nothing here touches the file system. It answers "where would a Minecraft installation
 * be on a machine with this platform, this environment and this home directory", and
 * whether any of those places exists is a separate question asked by `mounts.ts`. Keeping
 * the two apart is what lets the whole path table be tested for Windows from a Linux CI
 * runner, which is not a nicety on this project: `java/discovery.ts` carries a note about
 * the same trap, where path code that quietly used the *running* platform's separator
 * passed on one machine and failed on the other.
 *
 * ## What is looked in, and what is deliberately not
 *
 * The default installation, per platform, and a portable one beside the executable:
 *
 * ```
 * Windows   %APPDATA%\.minecraft\saves
 * macOS     ~/Library/Application Support/minecraft/saves
 * elsewhere ~/.minecraft/saves
 * portable  <directory holding the running executable>/.minecraft/saves
 * ```
 *
 * There is no entry for MultiMC, Prism, ATLauncher or any other third-party launcher, and
 * that is a decision rather than an oversight. Their instance roots move with how they
 * were installed, and nothing in this repository records the real shape of those paths -
 * writing one from memory would produce a row that silently looks in the wrong place and
 * reports "no worlds" about a folder full of them, which is worse than not looking. The
 * user-mounted folders in `mounts.ts` cover them properly: one instance's `.minecraft` is
 * mounted once, with a label, and its worlds join the list like any other. When somebody
 * confirms a launcher's layout from that launcher's own documentation, it belongs here.
 */

import { posix, win32 } from "node:path";

/** Which of the known places a candidate came from. Reported so a row can say where it looked. */
export type MinecraftFolderOrigin = "appdata" | "home" | "application-support" | "beside-executable";

export interface DefaultMinecraftFolder {
    /**
     * Stable across restarts, because a stored label is keyed by it.
     *
     * Derived from the origin rather than from the path so that a machine whose home
     * directory moves keeps the label the person gave the row.
     */
    readonly id: string;
    /** The installation folder, e.g. `C:\Users\me\AppData\Roaming\.minecraft`. */
    readonly installationPath: string;
    /** The `saves` folder inside it, which is what actually holds worlds. */
    readonly savesPath: string;
    readonly origin: MinecraftFolderOrigin;
}

export interface DefaultMinecraftFolderOptions {
    /** Taken as a parameter, never read from `process`. See the note at the top. */
    readonly platform: NodeJS.Platform;
    readonly env?: NodeJS.ProcessEnv;
    /** The user's home directory, for the platforms whose path is anchored there. */
    readonly home?: string;
    /**
     * The directory holding the running executable, for a portable installation.
     *
     * Null when it is not worth asking about - a development run from a checkout, where
     * the "executable" is Node in some toolchain directory and a `.minecraft` beside it
     * would be a coincidence rather than an installation.
     */
    readonly executableDirectory?: string | null;
}

/** Path handling for the platform being asked about, not the one this process runs on. */
function pathApi(platform: NodeJS.Platform): { join: (...parts: string[]) => string } {
    return platform === "win32"
        ? { join: (...parts) => win32.join(...parts) }
        : { join: (...parts) => posix.join(...parts) };
}

/**
 * `APPDATA` is case-insensitive on Windows and Node preserves whatever case the process
 * was handed, so reading `env.APPDATA` alone misses an `AppData` set by a shell.
 */
function envValue(env: NodeJS.ProcessEnv, name: string): string | null {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(env)) {
        if (key.toLowerCase() === wanted && typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }
    }
    return null;
}

/**
 * Every place a Minecraft installation would be on this machine, most likely first.
 *
 * Returns an empty list rather than throwing when nothing can be located - a machine with
 * no `APPDATA` and no home directory is unusual but not an error, and neither is a
 * machine with no Minecraft on it. "There is no Minecraft here" is a normal state that
 * the interface says in words; it is never a failure.
 *
 * The list is deduplicated by `savesPath`, because a portable installation that happens
 * to sit at the default location is one folder and must not be offered twice.
 */
export function defaultMinecraftFolders(
    options: DefaultMinecraftFolderOptions,
): readonly DefaultMinecraftFolder[] {
    const env = options.env ?? {};
    const path = pathApi(options.platform);
    const found: DefaultMinecraftFolder[] = [];

    const add = (installation: string, origin: MinecraftFolderOrigin): void => {
        const savesPath = path.join(installation, "saves");
        if (found.some((candidate) => candidate.savesPath === savesPath)) return;
        found.push({ id: `default:${origin}`, installationPath: installation, savesPath, origin });
    };

    if (options.platform === "win32") {
        const appData = envValue(env, "APPDATA");
        if (appData !== null) add(path.join(appData, ".minecraft"), "appdata");
        else if (options.home !== undefined && options.home.trim() !== "") {
            // The path `%APPDATA%` would have expanded to. Worth building by hand: a
            // process launched without the variable (a service, a stripped environment)
            // is not a machine without Minecraft.
            add(path.join(options.home.trim(), "AppData", "Roaming", ".minecraft"), "appdata");
        }
    } else if (options.platform === "darwin") {
        const home = options.home?.trim() ?? "";
        // Lower case `minecraft`, with no dot, which is what the macOS launcher writes.
        if (home !== "") add(path.join(home, "Library", "Application Support", "minecraft"), "application-support");
    } else {
        const home = options.home?.trim() ?? "";
        if (home !== "") add(path.join(home, ".minecraft"), "home");
    }

    const beside = options.executableDirectory?.trim() ?? "";
    if (beside !== "") add(path.join(beside, ".minecraft"), "beside-executable");

    return found;
}

/**
 * The untranslated English name of a place, for a log line and for a fallback.
 *
 * The interface has its own keyed strings for these, so this is never what a user reads
 * in a translated build. It exists so that a main-process error message can name the
 * place it looked in rather than only its path.
 */
export function describeOrigin(origin: MinecraftFolderOrigin): string {
    switch (origin) {
        case "appdata":
            return "the default Minecraft folder in %APPDATA%";
        case "application-support":
            return "the default Minecraft folder in Application Support";
        case "home":
            return "the default .minecraft folder in your home directory";
        case "beside-executable":
            return "a .minecraft folder beside the application";
    }
}

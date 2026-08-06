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
 * The default Java installation, per platform, a portable one beside the executable, and
 * (Windows only) the Bedrock Edition worlds folder:
 *
 * ```
 * Windows   %APPDATA%\.minecraft\saves
 * macOS     ~/Library/Application Support/minecraft/saves
 * elsewhere ~/.minecraft/saves
 * portable  <directory holding the running executable>/.minecraft/saves
 * Bedrock   %LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\minecraftWorlds
 * ```
 *
 * The Bedrock row is Windows-only because Bedrock's packaged-app storage convention
 * (`%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalState\...`) is a Windows/MSIX thing
 * with no equivalent on the other platforms this repository considers. `<PackageFamilyName>`
 * is `Microsoft.MinecraftUWP_8wekyb3d8bbwe` - a fixed identity Microsoft assigns the
 * Store's Minecraft for Windows app, documented across Microsoft's own developer docs and
 * unrelated to any user's locale or edition. **What was actually verified on a development
 * machine for this feature**: the general `Packages\<PackageFamilyName>\LocalState` shape
 * is real and populated by several other installed packaged apps on that machine (this very
 * application among them, once packaged); the specific Minecraft UWP package was not
 * present there, because Bedrock was not installed on that machine. The row behaves exactly
 * like every other default here when it turns out not to exist: `state: "missing"`, so the
 * interface can say it looked rather than pretending Bedrock support was never considered.
 *
 * There is no entry for CurseForge's, MultiMC's, Prism's, ATLauncher's or any other
 * third-party launcher's own instance root **as a single-`saves` default** - and for the
 * three of those never verified on a development machine (MultiMC, Prism, ATLauncher,
 * GDLauncher, Modrinth), there is no default entry of any kind. Their instance roots move
 * with how they were installed, and nothing in this repository records the real shape of
 * those paths - writing one from memory would produce a row that silently looks in the
 * wrong place and reports "no worlds" about a folder full of them, which is worse than not
 * looking. CurseForge is the one exception, and it is not a guess: a development machine
 * for this feature had CurseForge actually installed, at
 * `<home>\curseforge\minecraft\Instances\<Instance Name>\saves`, each instance folder
 * carrying its own `minecraftinstance.json` beside its `saves`. That default root is
 * offered through `defaultLauncherRoots` below rather than through this function, because
 * expanding it into one row per instance needs a directory read - see `launcherRoots.ts`.
 * For every launcher not confirmed this way, the user-mounted folders in `mounts.ts` cover
 * it properly: `resolveMinecraftFolder` recognises the same `Instances/<name>/saves` shape
 * on anything a person mounts by hand, launcher-name-agnostic, so a folder from an
 * unverified launcher that happens to share CurseForge's convention still works, and one
 * that does not is refused by name rather than silently mislooked-in. When somebody
 * confirms another launcher's real layout from that launcher's own documentation, it
 * belongs here as a proper default.
 */

import { posix, win32 } from "node:path";

/** Which of the known places a candidate came from. Reported so a row can say where it looked. */
export type MinecraftFolderOrigin =
    | "appdata"
    | "home"
    | "application-support"
    | "beside-executable"
    | "bedrock-appdata"
    | "curseforge-default";

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

    const add = (installation: string, origin: MinecraftFolderOrigin, savesChildName = "saves"): void => {
        const savesPath = path.join(installation, savesChildName);
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

        // Bedrock Edition, under the packaged-app storage every Store app on Windows uses.
        // See the module comment for exactly what was verified and what was not.
        const localAppData = envValue(env, "LOCALAPPDATA");
        const localAppDataRoot =
            localAppData ??
            (options.home !== undefined && options.home.trim() !== ""
                ? path.join(options.home.trim(), "AppData", "Local")
                : null);
        if (localAppDataRoot !== null) {
            add(
                path.join(
                    localAppDataRoot,
                    "Packages",
                    "Microsoft.MinecraftUWP_8wekyb3d8bbwe",
                    "LocalState",
                    "games",
                    "com.mojang",
                ),
                "bedrock-appdata",
                "minecraftWorlds",
            );
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

/** A launcher's own root, offered as a candidate rather than a confirmed folder. */
export interface DefaultLauncherRoot {
    readonly root: string;
    readonly origin: MinecraftFolderOrigin;
}

/**
 * Launcher roots worth probing for a multi-instance layout, separately from
 * {@link defaultMinecraftFolders} because expanding one into real rows needs a directory
 * read - see `launcherRoots.ts`'s `detectLauncherRoot`, which this repository's `mounts.ts`
 * calls against each candidate here.
 *
 * CurseForge only, and only on Windows: verified present on a development machine for this
 * feature at `<home>\curseforge\minecraft`, holding an `Instances` directory with one
 * subfolder per modpack instance, each with its own `saves`. See the module comment for
 * what "verified" means here and why no other launcher gets a default candidate.
 */
export function defaultLauncherRoots(options: DefaultMinecraftFolderOptions): readonly DefaultLauncherRoot[] {
    if (options.platform !== "win32") return [];
    const home = options.home?.trim() ?? "";
    if (home === "") return [];
    return [{ root: win32.join(home, "curseforge", "minecraft"), origin: "curseforge-default" }];
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
        case "bedrock-appdata":
            return "the Bedrock Edition worlds folder under %LOCALAPPDATA%";
        case "curseforge-default":
            return "the default CurseForge folder";
    }
}

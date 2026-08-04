/**
 * The worlds already on this machine, and the words that describe one.
 *
 * Step one of the wizard used to be a path field, which asks somebody to know where
 * Minecraft keeps its saves and to type it without a mistake. It now also offers the
 * worlds it can find: the default Minecraft folder for this platform, plus every folder
 * the person has mounted, each world listed with the facts people actually pick by.
 *
 * Everything here is pure. The bridge supplies the rows, this decides how they sort, what
 * their secondary line says, what a search matches against, and where an arrow key moves
 * the selection - so each of those can be tested without a file system and without a DOM,
 * and so the component below is arrangement rather than logic.
 *
 * Two rules run through all of it:
 *
 *  - **Nothing is guessed.** A field the main process could not read is null, and a null
 *    field is left out of the line rather than filled in with something plausible. A
 *    world whose `level.dat` is unreadable still appears, with what is known and a note
 *    saying the rest could not be read, because a world that silently vanishes from a
 *    list somebody knows it belongs in is the worst answer available.
 *  - **The list is an addition, never a replacement.** The typed path, the folder picker
 *    and the drop target all still name a world directly, with nothing mounted and
 *    nothing configured. A world on a USB stick is a normal world.
 */

import { formatBytes } from "../downloads/downloads.js";
import type { Translate } from "./worldFolder.js";

/* -------------------------------------------------------------------------- */
/* The shapes, restated                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Structural mirrors of the preload's own types, restated rather than imported for the
 * same reason `worldBridge.ts` restates its own: this package compiles and runs in three
 * places and only one of them has a preload.
 */
export interface MinecraftFolder {
    readonly id: string;
    readonly label: string;
    readonly labelled: boolean;
    readonly chosenPath: string;
    readonly savesPath: string;
    readonly resolution: "installation" | "saves";
    readonly builtIn: boolean;
    readonly origin: "appdata" | "home" | "application-support" | "beside-executable" | null;
    readonly state: "ok" | "missing" | "not-a-folder" | "unreadable";
    readonly stateDetail: string | null;
    readonly mountedAt: string | null;
}

export interface MinecraftWorldSummary {
    readonly folderId: string;
    readonly path: string;
    readonly directoryName: string;
    readonly name: string | null;
    readonly lastPlayed: number | null;
    readonly versionName: string | null;
    readonly snapshot: boolean | null;
    readonly gameMode: "survival" | "creative" | "adventure" | "spectator" | null;
    readonly hardcore: boolean | null;
    readonly cheats: boolean | null;
    readonly seed: string | null;
    readonly regionFiles: Readonly<Record<string, number>>;
    readonly sizeBytes: number | null;
    readonly sizeComplete: boolean;
    readonly detailsError: string | null;
}

export interface SavesScan {
    readonly folderId: string;
    readonly savesPath: string;
    readonly worlds: readonly MinecraftWorldSummary[];
    readonly truncated: boolean;
}

export type FolderScanResult =
    | { readonly ok: true; readonly scan: SavesScan }
    | { readonly ok: false; readonly folderId: string; readonly message: string };

export type MountFolderResult =
    | { readonly ok: true; readonly folder: MinecraftFolder; readonly alreadyMounted: boolean }
    | { readonly ok: false; readonly message: string };

/**
 * What this surface needs from the shell.
 *
 * All five together or none: a bridge carrying `listMinecraftFolders` and not
 * `scanMinecraftFolder` would present a list of folders whose worlds never arrive, which
 * is a spinner that never stops. When it is null the step shows no list at all and the
 * path field, the picker and the drop target are exactly as they were.
 */
export interface WorldCatalogBridge {
    listMinecraftFolders(): Promise<readonly MinecraftFolder[]>;
    mountMinecraftFolder(folder: string): Promise<MountFolderResult>;
    unmountMinecraftFolder(id: string): Promise<boolean>;
    labelMinecraftFolder(id: string, label: string): Promise<boolean>;
    scanMinecraftFolder(id: string): Promise<FolderScanResult>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The catalog half of the preload, or null when this build has none. */
export function resolveWorldCatalogBridge(): WorldCatalogBridge | null {
    const host = (globalThis as { materialBluemap?: Partial<WorldCatalogBridge> }).materialBluemap;
    if (host === undefined) return null;

    const required = [
        host.listMinecraftFolders,
        host.mountMinecraftFolder,
        host.unmountMinecraftFolder,
        host.labelMinecraftFolder,
        host.scanMinecraftFolder,
    ];
    if (!required.every(isFunction)) return null;

    const complete = host as WorldCatalogBridge;
    return {
        listMinecraftFolders: () => complete.listMinecraftFolders(),
        mountMinecraftFolder: (folder) => complete.mountMinecraftFolder(folder),
        unmountMinecraftFolder: (id) => complete.unmountMinecraftFolder(id),
        labelMinecraftFolder: (id, label) => complete.labelMinecraftFolder(id, label),
        scanMinecraftFolder: (id) => complete.scanMinecraftFolder(id),
    };
}

/**
 * The real path of a dropped file, when the shell can tell us.
 *
 * Electron took `File.path` away in version 32, so this is the only route a renderer has
 * to the location of something dropped on it. Null in a browser tab, where a drop names
 * bytes rather than a place on a disk, and the step says so rather than appearing to
 * accept the drop and doing nothing.
 */
export function pathForDroppedFile(file: File): string | null {
    const host = (globalThis as { materialBluemap?: { pathForDroppedFile?: (f: File) => string | null } })
        .materialBluemap;
    if (!isFunction(host?.pathForDroppedFile)) return null;
    try {
        return host.pathForDroppedFile(file);
    } catch {
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* Sorting, matching and identity                                             */
/* -------------------------------------------------------------------------- */

/**
 * Most recently played first, which is the one somebody almost always wants.
 *
 * A world that has never recorded a `LastPlayed` sorts to the end rather than to the
 * beginning: an unknown date is not "a long time ago", and putting a freshly copied
 * world at the top of the list purely because it has no timestamp would be the list
 * asserting something it does not know. Ties fall back to the name, so the order of two
 * worlds saved in the same second is stable between visits instead of following whatever
 * order the directory happened to be read in.
 */
export function sortWorldsByLastPlayed(
    worlds: readonly MinecraftWorldSummary[],
): readonly MinecraftWorldSummary[] {
    return [...worlds].sort((left, right) => {
        const leftAt = left.lastPlayed ?? -1;
        const rightAt = right.lastPlayed ?? -1;
        if (leftAt !== rightAt) return rightAt - leftAt;
        return displayName(left).localeCompare(displayName(right));
    });
}

/** The name to show: the world's own, falling back to its folder when that is all there is. */
export function displayName(world: MinecraftWorldSummary): string {
    return world.name ?? world.directoryName;
}

/**
 * Two paths that name the same folder.
 *
 * Compared with separators normalised and case folded, because a path picked from a
 * dialog, a path typed by hand and a path read from a directory listing routinely differ
 * in both on Windows and name one folder. This is what stops a world that was dropped in
 * appearing a second time under the row it already has in the list.
 */
export function samePath(left: string, right: string): boolean {
    const clean = (value: string): string =>
        value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return clean(left) !== "" && clean(left) === clean(right);
}

/** The world in the list at this path, or null when the path is somewhere else entirely. */
export function worldAtPath(
    worlds: readonly MinecraftWorldSummary[],
    path: string,
): MinecraftWorldSummary | null {
    return worlds.find((world) => samePath(world.path, path)) ?? null;
}

/* -------------------------------------------------------------------------- */
/* The words                                                                  */
/* -------------------------------------------------------------------------- */

/** "3 August 2026 at 09:14" in the viewer's locale, or null when there is no date. */
export function formatLastPlayed(lastPlayed: number | null): string | null {
    if (lastPlayed === null) return null;
    const at = new Date(lastPlayed);
    if (Number.isNaN(at.getTime())) return null;
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(at);
    } catch {
        return at.toISOString();
    }
}

/**
 * How big the world is, said honestly.
 *
 * A measurement that hit its cap says "at least", because a number that is quietly a
 * fraction of the truth is worse than one that admits which way it is wrong.
 */
export function formatWorldSize(world: MinecraftWorldSummary, t: Translate): string | null {
    if (world.sizeBytes === null) return null;
    const size = formatBytes(world.sizeBytes, t);
    if (size === "") return null;
    return world.sizeComplete
        ? size
        : t("world.list.sizeAtLeast", { size }, "at least {size}");
}

/** The game mode in words, keyed so it translates. Null when the world did not say. */
export function formatGameMode(world: MinecraftWorldSummary, t: Translate): string | null {
    switch (world.gameMode) {
        case "survival":
            return t("world.list.mode.survival", "Survival");
        case "creative":
            return t("world.list.mode.creative", "Creative");
        case "adventure":
            return t("world.list.mode.adventure", "Adventure");
        case "spectator":
            return t("world.list.mode.spectator", "Spectator");
        default:
            return null;
    }
}

/** How many dimensions really have terrain, from the counts the folder inspection made. */
export function dimensionCount(world: MinecraftWorldSummary): number {
    let found = 0;
    for (const [directory, count] of Object.entries(world.regionFiles)) {
        if (directory === "" || count <= 0) continue;
        found += 1;
    }
    return found;
}

/** Every region file across every dimension, which is the size of the job a render faces. */
export function regionFileCount(world: MinecraftWorldSummary): number {
    let total = 0;
    for (const [directory, count] of Object.entries(world.regionFiles)) {
        if (directory === "" || count <= 0) continue;
        total += count;
    }
    return total;
}

/**
 * The small secondary line under a world's name: its details, in the order they matter.
 *
 * Built as a list of parts and joined, so a world missing half of them reads as a shorter
 * sentence rather than as a line full of gaps and stray separators. Nothing here invents
 * a value: a part whose fact was unreadable is simply not in the list.
 */
export function worldDetailParts(
    world: MinecraftWorldSummary,
    folderLabel: string | null,
    t: Translate,
): string[] {
    const parts: string[] = [];

    const played = formatLastPlayed(world.lastPlayed);
    parts.push(
        played === null
            ? t("world.list.neverPlayed", "never opened")
            : t("world.list.lastPlayed", { at: played }, "last played {at}"),
    );

    if (world.versionName !== null) {
        parts.push(
            world.snapshot === true
                ? t("world.list.snapshot", { version: world.versionName }, "{version} snapshot")
                : world.versionName,
        );
    }

    const mode = formatGameMode(world, t);
    if (mode !== null) parts.push(mode);
    if (world.hardcore === true) parts.push(t("world.list.hardcore", "Hardcore"));
    if (world.cheats === true) parts.push(t("world.list.cheats", "cheats on"));

    const dimensions = dimensionCount(world);
    if (dimensions > 0) {
        parts.push(
            t(
                "world.list.dimensions",
                { dimensions, regions: regionFileCount(world) },
                "{dimensions} dimensions, {regions} region files",
            ),
        );
    }

    const size = formatWorldSize(world, t);
    if (size !== null) parts.push(size);

    if (world.seed !== null) parts.push(t("world.list.seed", { seed: world.seed }, "seed {seed}"));

    // The folder on disk, which is not the world's name and is how somebody tells two
    // worlds with the same name apart when everything else about them matches.
    if (world.name !== null && world.directoryName !== world.name) {
        parts.push(t("world.list.folder", { folder: world.directoryName }, "in {folder}"));
    }

    if (folderLabel !== null && folderLabel !== "") {
        parts.push(t("world.list.fromMount", { mount: folderLabel }, "from {mount}"));
    }

    if (world.detailsError !== null) {
        parts.push(t("world.list.unreadableDetails", "its level.dat could not be read"));
    }

    return parts;
}

/** The details as one line, which is what the row shows under the name. */
export function worldDetailLine(
    world: MinecraftWorldSummary,
    folderLabel: string | null,
    t: Translate,
): string {
    return worldDetailParts(world, folderLabel, t).join(" · ");
}

/**
 * What a screen reader says for one option.
 *
 * The name and the whole detail line, because the details are precisely what somebody is
 * choosing between and an option announced as "New World (2)" four times over is an
 * option nobody can choose. It is spoken text rather than a title attribute for the same
 * reason: a tooltip is not an accessible name.
 */
export function worldOptionName(
    world: MinecraftWorldSummary,
    folderLabel: string | null,
    t: Translate,
): string {
    return `${displayName(world)}. ${worldDetailLine(world, folderLabel, t)}`;
}

/**
 * The text a search runs against.
 *
 * Everything the row puts on screen, and nothing it does not: the world's name, its
 * folder on disk, its full path, the label of the folder it came from, and every part of
 * the detail line. Searching for `1.20`, `hardcore` or the name of an install has to find
 * the row showing it, or the search is lying about what it looked at.
 */
export function worldSearchText(
    world: MinecraftWorldSummary,
    folderLabel: string | null,
    t: Translate,
): string {
    return [
        displayName(world),
        world.directoryName,
        world.path,
        folderLabel ?? "",
        ...worldDetailParts(world, folderLabel, t),
    ]
        .filter((value) => value !== "")
        .join(" ");
}

/* -------------------------------------------------------------------------- */
/* The listbox                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Where an arrow key moves the active option.
 *
 * A listbox has one tab stop and the arrows move within it, which is the whole difference
 * between a list somebody can drive from the keyboard and a stack of cards they have to
 * tab through one at a time. Movement stops at the ends rather than wrapping: wrapping in
 * a list of ninety saves silently teleports somebody from the top to the bottom, and the
 * one thing a keyboard user cannot do is glance at where they ended up.
 *
 * Returns the index that should become active, or -1 when the list is empty. Any key this
 * does not handle returns the current index unchanged, which is how the caller knows not
 * to consume the event.
 */
export function nextOptionIndex(key: string, current: number, count: number): number {
    if (count <= 0) return -1;
    const at = current < 0 ? -1 : Math.min(current, count - 1);
    switch (key) {
        case "ArrowDown":
            return at < 0 ? 0 : Math.min(at + 1, count - 1);
        case "ArrowUp":
            return at < 0 ? count - 1 : Math.max(at - 1, 0);
        case "Home":
            return 0;
        case "End":
            return count - 1;
        case "PageDown":
            return at < 0 ? 0 : Math.min(at + 10, count - 1);
        case "PageUp":
            return at < 0 ? count - 1 : Math.max(at - 10, 0);
        default:
            return current;
    }
}

/* -------------------------------------------------------------------------- */
/* The honest states                                                          */
/* -------------------------------------------------------------------------- */

/** What one mounted folder's row says about itself. */
export function describeFolderState(folder: MinecraftFolder, t: Translate): string | null {
    switch (folder.state) {
        case "ok":
            return null;
        case "missing":
            return t(
                "world.mounts.missing",
                { path: folder.savesPath },
                "There is nothing at {path} right now. It stays in the list, because a folder on a drive that is unplugged is not a folder you meant to forget.",
            );
        case "not-a-folder":
            return t("world.mounts.notAFolder", { path: folder.savesPath }, "{path} is a file rather than a folder.");
        case "unreadable":
            return folder.stateDetail ?? t("world.mounts.unreadable", "That folder could not be read.");
    }
}

/** Where a detected folder came from, so the empty state can say where it looked. */
export function describeFolderOrigin(folder: MinecraftFolder, t: Translate): string | null {
    switch (folder.origin) {
        case "appdata":
            return t("world.mounts.origin.appdata", "the default Minecraft folder under %APPDATA%");
        case "application-support":
            return t("world.mounts.origin.applicationSupport", "the default Minecraft folder in Application Support");
        case "home":
            return t("world.mounts.origin.home", "the default .minecraft folder in your home directory");
        case "beside-executable":
            return t("world.mounts.origin.beside", "a .minecraft folder beside this application");
        default:
            return null;
    }
}

/** Which of the two levels a mounted folder turned out to be, said out loud. */
export function describeFolderResolution(folder: MinecraftFolder, t: Translate): string {
    return folder.resolution === "installation"
        ? t(
              "world.mounts.resolvedInstallation",
              { path: folder.savesPath },
              "A Minecraft installation. Its worlds are read from {path}.",
          )
        : t("world.mounts.resolvedSaves", { path: folder.savesPath }, "A saves folder. Its worlds are read from {path}.");
}

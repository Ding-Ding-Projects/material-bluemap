/**
 * What a Minecraft world folder looks like, and what to say when the chosen one
 * is not a Minecraft world folder.
 *
 * A render of the wrong folder does not fail immediately. It fails minutes later,
 * inside a Java process, with a message about a missing `level.dat` that arrives
 * after the app has already promised a map. So the wizard checks first, and says
 * precisely what is wrong: a folder with no `level.dat`, a folder that is the
 * `saves` directory holding several worlds, the `region` directory from inside a
 * world, or a dimension folder one level too deep. Those four are what people
 * actually pick, and each one has a different answer.
 *
 * Everything here is pure. The bridge supplies a listing, this interprets it, so
 * the interpretation can be tested against every one of those cases without a
 * file system. The messages are keyed rather than hard-coded English, so the
 * language modes apply to them like everything else.
 */

import type { MapPreset } from "@material-bluemap/config";

/** One file or directory found inside the chosen folder. */
export interface WorldFolderEntry {
    /** Relative to the chosen folder, forward slashes, no leading `./`. */
    readonly path: string;
    readonly directory: boolean;
}

/**
 * A dimension a Spigot/Paper-style server split into its own sibling folder rather
 * than nesting it inside the chosen one - `world_nether` and `world_the_end` beside
 * `world`, rather than `world/DIM-1` and `world/DIM1`. See `inspect.ts`'s header for
 * why this is looked for by name.
 */
export interface ServerSiblingDimension {
    /** The sibling's own folder, absolute. What BlueMap must be told `world` is, for it. */
    readonly worldFolder: string;
    readonly regionFiles: number;
}

/**
 * A shallow reading of the chosen folder.
 *
 * Region files are counted rather than listed: a mature world holds tens of
 * thousands of `.mca` files, and their names answer no question this wizard asks.
 * The key is the directory holding them, relative to the chosen folder, e.g.
 * `region` or `DIM-1/region`. The empty key is the chosen folder itself, which is
 * how "you picked the region directory" is recognised.
 */
export interface WorldFolderListing {
    /** The folder that was read, absolute. */
    readonly folder: string;
    readonly entries: readonly WorldFolderEntry[];
    readonly regionFiles: Readonly<Record<string, number>>;
    /**
     * The nether and/or the end, when they live in a sibling folder instead. Keyed
     * `"nether"` / `"the_end"`. Optional so every fixture and every bridge built before
     * this existed still satisfies the type; treated as empty when absent.
     */
    readonly serverSiblings?: Readonly<Record<string, ServerSiblingDimension>>;
}

export type WorldProblemCode =
    /** Nothing has been chosen yet. */
    | "empty"
    /** A relative path, which the engine resolves against its own working directory. */
    | "relative"
    /** The folder could not be read at all. */
    | "unreadable"
    /** No `level.dat`, and nothing that explains its absence. */
    | "no-level-dat"
    /** A `level.dat`, but no region files anywhere under it. */
    | "no-region-data"
    /** The `saves` directory: several worlds side by side, none of them chosen. */
    | "saves-folder"
    /** The `region` directory from inside a world. */
    | "region-folder"
    /** A dimension folder (`DIM-1`, `DIM1`) from inside a world. */
    | "dimension-folder";

export interface WorldProblem {
    readonly code: WorldProblemCode;
    /**
     * What was found, for the message: the world names inside a `saves` folder,
     * the folder one level up from a `region` directory, the read error.
     */
    readonly detail: string | null;
}

/** A dimension that really has region files on disk, ready to be offered. */
export interface WorldDimension {
    /** The key BlueMap's `dimension` setting takes, e.g. `minecraft:the_nether`. */
    readonly key: string;
    /**
     * The `dimension-type` key. Equal to {@link key} for everything vanilla, which
     * is what makes the generated config leave the setting out and let BlueMap
     * detect it from the world files.
     */
    readonly dimensionType: string;
    /** Untranslated label, e.g. `The Nether`. Custom dimensions use their key. */
    readonly label: string;
    /** Where its region files are, relative to the world folder that holds it. */
    readonly regionDirectory: string;
    readonly regionFiles: number;
    /** Which of upstream's three map templates suits it. */
    readonly preset: MapPreset;
    /** Upstream's own sort order: 0, 100, 200, then 300 upward for the rest. */
    readonly sorting: number;
    /** True for a dimension a mod or datapack introduced. */
    readonly custom: boolean;
    /**
     * True when this dimension's data lives in a sibling folder rather than inside the
     * world folder that was chosen - a Spigot/Paper-style server layout. When true,
     * {@link worldFolder} is where BlueMap has to be pointed for this dimension specifically.
     */
    readonly external: boolean;
    /**
     * The absolute folder to use as this dimension's `world`, when it differs from the
     * chosen world folder. Only present when {@link external} is true; omitted rather
     * than set to the chosen folder, so a caller cannot forget to fall back to it.
     */
    readonly worldFolder?: string;
}

export interface WorldInspection {
    /** The folder as it was given, trimmed. */
    readonly folder: string;
    /** True when this folder can be rendered as it stands. */
    readonly ok: boolean;
    readonly problems: readonly WorldProblem[];
    /** Every dimension with region files, in sort order. Empty when not a world. */
    readonly dimensions: readonly WorldDimension[];
    readonly hasLevelDat: boolean;
    /** True when the listing was never taken, so nothing was checked. */
    readonly unchecked: boolean;
}

/**
 * The translator the message helpers take, so they work with or without vue-i18n.
 *
 * Both shapes are here because a message carrying a value needs the second one.
 * vue-i18n compiles the fallback as a message too, so it consumes `{folder}` as a
 * named parameter of its own and hands back a sentence with the folder already
 * gone; substituting afterwards has nothing left to substitute. The value has to
 * arrive as argument two, before the message is compiled.
 */
export type Translate = {
    (key: string, fallback: string): string;
    (key: string, named: Readonly<Record<string, unknown>>, fallback: string): string;
};

/** Normalises a path the way every other path in this app is normalised. */
function normalize(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
}

/** The last segment of a path, for naming what was probably picked by mistake. */
export function folderName(folder: string): string {
    const trimmed = folder.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut < 0 ? trimmed : trimmed.slice(cut + 1);
}

/** The folder above this one, or the folder itself when it is already a root. */
export function parentFolder(folder: string): string {
    const trimmed = folder.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut <= 0 ? trimmed : trimmed.slice(0, cut);
}

/**
 * True for a path that names one place on this machine.
 *
 * Mirrors `isAbsolutePath` in the options editor, and for the same reason: the
 * engine resolves a relative path against its own working directory rather than
 * against the config folder, so a relative world path renders whatever happens to
 * sit beside the process.
 */
export function isAbsolutePath(value: string): boolean {
    return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value.trim());
}

const VANILLA: readonly {
    readonly directory: string;
    readonly key: string;
    readonly label: string;
    readonly preset: MapPreset;
    readonly sorting: number;
}[] = [
    { directory: "region", key: "minecraft:overworld", label: "Overworld", preset: "overworld", sorting: 0 },
    { directory: "DIM-1/region", key: "minecraft:the_nether", label: "The Nether", preset: "nether", sorting: 100 },
    { directory: "DIM1/region", key: "minecraft:the_end", label: "The End", preset: "end", sorting: 200 },
];

/** Every vanilla dimension's key, so the custom-dimension loop below never re-lists one of these under its own namespaced identifier. */
const VANILLA_KEYS: ReadonlySet<string> = new Set(VANILLA.map((dimension) => dimension.key));

/**
 * `dimensions/minecraft/<overworld|the_nether|the_end>/region`, upstream's *modern* path
 * for a vanilla dimension - built straight from the dimension's own key, since the key's
 * namespace and value are exactly the two path segments upstream's own
 * `MCAWorld.resolveDimensionFolder` joins under `dimensions/`.
 *
 * `resolveDimensionFolder` in vendored upstream (`core/.../world/mca/MCAWorld.java`)
 * checks this path *before* the legacy one, and a world is free to have all three vanilla
 * dimensions living here rather than at `region`/`DIM-1`/`DIM1` - real worlds on this
 * machine, generated by tooling outside this app, do exactly that. Without this, such a
 * world's own Nether and End were found - the raw region count was never wrong - but
 * mislabelled as unrecognised custom dimensions with the overworld's own preset, which
 * would have rendered the Nether lit like the Overworld.
 */
function modernDirectoryFor(key: string): string {
    const colon = key.indexOf(":");
    const namespace = colon < 0 ? key : key.slice(0, colon);
    const value = colon < 0 ? key : key.slice(colon + 1);
    return `dimensions/${namespace}/${value}/region`;
}

/** `dimensions/<namespace>/<path>/region`, which is where a datapack dimension lives. */
const CUSTOM_DIMENSION = /^dimensions\/([^/]+)\/(.+)\/region$/;

/** Which sibling key ({@link ServerSiblingDimension}) belongs to which vanilla dimension. */
const SIBLING_KEY_FOR: Readonly<Record<string, string>> = {
    "minecraft:the_nether": "nether",
    "minecraft:the_end": "the_end",
};

/**
 * Which dimensions this world actually has.
 *
 * Presence is decided by region files rather than by a directory existing.
 * Minecraft creates `DIM-1` and `DIM1` the moment anybody steps through a portal
 * and leaves them behind afterwards, so an empty one is a dimension nobody has
 * been to, and offering it would produce a map of nothing.
 *
 * `serverSiblings` is where the nether and/or the end are found instead, when a
 * Spigot/Paper-style server split them into their own folders - see `inspect.ts`'s
 * header. A dimension found inside the chosen folder always wins over a same-named
 * sibling: real data beside `level.dat` is never less trustworthy than a folder this
 * reader had to go looking for next door.
 */
export function dimensionsIn(
    regionFiles: Readonly<Record<string, number>>,
    serverSiblings: Readonly<Record<string, ServerSiblingDimension>> = {},
): WorldDimension[] {
    const found: WorldDimension[] = [];

    for (const dimension of VANILLA) {
        const count = regionFiles[dimension.directory] ?? 0;
        if (count > 0) {
            found.push({
                key: dimension.key,
                dimensionType: dimension.key,
                label: dimension.label,
                regionDirectory: dimension.directory,
                regionFiles: count,
                preset: dimension.preset,
                sorting: dimension.sorting,
                custom: false,
                external: false,
            });
            continue;
        }

        // The legacy path is empty or absent; try upstream's modern one before giving
        // up on finding this dimension inside the chosen folder at all.
        const modernDirectory = modernDirectoryFor(dimension.key);
        const modernCount = regionFiles[modernDirectory] ?? 0;
        if (modernCount > 0) {
            found.push({
                key: dimension.key,
                dimensionType: dimension.key,
                label: dimension.label,
                regionDirectory: modernDirectory,
                regionFiles: modernCount,
                preset: dimension.preset,
                sorting: dimension.sorting,
                custom: false,
                external: false,
            });
            continue;
        }

        const siblingKey = SIBLING_KEY_FOR[dimension.key];
        const sibling = siblingKey === undefined ? undefined : serverSiblings[siblingKey];
        if (sibling === undefined || sibling.regionFiles <= 0) continue;
        found.push({
            key: dimension.key,
            dimensionType: dimension.key,
            label: dimension.label,
            regionDirectory: dimension.directory,
            regionFiles: sibling.regionFiles,
            preset: dimension.preset,
            sorting: dimension.sorting,
            custom: false,
            external: true,
            worldFolder: sibling.worldFolder,
        });
    }

    const custom: WorldDimension[] = [];
    for (const [directory, count] of Object.entries(regionFiles)) {
        if (count <= 0) continue;
        const match = CUSTOM_DIMENSION.exec(directory);
        if (match === null) continue;
        const namespace = match[1] ?? "";
        const path = match[2] ?? "";
        const key = `${namespace}:${path}`;
        // A vanilla dimension found under its own modern path was already added above,
        // with its real label, preset and sort order - never listed a second time here
        // as an "unrecognised" dimension with the overworld's own preset baked in.
        if (VANILLA_KEYS.has(key)) continue;
        custom.push({
            key,
            // Left equal to the key so the generated config omits `dimension-type`
            // and lets BlueMap detect it, which is what upstream recommends and the
            // only honest answer for a dimension this app has never seen.
            dimensionType: key,
            label: key,
            regionDirectory: directory,
            regionFiles: count,
            preset: "overworld",
            sorting: 0,
            custom: true,
            external: false,
        });
    }

    custom.sort((left, right) => left.key.localeCompare(right.key));
    custom.forEach((dimension, index) => {
        found.push({ ...dimension, sorting: 300 + index * 100 });
    });

    return found;
}

/** True when this listing is a `saves` folder: worlds side by side, none picked. */
function worldsInside(entries: readonly WorldFolderEntry[]): string[] {
    const names = new Set<string>();
    for (const entry of entries) {
        const path = normalize(entry.path);
        const parts = path.split("/");
        if (parts.length !== 2) continue;
        if ((parts[1] ?? "").toLowerCase() !== "level.dat") continue;
        names.add(parts[0] ?? "");
    }
    return [...names].filter((name) => name !== "").sort();
}

function hasLevelDatAtRoot(entries: readonly WorldFolderEntry[]): boolean {
    return entries.some((entry) => normalize(entry.path).toLowerCase() === "level.dat" && !entry.directory);
}

/** An inspection for a folder nobody has read yet, so the wizard says so rather than guessing. */
export function uncheckedWorld(folder: string): WorldInspection {
    const trimmed = folder.trim();
    const problems: WorldProblem[] = [];
    if (trimmed === "") problems.push({ code: "empty", detail: null });
    else if (!isAbsolutePath(trimmed)) problems.push({ code: "relative", detail: null });

    return {
        folder: trimmed,
        ok: false,
        problems,
        dimensions: [],
        hasLevelDat: false,
        unchecked: true,
    };
}

/** An inspection for a folder the reader could not open, carrying its own words. */
export function unreadableWorld(folder: string, detail: string): WorldInspection {
    return {
        folder: folder.trim(),
        ok: false,
        problems: [{ code: "unreadable", detail }],
        dimensions: [],
        hasLevelDat: false,
        unchecked: false,
    };
}

/**
 * Reads a listing and decides whether it is a world, and what to say when it is
 * not.
 *
 * At most one structural problem is reported. A folder that is the `saves`
 * directory is also a folder with no `level.dat`, and saying both would bury the
 * sentence that actually helps under one that does not.
 */
export function inspectWorldFolder(listing: WorldFolderListing): WorldInspection {
    const folder = listing.folder.trim();
    if (folder === "") return uncheckedWorld("");

    const problems: WorldProblem[] = [];
    if (!isAbsolutePath(folder)) problems.push({ code: "relative", detail: null });

    const hasLevelDat = hasLevelDatAtRoot(listing.entries);
    const dimensions = dimensionsIn(listing.regionFiles, listing.serverSiblings ?? {});
    const name = folderName(folder);
    const rootRegionFiles = listing.regionFiles[""] ?? 0;

    if (!hasLevelDat && rootRegionFiles > 0) {
        // The region directory itself: `.mca` files sitting directly in the folder.
        problems.push({ code: "region-folder", detail: parentFolder(folder) });
    } else if (!hasLevelDat && /^DIM-?\d+$/i.test(name) && dimensions.length > 0) {
        problems.push({ code: "dimension-folder", detail: parentFolder(folder) });
    } else if (!hasLevelDat) {
        const worlds = worldsInside(listing.entries);
        if (worlds.length > 0) problems.push({ code: "saves-folder", detail: worlds.join(", ") });
        else problems.push({ code: "no-level-dat", detail: name });
    } else if (dimensions.length === 0) {
        problems.push({ code: "no-region-data", detail: name });
    }

    return {
        folder,
        ok: problems.length === 0,
        problems,
        dimensions,
        hasLevelDat,
        unchecked: false,
    };
}

/** What a problem says, and what to do about it. */
export interface WorldProblemText {
    /** One sentence naming what is wrong. */
    readonly title: string;
    /** One sentence naming the fix. Empty when the title is the whole answer. */
    readonly fix: string;
}

/**
 * The words for a problem.
 *
 * Facts first: every one of these names the folder, what was found in it, and
 * what to choose instead. The language mode and the funny level style the
 * sentences around them; the folder name and the file name never move.
 */
export function describeWorldProblem(problem: WorldProblem, t: Translate): WorldProblemText {
    const detail = problem.detail ?? "";

    switch (problem.code) {
        case "empty":
            return {
                title: t("world.folder.empty", "No world folder chosen yet."),
                fix: t("world.folder.emptyFix", "Choose the save folder of the world you want a map of, the one that contains level.dat."),
            };
        case "relative":
            return {
                title: t("world.folder.relative", "That path is relative, so where it points depends on where the app was started."),
                fix: t("world.folder.relativeFix", "Use a full path, starting from a drive letter or from the root of the file system."),
            };
        case "unreadable":
            return {
                title: t("world.folder.unreadable", "That folder could not be read."),
                fix: detail,
            };
        case "region-folder":
            return {
                title: t(
                    "world.folder.regionFolder",
                    "That is the region folder from inside a world. It holds the map data, but not the world itself.",
                ),
                // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: the
                // folder is the whole point of the sentence, and the `replace` form
                // loses it to vue-i18n's own compiler before it can be substituted.
                fix: t("world.folder.regionFolderFix", { parent: detail }, "Go up one level and choose {parent} instead."),
            };
        case "dimension-folder":
            return {
                title: t(
                    "world.folder.dimensionFolder",
                    "That is one dimension of a world rather than the world. BlueMap picks the dimension itself, from the world folder.",
                ),
                fix: t("world.folder.dimensionFolderFix", { parent: detail }, "Go up one level and choose {parent} instead."),
            };
        case "saves-folder":
            return {
                title: t(
                    "world.folder.savesFolder",
                    { worlds: detail },
                    "That folder holds several worlds rather than being one: {worlds}.",
                ),
                fix: t("world.folder.savesFolderFix", "Open it and choose the one world you want a map of."),
            };
        case "no-level-dat":
            return {
                title: t(
                    "world.folder.noLevelDat",
                    { folder: detail },
                    "There is no level.dat in {folder}, so it is not a Minecraft world.",
                ),
                fix: t(
                    "world.folder.noLevelDatFix",
                    "A world folder contains level.dat and a region folder. On a server it is usually called world; in the game it is under saves.",
                ),
            };
        case "no-region-data":
            return {
                title: t(
                    "world.folder.noRegionData",
                    { folder: detail },
                    "{folder} is a world, but no dimension in it has any region files, so there is nothing to render yet.",
                ),
                fix: t(
                    "world.folder.noRegionDataFix",
                    "Load the world in Minecraft and visit it once, then choose it again. Region files appear as soon as terrain is generated.",
                ),
            };
    }
}

/** A one-line summary of what was found, for the step header and the review. */
export function describeWorld(inspection: WorldInspection, t: Translate): string {
    if (inspection.unchecked) {
        return t("world.folder.unchecked", "Not checked yet. This build cannot read folders, so the world is taken as given.");
    }
    if (!inspection.ok) {
        const first = inspection.problems[0];
        return first === undefined ? "" : describeWorldProblem(first, t).title;
    }
    const total = inspection.dimensions.reduce((sum, dimension) => sum + dimension.regionFiles, 0);
    return t(
        "world.folder.ok",
        { dimensions: inspection.dimensions.length, regions: total },
        "A Minecraft world with {dimensions} dimensions and {regions} region files.",
    );
}

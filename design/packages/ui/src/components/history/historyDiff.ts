/**
 * Turning two versions of a config file into a list of settings that changed.
 *
 * ## Why a unified patch is the wrong unit here
 *
 * A patch is a diff of *lines*, and these files are not lines, they are settings. The two
 * coincide often enough that a patch looks acceptable and then stops being so exactly when
 * it matters. Some examples this module exists to fix:
 *
 *  - `-sky-color: "#7dabff"` / `+sky-color: "#ffffff"` is two lines the reader has to
 *    compare character by character to learn one fact. `sky-color: #7dabff to #ffffff` is
 *    the fact.
 *  - A key moved from the top of the file to the bottom with the same value is a five-line
 *    patch describing a change that did not happen.
 *  - A comment somebody added above a setting is a patch hunk with no setting change in it
 *    at all, and it sits between the reader and the change they were looking for.
 *  - A value written across several lines shows up in a patch as whichever of those lines
 *    happened to differ, which can be none of the interesting ones.
 *
 * So this reads both sides with the same HOCON model the editor writes files with, flattens
 * each to `dotted.key -> value`, and reports the difference between those two maps. What
 * comes out is what a person would say happened.
 *
 * ## The raw patch never goes away
 *
 * Every readable diff carries its patch, and the interface keeps it behind a disclosure.
 * That is not a hedge, it is the honest answer to two real cases: a file this editor does
 * not model, and a change the flattening genuinely loses (a comment, an ordering, a
 * formatting choice). When either happens, {@link readableFileDiff} says so in
 * `unreadable` and the interface shows the patch instead of pretending there was nothing
 * to see.
 *
 * ## Nothing here throws
 *
 * A config file in a history is by definition a file that once existed on somebody's disk,
 * which means it may be half-written, truncated by a crashed editor, or not a config file
 * at all. Every parse is caught and turned into a sentence. A history panel that threw
 * while rendering a row would take out the one screen the user opened to recover from
 * whatever went wrong.
 */

import { HoconError, parseHocon, resolve, type PlainValue } from "@material-bluemap/config";

import type { HistoryChangeStatus, HistoryComparisonFile } from "./historyHost.js";

/**
 * The largest file this module will parse.
 *
 * The main process caps what it sends at half a megabyte; this is the second, smaller cap,
 * because parsing happens on the interface thread and a quarter of a megabyte of HOCON is
 * already far beyond any config file BlueMap writes. Past it the raw patch is the better
 * answer anyway.
 */
export const MAX_READABLE_TEXT = 256 * 1024;

/**
 * The most settings one file's readable diff lists before it starts counting.
 *
 * A first snapshot of a folder, or a comparison spanning a month, can move hundreds of
 * settings. Rendering all of them turns the row into the wall of text this module exists to
 * replace, so the rest are counted and the raw patch behind the disclosure still holds
 * every one.
 */
export const MAX_LISTED_SETTINGS = 60;

/* -------------------------------------------------------------------------- */
/* Naming a config file the way the rest of the editor names it               */
/* -------------------------------------------------------------------------- */

/**
 * What kind of config file a path is, and what it is called.
 *
 * Structured rather than a finished sentence, because the sentence has to be built with
 * `t()` in whichever language mode is on, and a module that returned "the nether map" would
 * have hard-coded English into the one layer that has no business holding any. The main
 * process makes the same distinction for its commit labels; this is its interface twin.
 */
export type ConfigFileKind = "map" | "storage" | "core" | "webapp" | "webserver" | "plugin" | "other";

export interface ConfigFileName {
    readonly kind: ConfigFileKind;
    /** The map or storage id, e.g. `nether`. Empty for the root files and for `other`. */
    readonly name: string;
    /** The path, always, so an unrecognised file still has something honest to show. */
    readonly path: string;
}

export function configFileName(path: string): ConfigFileName {
    const clean = path.trim().replaceAll("\\", "/");
    const segments = clean.split("/");
    const fileName = segments[segments.length - 1] ?? clean;
    const bare = fileName.replace(/\.(?:conf|json)$/i, "");

    if (segments.length === 2) {
        const folder = (segments[0] ?? "").toLowerCase();
        if (folder === "maps") return { kind: "map", name: bare, path: clean };
        if (folder === "storages") return { kind: "storage", name: bare, path: clean };
        return { kind: "other", name: "", path: clean };
    }
    if (segments.length !== 1) return { kind: "other", name: "", path: clean };

    switch (bare.toLowerCase()) {
        case "core":
            return { kind: "core", name: "", path: clean };
        case "webapp":
            return { kind: "webapp", name: "", path: clean };
        case "webserver":
            return { kind: "webserver", name: "", path: clean };
        case "plugin":
            return { kind: "plugin", name: "", path: clean };
        default:
            return { kind: "other", name: "", path: clean };
    }
}

/* -------------------------------------------------------------------------- */
/* Reading a file into settings                                               */
/* -------------------------------------------------------------------------- */

/** The shapes this module can read, chosen by extension because that is what BlueMap does. */
export type ReadableFormat = "hocon" | "json";

export function formatOf(path: string): ReadableFormat | null {
    const lower = path.toLowerCase();
    if (lower.endsWith(".conf")) return "hocon";
    if (lower.endsWith(".json")) return "json";
    return null;
}

export type SettingMap = ReadonlyMap<string, PlainValue>;

export type ReadOutcome =
    | { readonly ok: true; readonly settings: SettingMap }
    | { readonly ok: false; readonly reason: string };

/**
 * Flattens a parsed document into `dotted.key -> value`.
 *
 * An array is a leaf rather than a branch, deliberately. Treating `hires-render-mask` as
 * four settings called `[0]`, `[1]`, `[2]`, `[3]` and reporting that three of them shifted
 * because one item was inserted at the front describes what a diff algorithm did rather
 * than what a person did. One line reading "the render mask changed" and showing both lists
 * is the true statement.
 *
 * An empty object is also a leaf, because the alternative is that a key which exists on one
 * side and not the other disappears from the comparison entirely.
 */
export function flattenSettings(value: PlainValue, prefix = "", into = new Map<string, PlainValue>()): SettingMap {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.keys(value).length === 0
    ) {
        if (prefix !== "") into.set(prefix, value);
        return into;
    }

    for (const [key, child] of Object.entries(value)) {
        flattenSettings(child, prefix === "" ? key : `${prefix}.${key}`, into);
    }
    return into;
}

/** One file's settings, or a sentence saying why there are none to show. */
export function readSettings(path: string, text: string): ReadOutcome {
    const format = formatOf(path);
    if (format === null) {
        return { ok: false, reason: `${path} is not a file this editor reads, so only the raw patch is shown.` };
    }
    if (text.length > MAX_READABLE_TEXT) {
        return { ok: false, reason: `${path} is too large to read setting by setting, so only the raw patch is shown.` };
    }

    try {
        const parsed: PlainValue =
            format === "hocon" ? (resolve(parseHocon(text)) as PlainValue) : (JSON.parse(text) as PlainValue);
        return { ok: true, settings: flattenSettings(parsed) };
    } catch (error) {
        // A HOCON error carries its own line and column, which is exactly what somebody
        // staring at a file that will not load wants to be told.
        const reason =
            error instanceof HoconError
                ? `${path} could not be read: ${error.message}`
                : `${path} could not be read: ${error instanceof Error ? error.message : String(error)}`;
        return { ok: false, reason };
    }
}

/* -------------------------------------------------------------------------- */
/* Formatting a value for a person                                            */
/* -------------------------------------------------------------------------- */

/** How long a formatted value may be before it is cut and marked as cut. */
export const MAX_VALUE_LENGTH = 160;

/**
 * A value as somebody would say it out loud.
 *
 * Strings lose their quotes, because `sky-color: #7dabff to #ffffff` reads better than
 * `sky-color: "#7dabff" to "#ffffff"` and nothing is lost - except for the empty string,
 * which without its quotes would render as nothing at all and read as a missing value
 * rather than as a value that is empty.
 */
export function formatSettingValue(value: PlainValue): string {
    if (value === null) return "null";
    if (typeof value === "string") return value === "" ? '""' : value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
        const text = `[${value.map((item) => formatSettingValue(item)).join(", ")}]`;
        return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
    }
    return "{}";
}

/** Whether two settings hold the same value, structurally rather than by their printed form. */
export function sameValue(left: PlainValue | undefined, right: PlainValue | undefined): boolean {
    if (left === undefined || right === undefined) return left === right;
    return JSON.stringify(left) === JSON.stringify(right);
}

/* -------------------------------------------------------------------------- */
/* The diff itself                                                            */
/* -------------------------------------------------------------------------- */

export type SettingChangeKind = "added" | "changed" | "gone";

export interface SettingChange {
    /** The dotted key, e.g. `sky-color` or `render-edges.enabled`. */
    readonly key: string;
    readonly kind: SettingChangeKind;
    /** The formatted old value, or null when the setting was not there before. */
    readonly before: string | null;
    /** The formatted new value, or null when the setting is not there any more. */
    readonly after: string | null;
    /** The raw new value, so a restore can put back exactly what was there. */
    readonly beforeValue: PlainValue | undefined;
}

/** Every setting whose value differs, in key order so two runs read the same way. */
export function diffSettings(before: SettingMap, after: SettingMap): SettingChange[] {
    const keys = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) =>
        left.localeCompare(right),
    );

    const changes: SettingChange[] = [];
    for (const key of keys) {
        const had = before.has(key);
        const has = after.has(key);
        const old = before.get(key);
        const now = after.get(key);
        if (had && has && sameValue(old, now)) continue;

        changes.push({
            key,
            kind: !had ? "added" : !has ? "gone" : "changed",
            before: had ? formatSettingValue(old as PlainValue) : null,
            after: has ? formatSettingValue(now as PlainValue) : null,
            beforeValue: old,
        });
    }
    return changes;
}

export interface ReadableFileDiff {
    readonly path: string;
    readonly status: HistoryChangeStatus;
    readonly file: ConfigFileName;
    /**
     * The settings that changed, or null when this file could not be read as settings.
     *
     * Null and empty mean different things and the interface says both differently: null is
     * "here is the raw patch instead", empty is "the file changed but no setting did", which
     * is a real and useful thing to be told - it means a comment or some formatting moved.
     */
    readonly settings: readonly SettingChange[] | null;
    /** Why `settings` is null, or why some were left out. Null when neither happened. */
    readonly unreadable: string | null;
    /** How many settings changed in total, which is more than `settings` when it was cut. */
    readonly total: number;
    /** The unified patch, always, kept behind a disclosure in the interface. */
    readonly patch: string;
}

/**
 * One file of a comparison, read as settings where that is possible and as a patch where it
 * is not.
 *
 * A file that was added or taken away is still diffed rather than short-circuited: "added
 * the nether map, with world: world and 6 other settings" is a more useful row than "added
 * maps/nether.conf", and it costs one parse of a file that is already in hand.
 */
export function readableFileDiff(file: HistoryComparisonFile): ReadableFileDiff {
    const named = configFileName(file.path);
    const base: Omit<ReadableFileDiff, "settings" | "unreadable" | "total"> = {
        path: file.path,
        status: file.status,
        file: named,
        patch: file.patch,
    };

    if (file.withheld !== null) {
        return { ...base, settings: null, unreadable: file.withheld, total: 0 };
    }

    const older = file.before === null ? { ok: true as const, settings: new Map() } : readSettings(file.path, file.before);
    if (!older.ok) return { ...base, settings: null, unreadable: older.reason, total: 0 };

    const newer = file.after === null ? { ok: true as const, settings: new Map() } : readSettings(file.path, file.after);
    if (!newer.ok) return { ...base, settings: null, unreadable: newer.reason, total: 0 };

    const changes = diffSettings(older.settings, newer.settings);
    const listed = changes.slice(0, MAX_LISTED_SETTINGS);

    return {
        ...base,
        settings: listed,
        unreadable:
            changes.length > listed.length
                ? `${String(changes.length - listed.length)} further settings changed. The raw patch below has all of them.`
                : null,
        total: changes.length,
    };
}

/** Every file of a comparison, read. */
export function readableDiff(files: readonly HistoryComparisonFile[]): ReadableFileDiff[] {
    return files.map((file) => readableFileDiff(file));
}

/* -------------------------------------------------------------------------- */
/* What a comparison amounts to, in one line                                  */
/* -------------------------------------------------------------------------- */

export interface DiffTotals {
    readonly files: number;
    readonly added: number;
    readonly modified: number;
    readonly deleted: number;
    /** Settings changed across every file this module could read. */
    readonly settings: number;
    /** Files whose settings could not be read, so the count above is a floor, not a total. */
    readonly unreadable: number;
}

export function diffTotals(files: readonly ReadableFileDiff[]): DiffTotals {
    let added = 0;
    let modified = 0;
    let deleted = 0;
    let settings = 0;
    let unreadable = 0;

    for (const file of files) {
        if (file.status === "added") added += 1;
        else if (file.status === "deleted") deleted += 1;
        else modified += 1;

        if (file.settings === null) unreadable += 1;
        else settings += file.total;
    }

    return { files: files.length, added, modified, deleted, settings, unreadable };
}

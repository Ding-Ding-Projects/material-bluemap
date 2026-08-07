/**
 * Merging one old setting back into a file that has moved on since.
 *
 * ## Why this is a merge rather than a copy
 *
 * Putting a whole file back is a copy: the bytes from the revision become the bytes on
 * disk. Putting one *setting* back cannot be, because everything else in that file has to
 * survive it - the other forty settings, every comment explaining them, the blank lines,
 * the order they were written in. So the current file is read, one key is given its old
 * value, and the file is written out again through the same round-tripping HOCON writer the
 * editor saves with, which is what keeps the comments.
 *
 * That is also why this lives in the interface rather than in the main process. The reader
 * and writer that round-trip are `@worldlens/config`, which the editor already
 * depends on; a second copy of them in the main process would be a second HOCON
 * implementation to disagree with the one that writes every save. What the main process
 * keeps is everything that makes the write *safe* - the revision has to exist, the path has
 * to be one the editor would write, the file has to be one that revision or the folder
 * holds, what is on disk is snapshotted first, and the result is recorded as a new revision
 * that can itself be undone.
 *
 * ## A refusal is a sentence, never a silent skip
 *
 * Three things can go wrong and each is reported by name rather than dropped: the file is
 * not there now (put the whole file back instead), the file cannot be parsed (the raw patch
 * is the honest answer), and the key is not one this reader can address. A partial merge
 * that quietly did three of four settings would leave somebody believing a setting was
 * restored when it was not, which is the one outcome worse than refusing.
 *
 * ## JSON is rewritten, HOCON is edited in place
 *
 * A `.conf` keeps its formatting because the HOCON writer puts it back. A `.json` is parsed
 * and re-serialised in this editor's own indentation, because JSON carries no comments and
 * there is nothing to preserve except a whitespace convention. {@link mergeSettingsBack}
 * says so on any JSON file it touches rather than letting the reformatting arrive as a
 * surprise in the next diff.
 */

import {
    deleteValue,
    parseHocon,
    resolve,
    setPlainValue,
    writeHocon,
    type PlainValue,
} from "@worldlens/config";

import { flattenSettings, formatOf, MAX_READABLE_TEXT } from "./historyDiff.js";
import type { HistoryMergedFile } from "./historyHost.js";

/** One setting somebody asked to have back, named by the file it lives in. */
export interface SettingSelection {
    /** The config file's path, relative and slash-separated, e.g. `maps/nether.conf`. */
    readonly path: string;
    /** The dotted key, e.g. `sky-color` or `render-edges.enabled`. */
    readonly key: string;
}

/** A setting that could not be put back, and the reason in the words a user would use. */
export interface RefusedSetting {
    readonly path: string;
    readonly key: string;
    readonly reason: string;
}

export interface MergePlan {
    /** The files to write, with their merged contents. Empty when nothing could be merged. */
    readonly files: readonly HistoryMergedFile[];
    /** The keys that really are in those files, for the revision's label. */
    readonly keys: readonly string[];
    readonly refused: readonly RefusedSetting[];
    /** Files whose formatting will change because JSON has none to keep. */
    readonly reformatted: readonly string[];
}

/** The path segments of a dotted key, the way HOCON reads a path expression. */
function segmentsOf(key: string): string[] {
    return key.split(".").filter((segment) => segment !== "");
}

/** Reads a value out of a plain object by dotted path, or `undefined` when it is not there. */
function valueAt(root: PlainValue, key: string): PlainValue | undefined {
    let cursor: PlainValue = root;
    for (const segment of segmentsOf(key)) {
        if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) return undefined;
        const next: PlainValue | undefined = (cursor as { [name: string]: PlainValue })[segment];
        if (next === undefined) return undefined;
        cursor = next;
    }
    return cursor;
}

/** Writes a value into a plain object by dotted path, creating the objects on the way. */
function putAt(root: { [name: string]: PlainValue }, key: string, value: PlainValue): void {
    const segments = segmentsOf(key);
    let cursor = root;
    for (const segment of segments.slice(0, -1)) {
        const existing = cursor[segment];
        if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
            cursor = existing;
        } else {
            const created: { [name: string]: PlainValue } = {};
            cursor[segment] = created;
            cursor = created;
        }
    }
    const last = segments[segments.length - 1];
    if (last !== undefined) cursor[last] = value;
}

/** Takes a key out of a plain object by dotted path, leaving everything around it alone. */
function dropAt(root: { [name: string]: PlainValue }, key: string): void {
    const segments = segmentsOf(key);
    let cursor: { [name: string]: PlainValue } = root;
    for (const segment of segments.slice(0, -1)) {
        const existing = cursor[segment];
        if (typeof existing !== "object" || existing === null || Array.isArray(existing)) return;
        cursor = existing;
    }
    const last = segments[segments.length - 1];
    if (last !== undefined) Reflect.deleteProperty(cursor, last);
}

/** The settings of one file at one moment, or null when it cannot be read as settings. */
function settingsOf(path: string, text: string | null): ReadonlyMap<string, PlainValue> | null {
    if (text === null) return new Map();
    const format = formatOf(path);
    if (format === null || text.length > MAX_READABLE_TEXT) return null;
    try {
        const parsed: PlainValue =
            format === "hocon" ? (resolve(parseHocon(text)) as PlainValue) : (JSON.parse(text) as PlainValue);
        return flattenSettings(parsed);
    } catch {
        return null;
    }
}

/**
 * Builds the file contents that put the chosen settings back.
 *
 * `atRevision` and `now` are the file texts at each end, keyed by path; a null value means
 * the file was not there at that moment, which is a real and different case from an empty
 * file. Nothing is written here - this returns the text, and the caller hands it to the
 * host, which is where the snapshot and the recording happen.
 */
export function mergeSettingsBack(
    selections: readonly SettingSelection[],
    atRevision: ReadonlyMap<string, string | null>,
    now: ReadonlyMap<string, string | null>,
): MergePlan {
    const files: HistoryMergedFile[] = [];
    const keys: string[] = [];
    const refused: RefusedSetting[] = [];
    const reformatted: string[] = [];

    const byFile = new Map<string, string[]>();
    for (const selection of selections) {
        const existing = byFile.get(selection.path);
        if (existing === undefined) byFile.set(selection.path, [selection.key]);
        else if (!existing.includes(selection.key)) existing.push(selection.key);
    }

    for (const [path, wanted] of byFile) {
        const currentText = now.get(path) ?? null;
        if (currentText === null) {
            for (const key of wanted) {
                refused.push({
                    path,
                    key,
                    reason:
                        "That file is not in the folder now, so a single setting cannot be merged " +
                        "into it. Put the whole file back instead.",
                });
            }
            continue;
        }

        const format = formatOf(path);
        if (format === null) {
            for (const key of wanted) {
                refused.push({ path, key, reason: "This editor does not read that file setting by setting." });
            }
            continue;
        }

        const old = settingsOf(path, atRevision.get(path) ?? null);
        if (old === null) {
            for (const key of wanted) {
                refused.push({
                    path,
                    key,
                    reason: "That file could not be read at the chosen revision, so its old value is unknown.",
                });
            }
            continue;
        }

        const merged = format === "hocon" ? mergeHocon(currentText, wanted, old) : mergeJson(currentText, wanted, old);
        if (!merged.ok) {
            for (const key of wanted) refused.push({ path, key, reason: merged.reason });
            continue;
        }

        // An unchanged file is left out rather than written back identically: writing it
        // would put a revision in the panel describing an edit that did not happen.
        if (merged.text === currentText) {
            for (const key of wanted) {
                refused.push({ path, key, reason: "That setting already holds the value it had then." });
            }
            continue;
        }

        files.push({ path, text: merged.text });
        for (const key of wanted) keys.push(key);
        if (format === "json") reformatted.push(path);
    }

    return { files, keys, refused, reformatted };
}

type MergeOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string };

/**
 * The HOCON path: edit the document, keep everything the editor did not touch.
 *
 * `setPlainValue` and `deleteValue` are the same two calls the config editor makes for an
 * ordinary edit, which is the point - a setting put back by the history panel and the same
 * setting typed in by hand produce the same file.
 */
function mergeHocon(text: string, keys: readonly string[], old: ReadonlyMap<string, PlainValue>): MergeOutcome {
    let document;
    try {
        document = parseHocon(text);
    } catch (error) {
        return {
            ok: false,
            reason: `That file could not be read as it is now: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }

    for (const key of keys) {
        const segments = segmentsOf(key);
        if (segments.length === 0) continue;
        const value = old.get(key);
        document = value === undefined ? deleteValue(document, segments) : setPlainValue(document, segments, value);
    }

    try {
        return { ok: true, text: writeHocon(document) };
    } catch (error) {
        return {
            ok: false,
            reason: `That file could not be written back: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/** The JSON path: parse, set, re-serialise. There are no comments to keep. */
function mergeJson(text: string, keys: readonly string[], old: ReadonlyMap<string, PlainValue>): MergeOutcome {
    let parsed: PlainValue;
    try {
        parsed = JSON.parse(text) as PlainValue;
    } catch (error) {
        return {
            ok: false,
            reason: `That file could not be read as it is now: ${
                error instanceof Error ? error.message : String(error)
            }`,
        };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { ok: false, reason: "That file does not hold settings this editor can address one at a time." };
    }

    const root = parsed as { [name: string]: PlainValue };
    for (const key of keys) {
        const value = old.get(key);
        if (value === undefined) dropAt(root, key);
        else putAt(root, key, value);
    }

    return { ok: true, text: `${JSON.stringify(root, null, 4)}\n` };
}

/** Whether a dotted key can be addressed at all, which the interface checks before offering it. */
export function isAddressableKey(key: string): boolean {
    return segmentsOf(key).length > 0;
}

/** Reads a value out of a flattened settings map by its dotted key. Exported for tests. */
export function settingValueAt(root: PlainValue, key: string): PlainValue | undefined {
    return valueAt(root, key);
}

/**
 * Editing a parsed HOCON document without losing the rest of the file.
 *
 * The options GUI never rebuilds a config file from a plain object. It loads the
 * file BlueMap generated, changes the one value the user changed, and writes it
 * back, so every comment, blank line and hand-written note that was in the file
 * before is still there afterwards. These helpers are how that happens.
 *
 * Every function returns a new document; nothing is mutated in place.
 */

import type { HoconDocument, HoconEntry, HoconObject, HoconValue, PlainValue, Trivia } from "./document.js";

/** Converts a plain value into a document node, with no source text attached. */
export function toHoconValue(value: PlainValue): HoconValue {
    if (value === null) return { type: "null" };
    if (typeof value === "boolean") return { type: "boolean", value };
    if (typeof value === "number") return { type: "number", value };
    if (typeof value === "string") return { type: "string", value };
    if (Array.isArray(value)) {
        return {
            type: "array",
            items: value.map((item) => ({ leading: [], value: toHoconValue(item), trailingComma: false })),
            trailing: [],
            inline: value.length === 0,
        };
    }
    return {
        type: "object",
        entries: Object.entries(value).map(([key, child]) => ({
            segments: [key],
            rawKey: key,
            leading: [],
            separator: ":" as const,
            value: toHoconValue(child),
            trailingComma: false,
        })),
        trailing: [],
        inline: Object.keys(value).length === 0,
        braced: true,
    };
}

function matchesSegments(entry: HoconEntry, segments: readonly string[]): boolean {
    if (entry.segments.length !== segments.length) return false;
    return entry.segments.every((segment, index) => segment === segments[index]);
}

/**
 * Finds the entry holding `path`, following both nested objects and HOCON path
 * expressions. The last matching entry wins, because that is the one HOCON's
 * merge rules leave in effect.
 */
export function findEntry(object: HoconObject, path: readonly string[]): HoconEntry | undefined {
    if (path.length === 0) return undefined;

    let found: HoconEntry | undefined;
    for (const entry of object.entries) {
        if (matchesSegments(entry, path)) {
            found = entry;
            continue;
        }
        // `log: { file: ... }` reached as ["log", "file"].
        if (entry.segments.length < path.length && entry.value.type === "object") {
            const prefix = path.slice(0, entry.segments.length);
            if (matchesSegments(entry, prefix)) {
                const nested = findEntry(entry.value, path.slice(entry.segments.length));
                if (nested !== undefined) found = nested;
            }
        }
    }
    return found;
}

/** True when `path` is present in the document at all. */
export function hasValue(document: HoconDocument, path: readonly string[]): boolean {
    return findEntry(document.root, path) !== undefined;
}

/** Reads the node at `path`, or `undefined` when it is not set. */
export function getValue(document: HoconDocument, path: readonly string[]): HoconValue | undefined {
    return findEntry(document.root, path)?.value;
}

/** Where a comment such as `#start-location: "..."` sits inside an object. */
interface CommentedPlaceholder {
    /** Index into `entries`, or `entries.length` for the trailing trivia. */
    readonly entryIndex: number;
    /** Index of the comment within that trivia list. */
    readonly triviaIndex: number;
}

function findCommentedPlaceholder(object: HoconObject, key: string): CommentedPlaceholder | undefined {
    const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:=]`);

    for (let entryIndex = 0; entryIndex < object.entries.length; entryIndex++) {
        const leading = (object.entries[entryIndex] as HoconEntry).leading;
        for (let triviaIndex = 0; triviaIndex < leading.length; triviaIndex++) {
            const trivia = leading[triviaIndex] as Trivia;
            if (trivia.kind === "comment" && pattern.test(trivia.text)) return { entryIndex, triviaIndex };
        }
    }

    for (let triviaIndex = 0; triviaIndex < object.trailing.length; triviaIndex++) {
        const trivia = object.trailing[triviaIndex] as Trivia;
        if (trivia.kind === "comment" && pattern.test(trivia.text)) return { entryIndex: object.entries.length, triviaIndex };
    }

    return undefined;
}

function insertEntry(object: HoconObject, entry: HoconEntry): HoconObject {
    const key = entry.segments[entry.segments.length - 1] as string;
    const placeholder = findCommentedPlaceholder(object, key);

    if (placeholder === undefined) {
        // Nothing to anchor to, so it goes at the end, after any trailing
        // comments so those keep describing whatever they described before.
        return { ...object, entries: [...object.entries, { ...entry, leading: [...object.trailing, ...entry.leading] }], trailing: [] };
    }

    if (placeholder.entryIndex === object.entries.length) {
        const before = object.trailing.slice(0, placeholder.triviaIndex + 1);
        const after = object.trailing.slice(placeholder.triviaIndex + 1);
        return { ...object, entries: [...object.entries, { ...entry, leading: [...before, ...entry.leading] }], trailing: after };
    }

    const anchor = object.entries[placeholder.entryIndex] as HoconEntry;
    const before = anchor.leading.slice(0, placeholder.triviaIndex + 1);
    const after = anchor.leading.slice(placeholder.triviaIndex + 1);

    return {
        ...object,
        entries: [
            ...object.entries.slice(0, placeholder.entryIndex),
            { ...entry, leading: [...before, ...entry.leading] },
            { ...anchor, leading: after },
            ...object.entries.slice(placeholder.entryIndex + 1),
        ],
    };
}

function setIn(object: HoconObject, path: readonly string[], value: HoconValue): HoconObject {
    const head = path[0] as string;

    // An entry that already covers the whole path is updated in place.
    for (let index = object.entries.length - 1; index >= 0; index--) {
        const entry = object.entries[index] as HoconEntry;
        if (matchesSegments(entry, path)) {
            const entries = [...object.entries];
            entries[index] = { ...entry, value };
            return { ...object, entries };
        }
    }

    if (path.length > 1) {
        // Descend through an existing nested object when there is one.
        for (let index = object.entries.length - 1; index >= 0; index--) {
            const entry = object.entries[index] as HoconEntry;
            if (entry.segments.length < path.length && entry.value.type === "object" && matchesSegments(entry, path.slice(0, entry.segments.length))) {
                const entries = [...object.entries];
                entries[index] = { ...entry, value: setIn(entry.value, path.slice(entry.segments.length), value) };
                return { ...object, entries };
            }
        }
    }

    // Nothing to update, so add it. Multi-segment paths are written as a path
    // expression rather than a new nested block, which keeps the diff to a line.
    return insertEntry(object, {
        segments: path,
        rawKey: path.length === 1 ? head : path.join("."),
        leading: [],
        separator: ":",
        value,
        trailingComma: false,
    });
}

/**
 * Sets `path` to `value`, updating the entry when it exists and adding one when
 * it does not.
 *
 * A new entry is placed directly beneath a matching commented-out example when
 * the file has one (`#start-location: "..."`), so the setting lands where its
 * own documentation already is instead of being appended to the bottom.
 */
export function setValue(document: HoconDocument, path: readonly string[], value: HoconValue): HoconDocument {
    if (path.length === 0) throw new Error("setValue needs a path with at least one segment");
    return { ...document, root: setIn(document.root, path, value) };
}

/** Convenience wrapper that converts a plain value first. */
export function setPlainValue(document: HoconDocument, path: readonly string[], value: PlainValue): HoconDocument {
    return setValue(document, path, toHoconValue(value));
}

function deleteIn(object: HoconObject, path: readonly string[]): HoconObject {
    const kept: HoconEntry[] = [];
    let carried: Trivia[] = [];

    for (const entry of object.entries) {
        if (matchesSegments(entry, path)) {
            // The removed entry's own comments stay in the file: they usually
            // document the setting rather than the value, and silently deleting
            // documentation is how a config file stops explaining itself.
            carried = [...carried, ...entry.leading];
            continue;
        }

        if (path.length > entry.segments.length && entry.value.type === "object" && matchesSegments(entry, path.slice(0, entry.segments.length))) {
            kept.push({ ...entry, leading: [...carried, ...entry.leading], value: deleteIn(entry.value, path.slice(entry.segments.length)) });
            carried = [];
            continue;
        }

        kept.push(carried.length === 0 ? entry : { ...entry, leading: [...carried, ...entry.leading] });
        carried = [];
    }

    return { ...object, entries: kept, trailing: [...carried, ...object.trailing] };
}

/** Removes `path`, leaving its surrounding comments in place. */
export function deleteValue(document: HoconDocument, path: readonly string[]): HoconDocument {
    if (path.length === 0) throw new Error("deleteValue needs a path with at least one segment");
    return { ...document, root: deleteIn(document.root, path) };
}

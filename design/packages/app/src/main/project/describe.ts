/**
 * Turning one project save into a sentence somebody recognises months later.
 *
 * `history/describe.ts` already does this for a config folder, and does it by looking at
 * which *files* changed. That reading is useless for a project, because a project is one
 * file: every save would produce the row "Changed material-bluemap.project.json", forty
 * times over, which is the word "Updated" wearing a longer name. A history panel full of
 * those is an archive nobody opens.
 *
 * So the description here is computed from the two projects themselves - the one the last
 * revision recorded and the one being saved - and names what actually moved inside the file:
 * a map added, a storage removed, the render options changed, the project renamed.
 *
 * ## Why this file is pure
 *
 * Two projects in, a label and an action out. No git, no disk, no clock. Every phrasing
 * decision below is therefore covered by an ordinary unit test, and changing the wording is
 * a diff somebody can read rather than a behaviour somebody has to run the app to observe.
 */

import type { ProjectFile, ProjectMap, ProjectReadFailure, ProjectStorage } from "@material-bluemap/config";

import { MAX_NAMED_FILES, joinNames, type HistoryAction } from "../history/index.js";

/** What one save should be called, and which filter groups it. */
export interface ProjectChangeDescription {
    /** The one-line label. Always names what changed, never merely that something did. */
    readonly label: string;
    /** The grouping word the history panel's action filter derives itself from. */
    readonly action: HistoryAction;
}

/** The two states a save sits between, and whether this history has anything in it yet. */
export interface ProjectChange {
    /** The project as the newest revision recorded it, or null when there is no revision. */
    readonly before: ProjectFile | null;
    /** The project being saved, or null when the project file is being taken away. */
    readonly after: ProjectFile | null;
    /** True for the snapshot that opens a project's history. */
    readonly first: boolean;
}

/* -------------------------------------------------------------------------- */
/* Naming the pieces                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What to call one map in a sentence.
 *
 * The map's own name, which is what the Maps screen shows, falling back to the id when a
 * project somehow carries a blank one. Using the id everywhere would be safer to compute and
 * worse to read: `overworld_2` is not what the person called it.
 */
function mapName(map: ProjectMap): string {
    const name = map.name.trim();
    return `the ${name === "" ? map.id : name} map`;
}

function storageName(storage: ProjectStorage): string {
    return `the ${storage.id} storage`;
}

/** `Added the nether map`, or `Added 5 maps` once naming them all stops helping. */
function clause(verb: string, names: readonly string[]): string {
    if (names.length <= MAX_NAMED_FILES) return `${verb} ${joinNames([...names])}`;
    const named = joinNames(names.slice(0, MAX_NAMED_FILES));
    return `${verb} ${named} and ${String(names.length - MAX_NAMED_FILES)} more`;
}

/** How several clauses become one sentence, matching the config history's own joining. */
function sentence(clauses: readonly string[]): string {
    if (clauses.length === 0) return "";
    if (clauses.length === 1) return clauses[0] ?? "";
    const rest = clauses.slice(1).map((text) => text.charAt(0).toLowerCase() + text.slice(1));
    return `${clauses[0] ?? ""}, ${rest.join(", ")}`;
}

/* -------------------------------------------------------------------------- */
/* Comparing two projects                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether two maps differ in anything a person set.
 *
 * Compared field by field rather than by serialising both, because the whole `config` body
 * is one of the fields and comparing serialised objects would depend on key order - which
 * would report a change every time a map travelled through a different code path, and a
 * history that records events nobody caused is a history nobody trusts.
 */
function mapDiffers(left: ProjectMap, right: ProjectMap): boolean {
    return (
        left.name !== right.name ||
        left.dimension !== right.dimension ||
        left.config !== right.config ||
        left.storage !== right.storage ||
        left.sorting !== right.sorting ||
        left.enabled !== right.enabled
    );
}

interface Split<T> {
    readonly added: readonly T[];
    readonly removed: readonly T[];
    readonly changed: readonly T[];
}

/** What happened to a keyed collection between two projects. */
function split<T>(before: readonly T[], after: readonly T[], key: (item: T) => string, differs: (a: T, b: T) => boolean): Split<T> {
    const was = new Map(before.map((item) => [key(item), item]));
    const now = new Map(after.map((item) => [key(item), item]));

    const added: T[] = [];
    const changed: T[] = [];
    for (const [id, item] of now) {
        const previous = was.get(id);
        if (previous === undefined) added.push(item);
        else if (differs(previous, item)) changed.push(item);
    }

    const removed: T[] = [];
    for (const [id, item] of was) if (!now.has(id)) removed.push(item);

    return { added, removed, changed };
}

/** The whole-body settings a project can carry, and what each is called on screen. */
const BODIES = [
    ["core", "the core settings"],
    ["webapp", "the web app settings"],
    ["webserver", "the web server settings"],
    ["plugin", "the plugin settings"],
] as const;

function renderDiffers(before: ProjectFile, after: ProjectFile): boolean {
    return (
        before.render.threads !== after.render.threads ||
        before.render.force !== after.render.force ||
        before.render.fixEdges !== after.render.fixEdges ||
        before.render.metrics !== after.render.metrics ||
        before.render.outputFolder !== after.render.outputFolder
    );
}

/* -------------------------------------------------------------------------- */
/* The description itself                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What one save should be called.
 *
 * `first` is its own case rather than a consequence of `before` being null, and the
 * distinction is real: a world can already carry a project written months ago on another
 * machine, and the first snapshot of it is the moment the record starts, not a project
 * somebody just created. Calling that "Created the project" would put an event in the panel
 * that nobody performed.
 *
 * The last case - a save where nothing a person set has changed - is reported honestly
 * rather than dressed up. Only `updatedAt` and `appVersion` moved, the file really is
 * different, and a row saying so is better than a row inventing a change to justify itself.
 *
 * `fromWizard` deliberately gets no clause of its own: it records where a project came from
 * rather than a setting anybody chose, so a row about it would describe provenance while the
 * edit that actually happened went unnamed.
 */
export function describeProjectChange(change: ProjectChange): ProjectChangeDescription {
    const { before, after, first } = change;

    if (after === null) {
        const name = before === null ? "" : ` "${before.name}"`;
        return { label: `Deleted the project${name}`, action: "deleted" };
    }

    if (first) {
        return {
            label: `Started keeping this project's history: "${after.name}"`,
            action: "started",
        };
    }

    if (before === null) {
        return { label: `Created the project "${after.name}"`, action: "created" };
    }

    const maps = split(before.maps, after.maps, (map) => map.id, mapDiffers);
    const storages = split(
        before.storages,
        after.storages,
        (storage) => storage.id,
        (left, right) => left.config !== right.config,
    );

    const clauses: string[] = [];
    if (before.name !== after.name) clauses.push(`Renamed the project to "${after.name}"`);

    if (maps.added.length > 0) clauses.push(clause("Added", maps.added.map(mapName)));
    if (storages.added.length > 0) clauses.push(clause("Added", storages.added.map(storageName)));

    const changedNames = [
        ...maps.changed.map(mapName),
        ...storages.changed.map(storageName),
        ...BODIES.filter(([key]) => before[key] !== after[key]).map(([, name]) => name),
        ...(renderDiffers(before, after) ? ["the render options"] : []),
    ];
    if (changedNames.length > 0) clauses.push(clause("Changed", changedNames));

    if (maps.removed.length > 0) clauses.push(clause("Deleted", maps.removed.map(mapName)));
    if (storages.removed.length > 0) clauses.push(clause("Deleted", storages.removed.map(storageName)));

    if (clauses.length === 0) {
        return { label: `Saved "${after.name}" with nothing changed`, action: "changed" };
    }

    const created = maps.added.length + storages.added.length > 0;
    const removed = maps.removed.length + storages.removed.length > 0;
    const edited = changedNames.length > 0 || before.name !== after.name;
    const kinds = [created, removed, edited].filter(Boolean).length;
    const action: HistoryAction = kinds > 1 ? "mixed" : created ? "created" : removed ? "deleted" : "changed";

    return { label: sentence(clauses), action };
}

/**
 * The label for a restore, which names the moment rather than the files that moved.
 *
 * "Changed the nether map and deleted the file storage" is true of a restore and is exactly
 * the wrong row to write, because the next reader goes looking for the edit that did it and
 * there was none. What happened is that somebody went back to a moment, and the label says
 * which moment.
 */
export function describeProjectRestore(target: { readonly label: string; readonly shortId: string }): string {
    return `Restored the project as it was at ${target.shortId}: ${target.label}`;
}

/* -------------------------------------------------------------------------- */
/* Saying why a project could not be read                                     */
/* -------------------------------------------------------------------------- */

/**
 * One sentence per reason a project would not open, written for somebody who has never
 * heard of JSON and does not have to care.
 *
 * Every one of them names the file, because a person reading this is looking at a list of
 * worlds and needs to know which one it is about; and every one says what the app did rather
 * than only what went wrong, because "could not be read" and "was left alone" answer two
 * different questions and the second is the one somebody actually has.
 */
export function describeReadFailure(failure: ProjectReadFailure, path: string): string {
    switch (failure.kind) {
        case "absent":
            return `${path} is not there, so this world has no project yet.`;
        case "unreadable":
            return `${path} could not be opened, so it was left alone: ${failure.message}`;
        case "not-json":
            return (
                `${path} is not readable as a project file - it may have been edited by hand or ` +
                `only half written. It was left alone: ${failure.message}`
            );
        case "too-new":
            return (
                `${path} was made by a newer version of Material BlueMap (format ` +
                `${String(failure.version)}). This build would have to throw away the settings it ` +
                `does not understand, so it left the file alone. Update the app to open it.`
            );
        case "invalid":
            return `${path} is a project file with something wrong in it, so it was left alone: ${failure.problems.join("; ")}`;
    }
}

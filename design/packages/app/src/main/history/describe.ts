/**
 * Turning a set of changed files into a sentence a person recognises.
 *
 * This is the whole difference between a history panel somebody uses and one they scroll
 * past. A list of forty rows all reading "Updated" is an archive: to find the moment the
 * nether map was deleted you have to open rows one at a time until you find it. A list
 * where that row reads "Deleted the nether map" is a record, and the thing you are looking
 * for is visible from across the room.
 *
 * So nothing here ever emits the word "Updated" on its own. Every label names the object
 * that changed, and where several changed at once it names them - up to the point where
 * naming them all would be worse than counting them, which is the only case that falls
 * back to a number, and even then it lists the first few.
 *
 * ## Why this file is pure
 *
 * It takes a list of `{path, status}` and returns strings. No git, no disk, no clock. That
 * means every phrasing decision below is covered by an ordinary unit test, and a change to
 * the wording is a diff somebody can read rather than a behaviour somebody has to run the
 * application to observe.
 *
 * ## What is not decided here
 *
 * The *action* - the word the history panel's filter groups by - is derived from the same
 * changes, but a restore overrides it, because a restore that happens to only add files is
 * still a restore and grouping it under "created" would hide it from the one filter
 * somebody looking for it would reach for.
 */

/** How one file changed between two snapshots. */
export type ChangeStatus = "added" | "modified" | "deleted";

export interface FileChange {
    /** Relative to the config folder, forward slashes, e.g. `maps/nether.conf`. */
    readonly path: string;
    readonly status: ChangeStatus;
}

/**
 * The actions a revision can have.
 *
 * A closed set here, but *not* a closed set in the history panel: the panel derives its
 * filter from the actions the revisions in front of it actually carry, so a history with
 * no restores in it offers no "restored" filter, and a word added here later needs no
 * change at all on the other side. That is the rule the contract asks for, and this
 * comment is the reminder that hard-coding the panel's list would break it.
 */
export type HistoryAction = "started" | "created" | "changed" | "deleted" | "mixed" | "restored" | "pruned";

/** How many files a label names before it starts counting them instead. */
export const MAX_NAMED_FILES = 3;

/**
 * A config file's name in the words the editor's own screens use.
 *
 * `maps/nether.conf` is "the nether map" because that is what the Maps screen calls it,
 * and a history that uses different nouns to the rest of the application makes the reader
 * translate. Anything this does not recognise keeps its path, which is honest: a label
 * reading "changed extra.conf" is less pretty than the others and tells no lies.
 */
export function describeFile(path: string): string {
    const clean = path.trim().replace(/\\/g, "/");
    const segments = clean.split("/");
    const fileName = segments[segments.length - 1] ?? clean;
    const name = fileName.replace(/\.(?:conf|json)$/i, "");

    if (segments.length === 2) {
        const folder = (segments[0] ?? "").toLowerCase();
        if (folder === "maps") return `the ${name} map`;
        if (folder === "storages") return `the ${name} storage`;
        return clean;
    }

    if (segments.length !== 1) return clean;

    switch (name.toLowerCase()) {
        case "core":
            return "the core settings";
        case "webapp":
            return "the web app settings";
        case "webserver":
            return "the web server settings";
        case "plugin":
            return "the plugin settings";
        default:
            return clean;
    }
}

/** `a, b and c`, which reads better in a one-line label than `a, b, c`. */
export function joinNames(names: readonly string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0] ?? "";
    const head = names.slice(0, -1).join(", ");
    const tail = names[names.length - 1] ?? "";
    return `${head} and ${tail}`;
}

/** The verb for a group of files that all changed the same way. */
function verbFor(status: ChangeStatus, count: number): string {
    switch (status) {
        case "added":
            return count === 1 ? "Added" : "Added";
        case "deleted":
            return count === 1 ? "Deleted" : "Deleted";
        case "modified":
            return "Changed";
    }
}

/**
 * `Added the nether map`, or `Added 5 maps` once naming them stops helping.
 *
 * The cut-off exists because a title has to survive being read at a glance in a narrow
 * column. Four names is already a sentence somebody has to parse; seven is a paragraph
 * pretending to be a title, and the detail beneath the row lists them all anyway.
 */
function clause(status: ChangeStatus, paths: readonly string[]): string {
    const verb = verbFor(status, paths.length);
    if (paths.length <= MAX_NAMED_FILES) {
        return `${verb} ${joinNames(paths.map(describeFile))}`;
    }
    const named = joinNames(paths.slice(0, MAX_NAMED_FILES).map(describeFile));
    const rest = paths.length - MAX_NAMED_FILES;
    return `${verb} ${named} and ${String(rest)} more`;
}

export interface ChangeDescription {
    /** The one-line label. Never "Updated": it always names what changed. */
    readonly label: string;
    /** The grouping word the history panel's action filter derives itself from. */
    readonly action: HistoryAction;
    /** Every changed file, one per line, for the row's detail. Empty when there are none. */
    readonly detail: string;
}

function bucket(changes: readonly FileChange[], status: ChangeStatus): string[] {
    return changes.filter((change) => change.status === status).map((change) => change.path);
}

/**
 * The sentence, the action and the detail for one set of changes.
 *
 * `first` marks the snapshot that opened a folder's history, which is not a creation the
 * user performed: the files were already there, and calling it "Added the core settings
 * and 6 more" would put an event in the panel that never happened. It gets its own action
 * so the filter can separate "this is where the record starts" from real edits.
 */
export function describeChanges(changes: readonly FileChange[], first = false): ChangeDescription {
    const added = bucket(changes, "added");
    const modified = bucket(changes, "modified");
    const deleted = bucket(changes, "deleted");

    const detail = [...changes]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((change) => `${change.status}: ${change.path}`)
        .join("\n");

    if (changes.length === 0) {
        return { label: "Nothing changed", action: "changed", detail: "" };
    }

    if (first) {
        const count = changes.length;
        return {
            label:
                count === 1
                    ? `Started keeping history, with ${describeFile(changes[0]?.path ?? "")}`
                    : `Started keeping history, with ${String(count)} config files`,
            action: "started",
            detail,
        };
    }

    const clauses: string[] = [];
    if (added.length > 0) clauses.push(clause("added", added));
    if (modified.length > 0) clauses.push(clause("modified", modified));
    if (deleted.length > 0) clauses.push(clause("deleted", deleted));

    // A second clause is joined lower-case, so `Added the nether map, changed the core
    // settings` reads as one sentence rather than two titles glued together.
    const label =
        clauses.length === 1
            ? (clauses[0] ?? "")
            : `${clauses[0] ?? ""}, ${clauses
                  .slice(1)
                  .map((text) => text.charAt(0).toLowerCase() + text.slice(1))
                  .join(", ")}`;

    const kinds = [added.length > 0, modified.length > 0, deleted.length > 0].filter(Boolean).length;
    const action: HistoryAction =
        kinds > 1 ? "mixed" : added.length > 0 ? "created" : deleted.length > 0 ? "deleted" : "changed";

    return { label, action, detail };
}

/**
 * The label for a restore, which describes the revision being returned to rather than the
 * files that moved.
 *
 * "Changed the core settings and deleted the nether map" is true of a restore and is
 * exactly the wrong thing to write in the panel, because the next reader will look for the
 * edit that did it and there was none. What happened is that somebody went back to a
 * moment, and the label says which moment.
 */
export function describeRestore(target: { readonly label: string; readonly shortId: string }): string {
    return `Restored the config as it was at ${target.shortId}: ${target.label}`;
}

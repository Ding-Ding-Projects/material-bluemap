/**
 * Turning one save of the profile list into a sentence somebody recognises months later.
 *
 * Written the same way `project/describe.ts` describes a project save: two states in, a
 * label and an action out, computed from what actually moved rather than from which bytes
 * changed. `history/describe.ts`'s file-level reading is the wrong model here for the same
 * reason it was the wrong model for a project - the profile list is one JSON file, and every
 * save would otherwise produce the row "Changed profiles.json", which is the word "Updated"
 * wearing a longer name.
 *
 * ## Why this file is pure
 *
 * Two states in, a label and an action out. No git, no disk, no clock. Every phrasing
 * decision below is therefore covered by an ordinary unit test, and changing the wording is
 * a diff somebody can read rather than a behaviour somebody has to run the app to observe.
 */

import { joinNames, MAX_NAMED_FILES, type HistoryAction } from "../history/index.js";

import type { ProfileRecord, ProfilesState } from "./store.js";

export interface ProfilesChangeDescription {
    /** The one-line label. Always names what changed, never merely that something did. */
    readonly label: string;
    /** The grouping word the history panel's action filter derives itself from. */
    readonly action: HistoryAction;
}

/** The two states a save sits between, and whether this history has anything in it yet. */
export interface ProfilesChange {
    /** The state as the newest revision recorded it, or null when there is no revision. */
    readonly before: ProfilesState | null;
    readonly after: ProfilesState;
    /** True for the snapshot that opens the profile list's history. */
    readonly first: boolean;
}

/** What a profile is called in a sentence, falling back to its id when the name is blank. */
function profileName(profile: ProfileRecord): string {
    const name = profile.name.trim();
    return `the profile "${name === "" ? profile.id : name}"`;
}

/** Whether two profiles differ in anything a person set. */
function profileDiffers(left: ProfileRecord, right: ProfileRecord): boolean {
    return (
        left.name !== right.name ||
        left.url !== right.url ||
        left.trustCustomizations !== right.trustCustomizations ||
        left.dataRoot !== right.dataRoot
    );
}

interface Split<T> {
    readonly added: readonly T[];
    readonly removed: readonly T[];
    readonly changed: readonly T[];
}

/** What happened to a keyed collection between two states, matching `project/describe.ts`. */
function split<T>(
    before: readonly T[],
    after: readonly T[],
    key: (item: T) => string,
    differs: (a: T, b: T) => boolean,
): Split<T> {
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

/** `Added the profile "Home server"`, or a count once naming them all stops helping. */
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

/**
 * What one save of the profile list should be called.
 *
 * `first` is its own case, not a consequence of `before` being null: somebody migrating from
 * `localStorage` arrives with profiles already in it, and the first snapshot of those is the
 * moment the record starts, not a set of profiles somebody just created. Calling that "Added
 * 3 profiles" would put an event in the panel that nobody performed.
 *
 * A save that changed only which profile is active gets its own honest label rather than
 * being folded into "nothing changed" or invented as an edit to a profile nobody touched.
 */
export function describeProfilesChange(change: ProfilesChange): ProfilesChangeDescription {
    const { before, after, first } = change;

    if (first) {
        const count = after.profiles.length;
        return {
            label:
                count === 0
                    ? "Started keeping the profile list's history, with none yet"
                    : `Started keeping the profile list's history, with ${String(count)} ${
                          count === 1 ? "profile" : "profiles"
                      }`,
            action: "started",
        };
    }

    const beforeProfiles = before?.profiles ?? [];
    const { added, removed, changed } = split(beforeProfiles, after.profiles, (profile) => profile.id, profileDiffers);

    const clauses: string[] = [];
    if (added.length > 0) clauses.push(clause("Added", added.map(profileName)));
    if (changed.length > 0) clauses.push(clause("Changed", changed.map(profileName)));
    if (removed.length > 0) clauses.push(clause("Deleted", removed.map(profileName)));

    if (clauses.length === 0) {
        const activeChanged = before !== null && before.activeId !== after.activeId;
        if (activeChanged) {
            const active = after.profiles.find((profile) => profile.id === after.activeId);
            return {
                label: active === undefined ? "Switched off the active profile" : `Switched the active profile to "${active.name}"`,
                action: "changed",
            };
        }
        return { label: "Saved the profile list with nothing changed", action: "changed" };
    }

    const kinds = [added.length > 0, changed.length > 0, removed.length > 0].filter(Boolean).length;
    const action: HistoryAction = kinds > 1 ? "mixed" : added.length > 0 ? "created" : removed.length > 0 ? "deleted" : "changed";

    return { label: sentence(clauses), action };
}

/**
 * The label for a restore, which names the moment rather than the profiles that moved.
 *
 * "Deleted the profile 'home server'" is true of a restore and is exactly the wrong row to
 * write, because the next reader goes looking for the edit that did it and there was none.
 * What happened is that somebody went back to a moment, and the label says which moment.
 */
export function describeProfilesRestore(target: { readonly label: string; readonly shortId: string }): string {
    return `Restored the profile list as it was at ${target.shortId}: ${target.label}`;
}

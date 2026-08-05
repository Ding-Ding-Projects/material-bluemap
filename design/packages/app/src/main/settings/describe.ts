/**
 * Turning one save of the application's settings into a sentence somebody recognises months
 * later. Written the same way `profiles/describe.ts` and `project/describe.ts` describe their
 * own single-file saves: two states in, a label and an action out.
 *
 * ## Why the label names keys, not meanings
 *
 * This module has no idea what `appearance.fontSize` or `dockPlacement.side` mean to a
 * person - `store.ts` says as much about the state itself. So a changed setting is named by
 * its key, sorted and joined the same way a changed config file is named by its path when
 * this build does not recognise it: less pretty than a hand-written sentence, and honest
 * about what this layer actually knows.
 *
 * ## Why this file is pure
 *
 * Two states in, a label and an action out. No git, no disk, no clock. Every phrasing
 * decision below is therefore covered by an ordinary unit test.
 */

import { joinNames, MAX_NAMED_FILES, type HistoryAction } from "../history/index.js";

import type { AppSettingsState } from "./store.js";

export interface SettingsChangeDescription {
    readonly label: string;
    readonly action: HistoryAction;
}

export interface SettingsChange {
    /** The state as the newest revision recorded it, or null when there is no revision. */
    readonly before: AppSettingsState | null;
    readonly after: AppSettingsState;
    /** True for the snapshot that opens the application settings' history. */
    readonly first: boolean;
}

/** `Changed appearance, dockPlacement`, or a count once naming them all stops helping. */
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

/** Whether two settings values are the same, compared by their JSON form. */
function valueDiffers(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) !== JSON.stringify(right);
}

/**
 * What one save of the application's settings should be called.
 *
 * `first` is its own case, not a consequence of `before` being null, for the same reason
 * `profiles/describe.ts` treats it as one: somebody migrating existing settings in arrives
 * with values already set, and the first snapshot of those is the moment the record starts,
 * not an edit somebody just made.
 */
export function describeSettingsChange(change: SettingsChange): SettingsChangeDescription {
    const { before, after, first } = change;

    if (first) {
        const count = Object.keys(after.values).length;
        return {
            label:
                count === 0
                    ? "Started keeping the application settings' history, with none set yet"
                    : `Started keeping the application settings' history, with ${String(count)} ${
                          count === 1 ? "setting" : "settings"
                      }`,
            action: "started",
        };
    }

    const beforeValues = before?.values ?? {};
    const beforeKeys = new Set(Object.keys(beforeValues));
    const afterKeys = new Set(Object.keys(after.values));

    const added: string[] = [];
    const changed: string[] = [];
    for (const key of afterKeys) {
        if (!beforeKeys.has(key)) added.push(key);
        else if (valueDiffers(beforeValues[key], after.values[key])) changed.push(key);
    }
    const removed: string[] = [...beforeKeys].filter((key) => !afterKeys.has(key));

    added.sort();
    changed.sort();
    removed.sort();

    const clauses: string[] = [];
    if (added.length > 0) clauses.push(clause("Added", added));
    if (changed.length > 0) clauses.push(clause("Changed", changed));
    if (removed.length > 0) clauses.push(clause("Removed", removed));

    if (clauses.length === 0) {
        return { label: "Saved the application settings with nothing changed", action: "changed" };
    }

    const kinds = [added.length > 0, changed.length > 0, removed.length > 0].filter(Boolean).length;
    const action: HistoryAction = kinds > 1 ? "mixed" : added.length > 0 ? "created" : removed.length > 0 ? "deleted" : "changed";

    return { label: sentence(clauses), action };
}

/**
 * The label for a restore, which names the moment rather than the settings that moved.
 *
 * "Changed appearance" is true of a restore and is exactly the wrong row to write, because
 * the next reader goes looking for the edit that did it and there was none. What happened is
 * that somebody went back to a moment, and the label says which moment.
 */
export function describeSettingsRestore(target: { readonly label: string; readonly shortId: string }): string {
    return `Restored the application settings as they were at ${target.shortId}: ${target.label}`;
}

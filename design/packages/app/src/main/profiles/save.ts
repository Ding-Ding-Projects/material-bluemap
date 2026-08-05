/**
 * Saving the profile list: the write, then the record of it, in that order and never the
 * reverse. See `project/save.ts` for why the order is the whole of this file.
 */

import type { HistoryRevision } from "../history/index.js";

import { recordProfilesRevision, type ProfilesHistoryOptions } from "./history.js";
import { writeProfilesState, type ProfilesState } from "./store.js";

export type ProfilesSaveResult = {
    readonly ok: true;
    readonly state: ProfilesState;
    /** True when a revision was recorded, or when there was nothing new to record. */
    readonly historyOk: boolean;
    /** The revision this save created, or null when nothing had changed. */
    readonly revision: HistoryRevision | null;
    /** What the history did or could not do, in one sentence, always present. */
    readonly historyMessage: string;
};

/**
 * Writes the profile list to disk and records exactly one revision of it.
 *
 * `snapshotProject` commits only when something differs, so a save that changes nothing at
 * all still returns `ok: true` with `revision: null` and says so, rather than inventing a
 * row for an event that did not happen.
 */
export async function saveProfilesState(
    options: ProfilesHistoryOptions,
    state: ProfilesState,
): Promise<ProfilesSaveResult> {
    await writeProfilesState(options.dataDir, state);

    // Past this line the save has happened. Nothing below may turn it back into a failure.
    const recorded = await recordProfilesRevision(options, state);

    return {
        ok: true,
        state,
        historyOk: recorded.ok,
        revision: recorded.ok ? recorded.revision : null,
        historyMessage: recorded.message,
    };
}

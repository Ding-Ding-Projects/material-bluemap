/**
 * Saving the application settings: the write, then the record of it, in that order and never
 * the reverse. See `project/save.ts` for why the order is the whole of this file.
 */

import type { HistoryRevision } from "../history/index.js";

import { recordAppSettingsRevision, type AppSettingsHistoryOptions } from "./history.js";
import { writeAppSettingsState, type AppSettingsState } from "./store.js";

export type AppSettingsSaveResult = {
    readonly ok: true;
    readonly state: AppSettingsState;
    readonly historyOk: boolean;
    readonly revision: HistoryRevision | null;
    readonly historyMessage: string;
};

/**
 * Writes the application settings to disk and records exactly one revision of them.
 *
 * `snapshotProject` commits only when something differs, so a save that changes nothing at
 * all still returns `ok: true` with `revision: null` and says so.
 */
export async function saveAppSettingsState(
    options: AppSettingsHistoryOptions,
    state: AppSettingsState,
): Promise<AppSettingsSaveResult> {
    await writeAppSettingsState(options.dataDir, state);

    // Past this line the save has happened. Nothing below may turn it back into a failure.
    const recorded = await recordAppSettingsRevision(options, state);

    return {
        ok: true,
        state,
        historyOk: recorded.ok,
        revision: recorded.ok ? recorded.revision : null,
        historyMessage: recorded.message,
    };
}

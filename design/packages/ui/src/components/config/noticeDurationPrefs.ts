/**
 * Persisting the notice-duration dial across restarts, and mirroring it into the shared
 * application-settings history exactly the way `updateModel.ts`'s `dismissUpdate` does for
 * its own preference.
 *
 * `setupStorage()` rather than `localStorage` directly, for the same two reasons every
 * other preference in this package uses it: Vitest has no `localStorage` at all, and a
 * private-browsing window or a filled quota makes a raw `localStorage.setItem` throw,
 * which must never turn "I changed how long a toast stays" into an unhandled exception.
 */

import { setupStorage } from "../setup/setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import {
    DEFAULT_NOTICE_DURATION_LEVEL,
    isNoticeDurationLevel,
    type NoticeDurationLevel,
} from "./noticeDurationLevels.js";

/** Where the chosen level is remembered. */
export const NOTICE_DURATION_KEY = "material-bluemap.notifications.durationLevel";

/** The stored level, or the shipped default when nothing has been chosen or it does not parse. */
export function readNoticeDurationLevel(): NoticeDurationLevel["level"] {
    const raw = setupStorage().read(NOTICE_DURATION_KEY);
    if (raw === null) return DEFAULT_NOTICE_DURATION_LEVEL;
    const parsed = Number(raw);
    return isNoticeDurationLevel(parsed) ? parsed : DEFAULT_NOTICE_DURATION_LEVEL;
}

/**
 * Remembers a chosen level, and mirrors it into the settings history bag under
 * `noticeDuration` - fire-and-forget, exactly like every other key `recordAppSetting`
 * carries; see its own doc comment for why the mirror can never fail the real write.
 */
export function writeNoticeDurationLevel(level: NoticeDurationLevel["level"]): void {
    setupStorage().write(NOTICE_DURATION_KEY, String(level));
    recordAppSetting("noticeDuration", level);
}

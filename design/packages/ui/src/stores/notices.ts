import {
    createNoticeState,
    notify,
    setNoticeDurationLevel,
    type Notice,
    type NoticeLevel,
    type NoticeOptions,
} from "../components/config/notifications.js";
import type { NoticeDurationLevel } from "../components/config/noticeDurationLevels.js";
import {
    readNoticeDurationLevel,
    writeNoticeDurationLevel,
} from "../components/config/noticeDurationPrefs.js";

/**
 * The application's one notification corner.
 *
 * The queue itself was built for the options editor and, until this, was created inside
 * it. That tied every message to one screen being mounted: a save that closes the editor
 * had nowhere left to report itself, and nothing outside that screen could say anything at
 * all. A notification nobody can see is a notification that was never raised, which is the
 * same "built and unreachable" failure this project keeps finding, one layer down.
 *
 * So the state is hoisted to the shell, and `App.vue` mounts exactly one
 * `<ConfigNotifications>` against it, outside `v-main` so the fixed corner is never a child
 * of the click-through layer. Exactly one: the component paints its own fixed stack, so a
 * second mounted copy would show every notice twice, in two corners, with two timers
 * racing to dismiss it.
 *
 * The rules that make a notice non-blocking - what auto-dismisses, what stays until it is
 * read, how long the history keeps it - stay in `components/config/notifications.ts` where
 * they are unit-tested without mounting anything. This module is only the singleton.
 */
export const notices = createNoticeState();

// The notice-duration dial is read once, here, at the moment this singleton is created -
// the same "load the persisted preference into the one shared state" step every other
// app-wide singleton in this package takes. A profile that has never touched the setting
// reads back `DEFAULT_NOTICE_DURATION_LEVEL`, which `createNoticeState()` already defaults
// to, so this is a no-op read on a fresh install rather than a second source of the default.
setNoticeDurationLevel(notices, readNoticeDurationLevel());

/**
 * Raises a notice on the shared corner.
 *
 * Saves the shell from importing the queue's own `notify` and remembering to pass the one
 * state to it, which is how a second, private queue gets created by accident.
 *
 * The third argument is a detail string or the full options object, exactly as `notify`
 * takes it, so a caller that wants to attach a retry or an "open the folder" link to a
 * message does not have to reach past this helper to do it.
 */
export function raiseNotice(
    level: NoticeLevel,
    message: string,
    options?: string | NoticeOptions,
): Notice {
    return notify(notices, level, message, options);
}

/**
 * Changes how long an informational or success toast stays, for every notice raised from
 * now on, and remembers the choice across restarts.
 *
 * The only place this setting is ever written from: `NotificationDurationRow.vue` calls
 * this rather than touching `notices.durationLevel` or the persisted store directly, so
 * the in-memory state and the remembered preference can never drift apart.
 */
export function changeNoticeDuration(level: NoticeDurationLevel["level"]): void {
    setNoticeDurationLevel(notices, level);
    writeNoticeDurationLevel(level);
}

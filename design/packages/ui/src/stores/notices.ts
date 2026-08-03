import {
    createNoticeState,
    notify,
    type Notice,
    type NoticeLevel,
} from "../components/config/notifications.js";

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

/**
 * Raises a notice on the shared corner.
 *
 * Saves the shell from importing the queue's own `notify` and remembering to pass the one
 * state to it, which is how a second, private queue gets created by accident.
 */
export function raiseNotice(level: NoticeLevel, message: string, detail?: string): Notice {
    return notify(notices, level, message, detail);
}

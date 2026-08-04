/**
 * Non-blocking notifications for the settings editor, plus the history that
 * keeps a dismissed one reviewable.
 *
 * Informational, success and progress messages never block. Errors and warnings
 * stay until they are dismissed, because a failure that auto-dismisses is a
 * failure nobody read. Anything that needs a decision before work can continue
 * is a dialog instead, and none of those live here.
 *
 * The state is a plain object rather than a component, so the queue's own rules
 * (auto-dismiss timing, stacking order, the bounded history) can be tested
 * without mounting anything.
 *
 * The history is the data behind the notification centre in
 * `components/notifications/`, which filters and searches it. The rules stay
 * here; the panel only reads them.
 */

import { reactive, readonly } from "vue";

export type NoticeLevel = "info" | "success" | "warning" | "error";

/**
 * One offered follow-up: retry, undo, open the folder that was written.
 *
 * The action is a callback the caller owns rather than a command this module knows how to
 * run, because the queue has no business understanding what "retry" means for a save, a
 * download or a render. `href` is the same offer for a destination rather than a verb, and
 * a notice may carry either kind.
 *
 * `id` is stable within one notice so a test can name the action it means instead of
 * indexing into an array whose order is an implementation detail.
 */
export interface NoticeAction {
    readonly id: string;
    readonly label: string;
    /** What pressing it does. Runs in the caller's context, never in this module. */
    readonly run?: () => void;
    /** A destination instead of a verb, for an "open" style offer. */
    readonly href?: string;
}

/**
 * Everything optional a notice can carry.
 *
 * A separate object rather than four positional parameters: `notify(state, "error", msg,
 * detail, undefined, actions)` is the shape that gets an argument in the wrong slot, and
 * the compiler cannot help when three of the four are strings.
 */
export interface NoticeOptions {
    readonly title?: string;
    readonly detail?: string;
    readonly actions?: readonly NoticeAction[];
}

export interface Notice {
    readonly id: number;
    readonly level: NoticeLevel;
    /** Optional headline above the body, for a message that needs one. */
    readonly title?: string;
    readonly message: string;
    /** Optional detail, shown behind a disclosure rather than in the toast body. */
    readonly detail?: string;
    /** Optional follow-ups, offered on the toast and again in the notification centre. */
    readonly actions?: readonly NoticeAction[];
    /** ISO-8601 with offset, so the history is readable and sortable. */
    readonly at: string;
    /** Milliseconds until this dismisses itself, or null when it stays. */
    readonly timeout: number | null;
}

/** How long an informational toast stays before dismissing itself. */
export const INFO_TIMEOUT_MS = 5000;
/** How long a success toast stays. Slightly shorter: it confirms, it does not inform. */
export const SUCCESS_TIMEOUT_MS = 4000;
/** How many notices the history keeps before dropping the oldest. */
export const HISTORY_LIMIT = 50;

/** Errors and warnings never dismiss themselves. */
export function timeoutFor(level: NoticeLevel): number | null {
    switch (level) {
        case "info":
            return INFO_TIMEOUT_MS;
        case "success":
            return SUCCESS_TIMEOUT_MS;
        case "warning":
        case "error":
            return null;
    }
}

export interface NoticeState {
    /** Currently on screen, newest last so the stack grows downward. */
    live: Notice[];
    /** Everything raised this session, newest first, bounded. */
    history: Notice[];
    nextId: number;
    /**
     * The highest id the notification centre has been opened over.
     *
     * An id rather than a count, because the history is bounded: once it starts dropping
     * its oldest entry a count of "seen" and a count of "raised" drift apart silently, and
     * the badge starts lying in the direction that matters least to notice.
     */
    reviewedId: number;
}

export function createNoticeState(): NoticeState {
    return reactive<NoticeState>({ live: [], history: [], nextId: 1, reviewedId: 0 });
}

/** A local ISO-8601 timestamp with its offset, e.g. `2026-08-03T12:41:07-04:00`. */
export function localTimestamp(date: Date = new Date()): string {
    const pad = (value: number): string => String(value).padStart(2, "0");
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const absolute = Math.abs(offset);
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
    );
}

/**
 * Raises a notice and returns it.
 *
 * The fourth parameter takes a bare detail string as well as the full options object. Every
 * existing caller passes the string, and rewriting them all to `{ detail }` would be a
 * change with no behaviour in it; the string form is not deprecated, it is the short spelling
 * of the common case.
 */
export function notify(
    state: NoticeState,
    level: NoticeLevel,
    message: string,
    options?: string | NoticeOptions,
): Notice {
    const resolved: NoticeOptions = typeof options === "string" ? { detail: options } : (options ?? {});
    const { title, detail, actions } = resolved;

    const notice: Notice = {
        id: state.nextId++,
        level,
        message,
        at: localTimestamp(),
        timeout: timeoutFor(level),
        ...(title === undefined ? {} : { title }),
        ...(detail === undefined ? {} : { detail }),
        ...(actions === undefined || actions.length === 0 ? {} : { actions }),
    };

    state.live.push(notice);
    state.history.unshift(notice);
    if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;

    return notice;
}

/** Takes one notice off the screen. It stays in the history. */
export function dismiss(state: NoticeState, id: number): void {
    state.live = state.live.filter((notice) => notice.id !== id);
}

/** Clears the screen without clearing the history. */
export function dismissAll(state: NoticeState): void {
    state.live = [];
}

/**
 * Puts a notice from the history back on screen, and says whether it could.
 *
 * This is what makes the centre a review surface rather than a log: an error dismissed by
 * a stray click is one press away from being readable again, with its actions still
 * attached, instead of being a sentence somebody has to remember. The stored object is
 * pushed back rather than copied, so the entry on screen and the entry in the history stay
 * the same notice and the id keeps meaning one thing.
 *
 * Restoring one that is already on screen is a no-op that reports success, because the
 * caller asked for it to be visible and it is.
 */
export function restore(state: NoticeState, id: number): boolean {
    if (state.live.some((notice) => notice.id === id)) return true;

    const notice = state.history.find((entry) => entry.id === id);
    if (notice === undefined) return false;

    state.live.push(notice);
    return true;
}

/** How many notices have been raised since the centre was last opened. */
export function unreadCount(state: NoticeState): number {
    return state.history.filter((notice) => notice.id > state.reviewedId).length;
}

/**
 * Records that the centre has been opened over everything raised so far.
 *
 * Reads the highest id present rather than `nextId - 1`, so a notice raised while the
 * panel was closing is not marked read by a race nobody can see.
 */
export function markReviewed(state: NoticeState): void {
    state.reviewedId = state.history.reduce(
        (highest, notice) => Math.max(highest, notice.id),
        state.reviewedId,
    );
}

/** A read-only view, for components that only display. */
export function readNotices(state: NoticeState): Readonly<NoticeState> {
    return readonly(state) as Readonly<NoticeState>;
}

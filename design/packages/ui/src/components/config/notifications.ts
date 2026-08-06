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
 *
 * ## How long a toast stays is itself a setting
 *
 * `state.durationLevel` is the novice dial `noticeDurationLevels.ts` defines - level 3 by
 * default, matching `INFO_TIMEOUT_MS` / `SUCCESS_TIMEOUT_MS` below exactly, so a profile
 * that has never touched the setting behaves exactly as this queue always has.
 * `NotificationDurationRow.vue` is the control; this module only reads the level `notify`
 * is called against, the same "the state carries the setting, the row only changes it"
 * split `mode`/`megabytes` follow in `renderMemorySetting.ts`.
 */

import { reactive, readonly } from "vue";
import {
    DEFAULT_NOTICE_DURATION_LEVEL,
    noticeDurationLevelByNumber,
    type NoticeDurationLevel,
} from "./noticeDurationLevels.js";

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
    /**
     * Buckets this notice for {@link cooldownMs} below. Two calls sharing a category within
     * that window are the same *kind* of event happening again in a hurry - an autosave
     * failing three times in the next ten seconds, say - and the second one restates nothing
     * a person did not already see a moment ago.
     */
    readonly category?: string;
    /**
     * How long, in milliseconds, a repeat of this {@link category} is kept off the toast
     * stack. The repeat is never lost - it still lands in the reviewable history exactly as
     * every notice does - only the *interruption* is throttled, which is the part the
     * non-blocking-notification rules actually ask to be rationed. Ignored without a
     * `category`, and ignored for `error`/`warning`, which never auto-dismiss and must never
     * be the one that goes missing from the corner because a sibling shown a second earlier
     * still occupies the slot.
     */
    readonly cooldownMs?: number;
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
    /**
     * A caller-chosen bucket, e.g. `"project-history"`, used only for the cooldown below. Not
     * shown anywhere: it is bookkeeping for how often a *kind* of notice may interrupt, not a
     * label the user reads.
     */
    readonly category?: string;
}

/**
 * The shipped default for an informational toast, at {@link DEFAULT_NOTICE_DURATION_LEVEL}.
 *
 * Kept as a named constant, rather than inlined, because `noticeDurationLevels.test.ts`
 * pins level 3 of the dial to this exact value - the check that keeps a profile which has
 * never touched the setting behaving exactly as it always did.
 */
export const INFO_TIMEOUT_MS = 5000;
/** The shipped default for a success toast, at {@link DEFAULT_NOTICE_DURATION_LEVEL}. */
export const SUCCESS_TIMEOUT_MS = 4000;
/** How many notices the history keeps before dropping the oldest. */
export const HISTORY_LIMIT = 50;

/**
 * How long a toast of this level stays, at the given duration level.
 *
 * Errors and warnings never dismiss themselves, at any level - a failure that auto-hides
 * is a failure nobody read, and the dial exists to let somebody give themselves *more*
 * time to read a message, never less time to be warned. `durationLevel` defaults to
 * {@link DEFAULT_NOTICE_DURATION_LEVEL} so every existing caller that named only the
 * notice's own level keeps the exact behaviour it always had.
 */
export function timeoutFor(
    level: NoticeLevel,
    durationLevel: NoticeDurationLevel["level"] = DEFAULT_NOTICE_DURATION_LEVEL,
): number | null {
    switch (level) {
        case "info":
            return noticeDurationLevelByNumber(durationLevel).infoTimeoutMs;
        case "success":
            return noticeDurationLevelByNumber(durationLevel).successTimeoutMs;
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
    /**
     * The novice duration dial, 1 (quickest) to 5 (stays until dismissed). Defaults to
     * {@link DEFAULT_NOTICE_DURATION_LEVEL}, which is pinned to this queue's own shipped
     * timeouts so a profile that never opens the setting keeps its exact prior behaviour.
     */
    durationLevel: NoticeDurationLevel["level"];
    /**
     * When each {@link NoticeOptions.category} was last shown live, epoch milliseconds.
     * Internal bookkeeping for {@link notify}'s cooldown - never rendered, never read outside
     * this module and its tests.
     */
    cooldowns: Map<string, number>;
}

export function createNoticeState(): NoticeState {
    return reactive<NoticeState>({
        live: [],
        history: [],
        nextId: 1,
        reviewedId: 0,
        durationLevel: DEFAULT_NOTICE_DURATION_LEVEL,
        cooldowns: new Map(),
    });
}

/** Changes how long an informational or success toast stays, for every notice raised after this. */
export function setNoticeDurationLevel(state: NoticeState, level: NoticeDurationLevel["level"]): void {
    state.durationLevel = level;
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
    const { title, detail, actions, category, cooldownMs } = resolved;

    const notice: Notice = {
        id: state.nextId++,
        level,
        message,
        at: localTimestamp(),
        timeout: timeoutFor(level, state.durationLevel),
        ...(title === undefined ? {} : { title }),
        ...(detail === undefined ? {} : { detail }),
        ...(actions === undefined || actions.length === 0 ? {} : { actions }),
        ...(category === undefined ? {} : { category }),
    };

    // A warning or an error is never throttled: those are the ones the non-blocking
    // notification rules say must persist until somebody reads them, and a cooldown that
    // dropped one on the strength of a sibling shown a moment earlier would be exactly the
    // failure this queue exists to prevent. Only info/success, and only with both a category
    // and a cooldown, can land in the reviewable history without also going live.
    const throttled =
        category !== undefined &&
        cooldownMs !== undefined &&
        (level === "info" || level === "success") &&
        (state.cooldowns.get(category) ?? -Infinity) + cooldownMs > Date.now();

    if (!throttled) {
        state.live.push(notice);
        if (category !== undefined) state.cooldowns.set(category, Date.now());
    }

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

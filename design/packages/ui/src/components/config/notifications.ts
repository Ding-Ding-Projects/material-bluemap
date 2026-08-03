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
 */

import { reactive, readonly } from "vue";

export type NoticeLevel = "info" | "success" | "warning" | "error";

export interface Notice {
    readonly id: number;
    readonly level: NoticeLevel;
    readonly message: string;
    /** Optional detail, shown behind a disclosure rather than in the toast body. */
    readonly detail?: string;
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
}

export function createNoticeState(): NoticeState {
    return reactive<NoticeState>({ live: [], history: [], nextId: 1 });
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

/** Raises a notice and returns it. */
export function notify(state: NoticeState, level: NoticeLevel, message: string, detail?: string): Notice {
    const notice: Notice = {
        id: state.nextId++,
        level,
        message,
        at: localTimestamp(),
        timeout: timeoutFor(level),
        ...(detail === undefined ? {} : { detail }),
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

/** A read-only view, for components that only display. */
export function readNotices(state: NoticeState): Readonly<NoticeState> {
    return readonly(state) as Readonly<NoticeState>;
}

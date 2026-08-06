/**
 * Turning one autosave attempt into, at most, one non-blocking notice.
 *
 * `main/project/autosave.ts` reports every attempt it makes - automatic or flushed,
 * successful or not - and it is tempting to raise a toast for each one, because that is the
 * most direct way to answer "is my work being saved". It is also exactly the noise the
 * project's non-blocking-notification rules warn against: an editor open for ten minutes
 * autosaves several times on its own quiet interval alone, and a toast on every one of them
 * would make the feature hated rather than trusted within the first session anyone used it.
 *
 * So the policy here is deliberately narrow, and it is a pure function precisely so the
 * policy itself - not the wiring around it - is what gets tested:
 *
 *   - A **successful, routine** autosave (`reason: "quiet"`, `ok: true`, `historyOk: true`)
 *     raises nothing at all. The project's own History tab is the ambient indicator that
 *     work is being kept; it already lists every revision with what changed and when, which
 *     is a truer "your work is safe" than a toast that says the same four words every
 *     fifteen seconds.
 *   - A **flushed but still routine** save (`reason: "boundary" | "destructive" | "quit"`)
 *     is treated the same as `"quiet"` when it succeeds - it is still an autosave, not
 *     something the person asked for by name, and it deserves the same quiet.
 *   - Any **failure** - the write itself failing, or the write succeeding with no record of
 *     it kept - always raises a notice, at every reason, because a broken safety net is
 *     exactly the kind of thing the notification rules call out as deserving attention
 *     rather than silence.
 *
 * Failures share one notice category with a cooldown, via `stores/notices.ts`'s `notify`, so
 * a repository that starts failing every autosave for the next few minutes interrupts once
 * and then stops interrupting - the failure stays fully reviewable in the notification
 * centre's history the whole time, it just stops elbowing its way onto the toast stack.
 */

import type { NoticeLevel } from "../components/config/notifications.js";
import { raiseNotice } from "./notices.js";

export type ProjectAutosaveReason = "quiet" | "boundary" | "destructive" | "quit";

/**
 * Just enough of `main/project/save.ts`'s `ProjectSaveResult` for this policy to read. A
 * structural subset rather than the bridge's own type, so this module - and its tests - do
 * not have to import the preload bundle to describe what one save produced.
 */
export type ProjectAutosaveSaveResult =
    | { readonly ok: true; readonly historyOk: boolean; readonly historyMessage: string }
    | { readonly ok: false; readonly reason: string };

export interface ProjectAutosaveOutcome {
    readonly worldFolder: string;
    readonly reason: ProjectAutosaveReason;
    readonly result: ProjectAutosaveSaveResult;
}

/** One notice, or null when this outcome earns silence. Pure, and the whole of the policy. */
export function autosaveNoticeFor(
    outcome: ProjectAutosaveOutcome,
): { readonly level: NoticeLevel; readonly message: string } | null {
    const { result } = outcome;

    if (!result.ok) {
        return { level: "error", message: result.reason };
    }
    if (!result.historyOk) {
        return { level: "warning", message: result.historyMessage };
    }
    // Saved, and recorded. Whatever asked for this - a quiet tick, a boundary, the app about
    // to quit - none of that is news; it is the feature working exactly as promised.
    return null;
}

/** Bucket every autosave-failure notice shares, so repeats throttle against each other. */
export const AUTOSAVE_NOTICE_CATEGORY = "project-autosave";

/** How long a repeat autosave failure is kept off the toast stack, once one has been shown. */
export const AUTOSAVE_NOTICE_COOLDOWN_MS = 60_000;

/**
 * Applies {@link autosaveNoticeFor} to one outcome and raises the notice it names, if any.
 *
 * The seam a test hands a fake `raise` through; {@link wireProjectAutosaveNotices} below is
 * the only real caller, and it always leaves this at its default.
 */
export function handleProjectAutosaveOutcome(
    outcome: ProjectAutosaveOutcome,
    raise: (level: NoticeLevel, message: string) => void = (level, message) =>
        void raiseNotice(level, message, { category: AUTOSAVE_NOTICE_CATEGORY, cooldownMs: AUTOSAVE_NOTICE_COOLDOWN_MS }),
): void {
    const notice = autosaveNoticeFor(outcome);
    if (notice !== null) raise(notice.level, notice.message);
}

/**
 * Subscribes to the main process's autosave events for the lifetime of the call, and returns
 * the unsubscribe function - the same shape every other `on*Event` bridge listener in this
 * package returns, so `App.vue` can wire this exactly like it wires the rest of them.
 *
 * Answers a no-op unsubscribe when there is no bridge at all (a browser tab, a test), which
 * is the same "a missing host is a stated fact, not a crash" degradation every other bridge
 * seam in this package follows.
 */
export function wireProjectAutosaveNotices(): () => void {
    const bridge = typeof window === "undefined" ? undefined : window.materialBluemap;
    const onAutosaveEvent = bridge?.project?.onAutosaveEvent;
    if (typeof onAutosaveEvent !== "function") return () => {};

    return onAutosaveEvent((event) => {
        handleProjectAutosaveOutcome(event);
    });
}

/**
 * Bulk actions over the notification history, decided without a component.
 *
 * The centre had a filter and a search and, until now, nothing that touched more than one
 * notice at a time. That is the same decorative-control failure this project keeps finding
 * in other lists: a review surface with fifty entries and no way to act on more than one of
 * them is a review surface that makes its own case for opening thirty toasts one at a time.
 *
 * This module owns three things, kept apart from the panel exactly the way `noticeCentre.ts`
 * keeps filtering apart from it:
 *
 *  - the selection model: which ids are picked, and what a click, a shift-click, an invert
 *    or a scoped "select all" does to that set;
 *  - the honest preview: how many are selected versus how many a given action will actually
 *    touch, because a watermark-based "read" concept and a "not currently showing" dismiss
 *    can each affect a different count than the one the user picked;
 *  - the actions themselves, run against a `NoticeState` the same way `dismiss`, `restore`
 *    and `markReviewed` in `../config/notifications.ts` already do.
 *
 * It lives here rather than in `../config/notifications.ts` on purpose: the queue's own file
 * owns the primitives every surface shares, and bulk selection is a feature of this one
 * review surface, not of the toast queue. Nothing here reaches past the public fields
 * `NoticeState` already exposes (`live`, `history`, `reviewedId`), so the queue's own rules
 * stay the single source of truth for what a notice is and how long it lives.
 *
 * ## Selection persists across the filter, deliberately
 *
 * A picked id stays picked when the search or the level chips change what is on screen,
 * the way a mail client's checkboxes do. The alternative, dropping a selection the moment
 * its row scrolls out of view, is the more surprising behaviour: narrowing a search to check
 * one more thing should not silently un-pick five notices somebody meant to delete. Because
 * of that, every bulk action is careful to report what it actually touches (`changingCount`)
 * next to what was picked (`selectedCount`), rather than assuming the two are the same.
 *
 * ## Marking as read is a line, not a flag
 *
 * `../config/notifications.ts` tracks "read" as a single watermark, `reviewedId`: everything
 * with an id at or below it is read, and opening the centre moves it to the top in one go.
 * There is no per-notice flag to flip, so a bulk "mark these as read" cannot be a bulk flip
 * of independent booleans without inventing state the rest of the app does not have and
 * would not honour. `markSelectedAsRead` is honest about that instead of pretending
 * otherwise: it moves the same one line forward, only as far as the newest selected notice
 * needs it to, and `readImpact` reports the unread ones sitting between the oldest and
 * newest of the selection that ride along even though nobody picked them.
 */

import type { Notice, NoticeState } from "../config/notifications.js";

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

export type SelectionSet = ReadonlySet<number>;

/** An empty selection, the state the panel opens in. */
export function emptySelection(): Set<number> {
    return new Set();
}

/** A plain click: picks the id up if it was not picked, puts it down if it was. */
export function toggleSelection(selected: SelectionSet, id: number): Set<number> {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

/**
 * A shift-click (or the keyboard equivalent): adds every id between the anchor and `id`,
 * inclusive, in whatever order the caller is currently displaying them.
 *
 * `order` is the visible order rather than the full history's, because a range somebody can
 * see is a range somebody meant; a range computed against ids hidden by the active filter
 * would silently sweep up notices the user has no way to know were between the two clicks.
 * Ids already picked outside the range are left alone: shift-click extends a selection, the
 * same way it does in a file manager, rather than replacing it.
 *
 * With no anchor yet - nothing has been clicked plain since the panel opened, or since the
 * last clear - this falls back to picking up just `id`, the same as a plain click, so a
 * shift-click on an empty selection is never a silent no-op.
 */
export function rangeSelection(
    order: readonly number[],
    selected: SelectionSet,
    anchorId: number | null,
    id: number,
): Set<number> {
    const next = new Set(selected);

    if (anchorId === null) {
        next.add(id);
        return next;
    }

    const from = order.indexOf(anchorId);
    const to = order.indexOf(id);
    if (from === -1 || to === -1) {
        next.add(id);
        return next;
    }

    const [start, end] = from <= to ? [from, to] : [to, from];
    for (let index = start; index <= end; index++) {
        const rangeId = order[index];
        if (rangeId !== undefined) next.add(rangeId);
    }
    return next;
}

/** Replaces the selection with exactly the ids given: "select all N shown" or "...in history". */
export function selectExactly(ids: readonly number[]): Set<number> {
    return new Set(ids);
}

/**
 * Flips membership for every currently visible id, leaving anything selected outside that
 * set untouched. Inverting is a statement about what is on screen, so it only ever acts on
 * what is on screen.
 */
export function invertSelection(visibleIds: readonly number[], selected: SelectionSet): Set<number> {
    const next = new Set(selected);
    for (const id of visibleIds) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
    }
    return next;
}

/* -------------------------------------------------------------------------- */
/* Honest previews                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What a bulk action is about to do, named without spin.
 *
 * `selectedCount` is what the user picked. `changingCount` is what the action actually
 * touches, which is allowed to be smaller (some picks are stale, or already in the state the
 * action would put them in) or, for the read watermark, larger (see the module comment).
 * `excludedCount` is always `selectedCount` minus however many of the selection genuinely
 * changed, so a caller never has to subtract to find out how many were left alone.
 */
export interface BulkImpact {
    readonly selectedCount: number;
    readonly changingCount: number;
    readonly excludedCount: number;
}

function poolImpact(pool: readonly Notice[], ids: SelectionSet): BulkImpact {
    const changing = pool.filter((notice) => ids.has(notice.id)).length;
    return { selectedCount: ids.size, changingCount: changing, excludedCount: Math.max(0, ids.size - changing) };
}

/** How many of the selection are currently on screen and would actually leave the corner. */
export function dismissImpact(state: NoticeState, ids: SelectionSet): BulkImpact {
    return poolImpact(state.live, ids);
}

/** How many of the selection still exist in the history and would actually be removed. */
export function deleteImpact(state: NoticeState, ids: SelectionSet): BulkImpact {
    return poolImpact(state.history, ids);
}

/** The notices a selection resolves to among the ones the filter is currently showing. */
export function selectedAmong(visible: readonly Notice[], ids: SelectionSet): Notice[] {
    return visible.filter((notice) => ids.has(notice.id));
}

/** How many of the selection match the active filter and search, and would be exported. */
export function exportImpact(visible: readonly Notice[], ids: SelectionSet): BulkImpact {
    const changing = selectedAmong(visible, ids).length;
    return { selectedCount: ids.size, changingCount: changing, excludedCount: Math.max(0, ids.size - changing) };
}

/**
 * The read watermark's honest preview: how many notices would flip from unread to read, and
 * how many of those were not part of the selection at all.
 *
 * `missingCount` covers ids picked for a notice the history no longer holds, which
 * `changingCount` can never include. `extraCount` is the module comment's "in between":
 * everything unread between the oldest and newest of what actually exists in the selection,
 * minus however many of the selection were themselves already unread.
 */
export interface ReadImpact extends BulkImpact {
    readonly missingCount: number;
    readonly extraCount: number;
}

export function readImpact(state: NoticeState, ids: SelectionSet): ReadImpact {
    const present = state.history.filter((notice) => ids.has(notice.id));
    const missingCount = ids.size - present.length;

    if (present.length === 0) {
        return { selectedCount: ids.size, changingCount: 0, excludedCount: ids.size, missingCount, extraCount: 0 };
    }

    const maxId = Math.max(...present.map((notice) => notice.id));
    const target = Math.max(state.reviewedId, maxId);
    const changing = state.history.filter((notice) => notice.id > state.reviewedId && notice.id <= target).length;
    const selectedUnread = present.filter((notice) => notice.id > state.reviewedId).length;
    const extraCount = Math.max(0, changing - selectedUnread);

    return {
        selectedCount: ids.size,
        changingCount: changing,
        excludedCount: missingCount,
        missingCount,
        extraCount,
    };
}

/* -------------------------------------------------------------------------- */
/* The actions                                                                */
/* -------------------------------------------------------------------------- */

/** Clears every selected id off the corner. Every one of them stays in the history. */
export function bulkDismiss(state: NoticeState, ids: SelectionSet): number {
    const before = state.live.length;
    state.live = state.live.filter((notice) => !ids.has(notice.id));
    return before - state.live.length;
}

/**
 * Removes every selected id from the history for good, and off the corner too if it was
 * still showing.
 *
 * This is the one destructive action in this module: nothing puts a deleted notice back,
 * and there is no local version history for the notification queue the way there is for a
 * config folder. Every caller reaches this only after the two-key gate authorizes it, which
 * `superConfirmPolicy.test.ts` holds this file to by name.
 */
export function deleteSelectedHistory(state: NoticeState, ids: SelectionSet): number {
    const before = state.history.length;
    state.history = state.history.filter((notice) => !ids.has(notice.id));
    state.live = state.live.filter((notice) => !ids.has(notice.id));
    return before - state.history.length;
}

/**
 * Advances the read watermark to cover the newest notice actually selected, and returns how
 * many notices flipped from unread to read as a result (see `readImpact` for why that can be
 * more than the selection's own size).
 */
export function markSelectedAsRead(state: NoticeState, ids: SelectionSet): number {
    const present = state.history.filter((notice) => ids.has(notice.id));
    if (present.length === 0) return 0;

    const maxId = Math.max(...present.map((notice) => notice.id));
    const before = state.reviewedId;
    state.reviewedId = Math.max(state.reviewedId, maxId);
    return state.history.filter((notice) => notice.id > before && notice.id <= state.reviewedId).length;
}

/* -------------------------------------------------------------------------- */
/* Export formatting                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The selected, currently-visible notices as JSON: an array of plain objects, UTF-8,
 * two-space indented, with every field the notice carries other than its live callbacks.
 *
 * `actions[].run` is a function and cannot round-trip through JSON, so only `id`, `label`
 * and `href` travel; a pasted export still says what a notice offered even though it cannot
 * offer to run it from outside the app.
 */
export function formatNoticesAsJson(notices: readonly Notice[]): string {
    return JSON.stringify(
        notices.map((notice) => ({
            id: notice.id,
            level: notice.level,
            at: notice.at,
            ...(notice.title === undefined ? {} : { title: notice.title }),
            message: notice.message,
            ...(notice.detail === undefined ? {} : { detail: notice.detail }),
            ...(notice.actions === undefined || notice.actions.length === 0
                ? {}
                : {
                      actions: notice.actions.map((action) => ({
                          id: action.id,
                          label: action.label,
                          ...(action.href === undefined ? {} : { href: action.href }),
                      })),
                  }),
        })),
        null,
        2,
    );
}

/** A short, single-line label for one notice: its title if it has one, else its message. */
export function noticeSummary(notice: Notice): string {
    const head = notice.title ?? notice.message;
    return head.length > 80 ? `${head.slice(0, 77)}...` : head;
}

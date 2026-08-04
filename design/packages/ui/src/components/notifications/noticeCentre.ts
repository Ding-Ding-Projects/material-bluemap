/**
 * What the notification centre shows, decided without a component.
 *
 * A toast is a message that leaves. That is the whole point of it, and it is also the whole
 * problem with it: the one notice worth reading twice is exactly the one that scrolled past
 * while somebody was looking at the map. The queue in `components/config/notifications.ts`
 * has always kept a bounded history for that reason, and until now the only thing reading it
 * was a menu that listed messages in one flat column with no way to find anything. Fifty
 * entries deep, that is an archive rather than a review surface.
 *
 * So the filtering lives here, as functions over plain arrays, for the same reason the queue
 * does: what counts as a match, what a level filter means when nothing is selected, and what
 * text a regular expression is actually tested against are all decisions a test can pin
 * without mounting Vuetify, a menu and a search field to ask.
 *
 * The engine is the settings editor's own `regexEngine`, reached through
 * {@link createSettingMatcher}, so the pattern a user builds in the centre behaves exactly
 * as one built in the options search bar: ECMAScript `RegExp`, evaluated locally, bounded,
 * plain text by default with regex an explicit opt-in.
 */

import type { Notice, NoticeLevel } from "../config/notifications.js";
import type { SettingMatcher } from "../config/regexEngine.js";

/**
 * The levels a filter row offers, worst first.
 *
 * Severity order rather than the declaration order in `NoticeLevel`, because somebody
 * opening the centre after something went wrong is looking for the failure, and a row that
 * leads with "info" makes them read past three chips to reach it.
 */
export const NOTICE_LEVELS: readonly NoticeLevel[] = ["error", "warning", "success", "info"];

/**
 * Everything about one notice that a search should be able to find it by.
 *
 * The level name and the timestamp are included deliberately. "error" is the query somebody
 * types when they want the failures and have not noticed the filter chips, and `2026-08-04`
 * is how a session gets narrowed to an afternoon without a date picker in the way. Action
 * labels are in because "retry" is a perfectly reasonable thing to look for, and the detail
 * is in because a stack trace is often the only place the file name appears.
 *
 * One line per notice, which is also the corpus the regex builder previews against, so what
 * the builder highlights is literally what the filter tests.
 */
export function noticeSearchText(notice: Notice): string {
    return [
        notice.level,
        notice.at,
        notice.title ?? "",
        notice.message,
        notice.detail ?? "",
        ...(notice.actions ?? []).map((action) => action.label),
    ]
        .filter((part) => part.length > 0)
        .join(" ")
        .replace(/\s+/g, " ");
}

/**
 * The builder's sample text: one candidate per line, newest first.
 *
 * Real history rather than an invented example. A builder previewing against text the user
 * has never seen teaches them a pattern that matches the sample and nothing they have.
 */
export function noticeSampleText(history: readonly Notice[]): string {
    return history.map((notice) => noticeSearchText(notice)).join("\n");
}

export interface NoticeFilter {
    /**
     * Levels to keep. Empty means every level, because a filter row with nothing selected
     * is a user who has not filtered, not a user who asked to see nothing.
     */
    readonly levels: readonly NoticeLevel[];
    /** The search predicate, plain text or regex, from `createSettingMatcher`. */
    readonly matcher: SettingMatcher;
}

/** The history a filter leaves visible, in the order the history already holds. */
export function filterNotices(history: readonly Notice[], filter: NoticeFilter): Notice[] {
    const levels = new Set(filter.levels);
    return history.filter(
        (notice) =>
            (levels.size === 0 || levels.has(notice.level)) &&
            filter.matcher.test(noticeSearchText(notice)),
    );
}

/**
 * How many of each level the history holds.
 *
 * Every level is present in the result even at zero, so the filter row can render a chip
 * that is visibly empty rather than one that disappears - a control that vanishes when its
 * count reaches zero is a control the user cannot find again when it stops being zero.
 */
export function countByLevel(history: readonly Notice[]): Record<NoticeLevel, number> {
    const counts: Record<NoticeLevel, number> = { error: 0, warning: 0, success: 0, info: 0 };
    for (const notice of history) counts[notice.level]++;
    return counts;
}

/**
 * The filtered view as Markdown, for the copy action.
 *
 * The exported text is what the panel is showing, filter and search included, because an
 * export that quietly widens to everything is an export nobody can use to report what they
 * were looking at. Levels and timestamps travel with it so a pasted extract still says what
 * happened and when, rather than being four sentences with no provenance.
 */
export function formatNoticesAsMarkdown(notices: readonly Notice[]): string {
    return notices
        .map((notice) => {
            const lines = [`- **${notice.level}** ${notice.at}`];
            if (notice.title !== undefined) lines.push(`  - ${notice.title}`);
            lines.push(`  - ${notice.message}`);
            if (notice.detail !== undefined) lines.push(`  - \`${notice.detail}\``);
            return lines.join("\n");
        })
        .join("\n");
}

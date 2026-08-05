/**
 * The novice "Notification duration" dial: one 1-5 number standing in for the two
 * auto-dismiss timeouts `notifications.ts` used to hardcode, `INFO_TIMEOUT_MS` and
 * `SUCCESS_TIMEOUT_MS` — plus a fifth level neither of those constants could ever express:
 * staying on screen until somebody dismisses it, the same way a warning or an error
 * always has.
 *
 * A toast that vanishes before it is read is not a smaller problem than a warning that
 * vanishes; it is the same problem, just on a message this application decided in advance
 * was not worth reading carefully. Fixed at 5 and 4 seconds, that decision was made for
 * every reader everywhere, including somebody using a screen reader mid-announcement,
 * somebody who reads slowly, or somebody who simply stepped away from the keyboard for a
 * moment. This dial is what makes the actual reader's comfort the thing that decides,
 * instead.
 *
 * ## Where the numbers come from
 *
 * Nobody upstream calibrated a "how long should a toast stay" scale, so this mapping is
 * this application's own invention, laid out below rather than folded into a formula.
 * Level 3 is pinned to the exact values this file's own `INFO_TIMEOUT_MS` /
 * `SUCCESS_TIMEOUT_MS` shipped with before this dial existed, so a profile that has never
 * touched the setting keeps behaving exactly as it always did —
 * `noticeDurationLevels.test.ts` checks that against those two constants directly, the
 * same way `speedLevels.test.ts` checks its own level 3 against the config schema's
 * defaults, so the two cannot drift apart silently.
 *
 * Level 5 sets both timeouts to `null`: an informational or success toast then behaves
 * exactly like a warning or an error already does, staying up until it is dismissed. This
 * is the one level with no upper bound to speak of, which is the point of putting it at
 * the top of the dial rather than inventing a separate "never dismiss" toggle beside it.
 */

/** One rung of the dial. `null` on either field means "stays until dismissed". */
export interface NoticeDurationLevel {
    readonly level: 1 | 2 | 3 | 4 | 5;
    /** Milliseconds an informational toast stays, or `null` to never auto-dismiss. */
    readonly infoTimeoutMs: number | null;
    /** Milliseconds a success toast stays, or `null` to never auto-dismiss. */
    readonly successTimeoutMs: number | null;
}

/**
 * The five levels, quickest to longest.
 *
 * Success is always shorter than info at the same level, matching the one-line
 * distinction `notifications.ts` already draws between the two: a success toast confirms
 * something the reader just did, an info toast tells them something they may not already
 * know, and the second is worth a little longer on screen than the first. Every value is
 * distinct across every level, in both columns, so a raw `(infoTimeoutMs, successTimeoutMs)`
 * pair can only ever mean one level.
 */
export const NOTICE_DURATION_LEVELS: readonly NoticeDurationLevel[] = [
    { level: 1, infoTimeoutMs: 2500, successTimeoutMs: 2000 },
    { level: 2, infoTimeoutMs: 4000, successTimeoutMs: 3000 },
    { level: 3, infoTimeoutMs: 5000, successTimeoutMs: 4000 },
    { level: 4, infoTimeoutMs: 8000, successTimeoutMs: 6000 },
    { level: 5, infoTimeoutMs: null, successTimeoutMs: null },
];

/** The level this application shipped with before the dial existed, and still defaults to. */
export const DEFAULT_NOTICE_DURATION_LEVEL: NoticeDurationLevel["level"] = 3;

/** One level, by its number. Throws only if `NOTICE_DURATION_LEVELS` itself is malformed. */
export function noticeDurationLevelByNumber(level: NoticeDurationLevel["level"]): NoticeDurationLevel {
    const found = NOTICE_DURATION_LEVELS.find((candidate) => candidate.level === level);
    if (found === undefined) throw new Error(`No such notice duration level: ${String(level)}`);
    return found;
}

/** True for a value that is genuinely one of the five level numbers. */
export function isNoticeDurationLevel(value: unknown): value is NoticeDurationLevel["level"] {
    return (
        typeof value === "number" &&
        NOTICE_DURATION_LEVELS.some((candidate) => candidate.level === value)
    );
}

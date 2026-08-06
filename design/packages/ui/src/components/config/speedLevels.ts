/**
 * The novice "Speed" dial: one 1-5 number standing in for two raw `core.conf`
 * settings at once, `render-thread-count` and `render-thread-priority`.
 *
 * Both are documented in `@material-bluemap/config`'s `core.ts`:
 *
 *   render-thread-count     "A higher value can improve the render speed, but
 *                            could impact performance on the host machine."
 *                            No schema-enforced bound. Zero or negative means
 *                            "available cores minus this value" -- the doc's own
 *                            example is a 6-core machine and -2, giving 4
 *                            threads. Java default: 1.
 *
 *   render-thread-priority  "How the thread-priority affects actual performance
 *                            depends on your JVM." Bounded 1-10 by the schema.
 *                            Java default: 5. Hidden behind Advanced today,
 *                            because a bare JVM priority slider means nothing to
 *                            somebody who has never heard of one.
 *
 * Neither BlueMap nor its Java class ever calibrated a "speed" scale across the
 * two of them -- that mapping is this application's own invention, laid out
 * below rather than hidden in a formula, and the copy that describes it says so
 * rather than implying it is a number upstream chose.
 *
 * Level 3 is pinned to BOTH raw defaults exactly (`threadCount: 1`,
 * `threadPriority: 5`), so a freshly generated `core.conf` -- or any `core.conf`
 * that never mentions either key -- reads as "Balanced" rather than "Custom".
 * `speedLevels.test.ts` checks that against the schema's own defaults directly,
 * so the two cannot drift apart silently.
 *
 * This module is framework-free on purpose: `SpeedControl.vue` is the only
 * thing that renders it, but the level table, the round-trip match and the
 * "does this raw pair count as Custom" question are all plain logic that a
 * component test would otherwise have to exercise through a mounted DOM.
 */

/** One rung of the dial, and the exact two raw values it writes. */
export interface SpeedLevel {
    readonly level: 1 | 2 | 3 | 4 | 5;
    /** Exact value written to `render-thread-count`. */
    readonly threadCount: number;
    /** Exact value written to `render-thread-priority`. */
    readonly threadPriority: number;
}

/**
 * The five levels, gentlest to fastest.
 *
 * `threadCount` follows the doc's own "cores minus this value" convention for
 * the two gentle levels, so a low speed leaves more of the host machine free
 * regardless of how many cores it actually has, rather than picking an absolute
 * thread count that means something different on a 4-core laptop and a 32-core
 * server. `threadPriority` climbs across the schema's full 1-10 range.
 *
 * Every value here is distinct across every level, in both columns, which is
 * what makes {@link speedLevelFor} a reliable round trip: no two levels can
 * ever be confused for one another, and `speedLevels.test.ts` checks that this
 * stays true rather than assuming it from the literals below.
 */
export const SPEED_LEVELS: readonly SpeedLevel[] = [
    { level: 1, threadCount: -2, threadPriority: 1 },
    { level: 2, threadCount: -1, threadPriority: 3 },
    { level: 3, threadCount: 1, threadPriority: 5 },
    { level: 4, threadCount: 2, threadPriority: 7 },
    { level: 5, threadCount: 4, threadPriority: 10 },
];

/** The level whose raw pair matches BlueMap's own Java defaults exactly. */
export const DEFAULT_SPEED_LEVEL = 3 as const;

/** One level, by its number. Throws only if `SPEED_LEVELS` itself is ever malformed. */
export function speedLevelByNumber(level: SpeedLevel["level"]): SpeedLevel {
    const found = SPEED_LEVELS.find((candidate) => candidate.level === level);
    if (found === undefined) throw new Error(`No such speed level: ${level}`);
    return found;
}

/**
 * Which level a raw `(threadCount, threadPriority)` pair matches, or `null` for
 * "Custom".
 *
 * `null` covers two different reasons, deliberately conflated into one state
 * for the UI: the pair might be a value nobody using the dial would ever
 * produce (`render-thread-count: 7, render-thread-priority: 2`), or either
 * field might not be a plain number at all (a HOCON parse failure, or a file
 * that never validated). Either way there is no level to show as selected, and
 * the raw fields are left exactly as they are -- this function only reads, it
 * never writes.
 */
export function speedLevelFor(threadCount: unknown, threadPriority: unknown): SpeedLevel | null {
    if (typeof threadCount !== "number" || typeof threadPriority !== "number") return null;
    return SPEED_LEVELS.find((candidate) => candidate.threadCount === threadCount && candidate.threadPriority === threadPriority) ?? null;
}

/**
 * Which level a request's own `renderThreads` matches, by thread count alone.
 *
 * A **coarser** question than {@link speedLevelFor}, and a deliberately different one: a
 * render started from the world wizard carries at most one raw number,
 * `RenderRequest.renderThreads` -- `render-thread-priority` is never set by that path at all
 * (it stays behind the Advanced config editor's own `core.conf`, a different file for a
 * different render), so there is no pair to match here, only a count. `null` covers two
 * different reasons, same as {@link speedLevelFor}'s own `null`: the request never named a
 * count at all (`kind: "automatic"`, this machine's own default applies), or it named one
 * that matches none of the five levels (`kind: "custom"`). Both are real, distinct states a
 * live-render surface has to say plainly rather than fold into one "unknown".
 */
export type ThreadCountMatch =
    | { readonly kind: "automatic" }
    | { readonly kind: "level"; readonly level: SpeedLevel }
    | { readonly kind: "custom"; readonly threadCount: number };

export function matchThreadCount(threadCount: number | null | undefined): ThreadCountMatch {
    if (threadCount === null || threadCount === undefined) return { kind: "automatic" };
    const level = SPEED_LEVELS.find((candidate) => candidate.threadCount === threadCount);
    return level === undefined ? { kind: "custom", threadCount } : { kind: "level", level };
}

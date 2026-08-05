/**
 * A small, honest set of cadences for scheduled re-rendering, and telling whether a check
 * is due yet.
 *
 * ## Why a set of choices and not a cron expression
 *
 * GitHub's `schedule:` trigger takes a cron expression, and a cron expression is exactly
 * the kind of thing this project's guided-forms rule refuses to hand somebody who does not
 * already know one: `17 star-slash-6 * * *` means nothing to a person deciding how often their
 * world should be checked. So the desktop app - see `app/src/main/cirender/schedule.ts` -
 * never asks for one. It offers this fixed list instead, and {@link cadenceIntervalMs}
 * is the one place cadence turns into a number of milliseconds, so the app's configuration
 * screen and the workflow's own "is a check due yet" step can never compute two different
 * answers for the same cadence name.
 *
 * ## Why the workflow still wakes up every hour regardless of cadence
 *
 * GitHub's cron is fixed at the moment the workflow file is written, and a repository
 * variable cannot change what a `schedule:` block reads - so a per-repository cadence
 * cannot be expressed as "GitHub wakes this workflow up less often." What it *can* express
 * is "GitHub wakes this workflow up on its finest cadence, and the job itself decides
 * whether to actually do anything." `.github/workflows/scheduled-render.yml` therefore
 * always wakes up hourly - the finest choice below - and {@link isCadenceDue} is what lets
 * an hourly wake-up honour a daily or weekly configuration by doing nothing, in a few
 * seconds, most of the times it runs. See `docs/scheduled-render.md`.
 */

export type CiScheduleCadence = "hourly" | "sixHourly" | "daily" | "weekly";

/** Every cadence this feature offers, finest first. The only values a config may hold. */
export const CI_SCHEDULE_CADENCES: readonly CiScheduleCadence[] = [
    "hourly",
    "sixHourly",
    "daily",
    "weekly",
];

export function isCiScheduleCadence(value: string): value is CiScheduleCadence {
    return (CI_SCHEDULE_CADENCES as readonly string[]).includes(value);
}

/** The one place a cadence name becomes a number of milliseconds. */
export function cadenceIntervalMs(cadence: CiScheduleCadence): number {
    switch (cadence) {
        case "hourly":
            return 60 * 60 * 1000;
        case "sixHourly":
            return 6 * 60 * 60 * 1000;
        case "daily":
            return 24 * 60 * 60 * 1000;
        case "weekly":
            return 7 * 24 * 60 * 60 * 1000;
    }
}

export interface ScheduleDue {
    readonly due: boolean;
    /** When the next check would become due, ISO-8601. Shown in the app, never guessed at. */
    readonly nextCheckAt: string;
}

/**
 * Whether a check is due, given when the last one ran and the chosen cadence.
 *
 * A pure function of its three arguments, on purpose - the interesting cases are "exactly
 * on the boundary" and "the last check was recorded in the future because a clock is
 * wrong somewhere", and neither is observable by actually waiting six hours for a test.
 *
 * `lastCheckAt` of `null` (or anything that does not parse as a date) is always due: no
 * earlier check is recorded, which is what "never checked" and "a corrupted record" both
 * honestly reduce to, and refusing to check because a timestamp is unreadable would leave
 * a scheduled world stuck forever.
 */
export function isCadenceDue(cadence: CiScheduleCadence, lastCheckAt: string | null, now: Date): ScheduleDue {
    const last = lastCheckAt === null ? Number.NaN : Date.parse(lastCheckAt);
    if (!Number.isFinite(last)) {
        return { due: true, nextCheckAt: now.toISOString() };
    }
    const next = last + cadenceIntervalMs(cadence);
    return { due: now.getTime() >= next, nextCheckAt: new Date(next).toISOString() };
}

/** When the next check would become due. The same arithmetic {@link isCadenceDue} uses. */
export function nextCheckAt(cadence: CiScheduleCadence, lastCheckAt: string | null): string {
    const last = lastCheckAt === null ? Number.NaN : Date.parse(lastCheckAt);
    if (!Number.isFinite(last)) return new Date(0).toISOString();
    return new Date(last + cadenceIntervalMs(cadence)).toISOString();
}

export interface CadenceCost {
    /** How many times a month (30 days) this cadence wakes the check up. Exact arithmetic. */
    readonly checksPerMonth: number;
    /** One honest sentence about what that costs, with no invented runner-minute figure. */
    readonly description: string;
}

/**
 * What a cadence costs, in the only units this feature can state without guessing.
 *
 * `checksPerMonth` is exact arithmetic from {@link cadenceIntervalMs}, never a fabricated
 * "about N minutes a month" figure - the check job's actual duration depends on the
 * world's source and this project's own runner, which this module cannot know and will
 * not invent. What it can say truthfully is what changes with cadence at all: how often
 * the check runs, and that only an *actual* change ever triggers the render workflow that
 * spends real minutes. See `docs/scheduled-render.md` for the fuller explanation.
 */
export function describeCadenceCost(cadence: CiScheduleCadence): CadenceCost {
    const checksPerMonth = Math.round((30 * 24 * 60 * 60 * 1000) / cadenceIntervalMs(cadence));
    return {
        checksPerMonth,
        description:
            `Checks about ${String(checksPerMonth)} times a month. Each check reads a small ` +
            "amount of metadata - never the world itself - so checking costs very little " +
            "however often it runs. A full render, which spends real GitHub Actions minutes, " +
            "only starts when a check actually finds a change.",
    };
}

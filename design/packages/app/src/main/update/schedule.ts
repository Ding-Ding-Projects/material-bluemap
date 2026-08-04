/**
 * How often the app is allowed to ask whether it is out of date.
 *
 * A pure function of the state so far, because a schedule written inline in a
 * `setInterval` call is a schedule nobody can test: the interesting cases are "what
 * happens after four failures in a row" and "does a manual check reset the clock", and
 * neither is observable without waiting hours.
 *
 * ## Bounded, in both directions
 *
 * The upper bound is the obvious one: a check every six hours, not every minute. The lower
 * bound is the one that gets forgotten - after a failure the delay grows, so a machine that
 * is offline for a week does not spend that week making a DNS query every six hours and
 * writing a failure into the log each time. It caps out at a day, because backing off
 * forever means a machine that was offline once never checks again.
 *
 * The first check is delayed rather than fired at launch. The failure that prevents is a
 * cold start competing with the window, the embedded server and the render restore for the
 * same few hundred milliseconds - an update check is the least urgent thing happening at
 * that moment and must not be the reason the window appears late.
 */

/** How long after launch the first check runs. Long enough for the window to be up. */
export const STARTUP_DELAY_MS = 30_000;

/** The ordinary gap between checks on a machine where checking works. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The longest the back-off is allowed to grow to. A day, never "never". */
export const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

/**
 * The shortest gap any two automatic checks may have, whatever else says otherwise.
 *
 * A guard against a feed that answers instantly and wrongly: without a floor, an engine
 * that reported failure synchronously would drive an unbounded loop of checks.
 */
export const MIN_INTERVAL_MS = 60_000;

export interface ScheduleState {
    /** How many checks have failed since the last one that did not. */
    readonly consecutiveFailures: number;
    /** True once an installer is staged, at which point checking again buys nothing. */
    readonly ready: boolean;
}

export function initialSchedule(): ScheduleState {
    return { consecutiveFailures: 0, ready: false };
}

export function scheduleAfterFailure(state: ScheduleState): ScheduleState {
    return { ...state, consecutiveFailures: state.consecutiveFailures + 1 };
}

export function scheduleAfterSuccess(state: ScheduleState, ready: boolean): ScheduleState {
    return { consecutiveFailures: 0, ready };
}

/**
 * How long to wait before the next automatic check, or null when there should not be one.
 *
 * Null once an update is staged. There is nothing left to discover: the installer is on
 * disk, the banner is up, and the only thing that changes the situation is the user
 * choosing to restart. Checking anyway would be network traffic in service of no decision.
 */
export function nextCheckDelay(state: ScheduleState): number | null {
    if (state.ready) return null;
    if (state.consecutiveFailures === 0) return CHECK_INTERVAL_MS;

    // Doubling from the ordinary interval, capped. `2 ** n` with n bounded by the cap below
    // rather than by the exponent, so a machine offline for a month cannot overflow it.
    const doubled = CHECK_INTERVAL_MS * 2 ** Math.min(state.consecutiveFailures, 8);
    return Math.max(MIN_INTERVAL_MS, Math.min(MAX_BACKOFF_MS, doubled));
}

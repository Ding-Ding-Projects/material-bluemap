/**
 * The one progress surface, and the vocabulary every route speaks to it.
 *
 * Mount {@link RenderProgressDetail} with a `ProgressFacts` and it draws the breakdown:
 * overall, the phase inside it, the unit being worked, real counts where real counts exist,
 * elapsed time, time since anything last arrived, an honest estimate or none at all, byte
 * transfers where a route counts bytes, and every shard job by name and state.
 *
 * There is deliberately one of these rather than one per route. `renderRun.ts` builds the
 * facts for a render on this machine, in a container, or on a machine over SSH — those
 * three arrive on one event stream on purpose. {@link ciProgressFacts} builds them for a
 * render on GitHub's runners from the run report the CI surface already holds.
 *
 * `progressModel.ts` is pure and has no Vue in it, so the rate, the stall detection and the
 * estimate can be tested without mounting anything.
 */

export { default as RenderProgressDetail } from "./RenderProgressDetail.vue";

export {
    EMPTY_FACTS,
    ETA_MIN_SAMPLES,
    ETA_WINDOW,
    NO_ESTIMATE,
    STALL_AFTER_MS,
    createEtaTracker,
    milestoneKeyOf,
    runningShards,
    shardFinished,
    shardGroupOf,
    shardGroups,
    summariseShards,
    timingOf,
} from "./progressModel.js";
export type {
    EstimateSource,
    EtaTracker,
    ProgressCount,
    ProgressEstimate,
    ProgressFacts,
    ProgressLevel,
    ProgressRoute,
    ProgressText,
    ProgressTiming,
    ProgressUnit,
    ShardGroup,
    ShardStat,
    ShardState,
    TransferDirection,
    TransferStat,
} from "./progressModel.js";

export {
    formatClock,
    formatCount,
    formatNumber,
    formatPercent,
    formatRate,
    formatTransfer,
} from "./format.js";

export { CI_PHASES, ciPhaseText, ciProgressFacts, plannedShards, shardFromJob } from "./ciProgress.js";
export type { CiProgressInput } from "./ciProgress.js";

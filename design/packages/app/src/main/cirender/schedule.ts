/**
 * Configuring scheduled re-rendering from the app: turning it on, choosing a cadence, and
 * reading back what `.github/workflows/scheduled-render.yml` found. See
 * docs/scheduled-render.md for the workflow side; this file only reads and writes the
 * repository variables that connect the two, through the transport a sync already chose -
 * see `transport.ts`'s `readVariable`/`writeVariable`.
 *
 * ## Guided, never a cron expression
 *
 * The cadence is one of exactly four names - `CI_SCHEDULE_CADENCES`, re-exported from
 * `@material-bluemap/render-actions` so the app and the workflow can never disagree about
 * what "daily" means in milliseconds. Nothing here accepts free text for it.
 *
 * ## What "configuring" actually writes
 *
 * Scheduling a world only makes sense once it has been uploaded at least once - the
 * workflow needs a release asset to watch. So {@link writeCiSchedule} takes the sync's own
 * {@link CiSyncState} and derives `world-source=release-asset` and
 * `world=<releaseTag>/<assetName>` from it, rather than asking a person to type a release
 * tag they would have to go and look up. Turning scheduling on for a world that has never
 * been uploaded is refused, with the reason, before anything is written.
 */

import {
    CI_SCHEDULE_CADENCES,
    describeCadenceCost,
    isCadenceDue,
    isCiScheduleCadence,
} from "@material-bluemap/render-actions";
import type { CiScheduleCadence } from "@material-bluemap/render-actions";
import type { CiTransport } from "./transport.js";
import type { CiSyncState } from "./state.js";

export { CI_SCHEDULE_CADENCES, isCiScheduleCadence };
export type { CiScheduleCadence };

/** Every repository variable this feature reads or writes, named once. */
export const CI_SCHEDULE_VARIABLES = {
    enabled: "CIRENDER_SCHEDULE_ENABLED",
    cadence: "CIRENDER_SCHEDULE_CADENCE",
    worldSource: "CIRENDER_SCHEDULE_WORLD_SOURCE",
    world: "CIRENDER_SCHEDULE_WORLD",
    dimension: "CIRENDER_SCHEDULE_DIMENSION",
    mapId: "CIRENDER_SCHEDULE_MAP_ID",
    mapName: "CIRENDER_SCHEDULE_MAP_NAME",
    output: "CIRENDER_SCHEDULE_OUTPUT",
    lastCheckAt: "CIRENDER_SCHEDULE_LAST_CHECK_AT",
    lastCheckResult: "CIRENDER_SCHEDULE_LAST_CHECK_RESULT",
    lastCheckReason: "CIRENDER_SCHEDULE_LAST_CHECK_REASON",
    lastRenderAt: "CIRENDER_SCHEDULE_LAST_RENDER_AT",
} as const;

export type CiScheduleCheckResultName = "changed" | "unchanged" | "unknown" | "error";

const CHECK_RESULT_NAMES: readonly CiScheduleCheckResultName[] = ["changed", "unchanged", "unknown", "error"];

function isCheckResultName(value: string): value is CiScheduleCheckResultName {
    return (CHECK_RESULT_NAMES as readonly string[]).includes(value);
}

export interface CiScheduleSettings {
    readonly enabled: boolean;
    readonly cadence: CiScheduleCadence;
}

/** What the settings screen shows: the configuration, plus the workflow's own last report. */
export interface CiScheduleStatus {
    readonly enabled: boolean;
    /** Null when nothing has been configured yet - a genuinely different state from "off". */
    readonly cadence: CiScheduleCadence | null;
    readonly lastCheckAt: string | null;
    readonly lastCheckResult: CiScheduleCheckResultName | null;
    readonly lastCheckReason: string | null;
    readonly lastRenderAt: string | null;
    /**
     * When the next check would become due, computed locally from `cadence` and
     * `lastCheckAt` with the exact arithmetic `.github/workflows/scheduled-render.yml`'s
     * own `schedule-due` step uses. Null when scheduling is off or has no cadence yet.
     */
    readonly nextCheckAt: string | null;
    /** How many times a month the configured cadence wakes the check up. Null when off. */
    readonly checksPerMonth: number | null;
    readonly costDescription: string | null;
}

export interface CiScheduleWriteFailure {
    readonly code: "not-uploaded-yet";
    readonly message: string;
}

export type CiScheduleWriteResult = { readonly ok: true } | { readonly ok: false; readonly failure: CiScheduleWriteFailure };

/**
 * Reads the current schedule status for one repository, straight from its variables.
 *
 * Six reads, sequential rather than parallel: each is a small, cheap API call and this is
 * called from a settings screen a person is looking at, not from a hot loop - there is no
 * reason to race six requests against the same rate limit for a screen that opens once.
 */
export async function readCiSchedule(transport: CiTransport, owner: string, repo: string): Promise<CiScheduleStatus> {
    const enabledRaw = await transport.readVariable(owner, repo, CI_SCHEDULE_VARIABLES.enabled);
    const cadenceRaw = await transport.readVariable(owner, repo, CI_SCHEDULE_VARIABLES.cadence);
    const lastCheckAt = await transport.readVariable(owner, repo, CI_SCHEDULE_VARIABLES.lastCheckAt);
    const lastCheckResultRaw = await transport.readVariable(owner, repo, CI_SCHEDULE_VARIABLES.lastCheckResult);
    const lastCheckReason = await transport.readVariable(owner, repo, CI_SCHEDULE_VARIABLES.lastCheckReason);
    const lastRenderAt = await transport.readVariable(owner, repo, CI_SCHEDULE_VARIABLES.lastRenderAt);

    return parseCiSchedule({
        enabled: enabledRaw,
        cadence: cadenceRaw,
        lastCheckAt,
        lastCheckResult: lastCheckResultRaw,
        lastCheckReason,
        lastRenderAt,
    });
}

/**
 * The pure half of {@link readCiSchedule}: turns raw variable strings into a typed status.
 *
 * Kept separate and exported so the parsing - what counts as "enabled", what an
 * unrecognised cadence or result means, the `nextCheckAt`/cost arithmetic - is tested
 * without a transport, a network, or a fake GitHub at all.
 */
export function parseCiSchedule(raw: {
    readonly enabled: string | null;
    readonly cadence: string | null;
    readonly lastCheckAt: string | null;
    readonly lastCheckResult: string | null;
    readonly lastCheckReason: string | null;
    readonly lastRenderAt: string | null;
}): CiScheduleStatus {
    const enabled = raw.enabled === "true";
    const cadence = raw.cadence !== null && isCiScheduleCadence(raw.cadence) ? raw.cadence : null;
    const lastCheckResult =
        raw.lastCheckResult !== null && isCheckResultName(raw.lastCheckResult) ? raw.lastCheckResult : null;

    const due = cadence === null ? null : isCadenceDue(cadence, raw.lastCheckAt, new Date());
    const cost = cadence === null ? null : describeCadenceCost(cadence);

    return {
        enabled,
        cadence,
        lastCheckAt: raw.lastCheckAt,
        lastCheckResult,
        lastCheckReason: raw.lastCheckReason,
        lastRenderAt: raw.lastRenderAt,
        nextCheckAt: enabled ? (due?.nextCheckAt ?? null) : null,
        checksPerMonth: enabled ? (cost?.checksPerMonth ?? null) : null,
        costDescription: enabled ? (cost?.description ?? null) : null,
    };
}

/**
 * Turns on (or reconfigures) scheduled re-rendering for one sync, or turns it off.
 *
 * Refuses, before writing anything, when the sync has never uploaded a world: the
 * workflow's `release-asset` source needs a release tag and asset name to watch, and there
 * is nothing to derive those from until `sync.ts`'s loop has actually published one. This
 * mirrors the same refusal shape `sync.ts` itself uses for its own preconditions - a typed
 * failure, never a thrown string.
 */
export async function writeCiSchedule(
    transport: CiTransport,
    state: CiSyncState,
    settings: CiScheduleSettings,
): Promise<CiScheduleWriteResult> {
    if (settings.enabled && (state.releaseTag === null || state.assetName === null)) {
        return {
            ok: false,
            failure: {
                code: "not-uploaded-yet",
                message:
                    "This world has never been synced to GitHub, so there is no uploaded release asset " +
                    "for a scheduled check to watch. Sync it once first, then turn scheduling on.",
            },
        };
    }

    const owner = state.owner;
    const repo = state.repo;
    await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.enabled, settings.enabled ? "true" : "false");
    await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.cadence, settings.cadence);

    if (settings.enabled) {
        // Only written while turning scheduling on (or refreshing it): a world that is
        // never scheduled has no reason to publish its release tag and map settings as
        // repository variables, and turning it off leaves the last-known configuration in
        // place rather than blanking it, so re-enabling does not need it typed again.
        await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.worldSource, "release-asset");
        await transport.writeVariable(
            owner,
            repo,
            CI_SCHEDULE_VARIABLES.world,
            `${state.releaseTag as string}/${state.assetName as string}`,
        );
        await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.dimension, state.dimension);
        await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.mapId, state.mapId);
        await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.mapName, state.mapName);
        await transport.writeVariable(owner, repo, CI_SCHEDULE_VARIABLES.output, "artifact");
    }

    return { ok: true };
}

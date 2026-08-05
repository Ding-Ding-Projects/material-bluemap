/**
 * The app-side half of scheduled re-rendering: reading a status back from repository
 * variables and writing a new configuration, against a fake transport so nothing here
 * touches the network.
 */

import { describe, expect, it } from "vitest";
import { CI_SCHEDULE_VARIABLES, parseCiSchedule, readCiSchedule, writeCiSchedule } from "./schedule.js";
import type { CiTransport } from "./transport.js";
import { newCiSyncState } from "./state.js";
import type { CiSyncState } from "./state.js";

const OWNER = "o";
const REPO = "r";

function fakeTransport(initial: Readonly<Record<string, string>> = {}): CiTransport & { readonly written: Record<string, string> } {
    const store = new Map<string, string>(Object.entries(initial));
    const written: Record<string, string> = {};
    const unused = (): never => {
        throw new Error("schedule.ts asked the transport for something outside variable read/write");
    };
    return {
        route: "session",
        describe: "a fake",
        canUpload: true,
        written,
        readWorkflow: unused,
        readDefaultBranch: unused,
        dispatchWorkflow: unused,
        findDispatchedRun: unused,
        readRun: unused,
        readRunJobs: unused,
        readJobLogTail: unused,
        listRunArtifacts: unused,
        downloadArtifact: unused,
        releaseHasAsset: unused,
        readRepository: unused,
        findRelease: unused,
        createRelease: unused,
        listReleaseAssets: unused,
        uploadReleaseAsset: unused,
        readVariable: (_owner, _repo, name) => Promise.resolve(store.get(name) ?? null),
        writeVariable: (_owner, _repo, name, value) => {
            store.set(name, value);
            written[name] = value;
            return Promise.resolve();
        },
    };
}

function syncedState(overrides: Partial<CiSyncState> = {}): CiSyncState {
    const base = newCiSyncState({
        syncId: "world-abc123",
        owner: OWNER,
        repo: REPO,
        worldFolder: "C:/worlds/overworld",
        mapId: "world",
        mapName: "World",
        dimension: "minecraft:overworld",
        at: "2026-08-01T00:00:00Z",
    });
    return { ...base, releaseTag: "mbm-ci-world-2026-08-01T00-00-00Z", assetName: "world.zip", ...overrides };
}

describe("parseCiSchedule: pure parsing, no transport at all", () => {
    it("is disabled with nothing configured, and every derived field is null", () => {
        const status = parseCiSchedule({
            enabled: null,
            cadence: null,
            lastCheckAt: null,
            lastCheckResult: null,
            lastCheckReason: null,
            lastRenderAt: null,
        });
        expect(status.enabled).toBe(false);
        expect(status.cadence).toBeNull();
        expect(status.nextCheckAt).toBeNull();
        expect(status.checksPerMonth).toBeNull();
    });

    it("only 'true', exactly, reads as enabled", () => {
        expect(parseCiSchedule({ enabled: "true", cadence: null, lastCheckAt: null, lastCheckResult: null, lastCheckReason: null, lastRenderAt: null }).enabled).toBe(true);
        for (const value of ["True", "1", "yes", "TRUE", ""]) {
            expect(
                parseCiSchedule({ enabled: value, cadence: null, lastCheckAt: null, lastCheckResult: null, lastCheckReason: null, lastRenderAt: null })
                    .enabled,
            ).toBe(false);
        }
    });

    it("rejects an unrecognised cadence rather than guessing, reading it as null", () => {
        const status = parseCiSchedule({
            enabled: "true",
            cadence: "0 * * * *",
            lastCheckAt: null,
            lastCheckResult: null,
            lastCheckReason: null,
            lastRenderAt: null,
        });
        expect(status.cadence).toBeNull();
    });

    it("computes nextCheckAt and checksPerMonth from the real cadence arithmetic when enabled", () => {
        const status = parseCiSchedule({
            enabled: "true",
            cadence: "daily",
            lastCheckAt: "2026-08-05T00:00:00Z",
            lastCheckResult: "unchanged",
            lastCheckReason: "nothing moved",
            lastRenderAt: null,
        });
        expect(status.nextCheckAt).toBe("2026-08-06T00:00:00.000Z");
        expect(status.checksPerMonth).toBe(30);
        expect(status.lastCheckResult).toBe("unchanged");
    });

    it("never computes nextCheckAt or a cost when scheduling is off, even with a cadence still recorded", () => {
        const status = parseCiSchedule({
            enabled: "false",
            cadence: "daily",
            lastCheckAt: "2026-08-05T00:00:00Z",
            lastCheckResult: null,
            lastCheckReason: null,
            lastRenderAt: null,
        });
        expect(status.nextCheckAt).toBeNull();
        expect(status.checksPerMonth).toBeNull();
    });

    it("rejects an unrecognised check result rather than inventing a state", () => {
        const status = parseCiSchedule({
            enabled: "true",
            cadence: "daily",
            lastCheckAt: null,
            lastCheckResult: "definitely-changed",
            lastCheckReason: null,
            lastRenderAt: null,
        });
        expect(status.lastCheckResult).toBeNull();
    });
});

describe("readCiSchedule", () => {
    it("reads every variable through the transport and parses them the same way", async () => {
        const transport = fakeTransport({
            [CI_SCHEDULE_VARIABLES.enabled]: "true",
            [CI_SCHEDULE_VARIABLES.cadence]: "sixHourly",
            [CI_SCHEDULE_VARIABLES.lastCheckAt]: "2026-08-05T12:00:00Z",
            [CI_SCHEDULE_VARIABLES.lastCheckResult]: "changed",
            [CI_SCHEDULE_VARIABLES.lastCheckReason]: "the release asset's digest moved",
            [CI_SCHEDULE_VARIABLES.lastRenderAt]: "2026-08-05T12:00:05Z",
        });
        const status = await readCiSchedule(transport, OWNER, REPO);
        expect(status).toEqual(
            parseCiSchedule({
                enabled: "true",
                cadence: "sixHourly",
                lastCheckAt: "2026-08-05T12:00:00Z",
                lastCheckResult: "changed",
                lastCheckReason: "the release asset's digest moved",
                lastRenderAt: "2026-08-05T12:00:05Z",
            }),
        );
    });

    it("reads a disabled, never-configured status from a transport with nothing set", async () => {
        const status = await readCiSchedule(fakeTransport(), OWNER, REPO);
        expect(status.enabled).toBe(false);
        expect(status.cadence).toBeNull();
        expect(status.lastCheckAt).toBeNull();
    });
});

describe("writeCiSchedule", () => {
    it("refuses to turn scheduling on for a world that has never been uploaded", async () => {
        const transport = fakeTransport();
        const state = syncedState({ releaseTag: null, assetName: null });
        const result = await writeCiSchedule(transport, state, { enabled: true, cadence: "daily" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-uploaded-yet");
        expect(Object.keys(transport.written)).toHaveLength(0);
    });

    it("writes enabled, cadence and the release-asset world derived from the sync state", async () => {
        const transport = fakeTransport();
        const state = syncedState();
        const result = await writeCiSchedule(transport, state, { enabled: true, cadence: "weekly" });
        expect(result.ok).toBe(true);
        expect(transport.written[CI_SCHEDULE_VARIABLES.enabled]).toBe("true");
        expect(transport.written[CI_SCHEDULE_VARIABLES.cadence]).toBe("weekly");
        expect(transport.written[CI_SCHEDULE_VARIABLES.worldSource]).toBe("release-asset");
        expect(transport.written[CI_SCHEDULE_VARIABLES.world]).toBe(`${state.releaseTag}/${state.assetName}`);
        expect(transport.written[CI_SCHEDULE_VARIABLES.mapId]).toBe(state.mapId);
        expect(transport.written[CI_SCHEDULE_VARIABLES.dimension]).toBe(state.dimension);
    });

    it("turning scheduling off writes only 'enabled=false' and cadence, never touching the world fields", async () => {
        const transport = fakeTransport();
        const state = syncedState();
        await writeCiSchedule(transport, state, { enabled: false, cadence: "daily" });
        expect(transport.written[CI_SCHEDULE_VARIABLES.enabled]).toBe("false");
        expect(transport.written[CI_SCHEDULE_VARIABLES.world]).toBeUndefined();
        expect(transport.written[CI_SCHEDULE_VARIABLES.worldSource]).toBeUndefined();
    });

    it("turning scheduling off never refuses, even for a world that was never uploaded", async () => {
        const transport = fakeTransport();
        const state = syncedState({ releaseTag: null, assetName: null });
        const result = await writeCiSchedule(transport, state, { enabled: false, cadence: "daily" });
        expect(result.ok).toBe(true);
    });
});

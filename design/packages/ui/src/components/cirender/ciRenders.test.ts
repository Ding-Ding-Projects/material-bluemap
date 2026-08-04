/**
 * The CI-render surface's state, without a component.
 *
 * The assertions that matter are about **not overstating**: a job that has not finished is
 * never coloured as a success, a run with no conclusion is described as still going, and
 * the one line that says whether a re-sync would upload anything says the right thing in
 * both directions. Getting that line's polarity backwards would be a very quiet bug -
 * somebody would start a four-hour upload believing nothing was going to be sent.
 */

import { describe, expect, it } from "vitest";
import { createCiRenders, jobTone, phaseLabel, runLabel, uploadLine } from "./ciRenders.js";
import type {
    CiJobReport,
    CiPreflight,
    CiRenderBridge,
    CiRunReport,
    CiSyncEvent,
    CiSyncResult,
} from "./ciRenderBridge.js";

const t = ((key: string, a?: unknown, b?: unknown): string => {
    const fallback = typeof a === "string" ? a : typeof b === "string" ? b : key;
    if (typeof a !== "object" || a === null) return fallback;
    return fallback.replace(/\{(\w+)\}/g, (_whole, name: string) =>
        String((a as Record<string, unknown>)[name] ?? ""),
    );
}) as Parameters<typeof phaseLabel>[1];

function job(overrides: Partial<CiJobReport> = {}): CiJobReport {
    return {
        id: 1,
        name: "Wave 1",
        status: "in_progress",
        conclusion: null,
        htmlUrl: "https://github.test/job/1",
        startedAt: null,
        completedAt: null,
        ...overrides,
    };
}

function run(overrides: Partial<CiRunReport> = {}): CiRunReport {
    return {
        runId: 7,
        runNumber: 7,
        htmlUrl: "https://github.test/runs/7",
        status: "in_progress",
        conclusion: null,
        createdAt: "2026-08-04T10:00:00Z",
        updatedAt: "2026-08-04T10:00:00Z",
        headSha: "abcdef",
        jobs: [],
        ...overrides,
    };
}

function bridge(overrides: Partial<CiRenderBridge> = {}): {
    bridge: CiRenderBridge;
    emit: (event: CiSyncEvent) => void;
} {
    let listener: ((event: CiSyncEvent) => void) | null = null;
    return {
        emit: (event) => listener?.(event),
        bridge: {
            ciRenderPreflight: () => Promise.resolve({ ok: false, message: "not stubbed" }),
            startCiRender: () =>
                Promise.resolve({
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "test",
                        message: "no",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                } satisfies CiSyncResult),
            checkCiRender: () =>
                Promise.resolve({
                    ok: true,
                    syncId: "s",
                    outcome: "running",
                    run: null,
                    state: null as never,
                } as CiSyncResult),
            listCiRenders: () => Promise.resolve({ ok: true, value: [] }),
            cancelCiRender: () => Promise.resolve(true),
            onCiRenderEvent: (candidate) => {
                listener = candidate;
                return () => {
                    listener = null;
                };
            },
            canCancel: true,
            canList: true,
            canCheck: true,
            ...overrides,
        },
    };
}

describe("nothing here draws an outcome a run has not reached", () => {
    it("never colours an unfinished job as a success", () => {
        expect(jobTone(job({ status: "in_progress" }))).toBe("info");
        expect(jobTone(job({ status: "queued" }))).toBe("default");
        // The one that matters: a completed job with no conclusion is not a success.
        expect(jobTone(job({ status: "completed", conclusion: null }))).toBe("default");
    });

    it("colours a real conclusion for what it is", () => {
        expect(jobTone(job({ status: "completed", conclusion: "success" }))).toBe("success");
        expect(jobTone(job({ status: "completed", conclusion: "failure" }))).toBe("error");
        expect(jobTone(job({ status: "completed", conclusion: "timed_out" }))).toBe("error");
        expect(jobTone(job({ status: "completed", conclusion: "cancelled" }))).toBe("warning");
    });

    it("says a run is still going, without hinting at how it will end", () => {
        expect(runLabel(run({ status: "in_progress" }), t)).toBe("Run is in progress");
        expect(runLabel(run({ status: "queued" }), t)).toBe("Run is queued");
        expect(runLabel(null, t)).toBe("No run yet");
    });

    it("reports a completed run by its actual conclusion, and says so when there is none", () => {
        expect(runLabel(run({ status: "completed", conclusion: "failure" }), t)).toBe("Run ended: failure");
        expect(runLabel(run({ status: "completed", conclusion: null }), t)).toContain("no conclusion");
    });

    it("names every phase, including the one before anything has happened", () => {
        expect(phaseLabel("uploading", t)).toContain("Uploading");
        expect(phaseLabel("rendering", t)).toContain("GitHub");
        expect(phaseLabel(null, t)).toBe("Starting");
    });
});

describe("the line that decides whether somebody starts an upload", () => {
    function preflight(overrides: Partial<CiPreflight>): CiPreflight {
        return {
            syncId: "s",
            repository: null,
            repositoryFailure: null,
            routeReport: {
                route: "session",
                describe: "Using the GitHub sign-in in this application.",
                session: { signedIn: true, usable: true, reason: null },
                gh: {
                    availability: "not-installed",
                    version: null,
                    account: null,
                    host: null,
                    message: "",
                    usable: false,
                    reason: null,
                },
                ready: true,
                canUpload: true,
            },
            eulaAccepted: true,
            plan: null,
            planFailure: null,
            world: { label: "overworld", files: 10, bytes: 1000 },
            worldFailure: null,
            worldChanged: true,
            uploadNeeded: true,
            estimatedArchiveBytes: 1_500_000_000,
            tooLargeToUpload: false,
            state: null,
            run: null,
            ...overrides,
        };
    }

    it("says how much would go up when an upload is needed", () => {
        expect(uploadLine(preflight({}), t)).toContain("1.5 GB");
        expect(uploadLine(preflight({}), t)).toContain("uploaded");
    });

    it("says nothing will be sent when the world has not changed", () => {
        const line = uploadLine(
            preflight({
                uploadNeeded: false,
                worldChanged: false,
                state: { assetName: "world.zip" } as never,
            }),
            t,
        );
        expect(line).toContain("has not changed");
        expect(line).toContain("world.zip");
        expect(line).not.toContain("will be uploaded");
    });

    it("reports the world's own problem rather than a size, when there is one", () => {
        expect(uploadLine(preflight({ world: null, worldFailure: "no level.dat" }), t)).toBe("no level.dat");
    });
});

describe("rows follow the events", () => {
    it("keeps a failed run's report on screen, because the job and the log are what to act on", () => {
        const { bridge: host, emit } = bridge();
        const renders = createCiRenders(host);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        emit({ type: "run", syncId: "s", run: run(), at: "2026-08-04T10:01:00Z" });
        emit({
            type: "failed",
            syncId: "s",
            failure: {
                code: "run-failure",
                message: "The render on GitHub ended as failure",
                detail: null,
                status: null,
                needsSignIn: false,
                needsEula: false,
                route: "session",
                run: run({ status: "completed", conclusion: "failure", jobs: [job({ conclusion: "failure" })] }),
                failingJob: "Wave 1",
                logExcerpt: "::error::boom",
            },
            at: "2026-08-04T10:30:00Z",
        });

        const row = renders.rows.value[0];
        expect(row?.state).toBe("failed");
        expect(row?.failure?.failingJob).toBe("Wave 1");
        expect(row?.run?.conclusion).toBe("failure");
        // Nothing about a failed sync claims a map arrived.
        expect(row?.summary).toBeNull();
        renders.dispose();
    });

    it("puts a refusal with no record beside the form rather than inventing a row for it", () => {
        const { bridge: host, emit } = bridge();
        const renders = createCiRenders(host);

        emit({
            type: "failed",
            syncId: "nowhere",
            failure: {
                code: "eula-not-accepted",
                message: "Mojang's licence has not been accepted",
                detail: null,
                status: null,
                needsSignIn: false,
                needsEula: true,
                route: null,
                run: null,
                failingJob: null,
                logExcerpt: null,
            },
            at: "2026-08-04T10:00:00Z",
        });

        expect(renders.rows.value).toHaveLength(0);
        expect(renders.startFailure.value?.needsEula).toBe(true);
        renders.dispose();
    });

    it("sorts a running sync above a finished one", () => {
        const { bridge: host, emit } = bridge();
        const renders = createCiRenders(host);
        for (const id of ["done", "going"]) {
            emit({
                type: "started",
                syncId: id,
                repository: "o/r",
                mapId: "world",
                worldFolder: "/w",
                at: "2026-08-04T10:00:00Z",
            });
        }
        emit({
            type: "finished",
            syncId: "done",
            durationMs: 10,
            at: "2026-08-04T11:00:00Z",
            summary: {
                syncId: "done",
                repository: "o/r",
                releaseTag: "t",
                assetName: "a.zip",
                runId: 7,
                runUrl: "u",
                renderId: "ci-done",
                dataRoot: "/local/ci-done",
                mapId: "world",
                mapName: "World",
                route: "session",
                uploaded: true,
                artifactBytes: 1,
                artifactSha256: "x",
                verified: true,
            },
        });

        expect(renders.rows.value.map((row) => row.syncId)).toEqual(["going", "done"]);
        renders.dispose();
    });

    it("carries the upload's byte count, and drops it the moment the phase moves on", () => {
        const { bridge: host, emit } = bridge();
        const renders = createCiRenders(host);

        emit({ type: "phase", syncId: "s", phase: "uploading", at: "2026-08-04T10:00:00Z" });
        emit({
            type: "progress",
            syncId: "s",
            phase: "uploading",
            description: "Uploading part 1 of 1",
            bytesDone: 250,
            bytesTotal: 1000,
            at: "2026-08-04T10:00:01Z",
        });

        expect(renders.rows.value[0]?.transfer?.percent).toBe(25);
        expect(renders.rows.value[0]?.transfer?.description).toBe("Uploading part 1 of 1");

        // A finished upload's bar left beside "GitHub is rendering" would read as a render
        // that is nearly done rather than one that has only just started.
        emit({ type: "phase", syncId: "s", phase: "rendering", at: "2026-08-04T10:05:00Z" });
        expect(renders.rows.value[0]?.transfer).toBeNull();
        renders.dispose();
    });

    it("reports nothing at all when this build has no bridge", () => {
        const renders = createCiRenders(null);
        expect(renders.available).toBe(false);
        expect(renders.canCancel).toBe(false);
        expect(renders.rows.value).toHaveLength(0);
        renders.dispose();
    });
});

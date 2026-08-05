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
import {
    createCiRenders,
    jobTone,
    phaseLabel,
    repoNameProblem,
    routeLabel,
    runLabel,
    uploadLine,
    waveSummaries,
    worldFolderName,
} from "./ciRenders.js";
import type {
    CiJobReport,
    CiOwnerChoicesAnswer,
    CiPreflight,
    CiRenderBridge,
    CiRepositoryChoice,
    CiRepositoryNameAvailability,
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
        wave: null,
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

        emit({ type: "phase", syncId: "s", phase: "uploading", route: "session", at: "2026-08-04T10:00:00Z" });
        emit({
            type: "progress",
            syncId: "s",
            phase: "uploading",
            description: "Uploading part 1 of 1",
            bytesDone: 250,
            bytesTotal: 1000,
            assetsDone: 0,
            assetsTotal: 3,
            asset: "world.zip",
            at: "2026-08-04T10:00:01Z",
        });

        expect(renders.rows.value[0]?.transfer?.percent).toBe(25);
        expect(renders.rows.value[0]?.transfer?.description).toBe("Uploading part 1 of 1");
        // The upload's own count of its pieces, not derived from the bytes above.
        expect(renders.rows.value[0]?.transfer?.assetsDone).toBe(0);
        expect(renders.rows.value[0]?.transfer?.assetsTotal).toBe(3);
        expect(renders.rows.value[0]?.transfer?.asset).toBe("world.zip");

        // A finished upload's bar left beside "GitHub is rendering" would read as a render
        // that is nearly done rather than one that has only just started.
        emit({ type: "phase", syncId: "s", phase: "rendering", route: "session", at: "2026-08-04T10:05:00Z" });
        expect(renders.rows.value[0]?.transfer).toBeNull();
        renders.dispose();
    });

    it("says which credential is driving a row, live - not only after it ends", () => {
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
        // Genuinely unknown for a moment: `started` fires before the route is resolved.
        expect(renders.rows.value[0]?.route).toBeNull();

        emit({ type: "phase", syncId: "s", phase: "checking", route: "gh", at: "2026-08-04T10:00:01Z" });
        expect(renders.rows.value[0]?.route).toBe("gh");
        expect(routeLabel(renders.rows.value[0]?.route ?? null, t)).toContain("gh command-line tool");

        emit({ type: "phase", syncId: "s", phase: "rendering", route: "gh", at: "2026-08-04T10:05:00Z" });
        expect(renders.rows.value[0]?.route).toBe("gh");
        renders.dispose();
    });

    it("keeps whichever wave each shard says it belongs to, in the summary", () => {
        const jobs: CiJobReport[] = [
            job({ id: 1, name: "Wave 1 shard 0", status: "completed", conclusion: "success", wave: 1 }),
            job({ id: 2, name: "Wave 1 shard 1", status: "in_progress", wave: 1 }),
            job({ id: 3, name: "Wave 2 shard 0", status: "queued", wave: 2 }),
            job({ id: 4, name: "Merge group 0", status: "queued", wave: null }),
        ];

        const summaries = waveSummaries(jobs);

        expect(summaries).toEqual([
            { wave: 1, done: 1, total: 2 },
            { wave: 2, done: 0, total: 1 },
            { wave: null, done: 0, total: 1 },
        ]);
    });

    it("reports nothing at all when this build has no bridge", () => {
        const renders = createCiRenders(null);
        expect(renders.available).toBe(false);
        expect(renders.canCancel).toBe(false);
        expect(renders.rows.value).toHaveLength(0);
        renders.dispose();
    });
});

describe("worldFolderName: what a repository name is suggested from", () => {
    it("takes the last segment of a path, either separator", () => {
        expect(worldFolderName("C:\\Users\\a\\Saves\\My World")).toBe("My World");
        expect(worldFolderName("/home/a/saves/my-world")).toBe("my-world");
    });

    it("drops a trailing separator rather than returning nothing", () => {
        expect(worldFolderName("/home/a/saves/my-world/")).toBe("my-world");
    });

    it("is the empty string for nothing at all", () => {
        expect(worldFolderName("")).toBe("");
        expect(worldFolderName("   ")).toBe("");
    });
});

describe("repoNameProblem: GitHub's own naming rules, said before GitHub says them", () => {
    it("is null for an empty field - that is a different message entirely", () => {
        expect(repoNameProblem("", t)).toBeNull();
    });

    it("is null for an ordinary name", () => {
        expect(repoNameProblem("my-world-map", t)).toBeNull();
    });

    it("names the exact rule broken, rather than a generic refusal", () => {
        expect(repoNameProblem("my world", t)).toContain("letters, digits");
        expect(repoNameProblem(".", t)).toContain('"."');
        expect(repoNameProblem("map.git", t)).toContain(".git");
        expect(repoNameProblem("a".repeat(101), t)).toContain("100 characters");
    });
});

describe("who could own it: the signed-in login and its organisations", () => {
    it("reports nobody signed in as the sign-in case, not the try-again case", async () => {
        const answer: CiOwnerChoicesAnswer = { ok: false, signedIn: false, message: "Nobody is signed in." };
        const { bridge: host } = bridge({ listCiOwners: () => Promise.resolve(answer) });
        const renders = createCiRenders(host);
        expect(renders.canListOwners).toBe(true);
        await renders.loadOwners();
        expect(renders.owners.value).toEqual(answer);
        renders.dispose();
    });

    it("tells signed-in-but-unreadable apart from not-signed-in, so the button offered differs", async () => {
        const answer: CiOwnerChoicesAnswer = { ok: false, signedIn: true, message: "GitHub answered 500." };
        const { bridge: host } = bridge({ listCiOwners: () => Promise.resolve(answer) });
        const renders = createCiRenders(host);
        await renders.loadOwners();
        expect(renders.owners.value).toEqual(answer);
        renders.dispose();
    });

    it("lists the login first, then every organisation", async () => {
        const answer: CiOwnerChoicesAnswer = {
            ok: true,
            login: "octocat",
            owners: [
                { login: "octocat", kind: "user" },
                { login: "octo-org", kind: "organization" },
            ],
        };
        const { bridge: host } = bridge({ listCiOwners: () => Promise.resolve(answer) });
        const renders = createCiRenders(host);
        await renders.loadOwners();
        expect(renders.owners.value).toEqual(answer);
        renders.dispose();
    });

    it("reports the capability as false, and does nothing, when the build has none of it", async () => {
        const { bridge: host } = bridge();
        const renders = createCiRenders(host);
        expect(renders.canListOwners).toBe(false);
        await renders.loadOwners();
        expect(renders.owners.value).toBeNull();
        renders.dispose();
    });
});

describe("suggesting and checking a repository name", () => {
    it("returns the main process's own suggestion", async () => {
        const { bridge: host } = bridge({ suggestCiRepoName: () => Promise.resolve("my-world") });
        const renders = createCiRenders(host);
        expect(await renders.suggestRepoName("My World")).toBe("my-world");
        renders.dispose();
    });

    it("returns null rather than throwing, when the build cannot suggest one", async () => {
        const { bridge: host } = bridge();
        const renders = createCiRenders(host);
        expect(renders.canSuggestRepoName).toBe(false);
        expect(await renders.suggestRepoName("My World")).toBeNull();
        renders.dispose();
    });

    it.each([
        ["available" as const, { status: "available", owner: "o", repo: "r" } as CiRepositoryNameAvailability],
        [
            "taken" as const,
            {
                status: "taken",
                owner: "o",
                repo: "r",
                private: false,
                htmlUrl: "https://github.test/o/r",
            } as CiRepositoryNameAvailability,
        ],
        [
            "unknown" as const,
            { status: "unknown", owner: "o", repo: "r", message: "offline" } as CiRepositoryNameAvailability,
        ],
    ])("carries the %s verdict through untouched, never rounding it to another one", async (_label, answer) => {
        const { bridge: host } = bridge({ checkCiRepoName: () => Promise.resolve(answer) });
        const renders = createCiRenders(host);
        expect(renders.canCheckRepoName).toBe(true);
        await renders.checkRepoName("o", "r");
        expect(renders.nameAvailability.value).toEqual(answer);
        expect(renders.checkingName.value).toBe(false);
        renders.dispose();
    });

    it("clears whatever the last check said, for a field that just changed underneath it", async () => {
        const { bridge: host } = bridge({
            checkCiRepoName: () => Promise.resolve({ status: "available", owner: "o", repo: "r" }),
        });
        const renders = createCiRenders(host);
        await renders.checkRepoName("o", "r");
        expect(renders.nameAvailability.value).not.toBeNull();
        renders.clearNameAvailability();
        expect(renders.nameAvailability.value).toBeNull();
        renders.dispose();
    });

    it("never lets a slow, superseded check overwrite a newer one that answered first", async () => {
        // Two in-flight checks, resolved out of fire order: "foo" was asked about first but
        // its network answer lands second, exactly like a laggy request racing a quick one.
        // Whichever finished last used to win outright; the field the user is actually
        // looking at ("foobar") must win instead, regardless of arrival order.
        //
        // Boxed rather than a bare `let`: TypeScript's control-flow analysis does not
        // widen a `let` back to its declared type when the only assignment to it lives
        // inside a nested closure (`checkCiRepoName`'s executor here) - it keeps reading
        // the outer-scope use as narrowed to the `null` initialiser, so `resolveFoo?.(...)`
        // below would type-check as calling `never`. A `{ current }` box sidesteps the
        // whole limitation, because narrowing a property read never worked that way.
        const resolveFoo: { current: ((value: CiRepositoryNameAvailability) => void) | null } = { current: null };
        const resolveFoobar: { current: ((value: CiRepositoryNameAvailability) => void) | null } = { current: null };
        const { bridge: host } = bridge({
            checkCiRepoName: ({ repo }) =>
                new Promise<CiRepositoryNameAvailability>((resolve) => {
                    if (repo === "foo") resolveFoo.current = resolve;
                    else resolveFoobar.current = resolve;
                }),
        });
        const renders = createCiRenders(host);

        const stale = renders.checkRepoName("o", "foo");
        const fresh = renders.checkRepoName("o", "foobar");

        // The fresher request (for what the field now holds) answers first...
        resolveFoobar.current?.({ status: "available", owner: "o", repo: "foobar" });
        await fresh;
        expect(renders.nameAvailability.value).toEqual({ status: "available", owner: "o", repo: "foobar" });

        // ...and the older, slower one answers after it. It must not clobber the fresher
        // verdict the user is already looking at.
        resolveFoo.current?.({ status: "taken", owner: "o", repo: "foo", private: false, htmlUrl: null });
        await stale;
        expect(renders.nameAvailability.value).toEqual({ status: "available", owner: "o", repo: "foobar" });
        expect(renders.checkingName.value).toBe(false);
        renders.dispose();
    });

    it("a superseded check that fails late does not overwrite the fresh verdict either", async () => {
        // Same boxed-closure pattern as the test above, and for the same reason: the
        // executor assigns these from inside `checkCiRepoName`'s nested function, which is
        // outside the control-flow analysis TypeScript performs at the read sites below.
        const rejectFoo: { current: ((error: Error) => void) | null } = { current: null };
        const resolveFoobar: { current: ((value: CiRepositoryNameAvailability) => void) | null } = { current: null };
        const { bridge: host } = bridge({
            checkCiRepoName: ({ repo }) =>
                repo === "foo"
                    ? new Promise<CiRepositoryNameAvailability>((_resolve, reject) => {
                          rejectFoo.current = reject;
                      })
                    : new Promise<CiRepositoryNameAvailability>((resolve) => {
                          resolveFoobar.current = resolve;
                      }),
        });
        const renders = createCiRenders(host);

        const stale = renders.checkRepoName("o", "foo");
        const fresh = renders.checkRepoName("o", "foobar");

        resolveFoobar.current?.({ status: "available", owner: "o", repo: "foobar" });
        await fresh;
        expect(renders.nameAvailability.value).toEqual({ status: "available", owner: "o", repo: "foobar" });

        rejectFoo.current?.(new Error("network blip"));
        await stale;
        expect(renders.nameAvailability.value).toEqual({ status: "available", owner: "o", repo: "foobar" });
        expect(renders.checkingName.value).toBe(false);
        renders.dispose();
    });

    it("a clear that lands while a check is still in flight keeps the field cleared", async () => {
        // Same boxed-closure pattern as the two tests above.
        const resolveCheck: { current: ((value: CiRepositoryNameAvailability) => void) | null } = { current: null };
        const { bridge: host } = bridge({
            checkCiRepoName: () =>
                new Promise<CiRepositoryNameAvailability>((resolve) => {
                    resolveCheck.current = resolve;
                }),
        });
        const renders = createCiRenders(host);

        const inFlight = renders.checkRepoName("o", "r");
        renders.clearNameAvailability();
        expect(renders.nameAvailability.value).toBeNull();

        resolveCheck.current?.({ status: "available", owner: "o", repo: "r" });
        await inFlight;

        expect(renders.nameAvailability.value).toBeNull();
        renders.dispose();
    });
});

describe("an existing repository, picked instead of typed", () => {
    it("lists what the build already knows about", async () => {
        const repositories: readonly CiRepositoryChoice[] = [
            {
                owner: "o",
                name: "r",
                fullName: "o/r",
                private: true,
                canWrite: true,
                htmlUrl: "https://github.test/o/r",
            },
        ];
        const { bridge: host } = bridge({
            listExistingRepositories: () => Promise.resolve({ ok: true, value: repositories }),
        });
        const renders = createCiRenders(host);
        expect(renders.canListRepositories).toBe(true);
        await renders.loadRepositories();
        expect(renders.repositories.value).toEqual(repositories);
        renders.dispose();
    });

    it("reports the failure message rather than an empty list that reads as 'none'", async () => {
        const { bridge: host } = bridge({
            listExistingRepositories: () => Promise.resolve({ ok: false, message: "offline" }),
        });
        const renders = createCiRenders(host);
        await renders.loadRepositories();
        expect(renders.repositories.value).toEqual([]);
        expect(renders.repositoriesFailure.value).toBe("offline");
        renders.dispose();
    });
});

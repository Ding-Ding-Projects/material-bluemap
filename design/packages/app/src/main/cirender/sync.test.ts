/**
 * The loop, against a recording fake of the GitHub API.
 *
 * Every assertion here is about one of the four promises this feature makes, and half of
 * them are **negative** - that something did *not* happen. Those are the ones a stub that
 * merely answered could never check, and they are the ones that matter: an unchanged world
 * that gets uploaded again costs an evening, and a failed run that registers a map costs
 * somebody's trust in every map in the list.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { packFolder } from "../backup/archive.js";
import type { RepositoryReport } from "../backup/index.js";
import { LocalMapHandler } from "../render/LocalMapHandler.js";
import { fingerprintWorld } from "./fingerprint.js";
import {
    RecordingGitHub,
    artifactJson,
    jobJson,
    repositoryJson,
    runJson,
} from "./recordingGitHub.js";
import { ciSyncWorkspace, newCiSyncState, readCiSyncState, syncIdFor, writeCiSyncState } from "./state.js";
import { CiRenderSync } from "./sync.js";
import type { BackupSurface, CiSyncEvent, CiSyncRequest } from "./sync.js";
import type { ProcessRunner } from "./gh.js";

/**
 * A `gh` that is not installed.
 *
 * Injected into every test here so the suite never spawns a real process and never
 * behaves differently on a machine that happens to have `gh` set up. The `gh` route has
 * its own tests in `transport.test.ts`; these are about the loop.
 */
function noGh(): ProcessRunner {
    return {
        run: () => Promise.resolve({ started: false, code: null, stdout: "", stderr: "spawn gh ENOENT" }),
        runToFile: () =>
            Promise.resolve({ started: false, code: null, bytes: 0, stderr: "spawn gh ENOENT" }),
    };
}

const OWNER = "o";
const REPO = "r";
const MAP_ID = "world";
const TOKEN = "t0k3n-that-must-never-cross";
const API = "https://api.test";
const UPLOADS = "https://uploads.test";
const NOW = Date.parse("2026-08-04T10:00:00Z");
const RELEASE_TAG = "mbm-backup-world-overworld-20260803T090000Z";
const ASSET_NAME = "world-overworld-20260803T090000Z.zip";

let workDir = "";
let world = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-cirender-"));
    world = join(workDir, "saves", "overworld");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "level");
    await writeFile(join(world, "region", "r.0.0.mca"), "region bytes");
    await writeFile(join(world, "material-bluemap.project.json"), projectFile(), "utf8");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function projectFile(): string {
    return `${JSON.stringify(
        {
            version: 1,
            id: "project-1",
            name: "Overworld",
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
            appVersion: null,
            maps: [
                {
                    id: MAP_ID,
                    name: "World",
                    dimension: "minecraft:overworld",
                    config: 'ambient-light: 0.1\nsky-color: "#7dabff"\n',
                    storage: "file",
                    sorting: 0,
                    enabled: true,
                },
            ],
            storages: [],
            render: { threads: null, force: false, fixEdges: false, metrics: false, outputFolder: null },
            core: null,
            webapp: null,
            webserver: null,
            plugin: null,
            fromWizard: false,
        },
        null,
        4,
    )}\n`;
}

function report(isPrivate: boolean, canWrite = true): RepositoryReport {
    return {
        owner: OWNER,
        repo: REPO,
        fullName: `${OWNER}/${REPO}`,
        private: isPrivate,
        canWrite,
        htmlUrl: `https://github.test/${OWNER}/${REPO}`,
        warning: isPrivate
            ? { level: "note", message: "This repository is private, so the backup will not be public." }
            : {
                  level: "warning",
                  message:
                      "This repository is PUBLIC. Everything uploaded to it can be downloaded by anybody.",
              },
    };
}

/**
 * The backup surface, which is now only asked to *word* the public-repository warning.
 *
 * The upload no longer goes through it: it goes through whichever transport the sync chose,
 * so "did anything get uploaded?" is asserted against the fake that would have had to serve
 * the release creation and the asset PUT. That is a stronger assertion than the old one -
 * it fails if a world is published by any route, not only by the one this stub stood in for.
 */
function fakeBackup(isPrivate: boolean, canWrite = true): BackupSurface {
    return { inspectRepository: () => Promise.resolve(report(isPrivate, canWrite)) };
}

/**
 * True when nothing was published: no release created and no asset put anywhere.
 *
 * Writes only. *Reading* a release is what the unchanged-world check does on every sync and
 * is not an upload, so counting every mention of `/releases` would make this assertion pass
 * or fail for the wrong reason.
 */
function nothingUploaded(github: RecordingGitHub): boolean {
    return github.countOf(/\/releases$/, "POST") === 0 && github.countOf("/assets?name=", "POST") === 0;
}

/**
 * The routes an upload needs: create the release, then accept each asset.
 *
 * The upload host is a second base URL, which is why `uploadsBase` is set alongside
 * `apiBase` - an upload that quietly went to the real `uploads.github.com` would be a test
 * that touches the network.
 */
function uploadRoutes(github: RecordingGitHub, tag = RELEASE_TAG): RecordingGitHub {
    return github
        .on("POST", /\/repos\/o\/r\/releases$/, {
            status: 201,
            json: {
                id: 5,
                tag_name: tag,
                name: tag,
                html_url: `https://github.test/release/${tag}`,
                upload_url: "",
                created_at: "2026-08-04T10:00:00Z",
                assets: [],
            },
        })
        .on("POST", "/assets?name=", {
            status: 201,
            json: { id: 11, name: "asset", size: 1, state: "uploaded", browser_download_url: "" },
        });
}

function makeSync(options: {
    github: RecordingGitHub;
    backup: BackupSurface;
    mounts?: LocalMapHandler;
    eulaAccepted?: boolean;
    events?: CiSyncEvent[];
}): CiRenderSync {
    return new CiRenderSync({
        storageDir: () => join(workDir, "maps"),
        token: () => TOKEN,
        runner: noGh(),
        eulaAccepted: () => options.eulaAccepted ?? true,
        backup: options.backup,
        fetch: options.github.fetch,
        apiBase: API,
        uploadsBase: UPLOADS,
        ...(options.mounts === undefined ? {} : { mounts: options.mounts }),
        ...(options.events === undefined ? {} : { onEvent: (event) => options.events?.push(event) }),
        now: () => NOW,
        sleep: () => Promise.resolve(),
        pollIntervalMs: 0,
        runLookupAttempts: 2,
    });
}

function request(extra: Partial<CiSyncRequest> = {}): CiSyncRequest {
    return {
        worldFolder: world,
        owner: OWNER,
        repo: REPO,
        mapId: MAP_ID,
        acknowledgeUpload: true,
        acknowledgePublic: true,
        ...extra,
    };
}

/** Routes every test needs: the repository (for the ref) and the dispatch itself. */
function baseRoutes(github: RecordingGitHub, isPrivate = true): RecordingGitHub {
    return github
        .on("POST", "/dispatches", { status: 204 })
        // The capability probe: the cheapest call that proves a credential can see Actions
        // on this repository, and what decides which of the two routes drives the sync.
        .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
            status: 200,
            json: { id: 1, name: "Render world", state: "active", path: ".github/workflows/render-world.yml" },
        })
        .on("GET", /\/repos\/o\/r$/, { status: 200, json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate }) });
}

/** Writes the record a previous successful upload would have left. */
async function seedUploadedState(options: { runId?: number } = {}): Promise<string> {
    const syncId = syncIdFor(OWNER, REPO, world, MAP_ID);
    const workspace = ciSyncWorkspace(join(workDir, "maps"), syncId);
    const fingerprint = await fingerprintWorld(world);
    await writeCiSyncState(workspace.stateFile, {
        ...newCiSyncState({
            syncId,
            owner: OWNER,
            repo: REPO,
            worldFolder: world,
            mapId: MAP_ID,
            mapName: "World",
            dimension: "minecraft:overworld",
            at: "2026-08-03T09:00:00Z",
        }),
        fingerprint: fingerprint.digest,
        releaseTag: RELEASE_TAG,
        assetName: ASSET_NAME,
        archiveBytes: 1024,
        archiveSha256: "a".repeat(64),
        stage: options.runId === undefined ? "uploaded" : "dispatched",
        runId: options.runId ?? null,
        runNumber: options.runId ?? null,
        runUrl: options.runId === undefined ? null : `https://github.test/runs/${String(options.runId)}`,
    });
    return syncId;
}

/** The release the seeded record points at, still holding its asset. */
function releaseRoute(github: RecordingGitHub): RecordingGitHub {
    return github.on("GET", `/releases/tags/${RELEASE_TAG}`, {
        status: 200,
        json: {
            id: 5,
            tag_name: RELEASE_TAG,
            name: RELEASE_TAG,
            html_url: "https://github.test/release",
            upload_url: "",
            created_at: "2026-08-03T09:00:00Z",
            assets: [{ id: 1, name: ASSET_NAME, size: 1024, state: "uploaded", browser_download_url: "" }],
        },
    });
}

/* -------------------------------------------------------------------------- */

describe("what leaves this computer is said first", () => {
    it("reports the PUBLIC warning through preflight, in the backup surface's own words", async () => {
        const github = baseRoutes(new RecordingGitHub(), false);
        const backup = fakeBackup(false);
        const sync = makeSync({ github, backup });

        const result = await sync.preflight(request());

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.preflight.repository?.private).toBe(false);
        expect(result.preflight.repository?.warning?.level).toBe("warning");
        expect(result.preflight.repository?.warning?.message).toContain("PUBLIC");
        // Reading a repository is not starting anything.
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a public repository that was never acknowledged, before anything is packed", async () => {
        const github = baseRoutes(new RecordingGitHub(), false);
        const backup = fakeBackup(false);
        const sync = makeSync({ github, backup });

        const result = await sync.sync(request({ acknowledgePublic: false }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("public-not-acknowledged");
        expect(result.failure.message).toContain("PUBLIC");
        expect(nothingUploaded(github)).toBe(true);
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses to upload a world nobody agreed to send", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const backup = fakeBackup(true);
        const sync = makeSync({ github, backup });

        const result = await sync.sync(request({ acknowledgeUpload: false }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("upload-not-acknowledged");
        expect(result.failure.message).toContain("upload the whole world");
        expect(nothingUploaded(github)).toBe(true);
    });

    it("never accepts Mojang's licence on somebody's behalf", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const backup = fakeBackup(true);
        const sync = makeSync({ github, backup, eulaAccepted: false });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("eula-not-accepted");
        expect(result.failure.needsEula).toBe(true);
        expect(result.failure.message).toContain("Settings");
        expect(nothingUploaded(github)).toBe(true);
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a repository the account cannot write to", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const backup = fakeBackup(true, false);
        const sync = makeSync({ github, backup });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("read-only");
        expect(nothingUploaded(github)).toBe(true);
    });
});

describe("an unchanged world is not uploaded again", () => {
    it("skips the upload when the fingerprint matches and the release still holds the asset", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Measure and plan", status: "in_progress" })] },
            });
        await seedUploadedState();
        const backup = fakeBackup(true);
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, backup, events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        // The whole point: nothing was packed and nothing was uploaded.
        expect(nothingUploaded(github)).toBe(true);
        expect(github.countOf("/dispatches", "POST")).toBe(1);
        const said = events.filter((event) => event.type === "log").map((event) => event.message);
        expect(said.join(" ")).toContain("has not changed");
    });

    it("uploads again when the release the record points at is gone", async () => {
        const github = uploadRoutes(baseRoutes(new RecordingGitHub()))
            // GitHub answers 404 for a release that was deleted, which is exactly what a
            // record pointing at nothing looks like from here.
            .on("GET", `/releases/tags/${RELEASE_TAG}`, { status: 404, json: { message: "Not Found" } })
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(github.countOf(/\/repos\/o\/r\/releases$/, "POST")).toBe(1);
    });

    it("uploads again when the world has actually changed", async () => {
        const github = uploadRoutes(releaseRoute(baseRoutes(new RecordingGitHub())))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(github.countOf(/\/repos\/o\/r\/releases$/, "POST")).toBe(1);
        // The archive, the sidecar and the pointer. The pointer goes last, because it is
        // what marks the release as a finished upload.
        const assets = github.calls
            .filter((call) => call.method === "POST" && call.url.includes("/assets?name="))
            .map((call) => decodeURIComponent(call.url.split("name=")[1] ?? ""));
        expect(assets).toHaveLength(3);
        expect(assets[1]).toBe("backup.json");
        expect(assets[2]).toContain(".cheaplfs");
    });

    it("reports through preflight whether an upload would happen at all", async () => {
        const github = baseRoutes(new RecordingGitHub());
        await seedUploadedState();
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const before = await sync.preflight(request());
        expect(before.ok && before.preflight.worldChanged).toBe(false);
        expect(before.ok && before.preflight.uploadNeeded).toBe(false);

        await writeFile(join(world, "region", "r.9.9.mca"), "changed");
        const after = await sync.preflight(request());
        expect(after.ok && after.preflight.worldChanged).toBe(true);
        expect(after.ok && after.preflight.uploadNeeded).toBe(true);
    });
});

describe("the live events carry the route and the upload's own item counts", () => {
    it("tags every phase with the credential actually driving it", async () => {
        const github = uploadRoutes(releaseRoute(baseRoutes(new RecordingGitHub())))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, backup: fakeBackup(true), events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        const phases = events.filter(
            (event): event is Extract<CiSyncEvent, { type: "phase" }> => event.type === "phase",
        );
        // Every phase this sync reaches - checking, uploading, dispatching, waiting - is
        // tagged, not only the ones after the upload finishes.
        expect(phases.length).toBeGreaterThan(1);
        expect(phases.every((event) => event.route === "session")).toBe(true);
    });

    it("forwards the upload's own count of its pieces, not just the bytes moved", async () => {
        const github = uploadRoutes(releaseRoute(baseRoutes(new RecordingGitHub())))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, backup: fakeBackup(true), events });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        const progress = events.filter(
            (event): event is Extract<CiSyncEvent, { type: "progress" }> => event.type === "progress",
        );
        expect(progress.length).toBeGreaterThan(0);
        // Uploading the archive, the sidecar and the pointer is three pieces, and the count
        // this reports is `upload.ts`'s own - never re-derived from the byte totals, which
        // would say nothing about a part skipped because it was already on the release.
        expect(progress.some((event) => event.assetsTotal >= 3)).toBe(true);
        expect(progress.every((event) => event.assetsDone <= event.assetsTotal)).toBe(true);
        // The asset actually being moved is named, not left implicit in the description.
        expect(progress.some((event) => event.asset !== null)).toBe(true);
    });
});

describe("a run that is still going is reported as still going", () => {
    it("says which wave a job belongs to, read from its own name", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({ id: 41, name: "Build the BlueMap CLI", status: "completed", conclusion: "success" }),
                        jobJson({ id: 42, name: "Wave 1 shard 0", status: "in_progress" }),
                        // GitHub prefixes a job from a called reusable workflow with the
                        // calling job's own name, which is also `Wave <n>` here.
                        jobJson({ id: 43, name: "Wave 1 / Wave 1 shard 1", status: "queued" }),
                        jobJson({ id: 44, name: "Wave 2 shard 0", status: "queued" }),
                        jobJson({ id: 45, name: "Merge group 0", status: "queued" }),
                    ],
                },
            });
        await seedUploadedState();
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "running") throw new Error("expected a running outcome");
        // A job with no wave in its own name is null, never a guessed 0.
        expect(result.run?.jobs.map((job) => job.wave)).toEqual([null, 1, 1, 2, null]);
    });

    it("answers with the real per-job states and no conclusion", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "in_progress" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({ id: 41, name: "Build the BlueMap CLI", status: "completed", conclusion: "success" }),
                        jobJson({ id: 42, name: "Measure and plan", status: "in_progress" }),
                        jobJson({ id: 43, name: "Wave 1", status: "queued" }),
                    ],
                },
            });
        await seedUploadedState();
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, backup: fakeBackup(true), mounts });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "running") throw new Error("expected a running outcome");
        expect(result.run?.status).toBe("in_progress");
        expect(result.run?.conclusion).toBeNull();
        expect(result.run?.jobs.map((job) => `${job.name}:${job.status}`)).toEqual([
            "Build the BlueMap CLI:completed",
            "Measure and plan:in_progress",
            "Wave 1:queued",
        ]);
        // Nothing has finished, so nothing was fetched and nothing was registered.
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
    });

    it("polls until the run completes when it is asked to follow", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on(
                "GET",
                /\/actions\/runs\/7$/,
                { status: 200, json: runJson({ id: 7, status: "queued" }) },
                { status: 200, json: runJson({ id: 7, status: "in_progress" }) },
                { status: 200, json: runJson({ id: 7, status: "completed", conclusion: "failure" }) },
            )
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Wave 1", status: "completed", conclusion: "failure" })] },
            })
            .on("GET", "/actions/jobs/42/logs", { status: 200, text: "boom\n" });
        await seedUploadedState();
        const events: CiSyncEvent[] = [];
        const sync = makeSync({ github, backup: fakeBackup(true), events });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        // Three reads: queued, in progress, completed. Each one pushed to the interface.
        expect(events.filter((event) => event.type === "run")).toHaveLength(3);
    });

    it("check() polls a recorded run without downloading or registering anything", async () => {
        const github = baseRoutes(new RecordingGitHub())
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "in_progress" }) })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Wave 1", status: "in_progress" })] },
            });
        const syncId = await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, backup: fakeBackup(true), mounts });

        const result = await sync.check(syncId);

        expect(result.ok && result.outcome === "running").toBe(true);
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
    });
});

describe("a failed run registers nothing", () => {
    it("names the failing job, carries its log, and mounts no map", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({ id: 41, name: "Build the BlueMap CLI", status: "completed", conclusion: "success" }),
                        jobJson({ id: 42, name: "Merge group 0", status: "completed", conclusion: "failure" }),
                        jobJson({ id: 43, name: "Wave 2", status: "completed", conclusion: "cancelled" }),
                    ],
                },
            })
            .on("GET", "/actions/jobs/42/logs", {
                status: 200,
                text: "Merging shards\n::error::these shards did not finish and were not merged: 3\n",
            });
        const syncId = await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, backup: fakeBackup(true), mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("run-failure");
        expect(result.failure.failingJob).toBe("Merge group 0");
        expect(result.failure.logExcerpt).toContain("did not finish");
        expect(result.failure.run?.conclusion).toBe("failure");
        // The three things a failed run must never produce.
        expect(github.never("/artifacts")).toBe(true);
        expect(mounts.getMounts()).toHaveLength(0);
        expect((await readCiSyncState(ciSyncWorkspace(join(workDir, "maps"), syncId).stateFile))?.renderId).toBeNull();
    });

    it("prefers the job that failed over a sibling the failure cancelled", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "failure" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: {
                    jobs: [
                        jobJson({ id: 40, name: "Wave 1", status: "completed", conclusion: "cancelled" }),
                        jobJson({ id: 42, name: "Wave 3", status: "completed", conclusion: "failure" }),
                    ],
                },
            })
            .on("GET", "/actions/jobs/42/logs", { status: 200, text: "the real problem\n" });
        await seedUploadedState({ runId: 7 });
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request());
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.failingJob).toBe("Wave 3");
    });

    it("still reports the failure when the log cannot be read", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "timed_out" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Wave 1", status: "completed", conclusion: "timed_out" })] },
            })
            .on("GET", "/actions/jobs/42/logs", { status: 410, json: { message: "gone" } });
        await seedUploadedState({ runId: 7 });
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("run-timed_out");
        expect(result.failure.logExcerpt).toBeNull();
        expect(result.failure.message).toContain("timed_out");
    });
});

describe("a successful run comes back as a map in the list", () => {
    it("downloads the artifact, verifies it against GitHub's digest, and mounts it", async () => {
        const site = join(workDir, "site");
        await mkdir(join(site, "maps", MAP_ID, "tiles"), { recursive: true });
        await writeFile(join(site, "settings.json"), '{"maps":["world"]}', "utf8");
        await writeFile(join(site, "maps", MAP_ID, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", MAP_ID, "tiles", "0.prbm"), "tile", "utf8");
        const archive = join(workDir, "rendered-map.zip");
        const packed = await packFolder(site, archive);
        const bytes = new Uint8Array(await readFile(archive));

        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", {
                status: 200,
                json: { jobs: [jobJson({ id: 42, name: "Merge group 0", status: "completed", conclusion: "success" })] },
            })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({
                            id: 9,
                            name: "rendered-map",
                            bytes: bytes.byteLength,
                            digest: `sha256:${packed.sha256}`,
                        }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes });

        const syncId = await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, backup: fakeBackup(true), mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "rendered") throw new Error("expected a rendered outcome");
        expect(result.summary.uploaded).toBe(false);
        expect(result.summary.verified).toBe(true);
        expect(result.summary.dataRoot).toBe(`/local/ci-${syncId}`);
        expect(mounts.getMounts()).toHaveLength(1);
        expect(mounts.getMount(`ci-${syncId}`)?.engineLabel).toContain("GitHub Actions");

        // A `render.json` beside the map is what puts it in the list of renders.
        const record = JSON.parse(
            await readFile(join(workDir, "maps", `ci-${syncId}`, "render.json"), "utf8"),
        ) as { outcome: string; maps: { id: string }[]; engineVersion: string };
        expect(record.outcome).toBe("finished");
        expect(record.maps[0]?.id).toBe(MAP_ID);
        // The commit, so "which renderer made these tiles" has a checkable answer.
        expect(record.engineVersion).toContain("abcdef012345");
    });

    it("refuses an artifact whose bytes do not match the digest GitHub published", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({ id: 9, name: "rendered-map", bytes: 4, digest: `sha256:${"b".repeat(64)}` }),
                    ],
                },
            })
            .on("GET", "/artifacts/9/zip", { status: 200, bytes: new Uint8Array([1, 2, 3, 4]) });
        await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, backup: fakeBackup(true), mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("digest-mismatch");
        expect(mounts.getMounts()).toHaveLength(0);
    });

    it("refuses a map that shipped in parts rather than half-unpacking it", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", /\/actions\/runs\/7$/, {
                status: 200,
                json: runJson({ id: 7, status: "completed", conclusion: "success" }),
            })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } })
            .on("GET", "/actions/runs/7/artifacts", {
                status: 200,
                json: {
                    artifacts: [
                        artifactJson({ id: 9, name: "map-lowres", bytes: 10 }),
                        artifactJson({ id: 10, name: "partial-hires-0", bytes: 10 }),
                        artifactJson({ id: 11, name: "partial-hires-1", bytes: 10 }),
                    ],
                },
            });
        await seedUploadedState({ runId: 7 });
        const mounts = new LocalMapHandler();
        const sync = makeSync({ github, backup: fakeBackup(true), mounts });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("map-shipped-in-parts");
        expect(result.failure.message).toContain("partial-hires-0");
        expect(mounts.getMounts()).toHaveLength(0);
        expect(github.never("/zip")).toBe(true);
    });
});

describe("refusals are values, and none of them is a stack", () => {
    it("says so when nobody is signed in, rather than calling GitHub with no token", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => null,
            runner: noGh(),
            eulaAccepted: () => true,
            backup: fakeBackup(true),
            fetch: github.fetch,
            apiBase: API,
        });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        // Neither credential can drive it, and the message names both.
        expect(result.failure.code).toBe("no-route");
        expect(result.failure.needsSignIn).toBe(true);
        expect(result.failure.message).toContain("gh");
        expect(github.calls).toHaveLength(0);
    });

    it("refuses a project whose map renders a dimension the workflow does not offer", async () => {
        await writeFile(
            join(world, "material-bluemap.project.json"),
            projectFile().replace("minecraft:overworld", "mystcraft:age_12"),
            "utf8",
        );
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unsupported-dimension");
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a world with no project file, and says where one comes from", async () => {
        await rm(join(world, "material-bluemap.project.json"));
        const github = baseRoutes(new RecordingGitHub());
        const sync = makeSync({ github, backup: fakeBackup(true) });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-project");
        expect(result.failure.message).toContain("wizard");
    });

    it("does not follow a second run for the same world and map at once", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on(
                "GET",
                /\/actions\/runs\/7$/,
                { status: 200, json: runJson({ id: 7, status: "in_progress" }) },
                { status: 200, json: runJson({ id: 7, status: "completed", conclusion: "failure" }) },
            )
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState({ runId: 7 });

        // A sleep the test holds open, so the first sync is provably still inside its
        // follow loop when the second one asks. A timing-based wait here would be a test
        // that passes on a fast machine and fails on a loaded runner.
        let release = (): void => {};
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const events: CiSyncEvent[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => TOKEN,
            runner: noGh(),
            eulaAccepted: () => true,
            backup: fakeBackup(true),
            fetch: github.fetch,
            apiBase: API,
            onEvent: (event) => events.push(event),
            now: () => NOW,
            sleep: () => held,
        });

        const first = sync.sync(request());
        await waitFor(() => events.some((event) => event.type === "run"));
        const second = await sync.sync(request({ follow: false }));
        release();
        await first;

        expect(second.ok).toBe(false);
        if (second.ok) return;
        expect(second.failure.code).toBe("already-running");
        expect(sync.activeSyncIds()).toHaveLength(0);
    });
});

describe("the gh command-line tool is a real fallback, not an error message", () => {
    /** One release as the fake `gh` remembers it, so a resumed upload has something to read. */
    interface FakeRelease {
        readonly id: number;
        readonly tag: string;
        readonly assets: Map<string, { name: string; size: number; state: string }>;
    }

    interface ReadyGh extends ProcessRunner {
        readonly calls: string[][];
        /** The releases this `gh` has been asked to create, and what is on them. */
        readonly releases: Map<string, FakeRelease>;
        /** Every `gh release upload` it was asked to perform, in order. */
        uploaded(): string[];
    }

    /**
     * A `gh` that is signed in and answers every endpoint the loop asks for.
     *
     * It keeps **state** rather than replaying canned answers, because the properties worth
     * testing here are stateful: that a release created by `gh release create` is then
     * readable by `gh api`, that an asset put there by `gh release upload` is skipped by a
     * resumed upload, and that a part recorded at the wrong size is sent again. A stub that
     * answered the same thing every time could not tell any of those apart.
     *
     * `runToFile` copies a real zip into place, because the collector unpacks what it
     * downloads and checks a `maps/<id>` folder came out of it - a stub that wrote nothing
     * would pass a download that produced no map.
     */
    function readyGh(options: {
        json: Readonly<Record<string, unknown>>;
        artifact?: string;
        releases?: Map<string, FakeRelease>;
    }): ReadyGh {
        const calls: string[][] = [];
        const releases = options.releases ?? new Map<string, FakeRelease>();
        let nextId = 100;

        const answerFor = (args: readonly string[]): string | null => {
            const key = Object.keys(options.json)
                .sort((left, right) => right.length - left.length)
                .find((candidate) => args.some((arg) => arg.includes(candidate)));
            return key === undefined ? null : JSON.stringify(options.json[key]);
        };

        const releaseJson = (release: FakeRelease): string =>
            JSON.stringify({
                id: release.id,
                tag_name: release.tag,
                html_url: `https://github.test/release/${release.tag}`,
                assets: [...release.assets.values()],
            });

        const ok = (stdout = ""): Promise<{ started: true; code: 0; stdout: string; stderr: string }> =>
            Promise.resolve({ started: true, code: 0, stdout, stderr: "" });
        const notFound = (): Promise<{ started: true; code: 1; stdout: string; stderr: string }> =>
            Promise.resolve({ started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" });

        return {
            calls,
            releases,
            uploaded: () =>
                calls
                    .filter((args) => args[0] === "release" && args[1] === "upload")
                    .map((args) => basename(args[3] ?? "")),

            async run(_command, args, runOptions) {
                calls.push([...args]);
                if (args.includes("--version")) return await ok("gh version 2.62.0\n");
                if (args.includes("status")) return await ok("✓ Logged in to github.com account octocat\n");

                if (args[0] === "release" && args[1] === "create") {
                    const tag = args[2] as string;
                    if (releases.has(tag)) {
                        return { started: true, code: 1, stdout: "", stderr: "a release with the same tag name already exists\n" };
                    }
                    releases.set(tag, { id: (nextId += 1), tag, assets: new Map() });
                    return await ok(`https://github.test/release/${tag}\n`);
                }
                if (args[0] === "release" && args[1] === "upload") {
                    const release = releases.get(args[2] as string);
                    if (release === undefined) return await notFound();
                    const file = args[3] as string;
                    // The asset lands under the file's own basename, exactly as the real
                    // `gh release upload` does - which is the constraint the uploader has to
                    // stage its files to satisfy.
                    const name = basename(file);
                    release.assets.set(name, { name, size: (await stat(file)).size, state: "uploaded" });
                    return await ok();
                }

                const tagRead = args.find((arg) => arg.includes("releases/tags/"));
                if (tagRead !== undefined) {
                    const release = releases.get(tagRead.slice(tagRead.indexOf("releases/tags/") + 14));
                    return release === undefined ? await notFound() : await ok(releaseJson(release));
                }

                if (runOptions?.input !== undefined) return await ok();
                const body = answerFor(args);
                return body === null ? await notFound() : await ok(body);
            },

            async runToFile(_command, args, destination) {
                calls.push([...args]);
                if (options.artifact === undefined) {
                    return { started: true, code: 1, bytes: 0, stderr: "gh: Not Found (HTTP 404)\n" };
                }
                const bytes = await readFile(options.artifact);
                await mkdir(dirname(destination), { recursive: true });
                await writeFile(destination, bytes);
                return { started: true, code: 0, bytes: bytes.byteLength, stderr: "" };
            },
        };
    }

    /**
     * The backup surface as a machine with no in-app sign-in actually has it.
     *
     * It refuses, because reading a repository over REST needs the token nobody has here.
     * That is what forces the public/private answer to come from the `gh` route, which is
     * the thing that has to keep working now that route can publish a world.
     */
    function signedOutBackup(): BackupSurface {
        return {
            inspectRepository: () =>
                Promise.reject(new Error("Nobody is signed in to GitHub on this computer.")),
        };
    }

    function ghSync(options: {
        runner: ProcessRunner;
        github: RecordingGitHub;
        mounts?: LocalMapHandler;
        backup?: BackupSurface;
    }): CiRenderSync {
        return new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => null,
            runner: options.runner,
            eulaAccepted: () => true,
            backup: options.backup ?? signedOutBackup(),
            fetch: options.github.fetch,
            apiBase: API,
            uploadsBase: UPLOADS,
            ...(options.mounts === undefined ? {} : { mounts: options.mounts }),
            now: () => NOW,
            sleep: () => Promise.resolve(),
        });
    }

    /**
     * Everything the loop reads up to the dispatch, with the run still queued.
     *
     * Queued on purpose: these tests are about the **upload** reaching GitHub over `gh`, so
     * they stop at `follow: false` rather than going on to download a map. Collecting one is
     * already covered by the test above.
     */
    function loopJson(): Record<string, unknown> {
        return {
            "actions/workflows/render-world.yml/runs": {
                workflow_runs: [runJson({ id: 7, status: "queued" })],
            },
            "actions/workflows/render-world.yml": { id: 1, name: "Render world", state: "active", path: "x" },
            "actions/runs/7/jobs": { jobs: [] },
            "actions/runs/7": runJson({ id: 7, status: "queued" }),
            "repos/o/r": repositoryJson({ owner: OWNER, repo: REPO, isPrivate: true }),
        };
    }

    it("drives the whole loop on gh alone, with no in-app sign-in at all", async () => {
        const site = join(workDir, "gh-site");
        await mkdir(join(site, "maps", MAP_ID), { recursive: true });
        await writeFile(join(site, "settings.json"), "{}", "utf8");
        await writeFile(join(site, "maps", MAP_ID, "settings.json"), "{}", "utf8");
        const archive = join(workDir, "gh-map.zip");
        await packFolder(site, archive);

        const runner = readyGh({
            artifact: archive,
            json: {
                "actions/workflows/render-world.yml/runs": {
                    workflow_runs: [runJson({ id: 7, status: "completed", conclusion: "success" })],
                },
                "actions/workflows/render-world.yml": {
                    id: 1,
                    name: "Render world",
                    state: "active",
                    path: "x",
                },
                "actions/runs/7/artifacts": {
                    artifacts: [artifactJson({ id: 9, name: "rendered-map", bytes: 0 })],
                },
                "actions/runs/7/jobs": {
                    jobs: [jobJson({ id: 42, name: "Merge group 0", status: "completed", conclusion: "success" })],
                },
                "actions/runs/7": runJson({ id: 7, status: "completed", conclusion: "success" }),
                [`releases/tags/${RELEASE_TAG}`]: {
                    assets: [{ name: ASSET_NAME, state: "uploaded" }],
                },
                "repos/o/r": repositoryJson({ owner: OWNER, repo: REPO, isPrivate: true }),
            },
        });

        // Nothing is signed in to the application, and the API fake would refuse
        // everything - so a single call through it would fail this test.
        const github = new RecordingGitHub();
        await seedUploadedState({ runId: 7 });
        // This one keeps the working backup surface so it stays a test about the render
        // loop; the upload's own route is exercised below.
        runner.releases.set(RELEASE_TAG, {
            id: 5,
            tag: RELEASE_TAG,
            assets: new Map([[ASSET_NAME, { name: ASSET_NAME, size: 1024, state: "uploaded" }]]),
        });
        const mounts = new LocalMapHandler();
        const sync = ghSync({ runner, github, mounts, backup: fakeBackup(true) });

        const result = await sync.sync(request());

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "rendered") throw new Error("expected a rendered outcome");
        expect(result.summary.route).toBe("gh");
        expect(mounts.getMounts()).toHaveLength(1);
        // Every operation went down one route. A mixture would have reached the API fake.
        expect(github.calls).toHaveLength(0);
        expect(runner.calls.some((args) => args.some((arg) => arg.includes("/zip")))).toBe(true);
    });

    it("publishes a world on gh alone, with no in-app sign-in and no call to the API", async () => {
        const runner = readyGh({ json: loopJson() });
        // The API fake answers nothing. A single call through it - to create the release,
        // to read the repository, to put an asset - would fail this test, which is the
        // point: one route drives the whole sync, upload included.
        const github = new RecordingGitHub();
        const events: CiSyncEvent[] = [];
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => null,
            runner,
            eulaAccepted: () => true,
            backup: signedOutBackup(),
            fetch: github.fetch,
            apiBase: API,
            uploadsBase: UPLOADS,
            onEvent: (event) => events.push(event),
            now: () => NOW,
            sleep: () => Promise.resolve(),
        });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(github.calls).toHaveLength(0);

        // One release, and the three assets in the order that makes the pointer a
        // completion marker: the world, then the sidecar, then the pointer.
        expect(runner.releases.size).toBe(1);
        const uploaded = runner.uploaded();
        expect(uploaded).toHaveLength(3);
        expect(uploaded[0]).toMatch(/\.zip$/);
        expect(uploaded[1]).toBe("backup.json");
        expect(uploaded[2]).toMatch(/\.cheaplfs$/);
        // `--clobber` is what lets a truncated part be replaced on a later attempt.
        expect(
            runner.calls.filter((args) => args[1] === "upload").every((args) => args.includes("--clobber")),
        ).toBe(true);

        // And the world really did reach the workflow: the dispatch names the release the
        // upload just made, not a tag from a record.
        const state = await sync.readState(result.syncId);
        expect(state?.releaseTag).toBe([...runner.releases.keys()][0]);
        expect(state?.pendingReleaseTag).toBeNull();
        expect(events.some((event) => event.type === "progress")).toBe(true);
    });

    it("resumes onto the release it was already using, and re-sends only what is short", async () => {
        const runner = readyGh({ json: loopJson() });
        const github = new RecordingGitHub();
        const first = await ghSync({ runner, github }).sync(request({ follow: false }));
        expect(first.ok).toBe(true);

        const tag = [...runner.releases.keys()][0] as string;
        const release = runner.releases.get(tag) as FakeRelease;
        const archive = runner.uploaded()[0] as string;
        const workspace = ciSyncWorkspace(join(workDir, "maps"), first.syncId);

        /*
         * The record an interrupted upload leaves: the release it was using, and nothing
         * claiming the world was ever finished. Written by hand because the only way to
         * produce it otherwise is to kill the process mid-upload.
         */
        const interrupted = await readCiSyncState(workspace.stateFile);
        await writeCiSyncState(workspace.stateFile, {
            ...(interrupted as NonNullable<typeof interrupted>),
            fingerprint: null,
            releaseTag: null,
            assetName: null,
            runId: null,
            pendingReleaseTag: tag,
            pendingAssetName: archive,
        });

        // The archive is intact on the release; the sidecar was left half-sent, which is
        // exactly what a dropped connection produces and what a name-only check would miss.
        release.assets.set("backup.json", { name: "backup.json", size: 3, state: "uploaded" });
        runner.calls.length = 0;

        const events: CiSyncEvent[] = [];
        const resumed = await new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => null,
            runner,
            eulaAccepted: () => true,
            backup: signedOutBackup(),
            fetch: github.fetch,
            apiBase: API,
            uploadsBase: UPLOADS,
            onEvent: (event) => events.push(event),
            now: () => NOW,
            sleep: () => Promise.resolve(),
        }).sync(request({ follow: false }));

        expect(resumed.ok).toBe(true);
        // No second release: it carried on with the one it had.
        expect(runner.releases.size).toBe(1);
        expect(runner.calls.some((args) => args[1] === "create")).toBe(false);
        // The multi-gigabyte archive was skipped on a name-and-size match; the truncated
        // sidecar was sent again rather than trusted.
        const again = runner.uploaded();
        expect(again).not.toContain(archive);
        expect(again).toContain("backup.json");
        const said = events.filter((event) => event.type === "log").map((event) => event.message);
        expect(said.join(" ")).toContain("already on the release at the right size");
        expect(said.join(" ")).toContain("did not finish sending it");
        expect(github.calls).toHaveLength(0);
    });

    it("reads the repository over gh when this application cannot, and still warns about PUBLIC", async () => {
        const runner = readyGh({
            json: { ...loopJson(), "repos/o/r": repositoryJson({ owner: OWNER, repo: REPO, isPrivate: false }) },
        });
        const github = new RecordingGitHub();
        const sync = ghSync({ runner, github });

        const refused = await sync.sync(request({ acknowledgePublic: false }));

        expect(refused.ok).toBe(false);
        if (refused.ok) return;
        // The world is not published unwarned just because the fuller wording lives behind
        // a sign-in this machine does not have.
        expect(refused.failure.code).toBe("public-not-acknowledged");
        expect(refused.failure.message).toContain("PUBLIC");
        expect(runner.releases.size).toBe(0);

        const seen = await sync.preflight(request());
        expect(seen.ok && seen.preflight.repository?.private).toBe(false);
        // ...and the interface is told the wording came from the fallback rather than from
        // the backup surface, so it can say which sign-in is missing.
        expect(seen.ok && seen.preflight.repositoryFailure).toContain("Nobody is signed in");
    });

    it("refuses when neither credential can even read the repository, and names both remedies", async () => {
        const runner = readyGh({
            json: { "actions/workflows/render-world.yml": { id: 1, name: "Render world", state: "active", path: "x" } },
        });
        const github = new RecordingGitHub();

        const result = await ghSync({ runner, github }).sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("repository-unreadable");
        expect(result.failure.route).toBe("gh");
        expect(result.failure.message).toContain("Settings");
        expect(result.failure.message).toContain("gh auth login");
        expect(runner.releases.size).toBe(0);
        expect(runner.calls.every((args) => !args.some((arg) => arg.includes("/dispatches")))).toBe(true);
    });
});

/** Waits for a condition to hold, polling the macrotask queue. Bounded, so a wrong
 * expectation fails the test rather than hanging the suite for its whole timeout. */
async function waitFor(condition: () => boolean, attempts = 200): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("the condition never became true");
}

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
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { packFolder } from "../backup/archive.js";
import type { BackupRequest, BackupResult, RepositoryReport } from "../backup/index.js";
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

interface FakeBackup {
    readonly surface: BackupSurface;
    readonly requests: BackupRequest[];
}

function fakeBackup(isPrivate: boolean, result?: BackupResult, canWrite = true): FakeBackup {
    const requests: BackupRequest[] = [];
    const success: BackupResult = {
        ok: true,
        backupId: "backup-1",
        durationMs: 1000,
        summary: {
            backupId: "backup-1",
            repository: `${OWNER}/${REPO}`,
            tag: RELEASE_TAG,
            releaseUrl: `https://github.test/${OWNER}/${REPO}/releases/tag/${RELEASE_TAG}`,
            archive: ASSET_NAME,
            bytes: 1024,
            sha256: "a".repeat(64),
            parts: 1,
            kind: "world",
            label: "overworld",
        },
    };
    return {
        requests,
        surface: {
            inspectRepository: () => Promise.resolve(report(isPrivate, canWrite)),
            backup: (request) => {
                requests.push(request);
                return Promise.resolve(result ?? success);
            },
            cancel: () => false,
        },
    };
}

function makeSync(options: {
    github: RecordingGitHub;
    backup: FakeBackup;
    mounts?: LocalMapHandler;
    eulaAccepted?: boolean;
    events?: CiSyncEvent[];
}): CiRenderSync {
    return new CiRenderSync({
        storageDir: () => join(workDir, "maps"),
        token: () => TOKEN,
        runner: noGh(),
        eulaAccepted: () => options.eulaAccepted ?? true,
        backup: options.backup.surface,
        fetch: options.github.fetch,
        apiBase: API,
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
        expect(backup.requests).toHaveLength(0);
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
        expect(backup.requests).toHaveLength(0);
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
        expect(backup.requests).toHaveLength(0);
        expect(github.never("/dispatches")).toBe(true);
    });

    it("refuses a repository the account cannot write to", async () => {
        const github = baseRoutes(new RecordingGitHub());
        const backup = fakeBackup(true, undefined, false);
        const sync = makeSync({ github, backup });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("read-only");
        expect(backup.requests).toHaveLength(0);
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
        expect(backup.requests).toHaveLength(0);
        expect(github.countOf("/dispatches", "POST")).toBe(1);
        const said = events.filter((event) => event.type === "log").map((event) => event.message);
        expect(said.join(" ")).toContain("has not changed");
    });

    it("uploads again when the release the record points at is gone", async () => {
        const github = baseRoutes(new RecordingGitHub())
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
        const backup = fakeBackup(true);
        const sync = makeSync({ github, backup });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(backup.requests).toHaveLength(1);
    });

    it("uploads again when the world has actually changed", async () => {
        const github = releaseRoute(baseRoutes(new RecordingGitHub()))
            .on("GET", "/actions/workflows/render-world.yml/runs", {
                status: 200,
                json: { workflow_runs: [runJson({ id: 7, status: "queued" })] },
            })
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: runJson({ id: 7, status: "queued" }) })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: { jobs: [] } });
        await seedUploadedState();
        await writeFile(join(world, "region", "r.0.1.mca"), "a new region nobody had rendered");
        const backup = fakeBackup(true);
        const sync = makeSync({ github, backup });

        const result = await sync.sync(request({ follow: false }));

        expect(result.ok).toBe(true);
        expect(backup.requests).toHaveLength(1);
        expect(backup.requests[0]?.kind).toBe("world");
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

describe("a run that is still going is reported as still going", () => {
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
            backup: fakeBackup(true).surface,
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
            backup: fakeBackup(true).surface,
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
    /**
     * A `gh` that is signed in and answers every endpoint the loop asks for.
     *
     * `runToFile` copies a real zip into place, because the collector unpacks what it
     * downloads and checks a `maps/<id>` folder came out of it - a stub that wrote nothing
     * would pass a download that produced no map.
     */
    function readyGh(options: {
        json: Readonly<Record<string, unknown>>;
        artifact?: string;
    }): ProcessRunner & { calls: string[][] } {
        const calls: string[][] = [];
        const answerFor = (args: readonly string[]): string | null => {
            const key = Object.keys(options.json)
                .sort((left, right) => right.length - left.length)
                .find((candidate) => args.some((arg) => arg.includes(candidate)));
            return key === undefined ? null : JSON.stringify(options.json[key]);
        };
        return {
            calls,
            run(_command, args, runOptions) {
                calls.push([...args]);
                if (args.includes("--version")) {
                    return Promise.resolve({ started: true, code: 0, stdout: "gh version 2.62.0\n", stderr: "" });
                }
                if (args.includes("status")) {
                    return Promise.resolve({
                        started: true,
                        code: 0,
                        stdout: "✓ Logged in to github.com account octocat\n",
                        stderr: "",
                    });
                }
                if (runOptions?.input !== undefined) {
                    return Promise.resolve({ started: true, code: 0, stdout: "", stderr: "" });
                }
                const body = answerFor(args);
                return Promise.resolve(
                    body === null
                        ? { started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" }
                        : { started: true, code: 0, stdout: body, stderr: "" },
                );
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
        const mounts = new LocalMapHandler();
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => null,
            runner,
            eulaAccepted: () => true,
            backup: fakeBackup(true).surface,
            fetch: github.fetch,
            apiBase: API,
            mounts,
            now: () => NOW,
            sleep: () => Promise.resolve(),
        });

        const result = await sync.sync(request());

        expect(result.ok).toBe(true);
        if (!result.ok || result.outcome !== "rendered") throw new Error("expected a rendered outcome");
        expect(result.summary.route).toBe("gh");
        expect(mounts.getMounts()).toHaveLength(1);
        // Every operation went down one route. A mixture would have reached the API fake.
        expect(github.calls).toHaveLength(0);
        expect(runner.calls.some((args) => args.some((arg) => arg.includes("/zip")))).toBe(true);
    });

    it("refuses an upload on the gh route, and names the reason rather than failing in a packer", async () => {
        const runner = readyGh({
            json: {
                "actions/workflows/render-world.yml": { id: 1, name: "Render world", state: "active", path: "x" },
                "repos/o/r": repositoryJson({ owner: OWNER, repo: REPO, isPrivate: true }),
            },
        });
        const backup = fakeBackup(true);
        const sync = new CiRenderSync({
            storageDir: () => join(workDir, "maps"),
            token: () => null,
            runner,
            eulaAccepted: () => true,
            backup: backup.surface,
            fetch: new RecordingGitHub().fetch,
            apiBase: API,
            now: () => NOW,
            sleep: () => Promise.resolve(),
        });

        const result = await sync.sync(request());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("upload-needs-app-sign-in");
        expect(result.failure.route).toBe("gh");
        expect(result.failure.needsSignIn).toBe(true);
        expect(backup.requests).toHaveLength(0);
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

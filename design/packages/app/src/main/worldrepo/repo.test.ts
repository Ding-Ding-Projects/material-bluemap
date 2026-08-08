/**
 * Keeping a world in a git repository, against a fake process runner.
 *
 * Same discipline `pages/hosting.test.ts` uses, for the same reason: nothing here spawns
 * `git` or `gh` for real, so the states worth proving - `gh` missing, a branch somebody
 * else wrote, a push GitHub refuses, an oversized region file - are all reachable without a
 * working machine's cooperation hiding them. The real-git proof that a second sync only
 * transfers what changed lives in `incremental.test.ts`, on purpose: that is the one claim
 * a fake runner cannot make honestly.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    DEFAULT_WORLD_BRANCH,
    LEGACY_WORLD_REPO_MARKER_FILE,
    LEGACY_WORLD_REPO_MARKER_TOOL,
    WORLD_REPO_MARKER_FILE,
    WORLD_REPO_MARKER_TOOL,
    WorldRepoHost,
    readWorldMarker,
    targetKey,
} from "./repo.js";
import type { ProcessResult, ProcessRunner } from "../cirender/gh.js";

/* -------------------------------------------------------------------------- */
/* A machine, invented                                                        */
/* -------------------------------------------------------------------------- */

interface Call {
    readonly command: string;
    readonly args: readonly string[];
    readonly input: string | null;
}

interface Machine extends ProcessRunner {
    readonly calls: Call[];
    readonly api: Map<string, unknown>;
    readonly failing: Map<string, { code: number; stderr: string }>;
    readonly refs: Map<string, string>;
    readonly landThenFail: Set<string>;
}

interface MachineOptions {
    readonly gh?: "ready" | "signed-out" | "missing";
    readonly git?: boolean;
}

interface MutableSavedBatch {
    index: number;
    commit: string;
    parent: string | null;
    introducedBytes: number;
    pushBytes: number;
}

interface MutableSavedState {
    commit: string;
    stagingRef: string;
    batches: MutableSavedBatch[];
}

function machine(options: MachineOptions = {}): Machine {
    const calls: Call[] = [];
    const api = new Map<string, unknown>();
    const failing = new Map<string, { code: number; stderr: string }>();
    const refs = new Map<string, string>();
    const landThenFail = new Set<string>();
    const ghState = options.gh ?? "ready";
    const hasGit = options.git !== false;
    let commitNumber = 0;
    let headSha = "d".repeat(40);

    function answerGh(args: readonly string[]): ProcessResult {
        if (ghState === "missing")
            return { started: false, code: null, stdout: "", stderr: "spawn gh ENOENT" };
        if (args[0] === "--version")
            return { started: true, code: 0, stdout: "gh version 2.62.0\n", stderr: "" };
        if (args[0] === "auth") {
            return ghState === "ready"
                ? {
                      started: true,
                      code: 0,
                      stdout: "Logged in to github.com account octocat (keyring)\n",
                      stderr: "",
                  }
                : {
                      started: true,
                      code: 1,
                      stdout: "",
                      stderr: "You are not logged into any hosts\n",
                  };
        }
        if (args[0] === "repo") {
            const failure = failing.get("repo create");
            return failure === undefined
                ? { started: true, code: 0, stdout: "", stderr: "" }
                : { started: true, code: failure.code, stdout: "", stderr: failure.stderr };
        }
        if (args[0] === "api") {
            const endpoint = args[args.length - 1] ?? "";
            if (args.includes("-X") && !args.includes("GET"))
                return { started: true, code: 0, stdout: "", stderr: "" };
            if (!api.has(endpoint))
                return { started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" };
            return {
                started: true,
                code: 0,
                stdout: JSON.stringify(api.get(endpoint)),
                stderr: "",
            };
        }
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    function apiBranchSha(ref: string): string | null {
        const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : "";
        const value = api.get(`repos/octocat/worlds/branches/${branch}`) as
            { readonly commit?: { readonly sha?: string } } | undefined;
        return value?.commit?.sha ?? null;
    }

    function currentRef(ref: string): string | null {
        return refs.get(ref) ?? apiBranchSha(ref);
    }

    function answerGit(args: readonly string[], input: string | undefined): ProcessResult {
        if (!hasGit) return { started: false, code: null, stdout: "", stderr: "spawn git ENOENT" };
        if (args.includes("--version"))
            return { started: true, code: 0, stdout: "git version 2.47.0\n", stderr: "" };
        if (args.includes("hash-object"))
            return { started: true, code: 0, stdout: `${"a".repeat(40)}\n`, stderr: "" };
        if (args.includes("commit")) {
            commitNumber += 1;
            headSha = commitNumber.toString(16).padStart(40, "0");
            return { started: true, code: 0, stdout: "", stderr: "" };
        }
        if (args.includes("rev-parse"))
            return { started: true, code: 0, stdout: `${headSha}\n`, stderr: "" };
        if (args.includes("rev-list"))
            return { started: true, code: 0, stdout: `${headSha}\n`, stderr: "" };
        if (
            args.includes("cat-file") &&
            args.includes("--batch-check=%(objectname) %(objecttype) %(objectsize)")
        ) {
            const lines = (input ?? "")
                .split(/\r?\n/)
                .filter((line) => line.length > 0)
                .map((object) => `${object} commit 256`)
                .join("\n");
            return { started: true, code: 0, stdout: `${lines}\n`, stderr: "" };
        }
        if (args.includes("cat-file") && args.includes("-e")) {
            return { started: true, code: 0, stdout: "", stderr: "" };
        }
        if (args.includes("ls-remote")) {
            const ref = args.at(-1) ?? "";
            const sha = currentRef(ref);
            return {
                started: true,
                code: 0,
                stdout: sha === null ? "" : `${sha}\t${ref}\n`,
                stderr: "",
            };
        }
        if (args.includes("push")) {
            const refspec = args.at(-1) ?? "";
            const split = refspec.indexOf(":");
            const source = split < 0 ? "" : refspec.slice(0, split);
            const destination = split < 0 ? "" : refspec.slice(split + 1);
            const lease = args.find((arg) => arg.startsWith(`--force-with-lease=${destination}:`));
            const expected = lease?.slice(`--force-with-lease=${destination}:`.length) ?? "";
            const current = currentRef(destination);
            const forcedDivergence = failing.get("lease-diverge");
            if (forcedDivergence !== undefined) {
                failing.delete("lease-diverge");
                refs.set(destination, "f".repeat(40));
                return {
                    started: true,
                    code: forcedDivergence.code,
                    stdout: "",
                    stderr: forcedDivergence.stderr,
                };
            }
            if (
                (expected.length === 0 && current !== null) ||
                (expected.length > 0 && current !== expected)
            ) {
                return { started: true, code: 1, stdout: "", stderr: "stale info\n" };
            }
            const failure = failing.get("push");
            if (failure !== undefined) {
                return { started: true, code: failure.code, stdout: "", stderr: failure.stderr };
            }
            if (source.length === 0) refs.delete(destination);
            else refs.set(destination, source);
            if (landThenFail.has(destination) || landThenFail.delete("*")) {
                return {
                    started: true,
                    code: 1,
                    stdout: "",
                    stderr: "connection lost after update\n",
                };
            }
            return { started: true, code: 0, stdout: "", stderr: "" };
        }
        const verb = args.find((arg) => !arg.startsWith("-") && !looksLikePath(arg)) ?? "";
        const failure = failing.get(verb);
        if (failure !== undefined)
            return { started: true, code: failure.code, stdout: "", stderr: failure.stderr };
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    return {
        calls,
        api,
        failing,
        refs,
        landThenFail,
        run(command, args, runOptions) {
            calls.push({ command, args: [...args], input: runOptions?.input ?? null });
            return Promise.resolve(
                command === "gh" ? answerGh(args) : answerGit(args, runOptions?.input),
            );
        },
        runToFile() {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

function looksLikePath(value: string): boolean {
    return value.includes("/") || value.includes("\\") || value.includes("=");
}

/* -------------------------------------------------------------------------- */
/* A world, invented                                                          */
/* -------------------------------------------------------------------------- */

let root = "";
let world = "";
let work = "";

async function makeWorld(): Promise<string> {
    const folder = join(root, "world");
    await mkdir(join(folder, "region"), { recursive: true });
    await writeFile(join(folder, "level.dat"), "nbt", "utf8");
    await writeFile(join(folder, "region", "r.0.0.mca"), "region bytes", "utf8");
    await writeFile(join(folder, "region", "r.0.1.mca"), "more region bytes", "utf8");
    return folder;
}

function host(runner: ProcessRunner): WorldRepoHost {
    return new WorldRepoHost({
        workRoot: () => work,
        runner,
        now: () => new Date("2026-08-05T12:00:00.000Z"),
    });
}

function repositoryPayload(options: { private?: boolean; push?: boolean } = {}): unknown {
    return {
        full_name: "octocat/worlds",
        private: options.private ?? false,
        html_url: "https://github.com/octocat/worlds",
        permissions: { push: options.push ?? true },
    };
}

function markerPayload(branch: string): unknown {
    return {
        content: Buffer.from(
            JSON.stringify({
                tool: WORLD_REPO_MARKER_TOOL,
                version: 1,
                branch,
                updatedAt: "2026-08-01T00:00:00.000Z",
            }),
        ).toString("base64"),
    };
}

function readyToResync(runner: Machine): void {
    runner.api.set("repos/octocat/worlds", repositoryPayload());
    runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "c".repeat(40) } });
    runner.api.set(
        `repos/octocat/worlds/contents/${WORLD_REPO_MARKER_FILE}?ref=world`,
        markerPayload("world"),
    );
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-worldrepo-"));
    work = join(root, "work");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */

describe("the marker", () => {
    it("reads one out of what the contents API answers", () => {
        expect(readWorldMarker(markerPayload("world"))?.branch).toBe("world");
    });

    it("reads the legacy tool while reserving the Worldlens filename for new writes", () => {
        const payload = markerPayload("legacy") as { content: string };
        const parsed = JSON.parse(
            Buffer.from(payload.content, "base64").toString("utf8"),
        ) as Record<string, unknown>;
        parsed.tool = LEGACY_WORLD_REPO_MARKER_TOOL;
        payload.content = Buffer.from(JSON.stringify(parsed)).toString("base64");
        expect(readWorldMarker(payload)?.branch).toBe("legacy");
        expect(WORLD_REPO_MARKER_FILE).toBe(".worldlens-world.json");
        expect(LEGACY_WORLD_REPO_MARKER_FILE).toBe(".material-bluemap-world.json");
    });

    it("refuses to call somebody else's file ours", () => {
        const foreign = {
            content: Buffer.from(
                JSON.stringify({ tool: "some-other-tool", branch: "world" }),
            ).toString("base64"),
        };
        expect(readWorldMarker(foreign)).toBeNull();
        expect(readWorldMarker({ content: Buffer.from("not json").toString("base64") })).toBeNull();
        expect(readWorldMarker(null)).toBeNull();
    });
});

describe("targetKey", () => {
    it("is stable and filesystem-safe for the same target", () => {
        expect(targetKey("octocat", "worlds", "world")).toBe("octocat__worlds__world");
        expect(targetKey("a/b", "c d", "e:f")).toMatch(/^[A-Za-z0-9._-]+$/);
    });
});

describe("the preflight", () => {
    it("reports nothing worth stopping over for a plain, small world", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const report = await host(runner).preflight({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(report.blockers).toEqual([]);
        expect(report.world?.looksLikeWorld).toBe(true);
        expect(report.world?.fileCount).toBeGreaterThan(0);
    });

    it("warns rather than blocks when nothing looks like a Minecraft world", async () => {
        world = join(root, "not-a-world");
        await mkdir(world, { recursive: true });
        await writeFile(join(world, "notes.txt"), "hello", "utf8");
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const report = await host(runner).preflight({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(report.blockers).toEqual([]);
        expect(report.warnings.join(" ")).toContain("level.dat");
    });

    it("blocks on a region file past GitHub's 100 MB limit", async () => {
        world = await makeWorld();
        await writeFile(join(world, "region", "r.9.9.mca"), Buffer.alloc(101 * 1024 * 1024), {
            flag: "w",
        });
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const report = await host(runner).preflight({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(report.blockers.join(" ")).toContain("100 MB");
    }, 20_000);

    it("blocks on a branch this application did not write", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "abc" } });

        const report = await host(runner).preflight({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(report.repository?.branchIsOurs).toBe(false);
        expect(report.blockers.join(" ")).toContain("did not write");
    });

    it("warns that a public repository publishes every block and coordinate", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload({ private: false }));

        const report = await host(runner).preflight({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(report.warnings.join(" ")).toContain("downloaded by anybody");
    });

    it("says which of the three things gh is, rather than that it is unavailable", async () => {
        world = await makeWorld();
        const out = await host(machine({ gh: "signed-out" })).preflight({
            worldPath: world,
            owner: "o",
            repo: "r",
        });
        expect(out.gh.availability).toBe("signed-out");

        const gone = await host(machine({ gh: "missing" })).preflight({
            worldPath: world,
            owner: "o",
            repo: "r",
        });
        expect(gone.gh.availability).toBe("not-installed");
    });

    it("blocks when git is not on this computer", async () => {
        world = await makeWorld();
        const report = await host(machine({ git: false })).preflight({
            worldPath: world,
            owner: "o",
            repo: "r",
        });
        expect(report.gitVersion).toBeNull();
        expect(report.blockers.join(" ")).toContain("git is not on this computer");
    });

    it("reports a world folder that does not exist as a blocker, not a crash", async () => {
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        const report = await host(runner).preflight({
            worldPath: join(root, "nowhere"),
            owner: "octocat",
            repo: "worlds",
        });
        expect(report.blockers.join(" ")).toContain("nowhere");
    });
});

describe("syncing", () => {
    it("refuses without an acknowledgement, and refuses a string that merely looks like one", async () => {
        world = await makeWorld();
        const runner = machine();
        readyToResync(runner);

        const refused = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.failure.code).toBe("not-acknowledged");

        const stillRefused = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: "yes" as unknown as true,
        });
        expect(stillRefused.ok).toBe(false);
    });

    it("never pushes to a branch this application did not write", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "abc" } });

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-ours");
        expect(runner.calls.some((call) => call.args.includes("push"))).toBe(false);
    });

    it("syncs a fresh world into a fresh repository, verified by reading the branch back", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.branch).toBe(DEFAULT_WORLD_BRANCH);
        expect(result.report.commit).toHaveLength(40);
        expect(result.report.pushVerified).toBe(true);
        expect(result.report.batchCount).toBe(1);

        // Markers are synthesized straight into Git's private index. Syncing never writes
        // application metadata into the person's live world folder.
        await expect(readFile(join(world, WORLD_REPO_MARKER_FILE), "utf8")).rejects.toThrow();
        expect(
            runner.calls.some(
                (call) =>
                    call.args.includes("hash-object") &&
                    call.input?.includes(`"tool": "${WORLD_REPO_MARKER_TOOL}"`),
            ),
        ).toBe(true);

        const pushes = runner.calls.filter((call) => call.args.includes("push"));
        expect(pushes.length).toBeGreaterThanOrEqual(2);
        expect(
            pushes.every((call) => call.args.some((arg) => arg.startsWith("--force-with-lease="))),
        ).toBe(true);
        expect(pushes.every((call) => !call.args.includes("--force"))).toBe(true);

        // No token, ever, on any command line.
        for (const call of runner.calls) {
            for (const arg of call.args) expect(arg).not.toMatch(/gh[oprsu]_[A-Za-z0-9]{20,}/);
        }
    });

    it("reports pushVerified true once the branch readback agrees", async () => {
        world = await makeWorld();
        const runner = machine();
        readyToResync(runner);
        // The old branch commit differs from the newly generated batch commit; the final
        // exact lease must still replace it only after staging readback succeeds.
        runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "d".repeat(40) } });

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.report.pushVerified).toBe(true);
    });

    it("reports a push GitHub refuses with its own words, not a guess", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.failing.set("push", {
            code: 1,
            stderr: "! [remote rejected] world -> world (protected branch hook declined)",
        });

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.code).toBe("push-refused");
            expect(result.failure.detail).toContain("protected branch hook declined");
        }
    });

    it("reads version-two completion metadata while remaining compatible with version one", () => {
        const versionTwo = {
            content: Buffer.from(
                JSON.stringify({
                    tool: WORLD_REPO_MARKER_TOOL,
                    version: 2,
                    branch: "world",
                    updatedAt: "2026-08-05T12:00:00.000Z",
                    snapshotId: "snapshot-1",
                    batchCount: 4,
                    bytes: 1_450_000_000,
                }),
            ).toString("base64"),
        };
        expect(readWorldMarker(versionTwo)).toMatchObject({
            version: 2,
            snapshotId: "snapshot-1",
            batchCount: 4,
            bytes: 1_450_000_000,
        });
        expect(readWorldMarker(markerPayload("world"))?.version).toBe(1);
    });

    it("accepts an exact staging readback when the upload command loses its reply", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.landThenFail.add("*");

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.report.pushVerified).toBe(true);
    });

    it("fails closed when the staging lease reads back an unexpected commit", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.failing.set("lease-diverge", { code: 1, stderr: "stale info" });

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("staging-diverged");
        expect(runner.refs.has("refs/heads/world")).toBe(false);
    });

    it("records an accepted batch after cancellation and resumes without uploading it twice", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        let cancelled = false;
        let uploadHost: WorldRepoHost;
        uploadHost = new WorldRepoHost({
            workRoot: () => work,
            runner,
            now: () => new Date("2026-08-05T12:00:00.000Z"),
            onEvent(event) {
                if (!cancelled && event.type === "phase" && event.phase === "pushing") {
                    cancelled = true;
                    uploadHost.cancel(event.key);
                }
            },
        });

        const stopped = await uploadHost.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(stopped.ok).toBe(false);
        if (!stopped.ok) expect(stopped.failure.code).toBe("cancelled");

        const saved = JSON.parse(
            await readFile(
                join(work, targetKey("octocat", "worlds", "world"), "sync.json"),
                "utf8",
            ),
        ) as {
            readonly version: number;
            readonly nextBatch: number;
            readonly batches: readonly unknown[];
        };
        expect(saved.version).toBe(2);
        expect(saved.nextBatch).toBe(1);
        expect(saved.batches).toHaveLength(1);

        const pushesBeforeResume = runner.calls.filter((call) => call.args.includes("push")).length;
        const resumed = await uploadHost.resume({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(resumed.ok).toBe(true);
        const resumePushes =
            runner.calls.filter((call) => call.args.includes("push")).length - pushesBeforeResume;
        // Only the final target update and staging cleanup remain; the data batch is not repeated.
        expect(resumePushes).toBe(2);
    });

    it.each([
        {
            name: "a non-contiguous batch index",
            mutate: (state: MutableSavedState) => {
                state.batches[1]!.index = 7;
            },
        },
        {
            name: "a duplicate commit",
            mutate: (state: MutableSavedState) => {
                state.batches[1]!.commit = state.batches[0]!.commit;
            },
        },
        {
            name: "a missing middle batch",
            mutate: (state: MutableSavedState) => {
                state.batches.splice(1, 1);
            },
        },
        {
            name: "a broken parent chain",
            mutate: (state: MutableSavedState) => {
                state.batches[1]!.parent = "f".repeat(40);
            },
        },
        {
            name: "an introduced-object cap violation",
            mutate: (state: MutableSavedState) => {
                state.batches[1]!.introducedBytes = 1_500_000_001;
            },
        },
        {
            name: "a push cap violation",
            mutate: (state: MutableSavedState) => {
                state.batches[1]!.pushBytes = 1_500_000_001;
            },
        },
        {
            name: "an unexpected final commit",
            mutate: (state: MutableSavedState) => {
                state.commit = "f".repeat(40);
            },
        },
        {
            name: "a staging ref outside this attempt",
            mutate: (state: MutableSavedState) => {
                state.stagingRef = "refs/heads/world";
            },
        },
    ])("rejects version-two resume state containing $name", async ({ mutate }) => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        let cancelled = false;
        let uploadHost: WorldRepoHost;
        uploadHost = new WorldRepoHost({
            workRoot: () => work,
            runner,
            planningTargetBytes: 300,
            onEvent(event) {
                if (!cancelled && event.type === "phase" && event.phase === "pushing") {
                    cancelled = true;
                    uploadHost.cancel(event.key);
                }
            },
        });
        const stopped = await uploadHost.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(stopped.ok).toBe(false);

        const statePath = join(work, targetKey("octocat", "worlds", "world"), "sync.json");
        const saved = JSON.parse(await readFile(statePath, "utf8")) as MutableSavedState;
        expect(saved.batches.length).toBeGreaterThanOrEqual(3);
        mutate(saved);
        await writeFile(statePath, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
        const pushesBeforeResume = runner.calls.filter((call) => call.args.includes("push")).length;

        const resumed = await uploadHost.resume({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });

        expect(resumed.ok).toBe(false);
        if (!resumed.ok) expect(resumed.failure.code).toBe("resume-state-invalid");
        expect(runner.calls.filter((call) => call.args.includes("push"))).toHaveLength(
            pushesBeforeResume,
        );
    });

    it("refuses the final target update when its exact original lease changed", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        const uploadHost = new WorldRepoHost({
            workRoot: () => work,
            runner,
            onEvent(event) {
                if (event.type === "progress" && event.description.startsWith("Verified batch")) {
                    runner.refs.set("refs/heads/world", "e".repeat(40));
                }
            },
        });

        const result = await uploadHost.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("target-diverged");
        expect(runner.refs.get("refs/heads/world")).toBe("e".repeat(40));
    });

    it("emits explicit batch and byte progress while data is uploaded", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        const events: {
            readonly unit?: string;
            readonly batch?: number;
            readonly batches?: number;
        }[] = [];
        const uploadHost = new WorldRepoHost({
            workRoot: () => work,
            runner,
            onEvent(event) {
                if (event.type === "progress" && event.phase === "pushing") events.push(event);
            },
        });

        const result = await uploadHost.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(true);
        expect(
            events.some(
                (event) => event.unit === "bytes" && event.batch === 1 && event.batches === 1,
            ),
        ).toBe(true);
    });

    it("refuses a world with a file past GitHub's 100 MB limit before ever touching git", async () => {
        world = await makeWorld();
        await writeFile(join(world, "region", "r.9.9.mca"), Buffer.alloc(101 * 1024 * 1024));
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const result = await host(runner).sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("file-too-large");
        expect(runner.calls.some((call) => call.args.includes("push"))).toBe(false);
    }, 20_000);

    it("resumes an interrupted sync by re-running it, and reports when there is nothing to resume", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        const key = targetKey("octocat", "worlds", "world");

        const none = await host(runner).resume({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(none.ok).toBe(false);

        await mkdir(join(work, key), { recursive: true });
        await writeFile(
            join(work, key, "sync.json"),
            JSON.stringify({
                version: 1,
                worldPath: world,
                owner: "octocat",
                repo: "worlds",
                branch: "world",
                stage: "pushing",
                commit: null,
                pushVerified: false,
                bytes: 0,
                fileCount: 0,
                syncedAt: "2026-08-01T00:00:00.000Z",
            }),
            "utf8",
        );
        const resumed = await host(runner).resume({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
        });
        expect(resumed.ok).toBe(true);
    });

    it("reports the cheap remote-tip check other lanes can use before downloading anything", async () => {
        const runner = machine();
        runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "c".repeat(40) } });
        const tip = await host(runner).remoteTip("octocat", "worlds", "world");
        expect(tip).toEqual({ exists: true, sha: "c".repeat(40) });

        const nothing = await host(runner).remoteTip("octocat", "nowhere", "world");
        expect(nothing).toEqual({ exists: false, sha: null });
    });
});

describe("removal", () => {
    it("never deletes a branch this application did not write", async () => {
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "abc" } });

        const result = await host(runner).remove({
            worldPath: "/x",
            owner: "octocat",
            repo: "worlds",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-ours");
    });

    it("deletes a branch that carries this application's own marker", async () => {
        const runner = machine();
        readyToResync(runner);

        const result = await host(runner).remove({
            worldPath: "/x",
            owner: "octocat",
            repo: "worlds",
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.report.branchDeleted).toBe(true);
    });
});

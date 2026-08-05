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
}

interface MachineOptions {
    readonly gh?: "ready" | "signed-out" | "missing";
    readonly git?: boolean;
}

function machine(options: MachineOptions = {}): Machine {
    const calls: Call[] = [];
    const api = new Map<string, unknown>();
    const failing = new Map<string, { code: number; stderr: string }>();
    const ghState = options.gh ?? "ready";
    const hasGit = options.git !== false;

    function answerGh(args: readonly string[]): ProcessResult {
        if (ghState === "missing") return { started: false, code: null, stdout: "", stderr: "spawn gh ENOENT" };
        if (args[0] === "--version") return { started: true, code: 0, stdout: "gh version 2.62.0\n", stderr: "" };
        if (args[0] === "auth") {
            return ghState === "ready"
                ? { started: true, code: 0, stdout: "Logged in to github.com account octocat (keyring)\n", stderr: "" }
                : { started: true, code: 1, stdout: "", stderr: "You are not logged into any hosts\n" };
        }
        if (args[0] === "repo") {
            const failure = failing.get("repo create");
            return failure === undefined
                ? { started: true, code: 0, stdout: "", stderr: "" }
                : { started: true, code: failure.code, stdout: "", stderr: failure.stderr };
        }
        if (args[0] === "api") {
            const endpoint = args[args.length - 1] ?? "";
            if (args.includes("-X") && !args.includes("GET")) return { started: true, code: 0, stdout: "", stderr: "" };
            if (!api.has(endpoint)) return { started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" };
            return { started: true, code: 0, stdout: JSON.stringify(api.get(endpoint)), stderr: "" };
        }
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    function answerGit(args: readonly string[]): ProcessResult {
        if (!hasGit) return { started: false, code: null, stdout: "", stderr: "spawn git ENOENT" };
        const verb = args.find((arg) => !arg.startsWith("-") && !looksLikePath(arg)) ?? "";
        const failure = failing.get(verb);
        if (failure !== undefined) return { started: true, code: failure.code, stdout: "", stderr: failure.stderr };
        if (args.includes("rev-parse")) return { started: true, code: 0, stdout: `${"d".repeat(40)}\n`, stderr: "" };
        if (args.includes("--version")) return { started: true, code: 0, stdout: "git version 2.47.0\n", stderr: "" };
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    return {
        calls,
        api,
        failing,
        run(command, args, runOptions) {
            calls.push({ command, args: [...args], input: runOptions?.input ?? null });
            return Promise.resolve(command === "gh" ? answerGh(args) : answerGit(args));
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
            JSON.stringify({ tool: WORLD_REPO_MARKER_TOOL, version: 1, branch, updatedAt: "2026-08-01T00:00:00.000Z" }),
        ).toString("base64"),
    };
}

function readyToResync(runner: Machine): void {
    runner.api.set("repos/octocat/worlds", repositoryPayload());
    runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "c".repeat(40) } });
    runner.api.set(`repos/octocat/worlds/contents/${WORLD_REPO_MARKER_FILE}?ref=world`, markerPayload("world"));
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

    it("refuses to call somebody else's file ours", () => {
        const foreign = {
            content: Buffer.from(JSON.stringify({ tool: "some-other-tool", branch: "world" })).toString("base64"),
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

        const report = await host(runner).preflight({ worldPath: world, owner: "octocat", repo: "worlds" });
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

        const report = await host(runner).preflight({ worldPath: world, owner: "octocat", repo: "worlds" });
        expect(report.blockers).toEqual([]);
        expect(report.warnings.join(" ")).toContain("level.dat");
    });

    it("blocks on a region file past GitHub's 100 MB limit", async () => {
        world = await makeWorld();
        await writeFile(join(world, "region", "r.9.9.mca"), Buffer.alloc(101 * 1024 * 1024), { flag: "w" });
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const report = await host(runner).preflight({ worldPath: world, owner: "octocat", repo: "worlds" });
        expect(report.blockers.join(" ")).toContain("100 MB");
    }, 20_000);

    it("blocks on a branch this application did not write", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());
        runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "abc" } });

        const report = await host(runner).preflight({ worldPath: world, owner: "octocat", repo: "worlds" });
        expect(report.repository?.branchIsOurs).toBe(false);
        expect(report.blockers.join(" ")).toContain("did not write");
    });

    it("warns that a public repository publishes every block and coordinate", async () => {
        world = await makeWorld();
        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload({ private: false }));

        const report = await host(runner).preflight({ worldPath: world, owner: "octocat", repo: "worlds" });
        expect(report.warnings.join(" ")).toContain("downloaded by anybody");
    });

    it("says which of the three things gh is, rather than that it is unavailable", async () => {
        world = await makeWorld();
        const out = await host(machine({ gh: "signed-out" })).preflight({ worldPath: world, owner: "o", repo: "r" });
        expect(out.gh.availability).toBe("signed-out");

        const gone = await host(machine({ gh: "missing" })).preflight({ worldPath: world, owner: "o", repo: "r" });
        expect(gone.gh.availability).toBe("not-installed");
    });

    it("blocks when git is not on this computer", async () => {
        world = await makeWorld();
        const report = await host(machine({ git: false })).preflight({ worldPath: world, owner: "o", repo: "r" });
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

        const refused = await host(runner).sync({ worldPath: world, owner: "octocat", repo: "worlds" });
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
        // The commit landed on GitHub before it is ever reported as such: the branch is not
        // in the fake's API map, so the readback answers 404 and pushVerified is false.
        expect(result.report.pushVerified).toBe(false);
        expect(result.report.notes.join(" ")).toContain("unverified");

        // The marker was written into the world folder itself - it has to be, to be part of
        // what gets pushed - and it names this application and the branch.
        const marker: unknown = JSON.parse(await readFile(join(world, WORLD_REPO_MARKER_FILE), "utf8"));
        expect((marker as { tool: string }).tool).toBe(WORLD_REPO_MARKER_TOOL);

        // No token, ever, on any command line.
        for (const call of runner.calls) {
            for (const arg of call.args) expect(arg).not.toMatch(/gh[oprsu]_[A-Za-z0-9]{20,}/);
        }
    });

    it("reports pushVerified true once the branch readback agrees", async () => {
        world = await makeWorld();
        const runner = machine();
        readyToResync(runner);
        // The commit the fake git runner always answers with - overriding readyToResync's,
        // which is deliberately a different SHA so the "unverified" test above stays honest.
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
        runner.failing.set("push", { code: 1, stderr: "! [remote rejected] world -> world (protected branch hook declined)" });

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

        const none = await host(runner).resume({ worldPath: world, owner: "octocat", repo: "worlds" });
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
        const resumed = await host(runner).resume({ worldPath: world, owner: "octocat", repo: "worlds" });
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

        const result = await host(runner).remove({ worldPath: "/x", owner: "octocat", repo: "worlds" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-ours");
    });

    it("deletes a branch that carries this application's own marker", async () => {
        const runner = machine();
        readyToResync(runner);

        const result = await host(runner).remove({ worldPath: "/x", owner: "octocat", repo: "worlds" });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.report.branchDeleted).toBe(true);
    });
});

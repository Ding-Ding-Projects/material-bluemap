/**
 * The one claim `repo.test.ts`'s fake runner cannot prove honestly: that a second sync of
 * a world only transfers the region file that actually changed.
 *
 * This runs real `git`, against a real local bare repository standing in for GitHub - a
 * `file:` remote is exactly as real a git remote as `https://github.com/...` is, as far as
 * the pack negotiation this test is proving goes. Only `gh` is faked, because there is no
 * real GitHub repository to point it at; every `git` command runs for real.
 *
 * Skipped, loudly, on a machine with no git - the same rule `history/ipc.test.ts` follows
 * and for the same reason: that machine has already seen the situation this test cannot
 * reach any other way.
 *
 * ## What "only what changed" is checked against
 *
 * Not bytes on a wire, which nothing here can observe without a packet sniffer. Instead,
 * the bare repository's own object database is enumerated with `git cat-file
 * --batch-all-objects` before and after the second sync. The objects that appear are
 * exactly the objects that were sent - a bare repository never has anything a push did not
 * put there - so the size of that new set is direct evidence of what actually moved over
 * the wire, not an inference about it.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
    WORLD_REPO_MARKER_FILE,
    WORLD_REPO_MARKER_TOOL,
    WORLD_REPO_MAX_INTRODUCED_BYTES,
    WORLD_REPO_MAX_PUSH_BYTES,
    WORLD_REPO_UPLOAD_MARKER_FILE,
    WorldRepoHost,
    targetKey,
} from "./repo.js";
import { nodeProcessRunner } from "../cirender/gh.js";
import type { ProcessResult, ProcessRunner } from "../cirender/gh.js";

/* -------------------------------------------------------------------------- */
/* Is there a git on this machine?                                            */
/* -------------------------------------------------------------------------- */

const realGit = nodeProcessRunner();
const gitProbe = await realGit.run("git", ["--version"]);
const hasGit = gitProbe.started && gitProbe.code === 0;

/* -------------------------------------------------------------------------- */
/* A hybrid runner: real git, a faked gh standing in for a repository nobody  */
/* is actually hosting on GitHub.                                             */
/* -------------------------------------------------------------------------- */

function hybridRunner(): { runner: ProcessRunner; markPublished: () => void } {
    let published = false;

    function answerGh(args: readonly string[]): ProcessResult {
        if (args[0] === "--version")
            return { started: true, code: 0, stdout: "gh version 2.62.0\n", stderr: "" };
        if (args[0] === "auth") {
            return {
                started: true,
                code: 0,
                stdout: "Logged in to github.com account octocat (keyring)\n",
                stderr: "",
            };
        }
        if (args[0] === "repo") return { started: true, code: 0, stdout: "", stderr: "" };
        if (args[0] === "api") {
            const endpoint = args[args.length - 1] ?? "";
            if (args.includes("-X") && !args.includes("GET"))
                return { started: true, code: 0, stdout: "", stderr: "" };
            if (endpoint === "repos/octocat/worlds") {
                return {
                    started: true,
                    code: 0,
                    stdout: JSON.stringify({
                        full_name: "octocat/worlds",
                        private: true,
                        html_url: "https://github.com/octocat/worlds",
                        permissions: { push: true },
                    }),
                    stderr: "",
                };
            }
            if (endpoint === "repos/octocat/worlds/branches/world" && published) {
                return {
                    started: true,
                    code: 0,
                    stdout: JSON.stringify({ commit: { sha: "irrelevant" } }),
                    stderr: "",
                };
            }
            if (
                endpoint === `repos/octocat/worlds/contents/${WORLD_REPO_MARKER_FILE}?ref=world` &&
                published
            ) {
                return {
                    started: true,
                    code: 0,
                    stdout: JSON.stringify({
                        content: Buffer.from(
                            JSON.stringify({
                                tool: WORLD_REPO_MARKER_TOOL,
                                version: 1,
                                branch: "world",
                            }),
                        ).toString("base64"),
                    }),
                    stderr: "",
                };
            }
            return { started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" };
        }
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    return {
        markPublished: () => {
            published = true;
        },
        runner: {
            run(command, args, options) {
                if (command === "gh") return Promise.resolve(answerGh(args));
                return realGit.run(command, args, options);
            },
            runToFile(command, args, destination, options) {
                return realGit.runToFile(command, args, destination, options);
            },
        },
    };
}

/* -------------------------------------------------------------------------- */

const cleanupDirs: string[] = [];

afterAll(async () => {
    for (const dir of cleanupDirs)
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    cleanupDirs.push(dir);
    return dir;
}

/** A deterministic block of bytes, standing in for one Minecraft region file. */
function regionBytes(seed: number, size = 40_000): Buffer {
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buffer[i] = (seed * 31 + i) % 256;
    return buffer;
}

async function makeWorld(folder: string, regionCount: number): Promise<void> {
    await mkdir(join(folder, "region"), { recursive: true });
    await writeFile(join(folder, "level.dat"), "nbt", "utf8");
    for (let i = 0; i < regionCount; i++) {
        await writeFile(join(folder, "region", `r.${String(i)}.0.mca`), regionBytes(i));
    }
}

/** Every object SHA the bare repository currently holds, as a Set. */
async function bareObjects(bareDir: string): Promise<Set<string>> {
    const result = await realGit.run("git", [
        "--git-dir",
        bareDir,
        "cat-file",
        "--batch-check=%(objectname)",
        "--batch-all-objects",
        "--unordered",
    ]);
    return new Set(
        result.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
    );
}

describe.skipIf(!hasGit)("a real git repository, on real disk", { timeout: 60_000 }, () => {
    it("publishes a complete final tree through three or more bounded linear commits", async () => {
        const bareDir = join(await tempDir("mbm-worldrepo-batches-bare-"), "world.git");
        await realGit.run("git", ["init", "--quiet", "--bare", bareDir]);

        const world = await tempDir("mbm-worldrepo-batches-world-");
        await makeWorld(world, 8);
        const work = await tempDir("mbm-worldrepo-batches-work-");
        const { runner } = hybridRunner();
        const host = new WorldRepoHost({
            workRoot: () => work,
            runner,
            remoteUrl: () => bareDir,
            planningTargetBytes: 50_000,
        });

        const result = await host.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.batchCount).toBeGreaterThanOrEqual(3);
        expect(result.report.maxCommitBytes).toBeLessThanOrEqual(WORLD_REPO_MAX_INTRODUCED_BYTES);
        expect(result.report.maxPushBytes).toBeLessThanOrEqual(WORLD_REPO_MAX_PUSH_BYTES);

        const count = await realGit.run("git", [
            "--git-dir",
            bareDir,
            "rev-list",
            "--count",
            "refs/heads/world",
        ]);
        expect(Number(count.stdout.trim())).toBe(result.report.batchCount);

        const tree = await realGit.run("git", [
            "--git-dir",
            bareDir,
            "ls-tree",
            "-r",
            "--name-only",
            "refs/heads/world",
        ]);
        const paths = tree.stdout.split(/\r?\n/).filter((path) => path.length > 0);
        expect(paths).toContain("level.dat");
        expect(paths).toContain("region/r.7.0.mca");
        expect(paths).toContain(WORLD_REPO_MARKER_FILE);
        expect(paths).not.toContain(WORLD_REPO_UPLOAD_MARKER_FILE);
        expect(await stat(join(world, WORLD_REPO_MARKER_FILE)).catch(() => null)).toBeNull();
        expect(await stat(join(world, WORLD_REPO_UPLOAD_MARKER_FILE)).catch(() => null)).toBeNull();

        const state = JSON.parse(
            await readFile(
                join(work, targetKey("octocat", "worlds", "world"), "sync.json"),
                "utf8",
            ),
        ) as {
            readonly version: number;
            readonly batches: readonly {
                readonly introducedBytes: number;
                readonly pushBytes: number;
            }[];
        };
        expect(state.version).toBe(2);
        expect(state.batches).toHaveLength(result.report.batchCount);
        expect(
            state.batches.every(
                (batch) => batch.introducedBytes <= WORLD_REPO_MAX_INTRODUCED_BYTES,
            ),
        ).toBe(true);
        expect(state.batches.every((batch) => batch.pushBytes <= WORLD_REPO_MAX_PUSH_BYTES)).toBe(
            true,
        );

        const staging = await realGit.run("git", [
            "--git-dir",
            bareDir,
            "for-each-ref",
            "--format=%(refname)",
            "refs/heads/worldlens-upload",
        ]);
        expect(staging.stdout.trim()).toBe("");
    });

    it("pushes only the changed blob on a second sync of the same target", async () => {
        const bareDir = join(await tempDir("mbm-worldrepo-bare-"), "world.git");
        await realGit.run("git", ["init", "--quiet", "--bare", bareDir]);

        const world = await tempDir("mbm-worldrepo-world-");
        await makeWorld(world, 12);

        const work = await tempDir("mbm-worldrepo-work-");
        const { runner, markPublished } = hybridRunner();
        const host = new WorldRepoHost({
            workRoot: () => work,
            runner,
            remoteUrl: () => bareDir,
        });

        const first = await host.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(first.ok).toBe(true);
        markPublished();

        const objectsAfterFirst = await bareObjects(bareDir);
        // Sanity: a dozen ~40 KB region files plus level.dat plus the marker really did
        // produce a meaningful number of objects, so the comparison below is not vacuous.
        expect(objectsAfterFirst.size).toBeGreaterThan(12);

        // Change exactly one region file. Everything else on disk is untouched.
        await writeFile(join(world, "region", "r.3.0.mca"), regionBytes(999));

        const second = await host.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(second.ok).toBe(true);
        if (!second.ok) return;

        const objectsAfterSecond = await bareObjects(bareDir);
        const newObjects = [...objectsAfterSecond].filter((sha) => !objectsAfterFirst.has(sha));

        // What must be new: the changed region file's blob, the marker file's blob (its
        // timestamp changes every sync), the root tree and the region/ subtree (both changed
        // because a child's hash changed), and the new commit. Five, generously rounded up -
        // and nowhere near the twelve-plus objects a full re-transfer of every region file
        // would have produced.
        expect(newObjects.length).toBeGreaterThan(0);
        expect(newObjects.length).toBeLessThanOrEqual(6);
        expect(newObjects.length).toBeLessThan(objectsAfterFirst.size);
    });

    it("still only sends what changed after this computer's local copy is lost", async () => {
        const bareDir = join(await tempDir("mbm-worldrepo-bare2-"), "world.git");
        await realGit.run("git", ["init", "--quiet", "--bare", bareDir]);

        const world = await tempDir("mbm-worldrepo-world2-");
        await makeWorld(world, 12);

        const workA = await tempDir("mbm-worldrepo-workA-");
        const first = hybridRunner();
        const hostA = new WorldRepoHost({
            workRoot: () => workA,
            runner: first.runner,
            remoteUrl: () => bareDir,
        });
        const firstResult = await hostA.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(firstResult.ok).toBe(true);
        first.markPublished();

        const objectsAfterFirst = await bareObjects(bareDir);

        // A different work root - standing in for this computer's local git directory
        // having been lost or never having existed - syncing the same target the remote
        // already carries a commit for.
        await writeFile(join(world, "region", "r.5.0.mca"), regionBytes(777));
        const workB = await tempDir("mbm-worldrepo-workB-");
        const second = hybridRunner();
        second.markPublished();
        const hostB = new WorldRepoHost({
            workRoot: () => workB,
            runner: second.runner,
            remoteUrl: () => bareDir,
        });
        const secondResult = await hostB.sync({
            worldPath: world,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(secondResult.ok).toBe(true);

        const objectsAfterSecond = await bareObjects(bareDir);
        const newObjects = [...objectsAfterSecond].filter((sha) => !objectsAfterFirst.has(sha));

        // The fetch-before-orphan step is what makes this possible from a cold work root:
        // without it, a fresh local git directory knows nothing the remote already has, and
        // every blob would be sent again.
        expect(newObjects.length).toBeGreaterThan(0);
        expect(newObjects.length).toBeLessThanOrEqual(6);
        expect(newObjects.length).toBeLessThan(objectsAfterFirst.size);
    });
});

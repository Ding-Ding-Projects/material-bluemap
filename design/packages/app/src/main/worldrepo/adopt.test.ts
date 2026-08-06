/**
 * Recognising a repository this application already prepared, against a fake `gh`, exactly
 * the discipline `repo.test.ts` holds itself to for the same reason: the interesting states
 * here - no marker, a marker from the future, a project from the future, a repository
 * already bound to a different local folder - are all reachable without a working machine's
 * cooperation hiding them.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    DEFAULT_MAX_ADOPTION_PROBES,
    buildAdoptionPlan,
    describeAdoptionSignal,
    probeAdoptionCandidates,
} from "./adopt.js";
import {
    WORLD_REPO_MARKER_FILE,
    WORLD_REPO_MARKER_TOOL,
    WORLD_REPO_MARKER_VERSION,
    WorldRepoHost,
    targetKey,
} from "./repo.js";
import {
    CI_BOOTSTRAP_MARKER_FILE,
    CI_BOOTSTRAP_MARKER_TOOL,
    CI_BOOTSTRAP_MARKER_VERSION,
} from "../cirender/bootstrap.js";
import type { ProcessResult, ProcessRunner } from "../cirender/gh.js";

/* -------------------------------------------------------------------------------------- */
/* A `gh`, invented                                                                        */
/* -------------------------------------------------------------------------------------- */

interface Call {
    readonly command: string;
    readonly args: readonly string[];
}

interface Machine extends ProcessRunner {
    readonly calls: Call[];
    readonly api: Map<string, unknown>;
}

function machine(): Machine {
    const calls: Call[] = [];
    const api = new Map<string, unknown>();
    return {
        calls,
        api,
        run(command, args): Promise<ProcessResult> {
            calls.push({ command, args: [...args] });
            if (command === "gh" && args[0] === "auth") {
                return Promise.resolve({
                    started: true,
                    code: 0,
                    stdout: "Logged in to github.com account octocat (keyring)\n",
                    stderr: "",
                });
            }
            if (command === "gh" && args[0] === "--version") {
                return Promise.resolve({ started: true, code: 0, stdout: "gh version 2.62.0\n", stderr: "" });
            }
            if (command === "gh" && args[0] === "api") {
                const endpoint = args[args.length - 1] ?? "";
                if (!api.has(endpoint)) {
                    return Promise.resolve({ started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" });
                }
                return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify(api.get(endpoint)), stderr: "" });
            }
            if (command === "git" && args.includes("rev-parse")) {
                return Promise.resolve({ started: true, code: 0, stdout: `${"d".repeat(40)}\n`, stderr: "" });
            }
            if (command === "git" && args.includes("--version")) {
                return Promise.resolve({ started: true, code: 0, stdout: "git version 2.47.0\n", stderr: "" });
            }
            return Promise.resolve({ started: true, code: 0, stdout: "", stderr: "" });
        },
        runToFile() {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

function jsonFile(value: unknown): unknown {
    return { content: Buffer.from(JSON.stringify(value)).toString("base64") };
}

function markerPayload(branch: string, version = WORLD_REPO_MARKER_VERSION): unknown {
    return jsonFile({ tool: WORLD_REPO_MARKER_TOOL, version, branch, updatedAt: "2026-08-01T00:00:00.000Z" });
}

function repositoryPayload(): unknown {
    return {
        full_name: "octocat/worlds",
        private: false,
        html_url: "https://github.com/octocat/worlds",
        permissions: { push: true },
    };
}

interface ProjectOverrides {
    readonly render?: Partial<{
        readonly threads: number | null;
        readonly force: boolean;
        readonly fixEdges: boolean;
        readonly metrics: boolean;
        readonly outputFolder: string | null;
    }>;
    readonly maps?: readonly {
        readonly id: string;
        readonly name: string;
        readonly dimension: string;
        readonly world?: string | null;
    }[];
    readonly version?: number;
}

/** A minimal but schema-valid project, the way a real save would write it. */
function projectPayload(overrides: ProjectOverrides = {}): unknown {
    return {
        version: overrides.version ?? 1,
        id: "abc123",
        name: "Andyville",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        appVersion: "1.2.3",
        maps: (overrides.maps ?? [{ id: "overworld", name: "Overworld", dimension: "minecraft:overworld" }]).map(
            (m) => ({
                id: m.id,
                name: m.name,
                dimension: m.dimension,
                world: m.world ?? null,
                config: "",
                storage: "file",
                sorting: 0,
                enabled: true,
            }),
        ),
        storages: [{ id: "file", config: "" }],
        render: {
            threads: overrides.render?.threads ?? 4,
            force: overrides.render?.force ?? false,
            fixEdges: overrides.render?.fixEdges ?? true,
            metrics: overrides.render?.metrics ?? false,
            outputFolder: overrides.render?.outputFolder ?? null,
        },
        core: null,
        webapp: null,
        webserver: null,
        plugin: null,
        fromWizard: false,
    };
}

function readyRepo(runner: Machine, options: { markerVersion?: number; projectVersion?: number } = {}): void {
    runner.api.set("repos/octocat/worlds", repositoryPayload());
    runner.api.set("repos/octocat/worlds/branches/world", { commit: { sha: "c".repeat(40) } });
    runner.api.set(
        `repos/octocat/worlds/contents/${WORLD_REPO_MARKER_FILE}?ref=world`,
        markerPayload("world", options.markerVersion),
    );
}

function bootstrapMarkerPayload(version = CI_BOOTSTRAP_MARKER_VERSION): unknown {
    return jsonFile({
        tool: CI_BOOTSTRAP_MARKER_TOOL,
        version,
        templateVersion: "1",
        files: [".github/workflows/render-world.yml"],
        preparedAt: "2026-08-01T00:00:00.000Z",
    });
}

/** A repository bootstrapped for CI rendering, but never synced through `worldrepo`. */
function bootstrapOnlyRepo(runner: Machine, repo = "worlds", version?: number): void {
    runner.api.set(`repos/octocat/${repo}`, { full_name: `octocat/${repo}`, private: false, permissions: { push: true } });
    runner.api.set(`repos/octocat/${repo}/contents/${CI_BOOTSTRAP_MARKER_FILE}`, bootstrapMarkerPayload(version));
}

let root = "";
let work = "";

function host(runner: ProcessRunner): WorldRepoHost {
    return new WorldRepoHost({ workRoot: () => work, runner, now: () => new Date("2026-08-05T12:00:00.000Z") });
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-adopt-"));
    work = join(root, "work");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------------------- */
/* Recognising a candidate in a list                                                       */
/* -------------------------------------------------------------------------------------- */

describe("probeAdoptionCandidates", () => {
    it("tells a prepared repository apart from a plain one, in the same list", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set("repos/octocat/scratch", { full_name: "octocat/scratch", private: false, permissions: { push: true } });
        runner.api.set("repos/octocat/scratch/branches/world", null as unknown as never);

        const results = await probeAdoptionCandidates(host(runner), runner, [
            { owner: "octocat", repo: "worlds" },
            { owner: "octocat", repo: "scratch" },
        ]);

        expect(results[0]?.status).toBe("prepared");
        expect(results[0]?.marker).not.toBeNull();
        expect(results[1]?.status).toBe("not-prepared");
        expect(results[1]?.marker).toBeNull();
    });

    it("never asserts certainty - every wording hedges with 'looks like'", async () => {
        const runner = machine();
        readyRepo(runner);
        const [prepared] = await probeAdoptionCandidates(host(runner), runner, [{ owner: "octocat", repo: "worlds" }]);
        expect(prepared?.message).toMatch(/looks like/i);
        expect(prepared?.message).not.toMatch(/\bis your\b|\bdefinitely\b|\bconfirmed\b/i);
    });

    it("bounds how many repositories one check reads, and says so rather than guessing", async () => {
        const runner = machine();
        readyRepo(runner);
        const candidates = Array.from({ length: DEFAULT_MAX_ADOPTION_PROBES + 3 }, (_, index) => ({
            owner: "octocat",
            repo: index === 0 ? "worlds" : `filler-${String(index)}`,
        }));
        for (const candidate of candidates.slice(1)) {
            runner.api.set(`repos/octocat/${candidate.repo}`, {
                full_name: `octocat/${candidate.repo}`,
                private: false,
                permissions: { push: true },
            });
        }

        const results = await probeAdoptionCandidates(host(runner), runner, candidates);
        expect(results).toHaveLength(candidates.length);
        expect(results[0]?.status).toBe("prepared");

        const untouched = results.slice(DEFAULT_MAX_ADOPTION_PROBES);
        expect(untouched.every((signal) => signal.status === "not-checked")).toBe(true);
        // Genuinely never asked: no `gh api` call was ever made for those repository names.
        for (const signal of untouched) {
            const name = signal.fullName.split("/")[1] ?? "";
            expect(runner.calls.some((call) => call.args.some((arg) => arg.includes(name)))).toBe(false);
        }
    });

    it("reports a network failure as unknown, never folded into a plain no", () => {
        const failing: import("./repo.js").WorldRepoRepositoryReport = {
            fullName: "octocat/worlds",
            exists: false,
            private: null,
            canWrite: null,
            htmlUrl: null,
            branchExists: false,
            branchIsOurs: null,
            branchMarker: null,
            branchSha: null,
            failure: "The network dropped mid-request.",
        };
        const signal = describeAdoptionSignal("octocat/worlds", "world", failing);
        expect(signal.status).toBe("unknown");
        expect(signal.message).toContain("could not be checked");
    });

    it("degrades a marker from a newer version honestly, still calling it likely prepared", async () => {
        const runner = machine();
        readyRepo(runner, { markerVersion: WORLD_REPO_MARKER_VERSION + 7 });
        const [signal] = await probeAdoptionCandidates(host(runner), runner, [{ owner: "octocat", repo: "worlds" }]);
        expect(signal?.status).toBe("prepared-newer-version");
        expect(signal?.message).toMatch(/newer version/i);
        expect(signal?.marker).not.toBeNull();
    });

    it("also recognises a repository bootstrapped for CI rendering but never synced as a world repo", async () => {
        const runner = machine();
        bootstrapOnlyRepo(runner);
        const [signal] = await probeAdoptionCandidates(host(runner), runner, [{ owner: "octocat", repo: "worlds" }]);
        expect(signal?.status).toBe("prepared");
        expect(signal?.marker).toBeNull();
        expect(signal?.bootstrapMarker).not.toBeNull();
        expect(signal?.message).toMatch(/CI-bootstrap marker/i);
        expect(signal?.message).toMatch(/looks like/i);
    });

    it("reports both markers when a repository carries both", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(`repos/octocat/worlds/contents/${CI_BOOTSTRAP_MARKER_FILE}`, bootstrapMarkerPayload());
        const [signal] = await probeAdoptionCandidates(host(runner), runner, [{ owner: "octocat", repo: "worlds" }]);
        expect(signal?.status).toBe("prepared");
        expect(signal?.marker).not.toBeNull();
        expect(signal?.bootstrapMarker).not.toBeNull();
    });
});

/* -------------------------------------------------------------------------------------- */
/* Building a plan                                                                         */
/* -------------------------------------------------------------------------------------- */

describe("buildAdoptionPlan", () => {
    it("refuses a repository with no marker, rather than inventing a plan for it", async () => {
        const runner = machine();
        runner.api.set("repos/octocat/scratch", { full_name: "octocat/scratch", private: false, permissions: { push: true } });
        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "scratch" });
        expect(plan.ok).toBe(false);
        if (!plan.ok) expect(plan.reason).toBe("not-prepared");
    });

    it("recognises a CI-bootstrap-only repository honestly - nothing to restore, but not a stranger either", async () => {
        const runner = machine();
        bootstrapOnlyRepo(runner);
        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.reason).toBe("ci-bootstrap-only");
        expect(plan.bootstrapMarker).not.toBeNull();
        expect(plan.marker).toBeNull();
        expect(plan.message).toMatch(/no maps, storages or/i);
    });

    it("restores the portable settings and reports exactly what it restored", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(
                projectPayload({
                    maps: [
                        { id: "overworld", name: "Overworld", dimension: "minecraft:overworld" },
                        { id: "nether", name: "The Nether", dimension: "minecraft:the_nether" },
                    ],
                }),
            ),
        );

        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.restoring.projectName).toBe("Andyville");
        expect(plan.restoring.maps).toEqual([
            { id: "overworld", name: "Overworld", dimension: "minecraft:overworld" },
            { id: "nether", name: "The Nether", dimension: "minecraft:the_nether" },
        ]);
        expect(plan.restoring.storageIds).toEqual(["file"]);
        expect(plan.restoring.renderNotes.join(" ")).toMatch(/4 render thread/);
        expect(plan.restoring.renderNotes.join(" ")).toMatch(/fix map edges/);
    });

    it("names every machine-specific gap as needing attention, never silently adopting it", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(projectPayload()),
        );
        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;

        const ids = plan.needsAttention.map((item) => item.id);
        expect(ids).toContain("world-folder");
        expect(ids).toContain("dependencies");
        expect(ids).toContain("remote-host");
        // Every item names a real gap in a full sentence, not just a bare id somebody has to
        // already understand.
        for (const item of plan.needsAttention) expect(item.message.length).toBeGreaterThan(20);
    });

    it("flags an absolute output folder and an absolute linked-world path from the old computer", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(
                projectPayload({
                    render: { outputFolder: "C:\\Users\\old-owner\\Maps\\Output" },
                    maps: [
                        {
                            id: "overworld",
                            name: "Overworld",
                            dimension: "minecraft:overworld",
                            world: "C:\\Users\\old-owner\\Saves\\Other World",
                        },
                    ],
                }),
            ),
        );
        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;

        const outputItem = plan.needsAttention.find((item) => item.id === "output-folder");
        expect(outputItem?.message).toContain("C:\\Users\\old-owner\\Maps\\Output");
        const linkedItem = plan.needsAttention.find((item) => item.id === "linked-world");
        expect(linkedItem?.mapId).toBe("overworld");
        expect(linkedItem?.message).toContain("C:\\Users\\old-owner\\Saves\\Other World");
    });

    it("degrades honestly when the project was written by a newer app than this one", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(projectPayload({ version: 99 })),
        );
        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(false);
        if (plan.ok) return;
        expect(plan.reason).toBe("project-too-new");
        expect(plan.foundFormatVersion).toBe(99);
        // The marker was still found and is still reported - only the project body is refused.
        expect(plan.marker).not.toBeNull();
        expect(plan.message.length).toBeGreaterThan(0);
    });

    it("detects an existing local project bound to the same repository instead of duplicating it", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(projectPayload()),
        );
        const key = targetKey("octocat", "worlds", "world");
        await mkdir(join(work, key), { recursive: true });
        await writeFile(
            join(work, key, "sync.json"),
            JSON.stringify({
                version: 1,
                worldPath: join(root, "already-here"),
                owner: "octocat",
                repo: "worlds",
                branch: "world",
                stage: "finished",
                commit: "d".repeat(40),
                pushVerified: true,
                bytes: 100,
                fileCount: 5,
                syncedAt: "2026-08-01T00:00:00.000Z",
            }),
            "utf8",
        );

        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.alreadyLocal?.worldPath).toBe(join(root, "already-here"));
    });

    it("reports no existing local binding when this computer has never synced this repository", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(projectPayload()),
        );
        const plan = await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.alreadyLocal).toBeNull();
    });

    it("never writes to the repository - every call it makes is a read", async () => {
        const runner = machine();
        readyRepo(runner);
        runner.api.set(
            "repos/octocat/worlds/contents/material-bluemap.project.json?ref=world",
            jsonFile(projectPayload()),
        );
        await buildAdoptionPlan(host(runner), runner, { owner: "octocat", repo: "worlds" });
        expect(runner.calls.length).toBeGreaterThan(0);
        for (const call of runner.calls) {
            expect(call.args).not.toContain("-X");
            expect(call.args).not.toContain("POST");
            expect(call.args).not.toContain("PUT");
            expect(call.args).not.toContain("PATCH");
            expect(call.args).not.toContain("DELETE");
        }
    });
});

/* -------------------------------------------------------------------------------------- */
/* Marker privacy: the file that may sit in a public repository                            */
/* -------------------------------------------------------------------------------------- */

describe("marker privacy", () => {
    it("carries no absolute path, username, host or credential - only tool, version, branch, updatedAt", async () => {
        // A real sync, through the same machine the rest of this suite uses, into a world
        // folder placed under this OS's own temp directory - which on a real Windows
        // machine sits under the profile path and so genuinely contains the account's
        // Windows username. If that leaked into the marker, this is exactly where it would
        // show up.
        const worldFolder = join(root, "world");
        await mkdir(join(worldFolder, "region"), { recursive: true });
        await writeFile(join(worldFolder, "level.dat"), "nbt", "utf8");
        await writeFile(join(worldFolder, "region", "r.0.0.mca"), "region bytes", "utf8");

        const runner = machine();
        runner.api.set("repos/octocat/worlds", repositoryPayload());

        const result = await host(runner).sync({
            worldPath: worldFolder,
            owner: "octocat",
            repo: "worlds",
            acknowledgeSync: true,
        });
        expect(result.ok).toBe(true);

        const written = await readFile(join(worldFolder, WORLD_REPO_MARKER_FILE), "utf8");
        const parsed: unknown = JSON.parse(written);
        expect(Object.keys(parsed as Record<string, unknown>).sort()).toEqual([
            "branch",
            "tool",
            "updatedAt",
            "version",
        ]);

        const serialized = written;
        // Never the world's own absolute path, never a drive letter, never a path
        // separator, never anything that looks like an OS profile/home directory.
        expect(serialized).not.toContain(worldFolder);
        expect(serialized).not.toContain(root);
        expect(serialized).not.toMatch(/[A-Za-z]:[\\/]/);
        expect(serialized).not.toContain("\\");
        expect(serialized.includes("/")).toBe(false);
        expect(serialized.toLowerCase()).not.toContain("users");
        expect(serialized.toLowerCase()).not.toContain("home");
        // No token- or credential-shaped content either.
        expect(serialized.toLowerCase()).not.toMatch(/token|password|secret|authorization|bearer/);
    });
});

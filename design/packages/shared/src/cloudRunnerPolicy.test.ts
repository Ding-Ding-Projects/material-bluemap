import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

type HostedRunner = "ubuntu-latest" | "windows-latest" | "macos-latest";

interface RunnerJob {
    readonly workflow: string;
    readonly job: string;
    readonly runner: HostedRunner;
}

interface ReusableWorkflowJob {
    readonly workflow: string;
    readonly job: string;
    readonly uses: string;
}

type WorkflowJob = RunnerJob | ReusableWorkflowJob;

const WORKFLOWS = [
    "build-jars.yml",
    "ci.yml",
    "pages.yml",
    "render-private-world.yml",
    "render-shard-wave.yml",
    "render-world.yml",
    "scheduled-render.yml",
] as const;

/**
 * Completeness guard, intentionally hand-written. Every workflow job is named here,
 * including reusable-workflow calls (which cannot legally declare `runs-on`). Adding,
 * removing, or renaming a job must update this inventory in the same commit.
 */
const WORKFLOW_JOBS: readonly WorkflowJob[] = [
    { workflow: "build-jars.yml", job: "build", runner: "ubuntu-latest" },
    { workflow: "ci.yml", job: "workflows", runner: "ubuntu-latest" },
    { workflow: "ci.yml", job: "check", runner: "ubuntu-latest" },
    { workflow: "ci.yml", job: "package", runner: "windows-latest" },
    { workflow: "ci.yml", job: "jars", uses: "./.github/workflows/build-jars.yml" },
    { workflow: "ci.yml", job: "config-java-roundtrip", runner: "ubuntu-latest" },
    { workflow: "ci.yml", job: "test-world", runner: "ubuntu-latest" },
    { workflow: "ci.yml", job: "screenshots", runner: "ubuntu-latest" },
    { workflow: "ci.yml", job: "release", runner: "ubuntu-latest" },
    { workflow: "pages.yml", job: "build", runner: "ubuntu-latest" },
    { workflow: "pages.yml", job: "deploy", runner: "ubuntu-latest" },
    { workflow: "render-private-world.yml", job: "preflight", runner: "ubuntu-latest" },
    { workflow: "render-private-world.yml", job: "cli", runner: "ubuntu-latest" },
    { workflow: "render-private-world.yml", job: "prepare", runner: "ubuntu-latest" },
    { workflow: "render-private-world.yml", job: "render", runner: "ubuntu-latest" },
    { workflow: "render-private-world.yml", job: "assemble", runner: "ubuntu-latest" },
    { workflow: "render-private-world.yml", job: "cleanup", runner: "ubuntu-latest" },
    { workflow: "render-shard-wave.yml", job: "render", runner: "ubuntu-latest" },
    { workflow: "render-world.yml", job: "cli", runner: "ubuntu-latest" },
    { workflow: "render-world.yml", job: "plan", runner: "ubuntu-latest" },
    ...Array.from({ length: 12 }, (_, index) => ({
        workflow: "render-world.yml",
        job: `wave${index + 1}`,
        uses: "./.github/workflows/render-shard-wave.yml",
    })),
    { workflow: "render-world.yml", job: "merge", runner: "ubuntu-latest" },
    { workflow: "render-world.yml", job: "merge-lowres", runner: "ubuntu-latest" },
    { workflow: "render-world.yml", job: "publish", runner: "ubuntu-latest" },
    { workflow: "scheduled-render.yml", job: "check", runner: "ubuntu-latest" },
];

function workflowText(name: string): string {
    return readFileSync(join(repositoryRoot, ".github", "workflows", name), "utf8");
}

function jobBlocks(text: string): Map<string, string> {
    const jobsIndex = text.search(/^jobs:\s*$/m);
    expect(jobsIndex, "workflow must contain a top-level jobs mapping").toBeGreaterThanOrEqual(0);
    const jobsText = text.slice(jobsIndex);
    const starts = [...jobsText.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => ({
        name: match[1] as string,
        index: match.index,
    }));
    const blocks = new Map<string, string>();
    starts.forEach((start, index) => {
        blocks.set(
            start.name,
            jobsText.slice(start.index, starts[index + 1]?.index ?? jobsText.length),
        );
    });
    return blocks;
}

function jobKey(job: Pick<WorkflowJob, "workflow" | "job">): string {
    return `${job.workflow}:${job.job}`;
}

describe("GitHub-hosted runner policy", () => {
    it("inventories every workflow file and every job by hand", () => {
        const workflowDirectory = join(repositoryRoot, ".github", "workflows");
        const discoveredWorkflows = readdirSync(workflowDirectory)
            .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
            .sort();
        expect(discoveredWorkflows).toEqual([...WORKFLOWS].sort());

        const discoveredJobs = WORKFLOWS.flatMap((workflow) =>
            [...jobBlocks(workflowText(workflow)).keys()].map((job) => ({ workflow, job })),
        );
        expect(discoveredJobs.map(jobKey).sort()).toEqual(WORKFLOW_JOBS.map(jobKey).sort());
    });

    it("gives every executable job its declared standard hosted label", () => {
        for (const expected of WORKFLOW_JOBS) {
            const block = jobBlocks(workflowText(expected.workflow)).get(expected.job);
            expect(block, `${jobKey(expected)} must exist`).toBeDefined();
            if ("runner" in expected) {
                expect(block).toContain(`runs-on: ${expected.runner}`);
                expect(block).not.toMatch(/^\s*uses:\s*\.\/\.github\/workflows\//m);
            } else {
                expect(block).toContain(`uses: ${expected.uses}`);
                expect(block).not.toMatch(/^\s*runs-on:/m);
            }
        }
    });

    it("rejects self-hosted labels, expressions, and non-standard runner labels", () => {
        const allowed = new Set<HostedRunner>(["ubuntu-latest", "windows-latest", "macos-latest"]);
        for (const workflow of WORKFLOWS) {
            const text = workflowText(workflow);
            expect(text.toLowerCase()).not.toContain("self-hosted");
            for (const [job, block] of jobBlocks(text)) {
                const match = block.match(/^\s*runs-on:\s*(.+?)\s*$/m);
                if (!match) continue;
                expect(allowed.has(match[1] as HostedRunner), `${workflow}:${job} runner`).toBe(
                    true,
                );
            }
        }
    });

    it("keeps the deleted self-hosted bootstrap out of workflows and the tree", () => {
        const removedPaths = [
            join(repositoryRoot, ".github", "actions", "bootstrap-self-hosted", "action.yml"),
            join(repositoryRoot, ".github", "scripts", "bootstrap-self-hosted-linux.sh"),
            join(repositoryRoot, ".github", "scripts", "bootstrap-self-hosted-windows.ps1"),
            join(repositoryRoot, "docs", "self-hosted-ci-bootstrap.md"),
        ];
        expect(removedPaths.filter(existsSync)).toEqual([]);
        for (const workflow of WORKFLOWS) {
            expect(workflowText(workflow)).not.toContain("bootstrap-self-hosted");
        }
    });

    it("restores pull-request validation now that public jobs are isolated", () => {
        expect(workflowText("ci.yml")).toMatch(/^\s{2}pull_request:\s*$/m);
    });
});

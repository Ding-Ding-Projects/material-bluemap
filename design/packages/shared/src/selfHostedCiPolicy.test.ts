import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

interface SelfHostedJob {
    readonly workflow: string;
    readonly job: string;
    readonly runner: "Linux" | "Windows";
    readonly profile: string;
}

/**
 * Completeness guard, intentionally hand-written. A pattern that tries to guess
 * which jobs matter can stop matching when a job is renamed; this list must be
 * edited in the same commit as every self-hosted job addition or rename.
 */
const SELF_HOSTED_JOBS: readonly SelfHostedJob[] = [
    { workflow: "build-jars.yml", job: "build", runner: "Linux", profile: "java-build" },
    { workflow: "ci.yml", job: "workflows", runner: "Linux", profile: "workflow-lint" },
    { workflow: "ci.yml", job: "check", runner: "Linux", profile: "workspace" },
    { workflow: "ci.yml", job: "package", runner: "Windows", profile: "windows-package" },
    {
        workflow: "ci.yml",
        job: "config-java-roundtrip",
        runner: "Linux",
        profile: "java-roundtrip",
    },
    { workflow: "ci.yml", job: "test-world", runner: "Linux", profile: "test-world" },
    { workflow: "ci.yml", job: "screenshots", runner: "Linux", profile: "screenshots" },
    { workflow: "ci.yml", job: "release", runner: "Linux", profile: "release" },
    { workflow: "pages.yml", job: "build", runner: "Linux", profile: "pages-build" },
    { workflow: "pages.yml", job: "deploy", runner: "Linux", profile: "action-only" },
];

const LINUX_PROFILE_PLANS = {
    "workflow-lint": {
        fakeMissing: "git,curl,tar,gzip,sha256sum,awk,sed,shellcheck,actionlint",
        aptPackages: "git curl tar gzip coreutils gawk sed",
        tools: ["shellcheck 0.11.0", "actionlint 1.7.12"],
    },
    workspace: {
        fakeMissing: "git,tar,gzip",
        aptPackages: "git tar gzip",
        tools: [],
    },
    "java-build": {
        fakeMissing: "git,tar,gzip",
        aptPackages: "git tar gzip",
        tools: [],
    },
    "java-roundtrip": {
        fakeMissing: "git,find,tar,gzip",
        aptPackages: "git findutils tar gzip",
        tools: [],
    },
    "test-world": {
        fakeMissing: "git,find,sed,zip,tar,gzip",
        aptPackages: "git findutils sed zip tar gzip",
        tools: [],
    },
    screenshots: {
        fakeMissing: "git,find,pkill,unzip,xvfb-run,xauth,ldconfig,libgtk-3.so.0,tar,gzip",
        aptPackages: "git findutils procps unzip xvfb xauth libc-bin libgtk-3-0t64 tar gzip",
        tools: [],
    },
    release: {
        fakeMissing: "git,curl,tar,gzip,sha256sum,find,awk,grep,zip,gh",
        aptPackages: "git curl tar gzip coreutils findutils gawk grep zip",
        tools: ["gh 2.97.0"],
    },
    "pages-build": {
        fakeMissing: "git,curl,tar,gzip,sha256sum,awk,gh",
        aptPackages: "git curl tar gzip coreutils gawk",
        tools: ["gh 2.97.0"],
    },
    "action-only": {
        fakeMissing: "",
        aptPackages: null,
        tools: [],
    },
} as const;

function workflowText(name: string): string {
    return readFileSync(join(repositoryRoot, ".github", "workflows", name), "utf8");
}

function jobBlocks(text: string): Map<string, string> {
    const starts = [...text.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => ({
        name: match[1] as string,
        index: match.index,
    }));
    const blocks = new Map<string, string>();
    starts.forEach((start, index) => {
        blocks.set(start.name, text.slice(start.index, starts[index + 1]?.index ?? text.length));
    });
    return blocks;
}

describe("self-hosted CI dependency policy", () => {
    it("inventories every self-hosted job and no hosted job by hand", () => {
        const discovered: string[] = [];
        for (const workflow of [
            "build-jars.yml",
            "ci.yml",
            "pages.yml",
            "render-private-world.yml",
            "render-shard-wave.yml",
            "render-world.yml",
            "scheduled-render.yml",
        ]) {
            for (const [job, block] of jobBlocks(workflowText(workflow))) {
                if (/runs-on:\s*\[self-hosted,\s*(Linux|Windows),\s*X64\]/.test(block)) {
                    discovered.push(`${workflow}:${job}`);
                }
            }
        }
        expect(discovered.sort()).toEqual(
            SELF_HOSTED_JOBS.map(({ workflow, job }) => `${workflow}:${job}`).sort(),
        );
    });

    it("runs the exact declared bootstrap profile in every self-hosted job", () => {
        for (const expected of SELF_HOSTED_JOBS) {
            const block = jobBlocks(workflowText(expected.workflow)).get(expected.job);
            expect(block, `${expected.workflow}:${expected.job} must exist`).toBeDefined();
            expect(block).toContain(`runs-on: [self-hosted, ${expected.runner}, X64]`);
            expect(block).toContain("uses: ./.github/actions/bootstrap-self-hosted");
            expect(block).toContain(`profile: ${expected.profile}`);
        }
    });

    it("never exposes a self-hosted workflow to pull_request", () => {
        for (const workflow of new Set(SELF_HOSTED_JOBS.map(({ workflow }) => workflow))) {
            expect(workflowText(workflow)).not.toMatch(/^\s{2}pull_request:/m);
        }
    });

    it("keeps every non-self-hosted render template on hosted runners", () => {
        for (const workflow of [
            "render-private-world.yml",
            "render-shard-wave.yml",
            "render-world.yml",
            "scheduled-render.yml",
        ]) {
            expect(workflowText(workflow)).not.toContain("self-hosted");
        }
    });

    it("proves every Linux profile's exact missing-dependency plan without installing", () => {
        const script = join(repositoryRoot, ".github", "scripts", "bootstrap-self-hosted-linux.sh");
        const bash =
            process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";
        if (!existsSync(bash) && process.platform === "win32") return;
        for (const [profile, plan] of Object.entries(LINUX_PROFILE_PLANS)) {
            const output = execFileSync(
                bash,
                [
                    script.replaceAll("\\", "/"),
                    profile,
                    "--dry-run",
                    "--fake-missing",
                    plan.fakeMissing,
                ],
                { encoding: "utf8" },
            );
            if (plan.aptPackages === null) {
                expect(output).not.toContain("DRY-RUN apt packages:");
            } else {
                expect(output).toContain(`DRY-RUN apt packages: ${plan.aptPackages}`);
            }
            for (const tool of plan.tools) {
                expect(output).toContain(`DRY-RUN install ${tool}`);
            }
            expect(output).toContain(`bootstrap[${profile}]: complete`);
        }
    });

    it.runIf(process.platform === "win32")(
        "exercises the Windows bootstrap's missing-git plan without installing",
        () => {
            const script = join(
                repositoryRoot,
                ".github",
                "scripts",
                "bootstrap-self-hosted-windows.ps1",
            );
            const output = execFileSync(
                "powershell.exe",
                [
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    script,
                    "-Profile",
                    "windows-package",
                    "-DryRun",
                    "-FakeMissing",
                    "git",
                ],
                { encoding: "utf8" },
            );
            expect(output).toContain("DRY-RUN install git 2.55.0.3");
            expect(output).toContain("bootstrap[windows-package]: complete");
        },
    );
});

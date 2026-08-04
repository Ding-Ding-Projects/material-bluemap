/**
 * Choosing between the two credentials, and driving a render on either.
 *
 * The four cases the feature promises: `gh` absent, `gh` present but signed out, `gh`
 * present and signed in, and the in-app token preferred when it works. Every one of them
 * runs against a fake process runner and a recording fake of the API, so nothing here
 * needs `gh` installed or a network.
 *
 * The property that matters most is not which route wins - it is that **one route drives
 * everything**. A sync that dispatched on one credential and downloaded on another would
 * work on a machine where both are authorised and fail halfway through on one where only
 * one is, with a message about the download that is really about the credential.
 */

import { describe, expect, it } from "vitest";
import { RecordingGitHub, artifactJson, jobJson, repositoryJson, runJson } from "./recordingGitHub.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "./gh.js";
import { ghTransport, resolveTransport, sessionTransport } from "./transport.js";

const OWNER = "o";
const REPO = "r";
const WORKFLOW = "render-world.yml";
const API = "https://api.test";
const TOKEN = "t0k3n-that-must-never-cross";

const WORKFLOW_JSON = { id: 1, name: "Render world", state: "active", path: ".github/workflows/render-world.yml" };

interface Call {
    readonly args: readonly string[];
    readonly input: string | null;
}

interface FakeRunner extends ProcessRunner {
    readonly calls: Call[];
}

function fakeRunner(
    answers: Readonly<Record<string, Partial<ProcessResult>>>,
    toFile: Partial<ProcessToFileResult> = {},
): FakeRunner {
    const calls: Call[] = [];
    const answer = (args: readonly string[]): ProcessResult => {
        // Longest key first, so `repos/o/r/actions/runs/7` wins over `repos/o/r`.
        const key = Object.keys(answers)
            .sort((left, right) => right.length - left.length)
            .find((candidate) => args.some((arg) => arg.includes(candidate)));
        const found = key === undefined ? {} : answers[key];
        return { started: true, code: 0, stdout: "", stderr: "", ...found };
    };
    return {
        calls,
        run(_command, args, options) {
            calls.push({ args: [...args], input: options?.input ?? null });
            return Promise.resolve(answer(args));
        },
        runToFile(_command, args) {
            calls.push({ args: [...args], input: null });
            return Promise.resolve({ started: true, code: 0, bytes: 64, stderr: "", ...toFile });
        },
    };
}

/** A `gh` that is signed in and answers every endpoint a probe or a loop asks for. */
function readyGh(extra: Readonly<Record<string, Partial<ProcessResult>>> = {}): FakeRunner {
    return fakeRunner({
        "--version": { stdout: "gh version 2.62.0\n" },
        status: { code: 0, stdout: "✓ Logged in to github.com account octocat (keyring)\n" },
        [`actions/workflows/${WORKFLOW}`]: { stdout: JSON.stringify(WORKFLOW_JSON) },
        ...extra,
    });
}

const MISSING_GH = fakeRunner({
    "--version": { started: false, code: null, stderr: "spawn gh ENOENT" },
});

function signedOutGh(): FakeRunner {
    return fakeRunner({
        "--version": { stdout: "gh version 2.62.0\n" },
        status: { code: 1, stderr: "You are not logged into any GitHub hosts.\n" },
    });
}

function apiWith(workflowStatus: number): RecordingGitHub {
    return new RecordingGitHub().on(
        "GET",
        /\/actions\/workflows\/render-world\.yml$/,
        workflowStatus === 200
            ? { status: 200, json: WORKFLOW_JSON }
            : { status: workflowStatus, json: { message: "no" } },
    );
}

function resolve(options: {
    token: string | null;
    runner: ProcessRunner;
    github: RecordingGitHub;
    prefer?: "session" | "gh";
}) {
    return resolveTransport({
        owner: OWNER,
        repo: REPO,
        workflowFile: WORKFLOW,
        token: options.token,
        account: "in-app-user",
        fetch: options.github.fetch,
        runner: options.runner,
        apiBase: API,
        ...(options.prefer === undefined ? {} : { prefer: options.prefer }),
    });
}

/* -------------------------------------------------------------------------- */

describe("the in-app sign-in is preferred when it works", () => {
    it("chooses it, and does not spawn gh at all", async () => {
        const runner = readyGh();
        const github = apiWith(200);

        const resolved = await resolve({ token: TOKEN, runner, github });

        expect(resolved.report.route).toBe("session");
        expect(resolved.transport?.route).toBe("session");
        expect(resolved.report.describe).toContain("in-app-user");
        expect(resolved.report.canUpload).toBe(true);
        // Running two extra processes to describe a route that will not be used costs a
        // person time on every single sync for information nobody asked for.
        expect(runner.calls).toHaveLength(0);
    });

    it("uses gh instead when the caller asked for it explicitly", async () => {
        const runner = readyGh();
        const github = apiWith(200);

        const resolved = await resolve({ token: TOKEN, runner, github, prefer: "gh" });

        expect(resolved.report.route).toBe("gh");
        expect(resolved.report.session.reason).toContain("explicitly");
    });
});

describe("gh is the fallback, and it is a real one", () => {
    it("falls back when the in-app token cannot see the workflow, and says why", async () => {
        const runner = readyGh();
        const github = apiWith(403);

        const resolved = await resolve({ token: TOKEN, runner, github });

        expect(resolved.report.route).toBe("gh");
        expect(resolved.transport?.route).toBe("gh");
        expect(resolved.report.gh.account).toBe("octocat");
        // The message names both credentials: somebody debugging a permission problem
        // cannot act on "denied" when their machine holds two GitHub sign-ins.
        expect(resolved.report.describe).toContain("octocat");
        expect(resolved.report.describe).toContain("permission");
        expect(resolved.report.session.usable).toBe(false);
    });

    it("works with no in-app sign-in at all, and can publish a world as well as render one", async () => {
        const runner = readyGh();
        const github = apiWith(200);

        const resolved = await resolve({ token: null, runner, github });

        expect(resolved.report.route).toBe("gh");
        expect(resolved.report.ready).toBe(true);
        // The transfer is route-aware now - one packer, two transports - so this is a real
        // fallback rather than a route that can start a render and then refuse the upload
        // it needs. Somebody signed in to `gh` and not to the application is not stuck.
        expect(resolved.report.canUpload).toBe(true);
        expect(resolved.transport?.canUpload).toBe(true);
        expect(github.calls).toHaveLength(0);
    });
});

describe("when neither can drive it", () => {
    it("says gh is not installed, and names the other reason too", async () => {
        const resolved = await resolve({ token: null, runner: MISSING_GH, github: apiWith(200) });

        expect(resolved.transport).toBeNull();
        expect(resolved.report.ready).toBe(false);
        expect(resolved.report.gh.availability).toBe("not-installed");
        expect(resolved.report.describe).toContain("Settings");
        expect(resolved.report.describe).toContain("PATH");
    });

    it("says gh is installed but signed out, which is a different remedy", async () => {
        const resolved = await resolve({ token: null, runner: signedOutGh(), github: apiWith(200) });

        expect(resolved.transport).toBeNull();
        expect(resolved.report.gh.availability).toBe("signed-out");
        expect(resolved.report.describe).toContain("gh auth login");
        expect(resolved.report.describe).toContain("terminal");
    });

    it("reports both refusals when gh is signed in but cannot see the workflow either", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.62.0\n" },
            status: { code: 0, stdout: "✓ Logged in to github.com account octocat\n" },
            [`actions/workflows/${WORKFLOW}`]: { code: 1, stderr: "gh: Not Found (HTTP 404)\n" },
        });

        const resolved = await resolve({ token: TOKEN, runner, github: apiWith(403) });

        expect(resolved.transport).toBeNull();
        expect(resolved.report.gh.usable).toBe(false);
        expect(resolved.report.gh.reason).toContain("404");
        expect(resolved.report.session.reason).toContain("403");
    });
});

describe("both transports answer the same questions the same way", () => {
    it("the gh route parses a run and its jobs exactly as the API route does", async () => {
        const run = runJson({ id: 7, status: "completed", conclusion: "failure" });
        const jobs = { jobs: [jobJson({ id: 42, name: "Wave 1", status: "completed", conclusion: "failure" })] };

        const github = new RecordingGitHub()
            .on("GET", /\/actions\/runs\/7$/, { status: 200, json: run })
            .on("GET", "/actions/runs/7/jobs", { status: 200, json: jobs });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });

        const runner = readyGh({
            "actions/runs/7/jobs": { stdout: JSON.stringify(jobs) },
            "actions/runs/7": { stdout: JSON.stringify(run) },
        });
        const gh = ghTransport({ runner });

        expect(await gh.readRun(OWNER, REPO, 7)).toEqual(await session.readRun(OWNER, REPO, 7));
        expect(await gh.readRunJobs(OWNER, REPO, 7)).toEqual(await session.readRunJobs(OWNER, REPO, 7));
    });

    it("the gh route reads artifacts, the default branch and a release's asset", async () => {
        const runner = readyGh({
            "actions/runs/7/artifacts": {
                stdout: JSON.stringify({
                    artifacts: [artifactJson({ id: 9, name: "rendered-map", bytes: 10 })],
                }),
            },
            "releases/tags/v1": {
                stdout: JSON.stringify({ assets: [{ name: "world.zip", state: "uploaded" }] }),
            },
            "repos/o/r": {
                stdout: JSON.stringify(repositoryJson({ owner: OWNER, repo: REPO, isPrivate: true, defaultBranch: "trunk" })),
            },
        });
        const gh = ghTransport({ runner });

        expect((await gh.listRunArtifacts(OWNER, REPO, 7))[0]?.name).toBe("rendered-map");
        expect(await gh.readDefaultBranch(OWNER, REPO)).toBe("trunk");
        expect(await gh.releaseHasAsset(OWNER, REPO, "v1", "world.zip")).toBe(true);
        expect(await gh.releaseHasAsset(OWNER, REPO, "v1", "other.zip")).toBe(false);
    });

    it("the gh route treats an unreadable release as gone, so the world is uploaded again", async () => {
        const runner = readyGh({ "releases/tags/v1": { code: 1, stderr: "gh: Not Found (HTTP 404)\n" } });
        expect(await ghTransport({ runner }).releaseHasAsset(OWNER, REPO, "v1", "world.zip")).toBe(false);
    });

    it("the gh route dispatches with the ref and the inputs as one JSON body", async () => {
        const runner = readyGh();
        await ghTransport({ runner }).dispatchWorkflow(OWNER, REPO, WORKFLOW, "main", { "map-id": "world" });

        const dispatch = runner.calls.find((call) => call.args.some((arg) => arg.includes("/dispatches")));
        expect(JSON.parse(dispatch?.input ?? "{}")).toEqual({
            ref: "main",
            inputs: { "map-id": "world" },
        });
    });

    it("the gh route answers null for a log it cannot read, rather than failing the report", async () => {
        const runner = readyGh({ "actions/jobs/42/logs": { code: 1, stderr: "gh: Gone (HTTP 410)\n" } });
        expect(await ghTransport({ runner }).readJobLogTail(OWNER, REPO, 42)).toBeNull();
    });

    it("the gh route reads a plain-text log that gh would not give it as JSON", async () => {
        const lines = Array.from({ length: 100 }, (_, index) => `line ${String(index)}`).join("\n");
        const runner = readyGh({ "actions/jobs/42/logs": { stdout: lines } });
        const tail = await ghTransport({ runner }).readJobLogTail(OWNER, REPO, 42, 3);
        expect(tail).toBe("line 97\nline 98\nline 99");
    });
});

/**
 * The transfer, which is the only part of the interface the two routes implement
 * differently - and therefore the only part where they could disagree about what a release
 * rule means. Each property below is asserted against `gh`'s argv rather than against a
 * mock's call count, because argv is what actually reaches the executable.
 */
describe("the transfer is route-aware, and both routes obey the same release rules", () => {
    const RELEASE = { assets: [] as unknown[], id: 5, tag_name: "v1", html_url: "https://github.test/v1" };

    it("the gh route creates a prerelease that never becomes the repository's latest", async () => {
        const runner = readyGh({ "releases/tags/v1": { code: 1, stderr: "gh: Not Found (HTTP 404)\n" } });
        // Answered as missing on the pre-check and present on the read-back, which is what
        // creating a release actually looks like from here.
        let seen = 0;
        const inner = runner.run.bind(runner);
        runner.run = (command, args, options) => {
            if (args.some((arg) => arg.includes("releases/tags/v1")) && (seen += 1) > 1) {
                runner.calls.push({ args: [...args], input: null });
                return Promise.resolve({ started: true, code: 0, stdout: JSON.stringify(RELEASE), stderr: "" });
            }
            return inner(command, args, options);
        };

        const release = await ghTransport({ runner }).createRelease(OWNER, REPO, "v1", "Backup: w", "notes");

        expect(release).toEqual({ id: 5, tag: "v1", htmlUrl: "https://github.test/v1" });
        const create = runner.calls.find((call) => call.args[0] === "release" && call.args[1] === "create");
        expect(create?.args).toContain("--prerelease");
        // A stored world quietly becoming somebody's latest release would redirect their
        // installer link at a Minecraft save.
        expect(create?.args).toContain("--latest=false");
        expect(create?.args).toEqual(expect.arrayContaining(["--repo", `${OWNER}/${REPO}`]));
        // Never a shell string, and never a token: the notes and the title are separate argv
        // entries, so a quote in a world's name cannot become part of a command.
        expect(create?.args).toContain("notes");
        expect(create?.args.some((arg) => arg.includes("--show-token"))).toBe(false);
    });

    it("the gh route refuses a tag that already exists rather than adopting it", async () => {
        const runner = readyGh({ "releases/tags/v1": { stdout: JSON.stringify(RELEASE) } });

        await expect(
            ghTransport({ runner }).createRelease(OWNER, REPO, "v1", "Backup: w", "notes"),
        ).rejects.toThrow(/already has a release tagged v1/);
        // The append-only rule: nothing was created, so yesterday's upload is untouched.
        expect(runner.calls.some((call) => call.args[1] === "create")).toBe(false);
    });

    it("the gh route uploads with --clobber, so a truncated part can be replaced", async () => {
        const runner = readyGh();
        await ghTransport({ runner }).uploadReleaseAsset({
            release: { id: 5, tag: "v1", htmlUrl: "" },
            owner: OWNER,
            repo: REPO,
            assetName: "world.zip",
            filePath: "/tmp/staged/world.zip",
            bytes: 10,
        });

        const upload = runner.calls.find((call) => call.args[1] === "upload");
        expect(upload?.args.slice(0, 4)).toEqual(["release", "upload", "v1", "/tmp/staged/world.zip"]);
        expect(upload?.args).toContain("--clobber");
    });

    it("the gh route refuses a staged file whose name is not the asset name", async () => {
        const runner = readyGh();
        // `gh release upload` names the asset after the basename, so this would publish a
        // part under a name the Cheap LFS pointer does not mention.
        await expect(
            ghTransport({ runner }).uploadReleaseAsset({
                release: { id: 5, tag: "v1", htmlUrl: "" },
                owner: OWNER,
                repo: REPO,
                assetName: "world.zip.000-abc",
                filePath: "/tmp/staged/world.zip.000",
                bytes: 10,
            }),
        ).rejects.toThrow(/a restore cannot find/);
        expect(runner.calls.some((call) => call.args[1] === "upload")).toBe(false);
    });

    it("both routes list only the assets GitHub calls uploaded", async () => {
        const assets = [
            { id: 1, name: "world.zip", size: 1024, state: "uploaded" },
            // A half-sent asset. Skipping it because a name matched is how a resumed upload
            // leaves a truncated part that nothing notices until a restore.
            { id: 2, name: "half.zip", size: 8, state: "starter" },
        ];
        const github = new RecordingGitHub().on("GET", "/releases/tags/v1", {
            status: 200,
            json: { ...RELEASE, assets },
        });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });
        const gh = ghTransport({ runner: readyGh({ "releases/tags/v1": { stdout: JSON.stringify({ ...RELEASE, assets }) } }) });

        for (const transport of [session, gh]) {
            const listed = await transport.listReleaseAssets(OWNER, REPO, "v1");
            expect([...listed.keys()]).toEqual(["world.zip"]);
            expect(listed.get("world.zip")?.size).toBe(1024);
            expect(await transport.releaseHasAsset(OWNER, REPO, "v1", "half.zip")).toBe(false);
        }
    });

    it("both routes read the same four facts about a repository", async () => {
        const json = repositoryJson({ owner: OWNER, repo: REPO, isPrivate: false, canWrite: true });
        const github = new RecordingGitHub().on("GET", /\/repos\/o\/r$/, { status: 200, json });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });
        const gh = ghTransport({ runner: readyGh({ "repos/o/r": { stdout: JSON.stringify(json) } }) });

        // Parsed by `main/backup/`'s own reader on both sides, so "PUBLIC" cannot come to
        // mean two different things depending on which credential asked.
        expect(await gh.readRepository(OWNER, REPO)).toEqual(await session.readRepository(OWNER, REPO));
        expect((await gh.readRepository(OWNER, REPO)).private).toBe(false);
    });
});

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
        status: {
            code: 0,
            stdout: "✓ Logged in to github.com account octocat (keyring)\n  - Active account: true\n",
        },
        ".login": { code: 0, stdout: "octocat\n" },
        [`actions/workflows/${WORKFLOW}`]: { stdout: JSON.stringify(WORKFLOW_JSON) },
        ...extra,
    });
}

function cliTransport(runner: ProcessRunner, account = "octocat", host = "github.com") {
    return ghTransport({ runner, account, host });
}

/** Stateful gh account/release machine for the identity boundary tests below. */
function accountAwareRunner(options: {
    readonly host?: string;
    readonly accounts: readonly string[];
    readonly active: string;
    readonly switchCode?: number;
    readonly switchTakes?: boolean;
    readonly effectiveIdentity?: string;
    readonly releaseCreateCode?: number;
}): FakeRunner {
    const calls: Call[] = [];
    const host = options.host ?? "github.com";
    let active = options.active;
    let releaseExists = false;
    const result = (
        code = 0,
        stdout = "",
        stderr = "",
    ): Promise<ProcessResult> => Promise.resolve({ started: true, code, stdout, stderr });
    const statusJson = (): string =>
        JSON.stringify({
            hosts: {
                [host]: options.accounts.map((login) => ({
                    active: login === active,
                    gitProtocol: "https",
                    host,
                    login,
                    scopes: "repo, workflow",
                    state: "success",
                    tokenSource: "keyring",
                })),
            },
        });

    return {
        calls,
        async run(_command, args, runOptions) {
            calls.push({ args: [...args], input: runOptions?.input ?? null });
            if (args.includes("--version")) return await result(0, "gh version 2.96.0\n");
            if (args[0] === "auth" && args[1] === "status") return await result(0, statusJson());
            if (args[0] === "auth" && args[1] === "switch") {
                const code = options.switchCode ?? 0;
                if (code === 0 && options.switchTakes !== false) active = args[5] ?? active;
                return await result(code, "", code === 0 ? "" : "switch refused");
            }
            if (args[0] === "api" && args.includes(".login")) {
                return await result(0, `${options.effectiveIdentity ?? active}\n`);
            }
            if (args[0] === "api" && args.some((arg) => arg.includes("actions/workflows/"))) {
                return await result(0, JSON.stringify(WORKFLOW_JSON));
            }
            if (args[0] === "api" && args.some((arg) => arg.includes("releases/tags/v1"))) {
                return releaseExists
                    ? await result(
                          0,
                          JSON.stringify({ id: 5, tag_name: "v1", html_url: "https://example.test/v1", assets: [] }),
                      )
                    : await result(1, "", "gh: Not Found (HTTP 404)\n");
            }
            if (args[0] === "release" && args[1] === "create") {
                const code = options.releaseCreateCode ?? 0;
                if (code === 0) releaseExists = true;
                return await result(code, "", code === 0 ? "" : "release refused");
            }
            if (args[0] === "release" && args[1] === "upload") return await result();
            return await result();
        },
        runToFile() {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
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
    account?: string;
}) {
    return resolveTransport({
        owner: OWNER,
        repo: REPO,
        workflowFile: WORKFLOW,
        token: options.token,
        account: options.account ?? "octocat",
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
        expect(resolved.report.describe).toContain("octocat");
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

    it("switches gh to the selected signed-in account before probing instead of falling through", async () => {
        const runner = accountAwareRunner({
            accounts: ["someone-else", "octocat"],
            active: "someone-else",
        });
        const resolved = await resolve({ token: TOKEN, runner, github: apiWith(403), account: "octocat" });

        expect(resolved.report.route).toBe("gh");
        expect(resolved.report.gh.account).toBe("octocat");
        expect(runner.calls.some((call) => call.args.join(" ") === "auth switch --hostname github.com --user octocat")).toBe(
            true,
        );
        expect(resolved.report.describe).toContain("octocat");
    });

    it("refuses a different gh account when the selected account is not signed in", async () => {
        const runner = accountAwareRunner({ accounts: ["someone-else"], active: "someone-else" });
        const resolved = await resolve({ token: TOKEN, runner, github: apiWith(403), account: "octocat" });

        expect(resolved.transport).toBeNull();
        expect(resolved.report.gh.reason).toContain("octocat");
        expect(resolved.report.gh.recovery).toBe("github-settings");
        expect(runner.calls.some((call) => call.args[0] === "release")).toBe(false);
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
            status: { code: 0, stdout: "✓ Logged in to github.com account octocat\n  - Active account: true\n" },
            ".login": { code: 0, stdout: "octocat\n" },
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
        const gh = cliTransport(runner);

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
        const gh = cliTransport(runner);

        expect((await gh.listRunArtifacts(OWNER, REPO, 7))[0]?.name).toBe("rendered-map");
        expect(await gh.readDefaultBranch(OWNER, REPO)).toBe("trunk");
        expect(await gh.releaseHasAsset(OWNER, REPO, "v1", "world.zip")).toBe(true);
        expect(await gh.releaseHasAsset(OWNER, REPO, "v1", "other.zip")).toBe(false);
    });

    it("the gh route treats an unreadable release as gone, so the world is uploaded again", async () => {
        const runner = readyGh({ "releases/tags/v1": { code: 1, stderr: "gh: Not Found (HTTP 404)\n" } });
        expect(await cliTransport(runner).releaseHasAsset(OWNER, REPO, "v1", "world.zip")).toBe(false);
    });

    it("the gh route dispatches with the ref and the inputs as one JSON body", async () => {
        const runner = readyGh();
        await cliTransport(runner).dispatchWorkflow(OWNER, REPO, WORKFLOW, "main", { "map-id": "world" });

        const dispatch = runner.calls.find((call) => call.args.some((arg) => arg.includes("/dispatches")));
        expect(JSON.parse(dispatch?.input ?? "{}")).toEqual({
            ref: "main",
            inputs: { "map-id": "world" },
        });
    });

    it("the gh route answers null for a log it cannot read, rather than failing the report", async () => {
        const runner = readyGh({ "actions/jobs/42/logs": { code: 1, stderr: "gh: Gone (HTTP 410)\n" } });
        expect(await cliTransport(runner).readJobLogTail(OWNER, REPO, 42)).toBeNull();
    });

    it("the gh route reads a plain-text log that gh would not give it as JSON", async () => {
        const lines = Array.from({ length: 100 }, (_, index) => `line ${String(index)}`).join("\n");
        const runner = readyGh({ "actions/jobs/42/logs": { stdout: lines } });
        const tail = await cliTransport(runner).readJobLogTail(OWNER, REPO, 42, 3);
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

        const release = await cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes");

        expect(release).toEqual({ id: 5, tag: "v1", htmlUrl: "https://github.test/v1" });
        const create = runner.calls.find((call) => call.args[0] === "release" && call.args[1] === "create");
        expect(create?.args).toContain("--prerelease");
        // A stored world quietly becoming somebody's latest release would redirect their
        // installer link at a Minecraft save.
        expect(create?.args).toContain("--latest=false");
        expect(create?.args).toEqual(expect.arrayContaining(["--repo", `github.com/${OWNER}/${REPO}`]));
        expect(create?.args).not.toContain("--hostname");
        // Never a shell string, and never a token: the notes and the title are separate argv
        // entries, so a quote in a world's name cannot become part of a command.
        expect(create?.args).toContain("notes");
        expect(create?.args.some((arg) => arg.includes("--show-token"))).toBe(false);
    });

    it("the gh route refuses a tag that already exists rather than adopting it", async () => {
        const runner = readyGh({ "releases/tags/v1": { stdout: JSON.stringify(RELEASE) } });

        await expect(
            cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes"),
        ).rejects.toThrow(/already has a release tagged v1/);
        // The append-only rule: nothing was created, so yesterday's upload is untouched.
        expect(runner.calls.some((call) => call.args[1] === "create")).toBe(false);
    });

    it("the gh route uploads with --clobber, so a truncated part can be replaced", async () => {
        const runner = readyGh();
        await cliTransport(runner).uploadReleaseAsset({
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
            cliTransport(runner).uploadReleaseAsset({
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
        const gh = cliTransport(readyGh({ "releases/tags/v1": { stdout: JSON.stringify({ ...RELEASE, assets }) } }));

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
        const gh = cliTransport(readyGh({ "repos/o/r": { stdout: JSON.stringify(json) } }));

        // Parsed by `main/backup/`'s own reader on both sides, so "PUBLIC" cannot come to
        // mean two different things depending on which credential asked.
        expect(await gh.readRepository(OWNER, REPO)).toEqual(await session.readRepository(OWNER, REPO));
        expect((await gh.readRepository(OWNER, REPO)).private).toBe(false);
    });

    it("keeps an enterprise host in --repo and never sends release create the unsupported --hostname flag", async () => {
        const runner = accountAwareRunner({
            host: "ghe.example.com",
            accounts: ["enterprise-user"],
            active: "enterprise-user",
        });

        await cliTransport(runner, "enterprise-user", "ghe.example.com").createRelease(
            OWNER,
            REPO,
            "v1",
            "Backup: w",
            "notes",
        );

        const create = runner.calls.find((call) => call.args[0] === "release" && call.args[1] === "create");
        expect(create?.args).toEqual(expect.arrayContaining(["--repo", `ghe.example.com/${OWNER}/${REPO}`]));
        expect(create?.args).not.toContain("--hostname");
        const identity = runner.calls.find((call) => call.args.includes(".login"));
        expect(identity?.args).toEqual(["api", "--hostname", "ghe.example.com", "user", "--jq", ".login"]);
    });

    it("auto-switches an inactive signed-in account and leaves it active for the whole computer", async () => {
        const runner = accountAwareRunner({ accounts: ["other", "octocat"], active: "other" });

        await cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes");

        expect(runner.calls.some((call) => call.args.join(" ") === "auth switch --hostname github.com --user octocat")).toBe(
            true,
        );
        expect(runner.calls.some((call) => call.args[0] === "release" && call.args[1] === "create")).toBe(true);
    });

    it("does not create a release when the selected account is missing", async () => {
        const runner = accountAwareRunner({ accounts: ["other"], active: "other" });

        await expect(cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes")).rejects.toThrow(
            /octocat is not signed in to gh/,
        );
        expect(runner.calls.some((call) => call.args[0] === "release")).toBe(false);
    });

    it("does not create a release when gh refuses the account switch", async () => {
        const runner = accountAwareRunner({
            accounts: ["other", "octocat"],
            active: "other",
            switchCode: 1,
        });

        await expect(cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes")).rejects.toThrow(
            /switch refused/,
        );
        expect(runner.calls.some((call) => call.args[0] === "release")).toBe(false);
    });

    it("does not create a release when the effective gh identity differs after verification", async () => {
        const runner = accountAwareRunner({
            accounts: ["octocat"],
            active: "octocat",
            effectiveIdentity: "unexpected-user",
        });

        await expect(cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes")).rejects.toThrow(
            /authenticated as unexpected-user, not octocat/,
        );
        expect(runner.calls.some((call) => call.args[0] === "release")).toBe(false);
    });

    it("reports a release-create refusal without retrying under another account", async () => {
        const runner = accountAwareRunner({
            accounts: ["octocat", "other"],
            active: "octocat",
            releaseCreateCode: 1,
        });

        await expect(cliTransport(runner).createRelease(OWNER, REPO, "v1", "Backup: w", "notes")).rejects.toThrow(
            /release refused/,
        );
        expect(runner.calls.filter((call) => call.args[0] === "release" && call.args[1] === "create")).toHaveLength(1);
        expect(runner.calls.some((call) => call.args[0] === "auth" && call.args[1] === "switch")).toBe(false);
    });

    it("rechecks and auto-switches before a resumed upload, with the supported enterprise command shape", async () => {
        const runner = accountAwareRunner({
            host: "ghe.example.com",
            accounts: ["other", "enterprise-user"],
            active: "other",
        });

        await cliTransport(runner, "enterprise-user", "ghe.example.com").uploadReleaseAsset({
            release: { id: 5, tag: "v1", htmlUrl: "" },
            owner: OWNER,
            repo: REPO,
            assetName: "world.zip",
            filePath: "/tmp/world.zip",
            bytes: 10,
        });

        const upload = runner.calls.find((call) => call.args[0] === "release" && call.args[1] === "upload");
        expect(upload?.args).toEqual(expect.arrayContaining(["--repo", `ghe.example.com/${OWNER}/${REPO}`, "--clobber"]));
        expect(upload?.args).not.toContain("--hostname");
        expect(runner.calls.some((call) => call.args.join(" ").includes("auth switch --hostname ghe.example.com"))).toBe(
            true,
        );
    });
});

describe("scheduled render: repository variables, on both routes", () => {
    it("reads a set variable's value", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/variables/CIRENDER_SCHEDULE_CADENCE", {
            status: 200,
            json: { name: "CIRENDER_SCHEDULE_CADENCE", value: "daily" },
        });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });
        const gh = cliTransport(
            readyGh({
                "actions/variables/CIRENDER_SCHEDULE_CADENCE": { stdout: JSON.stringify({ value: "daily" }) },
            }),
        );

        expect(await session.readVariable(OWNER, REPO, "CIRENDER_SCHEDULE_CADENCE")).toBe("daily");
        expect(await gh.readVariable(OWNER, REPO, "CIRENDER_SCHEDULE_CADENCE")).toBe("daily");
    });

    it("reads null, not a refusal, for a variable that was never set", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/variables/CIRENDER_SCHEDULE_CADENCE", {
            status: 404,
            json: { message: "Not Found" },
        });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });
        const gh = cliTransport(
            readyGh({
                "actions/variables/CIRENDER_SCHEDULE_CADENCE": {
                    code: 1,
                    stderr: "gh: Not Found (HTTP 404)",
                },
            }),
        );

        expect(await session.readVariable(OWNER, REPO, "CIRENDER_SCHEDULE_CADENCE")).toBeNull();
        expect(await gh.readVariable(OWNER, REPO, "CIRENDER_SCHEDULE_CADENCE")).toBeNull();
    });

    it("updates an existing variable with PATCH, on both routes", async () => {
        const github = new RecordingGitHub().on("PATCH", "/actions/variables/CIRENDER_SCHEDULE_ENABLED", {
            status: 204,
        });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });
        await session.writeVariable(OWNER, REPO, "CIRENDER_SCHEDULE_ENABLED", "true");
        expect(github.countOf("/actions/variables/CIRENDER_SCHEDULE_ENABLED", "PATCH")).toBe(1);
        expect(github.countOf("/actions/variables", "POST")).toBe(0);

        const runner = readyGh({
            "actions/variables/CIRENDER_SCHEDULE_ENABLED": { code: 0, stdout: "" },
        });
        const gh = cliTransport(runner);
        await gh.writeVariable(OWNER, REPO, "CIRENDER_SCHEDULE_ENABLED", "true");
        const patchCall = runner.calls.find((call) => call.args.includes("-X") && call.args.includes("PATCH"));
        expect(patchCall).toBeDefined();
    });

    it("falls back to creating the variable when the update 404s, on both routes", async () => {
        const github = new RecordingGitHub()
            .on("PATCH", "/actions/variables/CIRENDER_SCHEDULE_ENABLED", {
                status: 404,
                json: { message: "Not Found" },
            })
            .on("POST", "/actions/variables", { status: 201 });
        const session = sessionTransport({ fetch: github.fetch, token: TOKEN, apiBase: API });
        await session.writeVariable(OWNER, REPO, "CIRENDER_SCHEDULE_ENABLED", "true");
        expect(github.countOf("/actions/variables/CIRENDER_SCHEDULE_ENABLED", "PATCH")).toBe(1);
        expect(github.countOf("/actions/variables", "POST")).toBe(1);

        const runner = readyGh({
            "actions/variables/CIRENDER_SCHEDULE_ENABLED": { code: 1, stderr: "gh: Not Found (HTTP 404)" },
            "actions/variables": { code: 0, stdout: "" },
        });
        const gh = cliTransport(runner);
        await gh.writeVariable(OWNER, REPO, "CIRENDER_SCHEDULE_ENABLED", "true");
        expect(runner.calls.some((call) => call.args.includes("POST"))).toBe(true);
    });
});

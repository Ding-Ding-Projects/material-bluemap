/**
 * Publishing a rendered map to GitHub Pages, against a fake process runner.
 *
 * Nothing here spawns `git`, spawns `gh`, or touches the network. That is not a convenience:
 * the cases worth testing are the ones a working machine cannot produce. `gh` missing, `gh`
 * signed out, a publishing branch somebody else wrote, a push that GitHub does not show, a
 * Pages build that errors, and a published URL that answers 404 are all states this has to get
 * right, and every one of them is unreachable on a laptop where the whole thing works.
 *
 * The assertions worth reading twice are the negative ones:
 *
 *  - **A branch with no marker is never pushed to**, whatever else is true.
 *  - **A branch with no marker is never deleted**, checked again at the moment of deletion
 *    rather than trusted from a preflight that ran minutes earlier.
 *  - **No token is ever an argument.** Every spawned command is inspected for one.
 *  - **A site is never reported live** until a request to it answered 200.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PAGES_MARKER_FILE, PAGES_MARKER_TOOL, PagesHost, normaliseBranch, readMarker } from "./hosting.js";
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
    /** `gh api` answers, keyed by the endpoint argument. Absent means 404. */
    readonly api: Map<string, unknown>;
    /** Endpoints that should refuse, with the status to refuse with. */
    readonly refuse: Map<string, number>;
    /** Commands whose exit code is not zero, keyed by the subcommand. */
    readonly failing: Map<string, { code: number; stderr: string }>;
}

interface MachineOptions {
    readonly gh?: "ready" | "signed-out" | "missing";
    readonly git?: boolean;
}

/**
 * A `gh` and a `git` that exist only here.
 *
 * `gh api` is answered from a map keyed by the endpoint, which is the last argument `apiArgs`
 * appends, so a test says what GitHub holds rather than what `gh` prints.
 */
function machine(options: MachineOptions = {}): Machine {
    const calls: Call[] = [];
    const api = new Map<string, unknown>();
    const refuse = new Map<string, number>();
    const failing = new Map<string, { code: number; stderr: string }>();
    const ghState = options.gh ?? "ready";
    const hasGit = options.git !== false;

    function answerGh(args: readonly string[]): ProcessResult {
        if (ghState === "missing") {
            return { started: false, code: null, stdout: "", stderr: "spawn gh ENOENT" };
        }
        if (args[0] === "--version") {
            return { started: true, code: 0, stdout: "gh version 2.62.0\n", stderr: "" };
        }
        if (args[0] === "auth") {
            return ghState === "ready"
                ? {
                      started: true,
                      code: 0,
                      stdout: "Logged in to github.com account octocat (keyring)\n",
                      stderr: "",
                  }
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
            const status = refuse.get(endpoint);
            if (status !== undefined) {
                return { started: true, code: 1, stdout: "", stderr: `gh: refused (HTTP ${String(status)})\n` };
            }
            // A write, which GitHub answers with 204 and no body for most of these. Only a
            // GET is answered out of what the repository is said to hold.
            if (args.includes("-X") && !args.includes("GET")) {
                return { started: true, code: 0, stdout: "", stderr: "" };
            }
            if (!api.has(endpoint)) {
                return { started: true, code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)\n" };
            }
            return { started: true, code: 0, stdout: JSON.stringify(api.get(endpoint)), stderr: "" };
        }
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    function answerGit(args: readonly string[]): ProcessResult {
        if (!hasGit) return { started: false, code: null, stdout: "", stderr: "spawn git ENOENT" };
        const verb = args.find((arg) => !arg.startsWith("-") && !looksLikePath(arg)) ?? "";
        const failure = failing.get(verb);
        if (failure !== undefined) {
            return { started: true, code: failure.code, stdout: "", stderr: failure.stderr };
        }
        if (args.includes("rev-parse")) {
            return { started: true, code: 0, stdout: `${"c".repeat(40)}\n`, stderr: "" };
        }
        if (args.includes("--version")) {
            return { started: true, code: 0, stdout: "git version 2.47.0\n", stderr: "" };
        }
        return { started: true, code: 0, stdout: "", stderr: "" };
    }

    return {
        calls,
        api,
        refuse,
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

/** Good enough to tell `-C C:\x` and `--git-dir` values from a git subcommand. */
function looksLikePath(value: string): boolean {
    return value.includes("/") || value.includes("\\") || value.includes("=");
}

/* -------------------------------------------------------------------------- */
/* A rendered map, invented                                                   */
/* -------------------------------------------------------------------------- */

let root = "";
let storage = "";
let work = "";

const RENDER = "world-abc123";

async function renderAMap(mapIds: readonly string[] = ["world"]): Promise<string> {
    const webRoot = join(storage, RENDER, "web");
    await mkdir(webRoot, { recursive: true });
    await writeFile(
        join(webRoot, "settings.json"),
        JSON.stringify({ version: "5.0", maps: [...mapIds] }),
        "utf8",
    );
    await writeFile(join(webRoot, "index.html"), "<!doctype html>", "utf8");
    for (const id of mapIds) {
        const mapRoot = join(webRoot, "maps", id);
        await mkdir(join(mapRoot, "tiles", "0", "x0"), { recursive: true });
        await writeFile(join(mapRoot, "settings.json"), "{}", "utf8");
        await writeFile(join(mapRoot, "textures.json.gz"), "gz", "utf8");
        await writeFile(join(mapRoot, "tiles", "0", "x0", "z0.prbm.gz"), "tile", "utf8");
    }
    return webRoot;
}

function host(runner: ProcessRunner): PagesHost {
    return new PagesHost({
        storageDir: () => storage,
        workRoot: () => work,
        runner,
        probe: () => Promise.resolve(200),
        sleep: () => Promise.resolve(),
        pollAttempts: 3,
        pollIntervalMs: 0,
        now: () => new Date("2026-08-04T12:00:00.000Z"),
    });
}

function repositoryPayload(options: { private?: boolean; push?: boolean } = {}): unknown {
    return {
        full_name: "octocat/maps",
        private: options.private ?? false,
        html_url: "https://github.com/octocat/maps",
        permissions: { push: options.push ?? true },
    };
}

function markerPayload(renderId: string): unknown {
    return {
        content: Buffer.from(
            JSON.stringify({
                tool: PAGES_MARKER_TOOL,
                version: 1,
                renderId,
                maps: ["world"],
                publishedAt: "2026-08-01T00:00:00.000Z",
            }),
        ).toString("base64"),
    };
}

/** A repository that already carries one of our maps and a built Pages site. */
function readyToRepublish(runner: Machine): void {
    runner.api.set("repos/octocat/maps", repositoryPayload());
    runner.api.set("repos/octocat/maps/branches/gh-pages", { commit: { sha: "c".repeat(40) } });
    runner.api.set(`repos/octocat/maps/contents/${PAGES_MARKER_FILE}?ref=gh-pages`, markerPayload(RENDER));
    runner.api.set("repos/octocat/maps/pages", {
        html_url: "https://octocat.github.io/maps/",
        status: "built",
        source: { branch: "gh-pages", path: "/" },
    });
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-pages-"));
    storage = join(root, "maps");
    work = join(root, "work");
    await mkdir(storage, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */

describe("the branch name", () => {
    it("falls back rather than letting a ref escape into a path it was not meant to be", () => {
        expect(normaliseBranch(undefined)).toBe("gh-pages");
        expect(normaliseBranch("  ")).toBe("gh-pages");
        expect(normaliseBranch("../../refs/heads/main")).toBe("gh-pages");
        expect(normaliseBranch("feature branch")).toBe("gh-pages");
        expect(normaliseBranch("a..b")).toBe("gh-pages");
        expect(normaliseBranch("map-site")).toBe("map-site");
    });
});

describe("the marker", () => {
    it("reads one out of what the contents API answers", () => {
        expect(readMarker(markerPayload("r1"))?.renderId).toBe("r1");
    });

    it("refuses to call somebody else's file ours, however plausible it looks", () => {
        const foreign = {
            content: Buffer.from(JSON.stringify({ tool: "some-other-tool", renderId: "r1" })).toString(
                "base64",
            ),
        };
        expect(readMarker(foreign)).toBeNull();
        expect(readMarker({ content: Buffer.from("not json").toString("base64") })).toBeNull();
        expect(readMarker(null)).toBeNull();
    });
});

describe("the preflight", () => {
    it("reports what publishing would cost without writing a single byte", async () => {
        const webRoot = await renderAMap();
        const runner = machine();
        runner.api.set("repos/octocat/maps", repositoryPayload());

        const report = await host(runner).preflight({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        });

        expect(report.blockers).toEqual([]);
        expect(report.site?.fileCount).toBeGreaterThan(0);
        expect(report.site?.changedSettings).toBe(false);
        expect(report.gh.availability).toBe("ready");

        // The preview really was a preview: the flag the publish would flip is still off and
        // the marker Pages needs is still absent.
        const settings: unknown = JSON.parse(await readFile(join(webRoot, "settings.json"), "utf8"));
        expect((settings as { clientDecompression?: unknown }).clientDecompression).toBeUndefined();
        await expect(readFile(join(webRoot, ".nojekyll"), "utf8")).rejects.toThrow();
    });

    it("blocks on a map whose files the viewer would ask for and not find", async () => {
        await renderAMap();
        await rm(join(storage, RENDER, "web", "maps", "world", "textures.json.gz"));
        const runner = machine();
        runner.api.set("repos/octocat/maps", repositoryPayload());

        const report = await host(runner).preflight({ renderId: RENDER, owner: "octocat", repo: "maps" });
        expect(report.blockers.join(" ")).toContain("textures.json.gz");
    });

    it("blocks on a publishing branch this application did not write", async () => {
        await renderAMap();
        const runner = machine();
        runner.api.set("repos/octocat/maps", repositoryPayload());
        runner.api.set("repos/octocat/maps/branches/gh-pages", { commit: { sha: "abc" } });
        // No marker: the contents endpoint is absent, which the fake answers as a 404.

        const report = await host(runner).preflight({ renderId: RENDER, owner: "octocat", repo: "maps" });
        expect(report.repository?.branchIsOurs).toBe(false);
        expect(report.blockers.join(" ")).toContain("did not write");
    });

    it("says plainly that Pages on a private repository needs a paid plan", async () => {
        await renderAMap();
        const runner = machine();
        runner.api.set("repos/octocat/maps", repositoryPayload({ private: true }));

        const report = await host(runner).preflight({ renderId: RENDER, owner: "octocat", repo: "maps" });
        expect(report.warnings.join(" ")).toContain("paid plan");
    });

    it("says which of the three things gh is, rather than that it is unavailable", async () => {
        await renderAMap();
        const out = await host(machine({ gh: "signed-out" })).preflight({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        });
        expect(out.gh.availability).toBe("signed-out");
        expect(out.blockers.join(" ")).toContain("gh auth login");

        const gone = await host(machine({ gh: "missing" })).preflight({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        });
        expect(gone.gh.availability).toBe("not-installed");
    });

    it("blocks when git is not on this computer, because publishing is a push", async () => {
        await renderAMap();
        const report = await host(machine({ git: false })).preflight({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        });
        expect(report.gitVersion).toBeNull();
        expect(report.blockers.join(" ")).toContain("git is not on this computer");
    });
});

describe("publishing", () => {
    it("refuses without an acknowledgement, and refuses a string that merely looks like one", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);

        const refused = await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        });
        expect(refused.ok).toBe(false);
        expect(refused.ok === false && refused.failure.code).toBe("not-acknowledged");
        expect(runner.calls.some((call) => call.args.includes("push"))).toBe(false);
    });

    it("prepares, stages in batches, force-pushes an orphan, enables Pages and verifies the URL", async () => {
        const webRoot = await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        const events: string[] = [];

        const result = await new PagesHost({
            storageDir: () => storage,
            workRoot: () => work,
            runner,
            probe: () => Promise.resolve(200),
            sleep: () => Promise.resolve(),
            pollAttempts: 2,
            pollIntervalMs: 0,
            onEvent: (event) => events.push(event.type === "phase" ? `phase:${event.phase}` : event.type),
        }).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.status).toBe("live");
        expect(result.report.verified).toBe(true);
        expect(result.report.httpStatus).toBe(200);
        expect(result.report.pushVerified).toBe(true);
        expect(result.report.url).toBe("https://octocat.github.io/maps/");

        // The static-host preparation really did run in write mode this time.
        const settings: unknown = JSON.parse(await readFile(join(webRoot, "settings.json"), "utf8"));
        expect((settings as { clientDecompression?: unknown }).clientDecompression).toBe(true);
        await expect(readFile(join(webRoot, ".nojekyll"), "utf8")).resolves.toBe("");

        const marker: unknown = JSON.parse(await readFile(join(webRoot, PAGES_MARKER_FILE), "utf8"));
        expect((marker as { tool?: string }).tool).toBe(PAGES_MARKER_TOOL);
        expect((marker as { renderId?: string }).renderId).toBe(RENDER);

        // An orphan on the publishing branch, forced, and staged from stdin rather than
        // through a command line that a path could overflow.
        const push = runner.calls.find((call) => call.args.includes("push"));
        expect(push?.args).toContain("--force");
        expect(push?.args).toContain("HEAD:refs/heads/gh-pages");
        const staged = runner.calls.filter((call) => call.args.includes("add"));
        expect(staged.length).toBeGreaterThan(0);
        expect(staged[0]?.args).toContain("--pathspec-from-file=-");
        expect(staged[0]?.input ?? "").toContain(PAGES_MARKER_FILE);

        expect(events).toContain("phase:staging");
        expect(events).toContain("phase:verifying");
        expect(events).toContain("progress");
        expect(events.at(-1)).toBe("finished");
    });

    it("never puts a git directory inside the render output", async () => {
        const webRoot = await renderAMap();
        const runner = machine();
        readyToRepublish(runner);

        await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        await expect(readFile(join(webRoot, ".git", "HEAD"), "utf8")).rejects.toThrow();
        for (const call of runner.calls.filter((entry) => entry.command === "git")) {
            const gitDir = call.args[call.args.indexOf("--git-dir") + 1];
            if (gitDir !== undefined && call.args.includes("--git-dir")) {
                expect(gitDir.startsWith(work)).toBe(true);
            }
        }
    });

    it("refuses to replace a branch it cannot prove it wrote", async () => {
        await renderAMap();
        const runner = machine();
        runner.api.set("repos/octocat/maps", repositoryPayload());
        runner.api.set("repos/octocat/maps/branches/gh-pages", { commit: { sha: "somebody-else" } });

        const result = await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.failure.code).toBe("not-ours");
        expect(runner.calls.some((call) => call.args.includes("push"))).toBe(false);
    });

    it("creates the repository when it does not exist, and only then", async () => {
        await renderAMap();
        const runner = machine();
        runner.api.set("repos/octocat/maps/pages", {
            html_url: "https://octocat.github.io/maps/",
            status: "built",
            source: { branch: "gh-pages", path: "/" },
        });
        runner.api.set("repos/octocat/maps/branches/gh-pages", { commit: { sha: "c".repeat(40) } });

        await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            visibility: "private",
            acknowledgePublish: true,
        });

        const create = runner.calls.find((call) => call.args[0] === "repo" && call.args[1] === "create");
        expect(create?.args).toContain("octocat/maps");
        expect(create?.args).toContain("--private");
    });

    it("does not report a push as landed when GitHub does not show the commit", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        runner.api.set("repos/octocat/maps/branches/gh-pages", { commit: { sha: "a-different-commit" } });
        runner.api.set(
            `repos/octocat/maps/contents/${PAGES_MARKER_FILE}?ref=gh-pages`,
            markerPayload(RENDER),
        );

        const result = await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.report.pushVerified).toBe(false);
        expect(result.ok === true && result.report.notes.join(" ")).toContain("unverified");
    });

    it("does not call a site live when the published URL answers something other than 200", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);

        const result = await new PagesHost({
            storageDir: () => storage,
            workRoot: () => work,
            runner,
            probe: () => Promise.resolve(404),
            sleep: () => Promise.resolve(),
            pollAttempts: 1,
            pollIntervalMs: 0,
        }).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.verified).toBe(false);
        expect(result.report.status).toBe("built");
        expect(result.report.notes.join(" ")).toContain("404");
    });

    it("reports a build that is still queued as queued rather than as finished", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        runner.api.set("repos/octocat/maps/pages", {
            html_url: "https://octocat.github.io/maps/",
            status: "queued",
            source: { branch: "gh-pages", path: "/" },
        });

        const result = await new PagesHost({
            storageDir: () => storage,
            workRoot: () => work,
            runner,
            probe: () => Promise.resolve(null),
            sleep: () => Promise.resolve(),
            pollAttempts: 2,
            pollIntervalMs: 0,
        }).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.report.status).toBe("queued");
        expect(result.ok === true && result.report.verified).toBe(false);
    });

    it("stops rather than pushes when a map would not be servable", async () => {
        await renderAMap();
        await rm(join(storage, RENDER, "web", "maps", "world", "tiles"), { recursive: true });
        const runner = machine();
        readyToRepublish(runner);

        const result = await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.failure.code).toBe("not-servable");
        expect(runner.calls.some((call) => call.args.includes("push"))).toBe(false);
    });

    it("says what to run when gh is signed out, and does not try to drive it", async () => {
        await renderAMap();
        const runner = machine({ gh: "signed-out" });
        const result = await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        expect(result.ok === false && result.failure.code).toBe("gh-signed-out");
        expect(result.ok === false && result.failure.needsGhSignIn).toBe(true);
        expect(runner.calls.some((call) => call.args.includes("login"))).toBe(false);
    });

    it("is safe to run twice, and leaves one record rather than two", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        const publisher = host(runner);
        const request = {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        } as const;

        expect((await publisher.publish(request)).ok).toBe(true);
        expect((await publisher.publish(request)).ok).toBe(true);

        const records = await publisher.records();
        expect(records).toHaveLength(1);
        expect(records[0]?.url).toBe("https://octocat.github.io/maps/");
    });

    it("resumes after the durable checkpoint without staging or pushing the map again", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        const publisher = host(runner);
        const request = {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        } as const;
        expect((await publisher.publish(request)).ok).toBe(true);

        const path = join(work, RENDER, "publish.json");
        const saved = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        saved["stage"] = "waiting";
        await writeFile(path, `${JSON.stringify(saved)}\n`, "utf8");

        const before = runner.calls.length;
        const resumed = await publisher.resume(RENDER);
        expect(resumed.ok).toBe(true);
        const resumedCalls = runner.calls.slice(before);
        expect(resumedCalls.some((call) => call.args.includes("add"))).toBe(false);
        expect(resumedCalls.some((call) => call.args.includes("push"))).toBe(false);
        expect((await publisher.readRecord(RENDER))?.stage).toBe("finished");
    });

    it("counts every real git add and push call across a crash and resume, and reports the skipped stages as skipped rather than as running", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        const events: string[] = [];
        const infoLogs: string[] = [];
        const publisher = new PagesHost({
            storageDir: () => storage,
            workRoot: () => work,
            runner,
            probe: () => Promise.resolve(200),
            sleep: () => Promise.resolve(),
            pollAttempts: 2,
            pollIntervalMs: 0,
            onEvent: (event) => {
                events.push(event.type === "phase" ? `phase:${event.phase}` : event.type);
                if (event.type === "log" && event.level === "info") infoLogs.push(event.message);
            },
        });
        const request = {
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        } as const;

        // The first, uninterrupted publish really does add and push - the baseline this test
        // holds the resumed run against.
        expect((await publisher.publish(request)).ok).toBe(true);
        expect(runner.calls.filter((call) => call.args.includes("add")).length).toBeGreaterThan(0);
        expect(runner.calls.filter((call) => call.args.includes("push")).length).toBe(1);
        expect(events).toContain("phase:staging");
        expect(events).toContain("phase:pushing");

        // Simulate the crash this issue is about: the application died right after the durable
        // "pushing" checkpoint was written, with the real commit from the finished publish
        // already recorded. `resume()` reuses that checkpoint's saved record rather than the
        // one this run just wrote, exactly as an application restart would.
        const path = join(work, RENDER, "publish.json");
        const saved = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        saved["stage"] = "pushing";
        await writeFile(path, `${JSON.stringify(saved)}\n`, "utf8");

        const before = runner.calls.length;
        events.length = 0;
        infoLogs.length = 0;
        const resumed = await publisher.resume(RENDER);
        expect(resumed.ok).toBe(true);

        // The proof the issue asked for: an exact count of real invocations, not a boolean.
        const resumedCalls = runner.calls.slice(before);
        const resumedAddCalls = resumedCalls.filter((call) => call.args.includes("add"));
        const resumedPushCalls = resumedCalls.filter((call) => call.args.includes("push"));
        expect(resumedAddCalls).toHaveLength(0);
        expect(resumedPushCalls).toHaveLength(0);

        // The stages that did no real work are never announced as running...
        expect(events).not.toContain("phase:staging");
        expect(events).not.toContain("phase:pushing");
        // ...and are instead reported as the skip they actually are.
        expect(infoLogs.some((message) => /staged and committed/.test(message))).toBe(true);
        expect(infoLogs.some((message) => /already reached GitHub/.test(message))).toBe(true);

        const report = resumed.ok ? resumed.report : null;
        expect(report?.notes.some((note) => /staged and committed/.test(note))).toBe(true);
        expect(report?.notes.some((note) => /already reached GitHub/.test(note))).toBe(true);
    });

    it("refreshes the recorded Pages status and probes the saved URL again", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        const publisher = new PagesHost({
            storageDir: () => storage,
            workRoot: () => work,
            runner,
            probe: () => Promise.resolve(200),
            sleep: () => Promise.resolve(),
            pollAttempts: 1,
            pollIntervalMs: 0,
        });
        const published = await publisher.publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });
        expect(published.ok).toBe(true);
        runner.api.set("repos/octocat/maps/pages", {
            html_url: "https://octocat.github.io/maps/",
            status: "built",
            source: { branch: "gh-pages", path: "/" },
        });
        const refreshed = await publisher.refreshStatus(RENDER);
        expect(refreshed?.status).toBe("live");
        expect(refreshed?.verified).toBe(true);
        expect((await publisher.readRecord(RENDER))?.status).toBe("live");
    });

    it("never puts a credential on a command line", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        await host(runner).publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        for (const call of runner.calls) {
            for (const arg of call.args) {
                expect(arg).not.toContain("ghp_");
                expect(arg).not.toContain("github_pat_");
                expect(arg.toLowerCase()).not.toContain("--show-token");
            }
        }
        // Authentication for the push is gh's own helper, named rather than a value.
        const push = runner.calls.find((call) => call.args.includes("push"));
        expect(push?.args.join(" ")).toContain("credential.helper=!gh auth git-credential");
    });
});

describe("stopping", () => {
    it("takes Pages down and deletes the branch it published", async () => {
        await renderAMap();
        const runner = machine();
        readyToRepublish(runner);
        const publisher = host(runner);
        await publisher.publish({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
            acknowledgePublish: true,
        });

        const stopped = await publisher.stopHosting({ renderId: RENDER, owner: "octocat", repo: "maps" });

        expect(stopped.ok).toBe(true);
        expect(stopped.ok === true && stopped.report.pagesDisabled).toBe(true);
        expect(stopped.ok === true && stopped.report.branchDeleted).toBe(true);
        expect(await publisher.records()).toEqual([]);

        const deletes = runner.calls.filter((call) => call.args.includes("DELETE"));
        expect(deletes.map((call) => call.args.at(-1))).toEqual([
            "repos/octocat/maps/pages",
            "repos/octocat/maps/git/refs/heads/gh-pages",
        ]);
    });

    it("checks the marker again at the moment of deletion, not only at the preflight", async () => {
        await renderAMap();
        const runner = machine();
        runner.api.set("repos/octocat/maps", repositoryPayload());
        runner.api.set("repos/octocat/maps/branches/gh-pages", { commit: { sha: "somebody-else" } });

        const stopped = await host(runner).stopHosting({
            renderId: RENDER,
            owner: "octocat",
            repo: "maps",
        });

        expect(stopped.ok).toBe(false);
        expect(stopped.ok === false && stopped.failure.code).toBe("not-ours");
        expect(runner.calls.some((call) => call.args.includes("DELETE"))).toBe(false);
    });
});

describe("listing renders", () => {
    it("finds a render with a web root and names the maps it carries", async () => {
        await renderAMap(["world", "nether"]);
        const found = await host(machine()).candidates();
        expect(found).toHaveLength(1);
        expect(found[0]?.renderId).toBe(RENDER);
        expect([...(found[0]?.maps ?? [])].sort()).toEqual(["nether", "world"]);
    });

    it("keeps a render whose settings will not parse, with its problem rather than silently", async () => {
        await renderAMap();
        await writeFile(join(storage, RENDER, "web", "settings.json"), "{ not json", "utf8");
        const found = await host(machine()).candidates();
        expect(found[0]?.problem).not.toBeNull();
    });
});

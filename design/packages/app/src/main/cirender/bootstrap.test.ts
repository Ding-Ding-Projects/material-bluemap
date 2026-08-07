/**
 * Preparing a repository for CI rendering, against a fake GitHub Contents API reached
 * through the real `CiTransport`/`resolveTransport` plumbing - the same route every other
 * `cirender/` feature drives a sync through, exercised here at the one extra job
 * `bootstrap.ts` asks of it: bringing a repository to a state where a render can start.
 *
 * The one property every test here cares about is not "did it write the right bytes" -
 * it is "did it write *only* the right bytes". A bootstrap that quietly touches something
 * it does not own, or writes twice when nothing changed, is the exact failure this module
 * exists to design out; see the module doc comment in `bootstrap.ts`.
 */

import { describe, expect, it } from "vitest";
import {
    CI_BOOTSTRAP_MARKER_FILE,
    CI_BOOTSTRAP_MARKER_TOOL,
    LEGACY_CI_BOOTSTRAP_MARKER_FILE,
    LEGACY_CI_BOOTSTRAP_MARKER_TOOL,
    bootstrapCiRepository,
} from "./bootstrap.js";
import type { CiBootstrapEvent, CiWorkflowTemplate } from "./bootstrap.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "./gh.js";

const OWNER = "octocat";
const REPO = "a-map";
const API = "https://api.test";

const WORKFLOW_A: CiWorkflowTemplate = {
    path: ".github/workflows/render-world.yml",
    content: "name: Render world v1\n",
};
const WORKFLOW_B: CiWorkflowTemplate = {
    path: ".github/workflows/render-shard-wave.yml",
    content: "name: Render shard wave v1\n",
};
const TEMPLATES = [WORKFLOW_A, WORKFLOW_B];
const TEMPLATE_VERSION = "v1";

/* -------------------------------------------------------------------------------------- */
/* A tiny, stateful fake of the GitHub REST endpoints `CiTransport`'s session route calls   */
/* -------------------------------------------------------------------------------------- */

interface FakeFile {
    sha: string;
    content: string;
}

interface FakeRepoOptions {
    readonly private?: boolean;
    readonly canWrite?: boolean;
    /** null = the Actions permissions endpoint answers 403 ("could not be determined"). */
    readonly actionsEnabled?: boolean | null;
    /** null = `/rate_limit` carries no `x-oauth-scopes` header at all. */
    readonly scopes?: readonly string[] | null;
    readonly everCommitted?: boolean;
    readonly files?: Readonly<Record<string, string>>;
}

class FakeRepo {
    private_: boolean;
    canWrite: boolean;
    actionsEnabled: boolean | null;
    scopes: readonly string[] | null;
    everCommitted: boolean;
    readonly files = new Map<string, FakeFile>();
    #shaCounter = 0;

    readonly calls: { method: string; url: string; body: string | null }[] = [];

    constructor(options: FakeRepoOptions = {}) {
        this.private_ = options.private ?? false;
        this.canWrite = options.canWrite ?? true;
        this.actionsEnabled = options.actionsEnabled === undefined ? true : options.actionsEnabled;
        this.scopes = options.scopes === undefined ? ["repo", "workflow"] : options.scopes;
        this.everCommitted = options.everCommitted ?? true;
        for (const [path, content] of Object.entries(options.files ?? {})) {
            this.files.set(path, { sha: this.#nextSha(), content });
        }
    }

    #nextSha(): string {
        this.#shaCounter += 1;
        return `sha-${String(this.#shaCounter)}`;
    }

    putCount(): number {
        return this.calls.filter((call) => call.method === "PUT").length;
    }

    putPaths(): string[] {
        return this.calls
            .filter((call) => call.method === "PUT")
            .map((call) => decodeURIComponent(call.url.slice(call.url.indexOf("/contents/") + "/contents/".length)));
    }

    readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? init.body : null;
        this.calls.push({ method, url, body });

        const repoUrl = `${API}/repos/${OWNER}/${REPO}`;

        if (url === `${API}/rate_limit`) {
            const headers = new Headers({ "content-type": "application/json" });
            if (this.scopes !== null) headers.set("x-oauth-scopes", this.scopes.join(", "));
            return new Response(JSON.stringify({ resources: {} }), { status: 200, headers });
        }

        if (url === repoUrl && method === "GET") {
            return new Response(
                JSON.stringify({
                    full_name: `${OWNER}/${REPO}`,
                    name: REPO,
                    owner: { login: OWNER },
                    private: this.private_,
                    permissions: { push: this.canWrite },
                    html_url: `https://github.test/${OWNER}/${REPO}`,
                }),
                { status: 200 },
            );
        }

        if (url === `${repoUrl}/commits?per_page=1` && method === "GET") {
            if (!this.everCommitted) {
                return new Response(JSON.stringify({ message: "Git Repository is empty." }), { status: 409 });
            }
            return new Response(JSON.stringify([{ sha: "head-sha" }]), { status: 200 });
        }

        if (url === `${repoUrl}/actions/permissions` && method === "GET") {
            if (this.actionsEnabled === null) {
                return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
            }
            return new Response(JSON.stringify({ enabled: this.actionsEnabled }), { status: 200 });
        }

        const contentsPrefix = `${repoUrl}/contents/`;
        if (url.startsWith(contentsPrefix)) {
            const path = decodeURIComponent(url.slice(contentsPrefix.length));
            if (method === "GET") {
                const found = this.files.get(path);
                if (found === undefined) {
                    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
                }
                return new Response(
                    JSON.stringify({ sha: found.sha, content: Buffer.from(found.content, "utf8").toString("base64") }),
                    { status: 200 },
                );
            }
            if (method === "PUT") {
                const parsed = JSON.parse(body ?? "{}") as { message: string; content: string; sha?: string };
                const decoded = Buffer.from(parsed.content, "base64").toString("utf8");
                const existing = this.files.get(path);
                if (existing === undefined && parsed.sha !== undefined) {
                    return new Response(JSON.stringify({ message: "sha given for a file that does not exist" }), {
                        status: 422,
                    });
                }
                if (existing !== undefined && parsed.sha !== existing.sha) {
                    return new Response(JSON.stringify({ message: "sha does not match" }), { status: 409 });
                }
                const sha = this.#nextSha();
                this.files.set(path, { sha, content: decoded });
                this.everCommitted = true;
                return new Response(
                    JSON.stringify({ content: { sha }, commit: { sha: `commit-${sha}` } }),
                    { status: 200 },
                );
            }
        }

        return new Response(JSON.stringify({ message: `no fake route for ${method} ${url}` }), { status: 404 });
    };

    /** Seeds a marker file naming `paths` as this application's own. */
    seedMarker(paths: readonly string[]): void {
        this.files.set(CI_BOOTSTRAP_MARKER_FILE, {
            sha: this.#nextSha(),
            content: JSON.stringify({
                tool: CI_BOOTSTRAP_MARKER_TOOL,
                version: 1,
                templateVersion: "v0",
                files: paths,
                preparedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
    }
}

const NEVER_RUN: ProcessRunner = {
    run(): Promise<ProcessResult> {
        return Promise.reject(new Error("gh should never be invoked when the in-app session is available"));
    },
    runToFile(): Promise<ProcessToFileResult> {
        return Promise.reject(new Error("gh should never be invoked when the in-app session is available"));
    },
};

function run(
    repo: FakeRepo,
    overrides: Partial<{ templates: readonly CiWorkflowTemplate[]; templateVersion: string; token: string | null }> = {},
): ReturnType<typeof bootstrapCiRepository> {
    return bootstrapCiRepository(
        { owner: OWNER, repo: REPO },
        {
            token: overrides.token ?? "t0k3n",
            fetch: repo.fetch,
            runner: NEVER_RUN,
            apiBase: API,
            templates: overrides.templates ?? TEMPLATES,
            templateVersion: overrides.templateVersion ?? TEMPLATE_VERSION,
        },
    );
}

/* -------------------------------------------------------------------------------------- */

describe("a truly empty repository, no commits and no default branch yet", () => {
    it("creates every file with no sha, and reports ready", async () => {
        const repo = new FakeRepo({ everCommitted: false, files: {} });
        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.files.map((file) => file.action)).toEqual(["created", "created"]);
        expect(result.report.markerWritten).toBe(true);
        expect(result.report.ready).toBe(true);

        // Two workflow files plus the marker, and nothing sent a `sha` for any of them -
        // this is what "the repository had no commits yet" has to look like on the wire.
        expect(repo.putCount()).toBe(3);
        for (const call of repo.calls.filter((c) => c.method === "PUT")) {
            const body = JSON.parse(call.body ?? "{}") as { sha?: string };
            expect(body.sha).toBeUndefined();
        }
        expect(repo.files.has(WORKFLOW_A.path)).toBe(true);
        expect(repo.files.has(WORKFLOW_B.path)).toBe(true);
        expect(repo.files.has(CI_BOOTSTRAP_MARKER_FILE)).toBe(true);
    });
});

describe("a repository with content, but no workflow", () => {
    it("adds the workflow additively, and touches nothing that was already there", async () => {
        const repo = new FakeRepo({ files: { "README.md": "# hello\n" } });
        const readmeShaBefore = repo.files.get("README.md")?.sha;

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.files.map((file) => file.action)).toEqual(["created", "created"]);

        // The one file that already existed keeps its exact sha and content: nothing here
        // ever reads or writes a path it was not explicitly asked to manage.
        expect(repo.files.get("README.md")?.sha).toBe(readmeShaBefore);
        expect(repo.putPaths()).not.toContain("README.md");
        expect(repo.calls.some((call) => call.method === "DELETE")).toBe(false);
    });
});

describe("a repository this application prepared before, now stale", () => {
    it("updates the workflow it owns, using the file's current sha, and leaves user files alone", async () => {
        const repo = new FakeRepo({
            files: {
                [WORKFLOW_A.path]: "name: Render world v0 (old)\n",
                [WORKFLOW_B.path]: "name: Render shard wave v1\n", // already current
                "README.md": "# a map\n",
            },
        });
        repo.seedMarker([WORKFLOW_A.path, WORKFLOW_B.path]);
        const oldShaA = repo.files.get(WORKFLOW_A.path)?.sha;
        const readmeShaBefore = repo.files.get("README.md")?.sha;

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const outcomeA = result.report.files.find((file) => file.path === WORKFLOW_A.path);
        const outcomeB = result.report.files.find((file) => file.path === WORKFLOW_B.path);
        expect(outcomeA?.action).toBe("updated");
        expect(outcomeA?.reason).toContain("earlier version");
        expect(outcomeB?.action).toBe("unchanged");

        expect(repo.files.get(WORKFLOW_A.path)?.content).toBe(WORKFLOW_A.content);
        expect(repo.files.get("README.md")?.sha).toBe(readmeShaBefore);

        const updateCall = repo.calls.find(
            (call) => call.method === "PUT" && call.url.includes(encodeURIComponent(WORKFLOW_A.path).replace(/%2F/g, "/")),
        );
        // The update carried the file's own current sha - GitHub's optimistic-concurrency
        // guard - rather than none, which would have meant "create", or a stale one.
        const sentSha = JSON.parse(updateCall?.body ?? "{}") as { sha?: string };
        expect(sentSha.sha).toBe(oldShaA);

        // The marker keeps naming both files even though only one changed this run.
        const marker = JSON.parse(repo.files.get(CI_BOOTSTRAP_MARKER_FILE)?.content ?? "{}") as { files?: string[] };
        expect(marker.files).toEqual([WORKFLOW_A.path, WORKFLOW_B.path]);
    });
});

describe("a user-authored file sitting at the same path", () => {
    it("refuses to overwrite it, and writes nothing at all", async () => {
        const repo = new FakeRepo({
            files: { [WORKFLOW_A.path]: "# somebody else's file, not from this application\n" },
        });
        // No marker seeded: this application never claimed this path.

        const result = await run(repo, { templates: [WORKFLOW_A] });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("user-authored-conflict");
        expect(result.failure.message).toContain(WORKFLOW_A.path);

        // Nothing was written at all - not the conflicting file, and not the marker.
        expect(repo.putCount()).toBe(0);
        expect(repo.files.has(CI_BOOTSTRAP_MARKER_FILE)).toBe(false);
        expect(repo.files.get(WORKFLOW_A.path)?.content).toBe("# somebody else's file, not from this application\n");
    });

    it("refuses to overwrite a foreign file sitting at the marker's own path", async () => {
        // The workflow templates were always protected by the ownership check; the marker
        // path itself was not, so a file somebody else happened to put there was read for
        // its sha and then replaced. The filename makes that unlikely, but this module
        // promises that a file it did not write is refused, and unlikely is not refused.
        const foreign = '{"tool":"something-else","note":"not ours"}\n';
        const repo = new FakeRepo({ files: { [CI_BOOTSTRAP_MARKER_FILE]: foreign } });

        const result = await run(repo, { templates: [WORKFLOW_A] });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain(CI_BOOTSTRAP_MARKER_FILE);
        // The foreign file is exactly as it was.
        expect(repo.files.get(CI_BOOTSTRAP_MARKER_FILE)?.content).toBe(foreign);
    });

    it("still rewrites a marker this application wrote, including one from a newer build", async () => {
        // The refusal must key on authorship, not on version, or an older build would
        // refuse to touch a repository a newer one prepared and nothing could ever update.
        const ours = `{"tool":"material-bluemap","version":9999,"files":[],"preparedAt":"x"}\n`;
        const repo = new FakeRepo({ files: { [CI_BOOTSTRAP_MARKER_FILE]: ours } });

        const result = await run(repo, { templates: [WORKFLOW_A] });

        expect(result.ok).toBe(true);
        expect(repo.files.get(CI_BOOTSTRAP_MARKER_FILE)?.content).not.toBe(ours);
    });

    it("uses a legacy marker filename to update an owned workflow, then writes only Worldlens", async () => {
        const repo = new FakeRepo({ files: { [WORKFLOW_A.path]: "old" } });
        repo.files.set(LEGACY_CI_BOOTSTRAP_MARKER_FILE, {
            content: JSON.stringify({
                tool: LEGACY_CI_BOOTSTRAP_MARKER_TOOL,
                version: 1,
                templateVersion: "old",
                files: [WORKFLOW_A.path],
                preparedAt: "2026-01-01T00:00:00.000Z",
            }),
            sha: "legacy-marker-sha",
        });

        const result = await run(repo, { templates: [WORKFLOW_A] });

        expect(result.ok).toBe(true);
        expect(repo.files.get(WORKFLOW_A.path)?.content).toBe(WORKFLOW_A.content);
        expect(repo.files.has(CI_BOOTSTRAP_MARKER_FILE)).toBe(true);
        expect(JSON.parse(repo.files.get(CI_BOOTSTRAP_MARKER_FILE)?.content ?? "{}")).toMatchObject({
            tool: CI_BOOTSTRAP_MARKER_TOOL,
        });
        expect(repo.files.get(LEGACY_CI_BOOTSTRAP_MARKER_FILE)?.content).toContain(
            LEGACY_CI_BOOTSTRAP_MARKER_TOOL,
        );
    });

    it("refuses the whole run even when only one of several files conflicts", async () => {
        const repo = new FakeRepo({
            files: { [WORKFLOW_A.path]: "# not ours\n" },
        });

        const result = await run(repo);

        expect(result.ok).toBe(false);
        // The non-conflicting file (WORKFLOW_B) must not have been created either - a
        // conflict is atomic across the whole set, never a partial write.
        expect(repo.files.has(WORKFLOW_B.path)).toBe(false);
        expect(repo.putCount()).toBe(0);
    });
});

describe("a token missing the workflow scope", () => {
    it("is refused before any file is read or written", async () => {
        const repo = new FakeRepo({ scopes: ["repo"] });

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("missing-scope");
        expect(result.failure.missingScopes).toEqual(["workflow"]);
        expect(result.failure.message).toContain("workflow");

        // No content path was ever touched - the refusal happened before any file read.
        expect(repo.calls.some((call) => call.url.includes("/contents/"))).toBe(false);
    });

    it("proceeds, with a note, when the credential does not report scopes at all", async () => {
        const repo = new FakeRepo({ everCommitted: false, scopes: null });
        const events: CiBootstrapEvent[] = [];

        const result = await bootstrapCiRepository(
            { owner: OWNER, repo: REPO },
            {
                token: "t0k3n",
                fetch: repo.fetch,
                runner: NEVER_RUN,
                apiBase: API,
                templates: TEMPLATES,
                templateVersion: TEMPLATE_VERSION,
                onEvent: (event) => events.push(event),
            },
        );

        expect(result.ok).toBe(true);
        expect(events.some((event) => event.type === "log" && /scopes/.test(event.message))).toBe(true);
    });
});

describe("Actions disabled by repository or organisation policy", () => {
    it("is reported honestly, and is not a green tick", async () => {
        const repo = new FakeRepo({ everCommitted: false, actionsEnabled: false });

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.actionsEnabled).toBe(false);
        expect(result.report.actionsMessage).toContain("turned off");
        expect(result.report.ready).toBe(false);
        // The files were still written - the repository is prepared, just not runnable yet.
        expect(result.report.files.every((file) => file.action === "created")).toBe(true);
    });

    it("does not block readiness when it simply could not be determined", async () => {
        const repo = new FakeRepo({ everCommitted: false, actionsEnabled: null });

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.actionsEnabled).toBeNull();
        // Unknown is not the same as disabled - a contributor without admin rights can
        // still very well be able to render.
        expect(result.report.ready).toBe(true);
    });
});

describe("idempotence", () => {
    it("running it twice performs no writes at all the second time", async () => {
        const repo = new FakeRepo({ everCommitted: false, files: {} });

        const first = await run(repo);
        expect(first.ok).toBe(true);
        const callsAfterFirst = repo.calls.length;

        const second = await run(repo);
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.report.files.map((file) => file.action)).toEqual(["unchanged", "unchanged"]);
        expect(second.report.markerWritten).toBe(false);

        // Every call on the second run was a GET - no PUT landed, and the fake's own state
        // (file contents, shas) is byte-for-byte what the first run left it as.
        expect(repo.calls.slice(callsAfterFirst).every((call) => call.method === "GET")).toBe(true);
        expect(repo.putCount()).toBe(3);
    });
});

describe("a repository the credential cannot write to", () => {
    it("refuses before any content is read", async () => {
        const repo = new FakeRepo({ canWrite: false });

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("repository-not-writable");
        expect(repo.calls.some((call) => call.url.includes("/contents/"))).toBe(false);
    });
});

describe("no route at all", () => {
    it("refuses cleanly when nobody is signed in to the application and gh is not installed", async () => {
        const repo = new FakeRepo();
        const notInstalled: ProcessRunner = {
            run: () => Promise.resolve({ started: false, code: null, stdout: "", stderr: "spawn gh ENOENT" }),
            runToFile: () => Promise.resolve({ started: false, code: null, bytes: 0, stderr: "spawn gh ENOENT" }),
        };

        const result = await bootstrapCiRepository(
            { owner: OWNER, repo: REPO },
            {
                token: null,
                fetch: repo.fetch,
                runner: notInstalled,
                apiBase: API,
                templates: TEMPLATES,
                templateVersion: TEMPLATE_VERSION,
            },
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-route");
        expect(repo.calls).toHaveLength(0);
    });
});

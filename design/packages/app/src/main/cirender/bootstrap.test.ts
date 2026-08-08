import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    CI_BOOTSTRAP_MARKER_FILE,
    CI_BOOTSTRAP_MARKER_TOOL,
    CI_BOOTSTRAP_MARKER_VERSION,
    bootstrapCiRepository,
} from "./bootstrap.js";
import type { CiWorkflowTemplate } from "./bootstrap.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "./gh.js";

const OWNER = "octocat";
const REPO = "a-map";
const API = "https://api.test";
const TEMPLATE_VERSION = 2;

const WORKFLOW_A: CiWorkflowTemplate = {
    path: ".github/workflows/render-world.yml",
    content: "name: Render world v2\n",
};
const WORKFLOW_B: CiWorkflowTemplate = {
    path: ".github/workflows/render-shard-wave.yml",
    content: "name: Render shard wave v2\n",
};
const WORKFLOW_C: CiWorkflowTemplate = {
    path: ".github/workflows/scheduled-render.yml",
    content: "name: Scheduled render v2\n",
};
const TEMPLATES = [WORKFLOW_A, WORKFLOW_B, WORKFLOW_C] as const;

function sha256(text: string): string {
    return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

interface FakeRepoOptions {
    readonly files?: Readonly<Record<string, string>>;
    readonly headSha?: string | null;
    readonly scopes?: readonly string[] | null;
    readonly canWrite?: boolean;
    readonly actionsEnabled?: boolean;
}

interface FakeCommit {
    readonly parent: string | null;
    readonly files: Map<string, string>;
}

class FakeRepo {
    readonly files: Map<string, string>;
    headSha: string | null;
    scopes: readonly string[] | null;
    canWrite: boolean;
    actionsEnabled: boolean;
    moveHeadOnSecondRead = false;
    failAt: "blob" | "tree" | "commit" | null = null;
    readonly calls: { method: string; url: string; body: unknown }[] = [];
    #headReads = 0;
    #counter = 0;
    readonly #blobs = new Map<string, string>();
    readonly #trees = new Map<string, Map<string, string>>();
    readonly #commits = new Map<string, FakeCommit>();

    constructor(options: FakeRepoOptions = {}) {
        this.files = new Map(Object.entries(options.files ?? {}));
        this.headSha = options.headSha === undefined ? "head-0" : options.headSha;
        this.scopes = options.scopes === undefined ? ["repo", "workflow"] : options.scopes;
        this.canWrite = options.canWrite ?? true;
        this.actionsEnabled = options.actionsEnabled ?? true;
    }

    #next(prefix: string): string {
        this.#counter += 1;
        return `${prefix}-${this.#counter}`;
    }

    mutationCount(): number {
        return this.calls.filter((call) => call.method === "POST" || call.method === "PATCH")
            .length;
    }

    visibleCommitCount(): number {
        return this.calls.filter((call) => call.url.includes("/git/refs") && call.method !== "GET")
            .length;
    }

    seedMarker(
        installed: Readonly<Record<string, string>>,
        options: { version?: number; templateVersion?: number } = {},
    ): void {
        this.files.set(
            CI_BOOTSTRAP_MARKER_FILE,
            `${JSON.stringify(
                {
                    tool: CI_BOOTSTRAP_MARKER_TOOL,
                    version: options.version ?? CI_BOOTSTRAP_MARKER_VERSION,
                    templateVersion: options.templateVersion ?? TEMPLATE_VERSION,
                    files: Object.keys(installed),
                    fileHashes: Object.fromEntries(
                        Object.entries(installed).map(([path, content]) => [path, sha256(content)]),
                    ),
                    preparedAt: "2026-01-01T00:00:00.000Z",
                },
                null,
                2,
            )}\n`,
        );
    }

    readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
        this.calls.push({ method, url, body });
        const root = `${API}/repos/${OWNER}/${REPO}`;

        if (url === `${API}/rate_limit`) {
            const headers = new Headers({ "content-type": "application/json" });
            if (this.scopes !== null) headers.set("x-oauth-scopes", this.scopes.join(", "));
            return new Response("{}", { status: 200, headers });
        }
        if (url === root && method === "GET") {
            return Response.json({
                full_name: `${OWNER}/${REPO}`,
                name: REPO,
                owner: { login: OWNER },
                private: false,
                permissions: { push: this.canWrite },
                html_url: `https://github.test/${OWNER}/${REPO}`,
                default_branch: "main",
            });
        }
        if (url === `${root}/actions/permissions` && method === "GET") {
            return Response.json({ enabled: this.actionsEnabled });
        }
        if (url === `${root}/git/ref/heads/main` && method === "GET") {
            this.#headReads += 1;
            if (this.moveHeadOnSecondRead && this.#headReads === 2) this.headSha = "external-head";
            return this.headSha === null
                ? Response.json({ message: "Not Found" }, { status: 404 })
                : Response.json({ ref: "refs/heads/main", object: { sha: this.headSha } });
        }
        if (url.startsWith(`${root}/contents/`) && method === "GET") {
            const parsedUrl = new URL(url);
            const contentsPath = `${new URL(root).pathname}/contents/`;
            const path = parsedUrl.pathname
                .slice(contentsPath.length)
                .split("/")
                .map(decodeURIComponent)
                .join("/");
            const content = this.files.get(path);
            return content === undefined
                ? Response.json({ message: "Not Found" }, { status: 404 })
                : Response.json({
                      sha: `file-${sha256(content).slice(0, 12)}`,
                      content: Buffer.from(content).toString("base64"),
                  });
        }
        if (url.startsWith(`${root}/git/commits/`) && method === "GET") {
            return Response.json({ sha: this.headSha, tree: { sha: "visible-tree" } });
        }
        if (url === `${root}/git/blobs` && method === "POST") {
            if (this.failAt === "blob")
                return Response.json({ message: "injected blob failure" }, { status: 500 });
            const request = body as { content: string };
            const sha = this.#next("blob");
            this.#blobs.set(sha, Buffer.from(request.content, "base64").toString("utf8"));
            return Response.json({ sha }, { status: 201 });
        }
        if (url === `${root}/git/trees` && method === "POST") {
            if (this.failAt === "tree")
                return Response.json({ message: "injected tree failure" }, { status: 500 });
            const request = body as { tree: { path: string; sha: string }[] };
            const treeFiles = new Map(this.files);
            for (const entry of request.tree)
                treeFiles.set(entry.path, this.#blobs.get(entry.sha) ?? "");
            const sha = this.#next("tree");
            this.#trees.set(sha, treeFiles);
            return Response.json({ sha }, { status: 201 });
        }
        if (url === `${root}/git/commits` && method === "POST") {
            if (this.failAt === "commit")
                return Response.json({ message: "injected commit failure" }, { status: 500 });
            const request = body as { tree: string; parents: string[] };
            const sha = this.#next("commit");
            this.#commits.set(sha, {
                parent: request.parents[0] ?? null,
                files: new Map(this.#trees.get(request.tree) ?? []),
            });
            return Response.json({ sha }, { status: 201 });
        }
        if (url === `${root}/git/refs/heads/main` && method === "PATCH") {
            const request = body as { sha: string; force: boolean };
            const commit = this.#commits.get(request.sha);
            if (request.force || commit === undefined || commit.parent !== this.headSha) {
                return Response.json({ message: "Reference update failed" }, { status: 422 });
            }
            this.files.clear();
            for (const [path, content] of commit.files) this.files.set(path, content);
            this.headSha = request.sha;
            return Response.json({ ref: "refs/heads/main", object: { sha: request.sha } });
        }
        return Response.json({ message: `no fake route for ${method} ${url}` }, { status: 404 });
    };
}

const NEVER_RUN: ProcessRunner = {
    run(): Promise<ProcessResult> {
        return Promise.reject(new Error("gh should not run while the in-app session is usable"));
    },
    runToFile(): Promise<ProcessToFileResult> {
        return Promise.reject(new Error("gh should not run while the in-app session is usable"));
    },
};

function run(repo: FakeRepo, templateVersion = TEMPLATE_VERSION) {
    return bootstrapCiRepository(
        { owner: OWNER, repo: REPO },
        {
            token: "token-never-logged",
            fetch: repo.fetch,
            runner: NEVER_RUN,
            apiBase: API,
            templates: TEMPLATES,
            templateVersion,
            now: () => new Date("2026-08-07T12:00:00.000Z"),
        },
    );
}

function currentFiles(): Record<string, string> {
    return Object.fromEntries(TEMPLATES.map((template) => [template.path, template.content]));
}

describe("managed workflow bootstrap transaction", () => {
    it("performs no write when all three workflow bytes and the marker are current", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.seedMarker(files);

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.files.map((file) => file.action)).toEqual([
            "unchanged",
            "unchanged",
            "unchanged",
        ]);
        expect(result.report.markerWritten).toBe(false);
        expect(repo.mutationCount()).toBe(0);
        expect(
            repo.calls
                .filter((call) => call.method === "GET" && call.url.includes("/contents/"))
                .every((call) => new URL(call.url).searchParams.get("ref") === "head-0"),
        ).toBe(true);
    });

    it("safely updates only bytes that still equal their recorded installed hash", async () => {
        const installed = {
            [WORKFLOW_A.path]: "name: Render world v1\n",
            [WORKFLOW_B.path]: WORKFLOW_B.content,
            [WORKFLOW_C.path]: WORKFLOW_C.content,
        };
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.files.map((file) => file.action)).toEqual([
            "updated",
            "unchanged",
            "unchanged",
        ]);
        expect(repo.visibleCommitCount()).toBe(1);
        expect(repo.files.get(WORKFLOW_A.path)).toBe(WORKFLOW_A.content);
        const marker = JSON.parse(repo.files.get(CI_BOOTSTRAP_MARKER_FILE) ?? "{}") as {
            templateVersion?: number;
            fileHashes?: Record<string, string>;
        };
        expect(marker.templateVersion).toBe(TEMPLATE_VERSION);
        expect(marker.fileHashes?.[WORKFLOW_C.path]).toBe(sha256(WORKFLOW_C.content));
    });

    it("refuses a user edit whose bytes no longer match the installed SHA-256", async () => {
        const installed = currentFiles();
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });
        repo.files.set(WORKFLOW_A.path, "# user kept this customization\n");
        const before = new Map(repo.files);

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("managed-file-modified");
        expect(repo.files).toEqual(before);
        expect(repo.mutationCount()).toBe(0);
    });

    it("refuses to downgrade a newer marker schema", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.files.set(
            CI_BOOTSTRAP_MARKER_FILE,
            `${JSON.stringify({
                tool: CI_BOOTSTRAP_MARKER_TOOL,
                version: CI_BOOTSTRAP_MARKER_VERSION + 1,
                futureShape: { deliberately: "unknown to this build" },
            })}\n`,
        );

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("newer-marker-version");
        expect(repo.mutationCount()).toBe(0);
    });

    it("refuses to downgrade a newer managed template version", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.seedMarker(files, { templateVersion: TEMPLATE_VERSION + 1 });

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("newer-template-version");
        expect(repo.mutationCount()).toBe(0);
    });

    it("refuses when the default branch moves between planning and commit", async () => {
        const installed = {
            [WORKFLOW_A.path]: "name: Render world v1\n",
            [WORKFLOW_B.path]: WORKFLOW_B.content,
            [WORKFLOW_C.path]: WORKFLOW_C.content,
        };
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });
        const before = new Map(repo.files);
        repo.moveHeadOnSecondRead = true;

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("concurrent-update");
        expect(repo.files).toEqual(before);
        expect(repo.visibleCommitCount()).toBe(0);
    });

    it("leaves visible repository state unchanged when object creation fails mid-transaction", async () => {
        const installed = {
            [WORKFLOW_A.path]: "name: Render world v1\n",
            [WORKFLOW_B.path]: WORKFLOW_B.content,
            [WORKFLOW_C.path]: WORKFLOW_C.content,
        };
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });
        const before = new Map(repo.files);
        const headBefore = repo.headSha;
        repo.failAt = "tree";

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("http-error");
        expect(repo.files).toEqual(before);
        expect(repo.headSha).toBe(headBefore);
        expect(repo.visibleCommitCount()).toBe(0);
    });

    it("fails closed before object creation when a repository has no first commit", async () => {
        const repo = new FakeRepo({ files: {}, headSha: null });

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("empty-repository");
        expect(result.failure.message).toContain("starter commit");
        expect(repo.mutationCount()).toBe(0);
        expect(repo.files.size).toBe(0);
    });
});

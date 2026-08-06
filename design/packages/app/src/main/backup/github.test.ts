/**
 * The GitHub calls, against a fake `fetch` that records every request.
 *
 * The most important assertions here are about what is **not** sent. A backup is
 * append-only, and the way that is proved is by watching the whole conversation and
 * confirming there was never a `PATCH`, a `PUT` or a `DELETE` in it, whatever happened.
 * A rule enforced by "we did not write that function" is only as good as a test that
 * notices when somebody writes it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    GitHubCallError,
    createBackupRelease,
    createRepository,
    findExistingAssets,
    isRepositoryNameTakenError,
    listWritableRepositories,
    parseRepositoryRecord,
    readRepository,
    readTextAsset,
    uploadAsset,
} from "./github.js";
import type { BackupRelease, FetchLike } from "./github.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-github-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

interface Seen {
    readonly url: string;
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
}

/** A `fetch` that answers from a table and records the whole conversation. */
function fakeFetch(
    table: (url: string, init: RequestInit | undefined) => { status: number; body: unknown } | null,
): FetchLike & { readonly seen: Seen[] } {
    const seen: Seen[] = [];
    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
            headers[key.toLowerCase()] = value;
        }
        // A streaming body is *drained*, exactly as a real request would drain it. Without
        // that, a progress counter wired to consumption never fires and this fake would
        // report a passing test for an upload that reported nothing.
        let bodyBytes: number | null = null;
        const body = init?.body;
        if (body !== undefined && body !== null && typeof body === "object" && "getReader" in body) {
            bodyBytes = 0;
            const reader = (body as ReadableStream<Uint8Array>).getReader();
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bodyBytes += chunk.value.length;
            }
        }
        seen.push({
            url,
            method: init?.method ?? "GET",
            headers,
            body:
                bodyBytes !== null
                    ? { streamedBytes: bodyBytes }
                    : typeof init?.body === "string"
                      ? JSON.parse(init.body)
                      : init?.body,
        });
        const answer = table(url, init) ?? { status: 404, body: { message: "Not Found" } };
        return Promise.resolve({
            ok: answer.status >= 200 && answer.status < 300,
            status: answer.status,
            json: () => Promise.resolve(answer.body),
            arrayBuffer: () =>
                Promise.resolve(
                    Uint8Array.from(Buffer.from(String(answer.body), "utf8")).buffer as ArrayBuffer,
                ),
        } as unknown as Response);
    };
    return Object.assign(impl, { seen });
}

const base = { apiBase: "https://api.test", uploadsBase: "https://uploads.test", token: "t0k3n" };

const releaseJson = {
    id: 77,
    tag_name: "mbm-backup-world-overworld-20260804T101500Z",
    name: "Backup: Overworld",
    html_url: "https://github.test/o/r/releases/tag/mbm-backup",
    upload_url: "https://uploads.test/...",
    created_at: "2026-08-04T10:15:00Z",
    assets: [],
};

describe("listing repositories somebody can actually write to", () => {
    it("keeps only the ones GitHub says have push access", async () => {
        const fetch = fakeFetch((url) =>
            url.includes("page=1")
                ? {
                      status: 200,
                      body: [
                          {
                              full_name: "me/mine",
                              name: "mine",
                              owner: { login: "me" },
                              private: true,
                              permissions: { push: true },
                              html_url: "https://github.test/me/mine",
                          },
                          {
                              full_name: "someone/theirs",
                              name: "theirs",
                              owner: { login: "someone" },
                              private: false,
                              permissions: { push: false },
                              html_url: "https://github.test/someone/theirs",
                          },
                          {
                              // No permissions block at all: GitHub did not say, which is
                              // not the same as yes.
                              full_name: "org/quiet",
                              name: "quiet",
                              owner: { login: "org" },
                              private: false,
                              html_url: "https://github.test/org/quiet",
                          },
                      ],
                  }
                : { status: 200, body: [] },
        );

        const found = await listWritableRepositories({ fetch, ...base });
        expect(found.map((repository) => repository.fullName)).toEqual(["me/mine"]);
    });

    it("sends the token as a bearer and never in the URL", async () => {
        const fetch = fakeFetch(() => ({ status: 200, body: [] }));
        await listWritableRepositories({ fetch, ...base });
        expect(fetch.seen[0]?.headers["authorization"]).toBe("Bearer t0k3n");
        expect(fetch.seen[0]?.url).not.toContain("t0k3n");
    });
});

describe("reading one repository", () => {
    it("reports its visibility and whether this account may write", async () => {
        const fetch = fakeFetch(() => ({
            status: 200,
            body: {
                full_name: "me/public-thing",
                name: "public-thing",
                owner: { login: "me" },
                private: false,
                permissions: { push: true },
                html_url: "https://github.test/me/public-thing",
            },
        }));

        const repository = await readRepository("me", "public-thing", { fetch, ...base });
        expect(repository.private).toBe(false);
        expect(repository.canWrite).toBe(true);
    });

    it("turns a 404 into a sentence that explains why it might not be missing", async () => {
        const fetch = fakeFetch(() => ({ status: 404, body: { message: "Not Found" } }));
        await expect(readRepository("me", "hidden", { fetch, ...base })).rejects.toThrow(
            /cannot see it/,
        );
    });

    it("turns a 403 into a sentence naming the permission that is probably missing", async () => {
        const fetch = fakeFetch(() => ({ status: 403, body: { message: "Forbidden" } }));
        await expect(readRepository("me", "thing", { fetch, ...base })).rejects.toThrow(/"repo"/);
    });

    it("uses one record reader for the list and the single call", () => {
        expect(
            parseRepositoryRecord({
                full_name: "a/b",
                name: "b",
                owner: { login: "a" },
                permissions: { push: true },
            })?.canWrite,
        ).toBe(true);
        expect(parseRepositoryRecord({ full_name: "a/b" })).toBeNull();
    });
});

describe("creating the release for one backup", () => {
    it("creates a prerelease that is never made the repository's latest", async () => {
        const fetch = fakeFetch(() => ({ status: 201, body: releaseJson }));
        const release = await createBackupRelease("o", "r", "tag-1", "Backup", "body", {
            fetch,
            ...base,
        });

        expect(release.id).toBe(77);
        const request = fetch.seen[0];
        expect(request?.method).toBe("POST");
        expect(request?.body).toMatchObject({
            tag_name: "tag-1",
            draft: false,
            prerelease: true,
            make_latest: "false",
        });
    });

    it("refuses a tag that already exists rather than adopting the release", async () => {
        // The real shape a live run against github.com actually returns for a genuine
        // tag collision - `errors[].code` is what tells this apart from the *other* 422
        // a create can answer with, exercised in the next test.
        const fetch = fakeFetch(() => ({
            status: 422,
            body: {
                message: "Validation Failed",
                errors: [{ resource: "Release", code: "already_exists", field: "tag_name" }],
                documentation_url: "https://docs.github.com/rest/releases/releases#create-a-release",
            },
        }));

        const failure = await createBackupRelease("o", "r", "taken", "Backup", "body", {
            fetch,
            ...base,
        }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        expect((failure as Error).message).toContain("Nothing was changed");
        expect((failure as Error).message).toContain("never edits or replaces");
    });

    it("refuses an empty repository by naming the real problem, not a guessed tag collision", async () => {
        // A live run against a brand-new, never-pushed-to repository found this: GitHub
        // answers the *same* 422 status for "this repository has no commits yet" as it
        // does for a tag collision, with a completely different body. Assuming every 422
        // meant a taken tag told somebody in exactly this situation to "start the backup
        // again to get a fresh tag" - advice that fails identically forever.
        const fetch = fakeFetch(() => ({
            status: 422,
            body: {
                message: "Validation Failed",
                errors: [{ resource: "Release", code: "custom", message: "Repository is empty." }],
                documentation_url: "https://docs.github.com/rest/releases/releases#create-a-release",
            },
        }));

        const failure = await createBackupRelease("o", "r", "first-ever", "Backup", "body", {
            fetch,
            ...base,
        }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        const message = (failure as Error).message;
        expect(message).toContain("no commits yet");
        expect(message).not.toContain("already has a release");
        expect(message).not.toContain("fresh tag");
    });

    it("still names an unrecognised 422 honestly rather than guessing at a cause", async () => {
        const fetch = fakeFetch(() => ({
            status: 422,
            body: { message: "Validation Failed", errors: [{ resource: "Release", code: "custom", message: "Something else entirely." }] },
        }));

        const failure = await createBackupRelease("o", "r", "tag-x", "Backup", "body", {
            fetch,
            ...base,
        }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        const message = (failure as Error).message;
        expect(message).toContain("Something else entirely.");
        expect(message).not.toContain("already has a release");
        expect(message).not.toContain("no commits yet");
    });

    it("never sends a method that could change something that already exists", async () => {
        const fetch = fakeFetch(() => ({ status: 201, body: releaseJson }));
        await createBackupRelease("o", "r", "tag-1", "Backup", "body", { fetch, ...base });
        await findExistingAssets("o", "r", "tag-1", { fetch, ...base }).catch(() => undefined);

        for (const request of fetch.seen) {
            expect(["GET", "POST"]).toContain(request.method);
        }
    });
});

describe("creating a new repository", () => {
    const createdJson = {
        full_name: "me/new-world",
        name: "new-world",
        owner: { login: "me" },
        private: false,
        permissions: { push: true },
        html_url: "https://github.test/me/new-world",
    };

    it("posts to /user/repos for a personal owner, initialised so it is never empty", async () => {
        const fetch = fakeFetch(() => ({ status: 201, body: createdJson }));
        const created = await createRepository(
            { ownerLogin: "me", ownerKind: "user", name: "new-world", private: false },
            { fetch, ...base },
        );

        expect(created.fullName).toBe("me/new-world");
        expect(created.canWrite).toBe(true);
        const request = fetch.seen[0];
        expect(request?.url).toBe("https://api.test/user/repos");
        expect(request?.method).toBe("POST");
        expect(request?.body).toMatchObject({ name: "new-world", private: false, auto_init: true });
    });

    it("posts to /orgs/{org}/repos for an organisation owner instead", async () => {
        const fetch = fakeFetch(() => ({
            status: 201,
            body: { ...createdJson, full_name: "acme/new-world", owner: { login: "acme" } },
        }));
        await createRepository(
            { ownerLogin: "acme", ownerKind: "organization", name: "new-world", private: true },
            { fetch, ...base },
        );

        const request = fetch.seen[0];
        expect(request?.url).toBe("https://api.test/orgs/acme/repos");
        expect(request?.body).toMatchObject({ name: "new-world", private: true, auto_init: true });
    });

    it("reports a taken name honestly, told apart from any other 422", async () => {
        const fetch = fakeFetch(() => ({
            status: 422,
            body: {
                message: "Validation Failed",
                errors: [{ resource: "Repository", code: "already_exists", field: "name" }],
            },
        }));

        const failure = await createRepository(
            { ownerLogin: "me", ownerKind: "user", name: "taken", private: false },
            { fetch, ...base },
        ).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        expect(isRepositoryNameTakenError(failure)).toBe(true);
        expect((failure as Error).message).toContain('"taken"');
        expect((failure as Error).message).toContain("already exists");
    });

    it("does not mistake an unrelated 422 for a taken name", async () => {
        const fetch = fakeFetch(() => ({
            status: 422,
            body: {
                message: "Validation Failed",
                errors: [{ resource: "Repository", code: "invalid", field: "name", message: "name is invalid" }],
            },
        }));

        const failure = await createRepository(
            { ownerLogin: "me", ownerKind: "user", name: "bad name!", private: false },
            { fetch, ...base },
        ).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        expect(isRepositoryNameTakenError(failure)).toBe(false);
        expect((failure as Error).message).toContain("name is invalid");
    });

    it("reports an organisation refusal (403) with the account's real permission named", async () => {
        const fetch = fakeFetch(() => ({
            status: 403,
            body: { message: "Must have admin rights to Repository." },
        }));

        const failure = await createRepository(
            { ownerLogin: "acme", ownerKind: "organization", name: "new-world", private: false },
            { fetch, ...base },
        ).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        expect((failure as Error).message).toContain("repo");
    });

    it("isRepositoryNameTakenError is false for anything that is not that specific refusal", () => {
        expect(isRepositoryNameTakenError(new Error("unrelated"))).toBe(false);
        expect(isRepositoryNameTakenError(new GitHubCallError("Creating failed: GitHub answered 500.", 500, "u"))).toBe(
            false,
        );
    });
});

describe("finding what is already on a release, for a resumed upload", () => {
    it("returns only assets GitHub reports as fully uploaded", async () => {
        const fetch = fakeFetch(() => ({
            status: 200,
            body: {
                ...releaseJson,
                assets: [
                    { id: 1, name: "a.zip.001-aaaa", size: 100, state: "uploaded", browser_download_url: "u1" },
                    { id: 2, name: "a.zip.002-bbbb", size: 100, state: "starter", browser_download_url: "u2" },
                ],
            },
        }));

        const assets = await findExistingAssets("o", "r", "tag-1", { fetch, ...base });
        expect([...assets.keys()]).toEqual(["a.zip.001-aaaa"]);
    });

    it("is an empty map when there is no such release, not a failure", async () => {
        const fetch = fakeFetch(() => ({ status: 404, body: { message: "Not Found" } }));
        expect((await findExistingAssets("o", "r", "gone", { fetch, ...base })).size).toBe(0);
    });
});

describe("uploading an asset", () => {
    const release: BackupRelease = {
        id: 77,
        tag: "tag-1",
        name: "Backup",
        htmlUrl: "",
        uploadUrl: "",
        assets: [],
        createdAt: "",
    };

    it("streams the file, sets its length, and names it in the query", async () => {
        const path = join(workDir, "part.bin");
        await writeFile(path, Buffer.alloc(2048, 7));

        const fetch = fakeFetch(() => ({
            status: 201,
            body: { id: 5, name: "part.bin", size: 2048, state: "uploaded", browser_download_url: "u" },
        }));

        const seenProgress: number[] = [];
        const asset = await uploadAsset(release, "o", "r", "part.bin", path, {
            fetch,
            ...base,
            onProgress: (progress) => seenProgress.push(progress.bytesSent),
        });

        expect(asset.size).toBe(2048);
        const request = fetch.seen[0];
        expect(request?.method).toBe("POST");
        expect(request?.url).toBe(
            "https://uploads.test/repos/o/r/releases/77/assets?name=part.bin",
        );
        expect(request?.headers["content-length"]).toBe("2048");
        expect(request?.headers["content-type"]).toBe("application/octet-stream");
        // A stream, not a buffer: the whole point is that a 500 MiB part is never in
        // memory. The fake drained it, so the byte count proves every byte was handed over.
        expect(Buffer.isBuffer(request?.body)).toBe(false);
        expect(request?.body).toEqual({ streamedBytes: 2048 });
        expect(seenProgress.at(-1)).toBe(2048);
    });

    it("reports a refused upload with the status and GitHub's own message", async () => {
        const path = join(workDir, "part.bin");
        await writeFile(path, "x");
        const fetch = fakeFetch(() => ({ status: 422, body: { message: "already_exists" } }));

        const failure = await uploadAsset(release, "o", "r", "part.bin", path, {
            fetch,
            ...base,
        }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(GitHubCallError);
        expect((failure as Error).message).toContain("already_exists");
        expect((failure as GitHubCallError).status).toBe(422);
    });
});

describe("reading a small text asset", () => {
    it("refuses one bigger than the bound without fetching it", async () => {
        const fetch = fakeFetch(() => ({ status: 200, body: "should not be read" }));
        const text = await readTextAsset(
            { id: 1, name: "backup.json", size: 5_000_000, state: "uploaded", downloadUrl: "u" },
            1024,
            { fetch, ...base },
        );
        expect(text).toBeNull();
        expect(fetch.seen).toHaveLength(0);
    });
});

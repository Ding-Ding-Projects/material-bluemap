/**
 * Owner choices, name suggestion and availability, against a fake `fetch` that answers
 * from a table - the same style `backup/github.test.ts` uses for the calls this borrows
 * its shape from.
 */

import { describe, expect, it } from "vitest";
import {
    CI_REPOSITORY_NAME_FALLBACK,
    MAX_CI_REPOSITORY_NAME_LENGTH,
    checkCiRepositoryNameAvailability,
    listCiOwnerChoices,
    suggestCiRepositoryName,
} from "./setup.js";
import type { FetchLike } from "./setup.js";

interface Seen {
    readonly url: string;
    readonly headers: Record<string, string>;
}

/** A `fetch` that answers from a table and records every request it saw. */
function fakeFetch(
    table: (url: string) => { status: number; body: unknown } | null,
): FetchLike & { readonly seen: Seen[] } {
    const seen: Seen[] = [];
    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
            headers[key.toLowerCase()] = value;
        }
        seen.push({ url, headers });
        const answer = table(url) ?? { status: 404, body: { message: "Not Found" } };
        return Promise.resolve({
            ok: answer.status >= 200 && answer.status < 300,
            status: answer.status,
            json: () => Promise.resolve(answer.body),
        } as unknown as Response);
    };
    return Object.assign(impl, { seen });
}

const API = "https://api.test";

describe("listing who a render could be published under", () => {
    it("reports the login and every organisation, when signed in", async () => {
        const fetch = fakeFetch((url) => {
            if (url === `${API}/user`) return { status: 200, body: { login: "steve" } };
            if (url.startsWith(`${API}/user/orgs`)) {
                return {
                    status: 200,
                    body: [{ login: "mining-co" }, { login: "the-nether-guild" }],
                };
            }
            return null;
        });

        const answer = await listCiOwnerChoices({ token: () => "t0k3n", fetch, apiBase: API });

        expect(answer).toEqual({
            ok: true,
            login: "steve",
            owners: [
                { login: "steve", kind: "user" },
                { login: "mining-co", kind: "organization" },
                { login: "the-nether-guild", kind: "organization" },
            ],
        });
        // Authenticated, not anonymous - a private organisation the account belongs to
        // would not show up on an anonymous call at all.
        expect(fetch.seen[0]?.headers["authorization"]).toBe("Bearer t0k3n");
    });

    it("never throws for 'nobody is signed in' - it answers signedIn: false", async () => {
        const fetch = fakeFetch(() => {
            throw new Error("must not be called when there is no token");
        });

        const answer = await listCiOwnerChoices({ token: () => null, fetch, apiBase: API });

        expect(answer).toEqual({
            ok: false,
            signedIn: false,
            message: expect.stringContaining("Nobody is signed in"),
        });
    });

    it("treats an empty-string token the same as no token", async () => {
        const answer = await listCiOwnerChoices({
            token: () => "",
            fetch: fakeFetch(() => null),
            apiBase: API,
        });
        expect(answer).toEqual({ ok: false, signedIn: false, message: expect.any(String) });
    });

    it("reports signedIn: true for a token GitHub rejects with something other than 401", async () => {
        const fetch = fakeFetch((url) =>
            url === `${API}/user` ? { status: 500, body: { message: "internal error" } } : null,
        );
        const answer = await listCiOwnerChoices({ token: () => "t0k3n", fetch, apiBase: API });
        expect(answer).toEqual({ ok: false, signedIn: true, message: expect.any(String) });
    });

    it("reports signedIn: false for a token GitHub answers 401 to - it is no longer good", async () => {
        const fetch = fakeFetch((url) =>
            url === `${API}/user` ? { status: 401, body: { message: "Bad credentials" } } : null,
        );
        const answer = await listCiOwnerChoices({ token: () => "stale", fetch, apiBase: API });
        expect(answer).toEqual({ ok: false, signedIn: false, message: expect.any(String) });
    });

    it("still reports the login when the organisations call fails on its own", async () => {
        const fetch = fakeFetch((url) => {
            if (url === `${API}/user`) return { status: 200, body: { login: "steve" } };
            if (url.startsWith(`${API}/user/orgs`)) return { status: 500, body: { message: "nope" } };
            return null;
        });
        const answer = await listCiOwnerChoices({ token: () => "t0k3n", fetch, apiBase: API });
        expect(answer).toEqual({ ok: true, login: "steve", owners: [{ login: "steve", kind: "user" }] });
    });
});

describe("suggesting a repository name", () => {
    it("keeps an already-valid name untouched", () => {
        expect(suggestCiRepositoryName("overworld-map")).toBe("overworld-map");
    });

    it("replaces spaces and punctuation with hyphens", () => {
        expect(suggestCiRepositoryName("My World!!")).toBe("My-World");
    });

    it("collapses runs of disallowed characters into a single hyphen", () => {
        expect(suggestCiRepositoryName("a   b")).toBe("a-b");
    });

    it("strips accents rather than dropping the letter", () => {
        expect(suggestCiRepositoryName("Café del Mundo")).toBe("Cafe-del-Mundo");
    });

    it("strips a leading and trailing separator", () => {
        expect(suggestCiRepositoryName("-hidden-file-")).toBe("hidden-file");
    });

    it("strips a trailing .git, case-insensitively", () => {
        expect(suggestCiRepositoryName("world.GIT")).toBe("world");
    });

    it("caps length at GitHub's limit", () => {
        const long = "a".repeat(MAX_CI_REPOSITORY_NAME_LENGTH + 40);
        const result = suggestCiRepositoryName(long);
        expect(result.length).toBeLessThanOrEqual(MAX_CI_REPOSITORY_NAME_LENGTH);
        expect(result).toBe("a".repeat(MAX_CI_REPOSITORY_NAME_LENGTH));
    });

    it("never lets the length cap reveal a trailing .git that was not there before truncation", () => {
        // Pre-truncation this ends in "bcd", not ".git" - the source string never violates
        // the naming contract. Slicing to the 100-character limit lands exactly on a ".git"
        // boundary that only exists because of where the cut fell.
        const source = "a".repeat(96) + ".git" + "bcd";
        const result = suggestCiRepositoryName(source);
        expect(result.length).toBeLessThanOrEqual(MAX_CI_REPOSITORY_NAME_LENGTH);
        expect(result).not.toMatch(/\.git$/i);
    });

    it("falls back to a generic name when nothing usable survives", () => {
        expect(suggestCiRepositoryName("")).toBe(CI_REPOSITORY_NAME_FALLBACK);
        expect(suggestCiRepositoryName("   ")).toBe(CI_REPOSITORY_NAME_FALLBACK);
        expect(suggestCiRepositoryName("!!!")).toBe(CI_REPOSITORY_NAME_FALLBACK);
    });

    it("falls back for the two reserved names GitHub refuses outright", () => {
        expect(suggestCiRepositoryName(".")).toBe(CI_REPOSITORY_NAME_FALLBACK);
        expect(suggestCiRepositoryName("..")).toBe(CI_REPOSITORY_NAME_FALLBACK);
    });

    it("keeps underscores and periods, which GitHub allows", () => {
        expect(suggestCiRepositoryName("my_world.v2")).toBe("my_world.v2");
    });
});

describe("checking whether a repository name is free", () => {
    it("reports available on a 404", async () => {
        const fetch = fakeFetch(() => ({ status: 404, body: { message: "Not Found" } }));
        const result = await checkCiRepositoryNameAvailability("steve", "new-map", {
            token: () => "t0k3n",
            fetch,
            apiBase: API,
        });
        expect(result).toEqual({ status: "available", owner: "steve", repo: "new-map" });
    });

    it("reports taken with visibility and a URL on a 200", async () => {
        const fetch = fakeFetch(() => ({
            status: 200,
            body: { private: true, html_url: "https://github.test/steve/taken" },
        }));
        const result = await checkCiRepositoryNameAvailability("steve", "taken", {
            token: () => "t0k3n",
            fetch,
            apiBase: API,
        });
        expect(result).toEqual({
            status: "taken",
            owner: "steve",
            repo: "taken",
            private: true,
            htmlUrl: "https://github.test/steve/taken",
        });
    });

    it("never guesses available from a network failure - it says unknown", async () => {
        const fetch: FetchLike = () => Promise.reject(new Error("offline"));
        const result = await checkCiRepositoryNameAvailability("steve", "new-map", {
            token: () => "t0k3n",
            fetch,
            apiBase: API,
        });
        expect(result.status).toBe("unknown");
        expect((result as { message: string }).message).toContain("offline");
    });

    it("never guesses available from an ambiguous status either", async () => {
        const fetch = fakeFetch(() => ({ status: 403, body: { message: "rate limited" } }));
        const result = await checkCiRepositoryNameAvailability("steve", "new-map", {
            token: () => "t0k3n",
            fetch,
            apiBase: API,
        });
        expect(result.status).toBe("unknown");
    });

    it("still runs with no token at all, unauthenticated", async () => {
        const fetch = fakeFetch(() => ({ status: 404, body: {} }));
        const result = await checkCiRepositoryNameAvailability("steve", "new-map", {
            token: () => null,
            fetch,
            apiBase: API,
        });
        expect(result).toEqual({ status: "available", owner: "steve", repo: "new-map" });
        expect(fetch.seen[0]?.headers["authorization"]).toBeUndefined();
    });

    it("reports unknown without a network call when owner or repo is blank", async () => {
        const fetch = fakeFetch(() => {
            throw new Error("must not be called for a blank field");
        });
        const result = await checkCiRepositoryNameAvailability("  ", "new-map", {
            token: () => "t0k3n",
            fetch,
            apiBase: API,
        });
        expect(result.status).toBe("unknown");
    });
});

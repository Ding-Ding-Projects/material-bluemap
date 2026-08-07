/**
 * Tests for the sign-in session as a whole.
 *
 * These exercise the real `TokenStore` against a temporary directory rather than a mock
 * of it, because the two things most worth proving here are exactly the things a mocked
 * store would paper over: that a machine with no credential store still gets a working
 * session and is told it will not last, and that a token about to expire is renewed
 * before anything is attempted with it rather than after something has already failed.
 *
 * The clock and the network are parameters, so an eight-hour token lifetime is a number
 * in a test rather than a reason not to test it.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubSession } from "./session.js";
import { TokenStore } from "./storage.js";
import type { SafeStorageLike } from "./storage.js";

const OAUTH_BASE = "https://github.test";
const API_BASE = "https://api.github.test";
const APP_CLIENT = { id: "Iv23liPCatYTLpipKJYS", kind: "app" as const };
const OAUTH_CLIENT = { id: "Ov23liJJhHYC2YP1iTFN", kind: "oauth" as const };

const DEVICE_CODE = "0123456789abcdef0123456789abcdef01234567";
const APP_TOKEN = `ghu_${"a".repeat(36)}`;
const REFRESH_TOKEN = `ghr_${"b".repeat(36)}`;
const REFRESHED_TOKEN = `ghu_${"c".repeat(36)}`;
const PASTED_TOKEN = `ghp_${"d".repeat(36)}`;

function fakeSafeStorage(available = true): SafeStorageLike {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (plainText) =>
            Buffer.from(`enc:${Buffer.from(plainText, "utf8").toString("base64")}`, "utf8"),
        decryptString: (encrypted) =>
            Buffer.from(encrypted.toString("utf8").slice(4), "base64").toString("utf8"),
    };
}

interface Route {
    (fields: URLSearchParams, init: RequestInit | undefined): Response;
}

/** A fetch that dispatches on the URL, so a test only writes the answers it cares about. */
function router(routes: Record<string, Route>): {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    urls: string[];
} {
    const urls: string[] = [];
    return {
        urls,
        fetch: (url, init) => {
            urls.push(url);
            const route = routes[url];
            if (route === undefined) throw new Error(`unrouted request to ${url}`);
            return Promise.resolve(route(new URLSearchParams(String(init?.body ?? "")), init));
        },
    };
}

function json(body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status: 200, headers });
}

let directory: string;
let file: string;
let opened: string[];

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "material-bluemap-session-"));
    file = join(directory, "github-credential.json");
    opened = [];
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

function sessionWith(options: {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    store?: TokenStore;
    client?: { id: string; kind: "app" | "oauth" } | null;
    now?: () => number;
}): {
    session: GitHubSession;
    events: { type: string; [key: string]: unknown }[];
    store: TokenStore;
} {
    const store = options.store ?? new TokenStore({ file, safeStorage: fakeSafeStorage() });
    const events: { type: string; [key: string]: unknown }[] = [];
    const session = new GitHubSession({
        store,
        fetch: options.fetch,
        sleep: () => Promise.resolve(),
        client: () => (options.client === undefined ? APP_CLIENT : options.client),
        oauthFallbackClient: () => OAUTH_CLIENT,
        openExternal: (url) => {
            opened.push(url);
            return Promise.resolve(true);
        },
        onEvent: (event) => events.push(event as unknown as { type: string }),
        now: options.now ?? (() => 1_000_000),
        apiBase: API_BASE,
        oauthBase: OAUTH_BASE,
    });
    return { session, events, store };
}

describe("device sign-in", () => {
    it("shows the code, opens the browser and ends signed in", async () => {
        const { fetch } = router({
            [`${OAUTH_BASE}/login/device/code`]: () =>
                json({
                    device_code: DEVICE_CODE,
                    user_code: "D8DF-0DE4",
                    verification_uri: "https://github.com/login/device",
                    expires_in: 899,
                    interval: 5,
                }),
            [`${OAUTH_BASE}/login/oauth/access_token`]: () =>
                json({
                    access_token: APP_TOKEN,
                    refresh_token: REFRESH_TOKEN,
                    expires_in: 28800,
                    refresh_token_expires_in: 15897600,
                }),
            [`${API_BASE}/user`]: () => json({ login: "octocat", id: 1, name: "The Octocat" }),
        });
        const { session, events } = sessionWith({ fetch });

        const result = await session.startDeviceSignIn();

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.account.login).toBe("octocat");
        expect(result.account.source).toBe("github-app");
        expect(result.account.persisted).toBe(true);
        expect(result.account.refreshable).toBe(true);
        expect(result.account.expiresAt).toBe(new Date(1_000_000 + 28800_000).toISOString());

        const code = events.find((event) => event.type === "code");
        // Verbatim: this is the string the person types on the verification page.
        expect(code?.["userCode"]).toBe("D8DF-0DE4");
        expect(code?.["expiresInSeconds"]).toBe(899);
        expect(code?.["browserOpened"]).toBe(true);
        expect(opened).toEqual(["https://github.com/login/device"]);

        expect(session.status().signedIn).toBe(true);
        expect(session.status().account?.login).toBe("octocat");
    });

    it("falls back to the OAuth application when asked, scopes and all", async () => {
        const sent: URLSearchParams[] = [];
        const { fetch } = router({
            [`${OAUTH_BASE}/login/device/code`]: (fields) => {
                sent.push(fields);
                return json({
                    device_code: DEVICE_CODE,
                    user_code: "AAAA-BBBB",
                    verification_uri: "https://github.com/login/device",
                    expires_in: 899,
                    interval: 5,
                });
            },
            [`${OAUTH_BASE}/login/oauth/access_token`]: () => json({ access_token: PASTED_TOKEN }),
            [`${API_BASE}/user`]: () =>
                json(
                    { login: "octocat", id: 1 },
                    { "x-oauth-scopes": "public_repo, workflow, read:user" },
                ),
        });
        const { session } = sessionWith({ fetch });

        const result = await session.startDeviceSignIn({ useOAuthFallback: true });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.account.source).toBe("oauth-app");
        expect(sent[0]?.get("client_id")).toBe(OAUTH_CLIENT.id);
        // The OAuth client is the one that takes scopes, and it must actually be sent them.
        expect(sent[0]?.get("scope")).toBe("public_repo workflow read:user");
    });

    it("says the device flow is unavailable rather than failing obscurely", async () => {
        const { fetch } = router({});
        const { session } = sessionWith({ fetch, client: null });

        const result = await session.startDeviceSignIn();

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("no-client-configured");
        expect(result.failure.message).toContain("personal access token");
        expect(result.failure.message).toContain("WORLDLENS_GITHUB_CLIENT_ID");
    });
});

describe("a machine with no credential store", () => {
    it("signs in for this run and says the sign-in will not survive a restart", async () => {
        const { fetch } = router({
            [`${API_BASE}/user`]: () =>
                json(
                    { login: "octocat", id: 1 },
                    { "x-oauth-scopes": "public_repo, workflow, read:user" },
                ),
        });
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage(false) });
        const { session } = sessionWith({ fetch, store });

        const result = await session.signInWithToken(PASTED_TOKEN);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The session works. It simply was not written down, and says so in as many words.
        expect(result.account.persisted).toBe(false);
        expect(result.account.warnings.join(" ")).toContain("nowhere safe");
        expect(session.status().encryptionAvailable).toBe(false);

        const token = await session.accessToken();
        expect(token.ok).toBe(true);
    });
});

describe("a token that expires", () => {
    it("renews it before it dies rather than after something has failed", async () => {
        const refreshCalls: URLSearchParams[] = [];
        const { fetch } = router({
            [`${OAUTH_BASE}/login/oauth/access_token`]: (fields) => {
                refreshCalls.push(fields);
                return json({
                    access_token: REFRESHED_TOKEN,
                    refresh_token: `ghr_${"e".repeat(36)}`,
                    expires_in: 28800,
                    refresh_token_expires_in: 15897600,
                });
            },
        });

        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        const now = 2_000_000;
        store.save(
            { token: APP_TOKEN, refreshToken: REFRESH_TOKEN },
            {
                kind: "github-app",
                login: "octocat",
                userId: 1,
                scopes: [],
                scopesReported: false,
                clientId: APP_CLIENT.id,
                // Two minutes left, which is inside the five-minute margin.
                expiresAt: new Date(now + 120_000).toISOString(),
                refreshTokenExpiresAt: new Date(now + 15897600_000).toISOString(),
            },
        );
        const { session } = sessionWith({ fetch, store, now: () => now });

        const token = await session.accessToken();

        expect(token.ok).toBe(true);
        if (!token.ok) return;
        expect(token.token).toBe(REFRESHED_TOKEN);
        expect(refreshCalls[0]?.get("grant_type")).toBe("refresh_token");
        expect(refreshCalls[0]?.get("refresh_token")).toBe(REFRESH_TOKEN);

        // And the new pair was written down, so the next launch does not start from the
        // dead one. Keeping the old refresh token is what makes the *next* refresh fail.
        const stored = new TokenStore({ file, safeStorage: fakeSafeStorage() }).read();
        expect(stored.ok).toBe(true);
        if (!stored.ok) return;
        expect(stored.secret.token).toBe(REFRESHED_TOKEN);
        expect(stored.secret.refreshToken).toBe(`ghr_${"e".repeat(36)}`);
    });

    it("leaves a non-expiring token alone instead of refreshing something that cannot be", async () => {
        const { fetch, urls } = router({});
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        store.save(
            { token: PASTED_TOKEN, refreshToken: null },
            {
                kind: "oauth-app",
                login: "octocat",
                userId: 1,
                scopes: ["public_repo", "workflow", "read:user"],
                scopesReported: true,
                clientId: OAUTH_CLIENT.id,
                // An OAuth App token has no expiry. That is a fact, not a missing field.
                expiresAt: null,
                refreshTokenExpiresAt: null,
            },
        );
        const { session } = sessionWith({ fetch, store });

        const token = await session.accessToken();

        expect(token.ok).toBe(true);
        if (!token.ok) return;
        expect(token.token).toBe(PASTED_TOKEN);
        // No network call at all: nothing had to be renewed.
        expect(urls).toEqual([]);
    });

    it("asks for a new sign-in when there is nothing to refresh with", async () => {
        const { fetch } = router({});
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        const now = 3_000_000;
        store.save(
            { token: APP_TOKEN, refreshToken: null },
            {
                kind: "github-app",
                login: "octocat",
                userId: 1,
                scopes: [],
                scopesReported: false,
                clientId: APP_CLIENT.id,
                expiresAt: new Date(now - 1000).toISOString(),
                refreshTokenExpiresAt: null,
            },
        );
        const { session } = sessionWith({ fetch, store, now: () => now });

        const token = await session.accessToken();

        expect(token.ok).toBe(false);
        if (token.ok) return;
        expect(token.failure.code).toBe("session-expired");
        expect(token.failure.message).toContain("Sign in again");
    });
});

describe("what a failure is allowed to say", () => {
    it("never repeats the token, even when the transport error carries it", async () => {
        const { fetch } = router({
            [`${API_BASE}/user`]: () => {
                throw new Error(`socket hang up (Authorization: Bearer ${PASTED_TOKEN})`);
            },
        });
        const { session, events } = sessionWith({ fetch });

        const result = await session.signInWithToken(PASTED_TOKEN);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).not.toContain(PASTED_TOKEN);
        // And not through the event channel either, which is what reaches the renderer.
        expect(JSON.stringify(events)).not.toContain(PASTED_TOKEN);
    });

    it("reports insufficient scopes as such", async () => {
        const { fetch } = router({
            [`${API_BASE}/user`]: () =>
                json({ login: "octocat", id: 1 }, { "x-oauth-scopes": "public_repo, read:user" }),
        });
        const { session } = sessionWith({ fetch });

        const result = await session.signInWithToken(PASTED_TOKEN);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("insufficient-scopes");
        expect(result.failure.missingScopes).toEqual(["workflow"]);
    });
});

describe("reaching a repository", () => {
    it("reports a missing App installation instead of a missing repository", async () => {
        const { fetch } = router({
            [`${API_BASE}/user`]: () => json({ login: "octocat", id: 1 }),
            [`${API_BASE}/repos/octocat/world`]: () =>
                new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
            [`${OAUTH_BASE}/login/device/code`]: () =>
                json({
                    device_code: DEVICE_CODE,
                    user_code: "D8DF-0DE4",
                    verification_uri: "https://github.com/login/device",
                    expires_in: 899,
                    interval: 5,
                }),
            [`${OAUTH_BASE}/login/oauth/access_token`]: () => json({ access_token: APP_TOKEN }),
        });
        const { session } = sessionWith({ fetch });
        await session.startDeviceSignIn();

        const access = await session.checkRepository("octocat", "world");

        expect(access.ok).toBe(false);
        if (access.ok) return;
        expect(access.failure.code).toBe("app-not-installed");
        expect(access.failure.offerOAuthFallback).toBe(true);
    });
});

describe("signing out", () => {
    it("deletes the credential and does not claim a revocation it could not make", async () => {
        const { fetch } = router({
            [`${API_BASE}/user`]: () =>
                json(
                    { login: "octocat", id: 1 },
                    { "x-oauth-scopes": "public_repo, workflow, read:user" },
                ),
        });
        const { session, store, events } = sessionWith({ fetch });
        await session.signInWithToken(PASTED_TOKEN);

        const result = await session.signOut();

        expect(result.signedOut).toBe(true);
        expect(result.revoked).toBe(false);
        expect(result.manageUrl).toBe("https://github.com/settings/tokens");
        expect(store.metadata()).toBeNull();
        expect(session.status().signedIn).toBe(false);
        expect(events.some((event) => event.type === "signed-out")).toBe(true);
    });
});

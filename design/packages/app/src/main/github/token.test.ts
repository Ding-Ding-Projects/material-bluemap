/**
 * Tests for checking a token and letting go of one.
 *
 * Two things are being pinned down here, and they are both about telling somebody the
 * truth at the earliest moment it is knowable.
 *
 * The first is scopes. A token with the wrong ones works perfectly until the exact
 * moment it does not, which is halfway through starting a render, where the failure
 * reads as the render being broken rather than the sign-in. So the check happens on the
 * way in and names what is missing.
 *
 * The second is the 404. GitHub deliberately answers "not found" both for a repository
 * that does not exist and for one the caller is not allowed to know about - which is
 * right for GitHub and awful for an error message, because a GitHub App's most common
 * 404 by far is "you never installed me there". Somebody told "not found" checks their
 * spelling. Nobody checks their installation settings.
 *
 * Throughout: nothing this module produces may contain the token. The tests use a
 * realistic-looking one and assert its absence, including on the paths where an error
 * arrives with the whole request embedded in it.
 */

import { describe, expect, it } from "vitest";
import {
    checkRepositoryAccess,
    missingScopes,
    revokeToken,
    scopeSatisfied,
    verifyToken,
} from "./token.js";

const TOKEN = `ghp_${"z".repeat(36)}`;

function account(overrides: Record<string, unknown> = {}): unknown {
    return { login: "octocat", id: 583231, name: "The Octocat", ...overrides };
}

function respond(body: unknown, init: { status?: number; scopes?: string | null } = {}): Response {
    const headers: Record<string, string> = {};
    if (typeof init.scopes === "string") headers["x-oauth-scopes"] = init.scopes;
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

function fetchReturning(
    response: Response | (() => never),
): (url: string, init?: RequestInit) => Promise<Response> {
    return () => {
        if (typeof response === "function") response();
        return Promise.resolve((response as Response).clone());
    };
}

describe("scope arithmetic", () => {
    it("knows which scopes contain which", () => {
        expect(scopeSatisfied(["repo"], "public_repo")).toBe(true);
        expect(scopeSatisfied(["user"], "read:user")).toBe(true);
        expect(scopeSatisfied(["public_repo"], "public_repo")).toBe(true);
        // The one that catches people out: `workflow` is not implied by any repository
        // scope, so a token with `repo` alone still cannot dispatch a workflow.
        expect(scopeSatisfied(["repo"], "workflow")).toBe(false);
    });

    it("lists exactly what is missing", () => {
        expect(missingScopes(["public_repo", "read:user"])).toEqual(["workflow"]);
        expect(missingScopes(["repo", "workflow", "user"])).toEqual([]);
    });
});

describe("verifyToken", () => {
    it("accepts a token with the scopes this application needs", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(
                respond(account(), { scopes: "public_repo, workflow, read:user" }),
            ),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.identity.login).toBe("octocat");
        expect(result.scopes).toEqual(["public_repo", "workflow", "read:user"]);
        expect(result.scopesReported).toBe(true);
        expect(result.warnings).toEqual([]);
    });

    it("refuses a token that is missing one, and says which", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(respond(account(), { scopes: "public_repo, read:user" })),
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("insufficient-scopes");
        expect(result.failure.missingScopes).toEqual(["workflow"]);
        // The account is still reported: "that token belongs to you but cannot do this"
        // is a far more useful sentence than "that token is no good".
        expect(result.failure.identity?.login).toBe("octocat");
        expect(result.failure.message).toContain("octocat");
        expect(result.failure.message).toContain("workflow");
        expect(result.failure.message).not.toContain(TOKEN);
    });

    it("accepts an over-scoped token but says so immediately", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(
                respond(account(), { scopes: "repo, workflow, user, delete_repo" }),
            ),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.warnings.join(" ")).toContain("full 'repo' scope");
        expect(result.warnings.join(" ")).toContain("delete_repo");
    });

    it("treats a token with no scopes at all as insufficient rather than as unknown", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(respond(account(), { scopes: "" })),
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("insufficient-scopes");
        expect(result.failure.message).toContain("no scopes at all");
    });

    it("says plainly that a GitHub App token's permissions could not be checked here", async () => {
        // No x-oauth-scopes header at all, which is what an App user token sends.
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(respond(account())),
            source: "github-app",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.scopesReported).toBe(false);
        expect(result.warnings[0]).toContain("installed on");
        expect(result.warnings[0]).not.toContain("fine-grained");
    });

    it("says something different for a fine-grained personal access token", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(respond(account())),
            source: "personal-access-token",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.warnings[0]).toContain("fine-grained");
    });

    it("reports an unrecognised token without repeating it back", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(respond({ message: "Bad credentials" }, { status: 401 })),
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-token");
        expect(result.failure.message).not.toContain(TOKEN);
    });

    it("never lets the token out through an error that carries the request", async () => {
        const result = await verifyToken(TOKEN, {
            fetch: fetchReturning(() => {
                // Exactly the shape that leaks: a transport error whose message includes
                // the headers it was sent with.
                throw new Error(`fetch failed (Authorization: Bearer ${TOKEN})`);
            }),
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("network");
        expect(result.failure.message).not.toContain(TOKEN);
        expect(result.failure.message).toContain("[redacted]");
    });
});

describe("checkRepositoryAccess", () => {
    it("reports a 404 on a GitHub App as a possible missing installation", async () => {
        const result = await checkRepositoryAccess(TOKEN, "octocat", "private-world", {
            fetch: fetchReturning(respond({ message: "Not Found" }, { status: 404 })),
            source: "github-app",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("app-not-installed");
        expect(result.failure.message).toContain("has not been given access");
        expect(result.failure.manageUrl).toBe("https://github.com/settings/installations");
        // The whole point of detecting it: there is somewhere else to go.
        expect(result.failure.offerOAuthFallback).toBe(true);
    });

    it("reports the same 404 on a pasted token as a repository that is not there", async () => {
        const result = await checkRepositoryAccess(TOKEN, "octocat", "typo", {
            fetch: fetchReturning(respond({ message: "Not Found" }, { status: 404 })),
            source: "personal-access-token",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("not-found");
        expect(result.failure.offerOAuthFallback).toBe(false);
    });

    it("confirms a repository it can reach", async () => {
        const result = await checkRepositoryAccess(TOKEN, "octocat", "world", {
            fetch: fetchReturning(respond({ full_name: "octocat/world", private: false })),
            source: "github-app",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.fullName).toBe("octocat/world");
        expect(result.private).toBe(false);
    });
});

describe("revokeToken", () => {
    it("does not claim a revocation it could not make", async () => {
        const outcome = await revokeToken(TOKEN, "github-app", {
            fetch: fetchReturning(new Response(null, { status: 204 })),
            clientId: "Iv23liPCatYTLpipKJYS",
            // No secret, which is the shipped case.
            clientSecret: null,
        });

        expect(outcome.revoked).toBe(false);
        expect(outcome.reason).toContain("deleted from this computer");
        expect(outcome.manageUrl).toBe("https://github.com/settings/installations");
    });

    it("confirms one when GitHub confirms it", async () => {
        const outcome = await revokeToken(TOKEN, "oauth-app", {
            fetch: fetchReturning(new Response(null, { status: 204 })),
            clientId: "Ov23liJJhHYC2YP1iTFN",
            clientSecret: "a-real-secret",
        });

        expect(outcome.revoked).toBe(true);
        expect(outcome.reason).toBeNull();
    });

    it("sends a pasted token's owner to their own token settings", async () => {
        const outcome = await revokeToken(TOKEN, "personal-access-token", {
            fetch: fetchReturning(new Response(null, { status: 204 })),
        });

        expect(outcome.revoked).toBe(false);
        expect(outcome.manageUrl).toBe("https://github.com/settings/tokens");
    });
});

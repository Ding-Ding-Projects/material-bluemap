/**
 * The credential-routing decisions, exercised without ever touching a real network or a
 * real token.
 *
 * Every scenario here is one this application has genuinely hit: an in-app sign-in that is
 * short a scope while `gh` has it, a repository the in-app account cannot see but `gh` can
 * (the ambiguous 404 the module doc comment explains), and the one failure mode that must
 * never be automatic - a write that would run as a different account than the one selected.
 */

import { describe, expect, it } from "vitest";
import {
    chooseAccountForScope,
    classifyRoutableFailure,
    decideWriteRoute,
    routableFromGitHubFailure,
    routableFromHttpLikeStatus,
    routeWithFallback,
} from "./routing.js";
import type { RoutableFailure, RouteFallback } from "./routing.js";

/* -------------------------------------------------------------------------- */
/* classifyRoutableFailure                                                    */
/* -------------------------------------------------------------------------- */

describe("classifyRoutableFailure", () => {
    it("retries a 401 (the credential itself is no longer accepted)", () => {
        expect(classifyRoutableFailure({ status: 401 })).toEqual({
            retryOtherRoute: true,
            reason: "unauthorized",
        });
    });

    it("retries a 403 that is not a rate limit", () => {
        expect(classifyRoutableFailure({ status: 403, message: "Resource not accessible" })).toEqual({
            retryOtherRoute: true,
            reason: "forbidden",
        });
    });

    it("retries a 404, the ambiguous case GitHub itself cannot tell apart", () => {
        expect(classifyRoutableFailure({ status: 404 })).toEqual({
            retryOtherRoute: true,
            reason: "ambiguous-not-found",
        });
    });

    it("retries an explicit missing-scope failure regardless of its status", () => {
        expect(classifyRoutableFailure({ status: 403, missingScopes: ["workflow"] })).toEqual({
            retryOtherRoute: true,
            reason: "missing-scope",
        });
        expect(classifyRoutableFailure({ status: null, code: "insufficient-scopes" })).toEqual({
            retryOtherRoute: true,
            reason: "missing-scope",
        });
    });

    it("never retries a network failure - both credentials sit behind the same network", () => {
        expect(classifyRoutableFailure({ status: null })).toEqual({ retryOtherRoute: false, reason: "network" });
        expect(classifyRoutableFailure({ status: 0 })).toEqual({ retryOtherRoute: false, reason: "network" });
    });

    it("never retries a rate limit - a second identity does not make GitHub answer faster", () => {
        expect(classifyRoutableFailure({ status: 429 })).toEqual({
            retryOtherRoute: false,
            reason: "rate-limited",
        });
        expect(
            classifyRoutableFailure({ status: 403, message: "API rate limit exceeded for installation" }),
        ).toEqual({ retryOtherRoute: false, reason: "rate-limited" });
    });

    it("never retries a malformed request - every credential would be refused the same way", () => {
        expect(classifyRoutableFailure({ status: 422 })).toEqual({
            retryOtherRoute: false,
            reason: "malformed-request",
        });
        expect(classifyRoutableFailure({ status: 400 })).toEqual({
            retryOtherRoute: false,
            reason: "malformed-request",
        });
        expect(classifyRoutableFailure({ status: null, code: "malformed-response" })).toEqual({
            retryOtherRoute: false,
            reason: "malformed-request",
        });
    });

    it("fails closed on a status it does not recognise", () => {
        expect(classifyRoutableFailure({ status: 500 })).toEqual({
            retryOtherRoute: false,
            reason: "unclassified",
        });
    });
});

describe("routableFromGitHubFailure", () => {
    it("maps invalid-token to 401 and app-not-installed to 404", () => {
        expect(routableFromGitHubFailure({ code: "invalid-token", message: "bad token" }).status).toBe(401);
        expect(routableFromGitHubFailure({ code: "app-not-installed", message: "not installed" }).status).toBe(404);
    });

    it("carries missingScopes through unchanged", () => {
        const failure = routableFromGitHubFailure({
            code: "insufficient-scopes",
            message: "short a scope",
            missingScopes: ["workflow"],
        });
        expect(failure.missingScopes).toEqual(["workflow"]);
    });

    it("maps an unknown code to no status rather than guessing", () => {
        expect(routableFromGitHubFailure({ code: "already-signing-in", message: "busy" }).status).toBeNull();
    });
});

describe("routableFromHttpLikeStatus", () => {
    it("treats status 0 as no status at all", () => {
        expect(routableFromHttpLikeStatus(0, "gh not on PATH").status).toBeNull();
    });

    it("passes a real status straight through", () => {
        expect(routableFromHttpLikeStatus(404, "not found").status).toBe(404);
    });
});

/* -------------------------------------------------------------------------- */
/* chooseAccountForScope                                                      */
/* -------------------------------------------------------------------------- */

describe("chooseAccountForScope", () => {
    it("prefers the account known to hold the scope", () => {
        const choice = chooseAccountForScope(
            [
                { id: "app", login: "app-account", scopes: ["public_repo"], scopesReported: true },
                { id: "gh", login: "gh-account", scopes: ["repo", "workflow"], scopesReported: true },
            ],
            "workflow",
        );
        expect(choice.id).toBe("gh");
        expect(choice.reason).toContain("gh-account");
    });

    it("never rules out a candidate whose scope list is not reported at all", () => {
        const choice = chooseAccountForScope(
            [{ id: "app", login: "app-account", scopes: [], scopesReported: false }],
            "workflow",
        );
        expect(choice.id).toBeNull();
        expect(choice.reason).toContain("not yet known");
    });

    it("says plainly when neither known credential reports the scope", () => {
        const choice = chooseAccountForScope(
            [
                { id: "app", login: "a", scopes: ["public_repo"], scopesReported: true },
                { id: "gh", login: "b", scopes: ["gist"], scopesReported: true },
            ],
            "workflow",
        );
        expect(choice.id).toBeNull();
        expect(choice.reason).toContain("Neither");
    });
});

/* -------------------------------------------------------------------------- */
/* decideWriteRoute                                                           */
/* -------------------------------------------------------------------------- */

describe("decideWriteRoute", () => {
    it("proceeds when the fallback account is the same one selected, case-insensitively", () => {
        expect(decideWriteRoute("Octocat", "octocat")).toEqual({ proceed: true, reason: "same-account" });
    });

    it("proceeds when nothing was selected to diverge from", () => {
        expect(decideWriteRoute(null, "octocat")).toEqual({ proceed: true, reason: "no-account-selected" });
    });

    it("refuses to proceed automatically when the fallback account differs", () => {
        expect(decideWriteRoute("alice", "bob")).toEqual({
            proceed: false,
            reason: "different-account",
            selectedLogin: "alice",
            fallbackLogin: "bob",
        });
    });
});

/* -------------------------------------------------------------------------- */
/* routeWithFallback                                                          */
/* -------------------------------------------------------------------------- */

function fallbackOf<T>(
    accountLogin: string,
    run: () => Promise<T>,
    classifyFailure: (error: unknown) => RoutableFailure | null = () => null,
): RouteFallback<T> {
    return { describe: `the gh command-line tool (${accountLogin})`, accountLogin, run, classifyFailure };
}

class FakeApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function classifyFakeApiError(error: unknown): RoutableFailure | null {
    if (!(error instanceof FakeApiError)) return null;
    return routableFromHttpLikeStatus(error.status, error.message);
}

describe("routeWithFallback", () => {
    it("returns the primary's own value when it just works", async () => {
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.resolve("primary value"),
            classifyFailure: classifyFakeApiError,
            fallback: null,
        });
        expect(result).toEqual({
            outcome: "primary-succeeded",
            value: "primary value",
            message: "Used the sign-in in this application.",
        });
    });

    it("falls back and succeeds on an authentication failure (401)", async () => {
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(401, "token no longer accepted")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("octocat", () => Promise.resolve("fallback value")),
        });
        expect(result.outcome).toBe("fallback-succeeded");
        if (result.outcome === "fallback-succeeded") {
            expect(result.value).toBe("fallback value");
            expect(result.accessDifference).toBe(false);
        }
    });

    it("does NOT fall back on a network error", async () => {
        let fallbackCalled = false;
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(0, "getaddrinfo ENOTFOUND api.github.com")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("octocat", () => {
                fallbackCalled = true;
                return Promise.resolve("should never run");
            }),
        });
        expect(result.outcome).toBe("not-retried");
        expect(fallbackCalled).toBe(false);
    });

    it("does NOT fall back on a rate limit", async () => {
        let fallbackCalled = false;
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(403, "API rate limit exceeded")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("octocat", () => {
                fallbackCalled = true;
                return Promise.resolve("should never run");
            }),
        });
        expect(result.outcome).toBe("not-retried");
        expect(fallbackCalled).toBe(false);
    });

    it("reports a 404-then-success as an access difference, not as 'found it after all'", async () => {
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(404, "Not Found")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("octocat", () => Promise.resolve("read successfully")),
        });
        expect(result.outcome).toBe("fallback-succeeded");
        if (result.outcome === "fallback-succeeded") {
            expect(result.accessDifference).toBe(true);
            expect(result.message).toContain("access difference");
        }
    });

    it("reports a 404-then-404 as genuinely missing, not as an access difference", async () => {
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(404, "Not Found")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf(
                "octocat",
                () => Promise.reject(new FakeApiError(404, "Not Found")),
                classifyFakeApiError,
            ),
        });
        expect(result.outcome).toBe("both-failed");
        expect(result.message).toContain("genuinely does not exist");
    });

    it("keeps both routes' own failures distinct when neither is a matching 404", async () => {
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(403, "forbidden by the first account")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("octocat", () => Promise.reject(new FakeApiError(403, "forbidden by gh too"))),
        });
        expect(result.outcome).toBe("both-failed");
        expect(result.message).toContain("forbidden by the first account");
        expect(result.message).toContain("forbidden by gh too");
    });

    it("asks rather than proceeding when a write's fallback account differs from the selected one", async () => {
        let fallbackRan = false;
        const result = await routeWithFallback({
            kind: "write",
            selectedAccountLogin: "alice",
            describe: "the sign-in in this application (alice)",
            run: () => Promise.reject(new FakeApiError(403, "forbidden")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("bob", () => {
                fallbackRan = true;
                return Promise.resolve("created");
            }),
        });
        expect(result.outcome).toBe("needs-confirmation");
        expect(fallbackRan).toBe(false);
        if (result.outcome === "needs-confirmation") {
            expect(result.selectedLogin).toBe("alice");
            expect(result.fallbackLogin).toBe("bob");
        }
    });

    it("proceeds automatically when a write's fallback account matches the selected one", async () => {
        const result = await routeWithFallback({
            kind: "write",
            selectedAccountLogin: "alice",
            describe: "the sign-in in this application (alice)",
            run: () => Promise.reject(new FakeApiError(403, "forbidden")),
            classifyFailure: classifyFakeApiError,
            fallback: fallbackOf("alice", () => Promise.resolve("created")),
        });
        expect(result.outcome).toBe("fallback-succeeded");
        if (result.outcome === "fallback-succeeded") expect(result.value).toBe("created");
    });

    it("degrades honestly when gh is not available as a fallback at all", async () => {
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new FakeApiError(401, "token no longer accepted")),
            classifyFailure: classifyFakeApiError,
            fallback: null,
        });
        expect(result.outcome).toBe("gh-unavailable");
        expect(result.message).toContain("System dependencies");
    });

    it("never retries a failure it cannot classify at all", async () => {
        let fallbackCalled = false;
        const result = await routeWithFallback({
            kind: "read",
            selectedAccountLogin: null,
            describe: "the sign-in in this application",
            run: () => Promise.reject(new Error("something this test never taught the classifier about")),
            classifyFailure: () => null,
            fallback: fallbackOf("octocat", () => {
                fallbackCalled = true;
                return Promise.resolve("should never run");
            }),
        });
        expect(result.outcome).toBe("not-retried");
        expect(fallbackCalled).toBe(false);
    });

    it("never lets a token-shaped string appear in any message it produces", async () => {
        const scenarios: Array<Promise<unknown>> = [
            routeWithFallback({
                kind: "read",
                selectedAccountLogin: null,
                describe: "the sign-in in this application",
                run: () => Promise.reject(new FakeApiError(401, "ghp_thisIsNotARealTokenAAAAAAAAAAAAAAAA")),
                classifyFailure: classifyFakeApiError,
                fallback: fallbackOf("octocat", () => Promise.resolve("ok")),
            }),
            routeWithFallback({
                kind: "write",
                selectedAccountLogin: "alice",
                describe: "the sign-in in this application (alice)",
                run: () => Promise.reject(new FakeApiError(403, "forbidden")),
                classifyFailure: classifyFakeApiError,
                fallback: fallbackOf("bob", () => Promise.resolve("ok")),
            }),
        ];
        const results = await Promise.all(scenarios);
        for (const result of results) {
            const message = (result as { message: string }).message;
            expect(message.toLowerCase()).not.toMatch(/\bghp_|ghu_|ghs_|gho_/);
        }
    });
});

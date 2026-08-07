/**
 * The one gap every other test in this directory names and does not close: real contact
 * with github.com.
 *
 * `deviceFlow.test.ts`, `token.test.ts` and `session.test.ts` drive this module's logic
 * against a stand-in `fetch` that returns exactly the bytes a test wrote. That proves the
 * code is right about GitHub's documented shapes; it proves nothing about whether GitHub
 * still answers that way today, on the real endpoint, for this application's own
 * registered client id. This file is the one place that finds out, following the same
 * "loud skip by default, real network on request" pattern `SqlStorage.realServer.test.ts`
 * uses for real MySQL/MariaDB/PostgreSQL servers.
 *
 * ## What is proven here, and how
 *
 * - **`MBM_TEST_GITHUB_LIVE=1`** - no credential needed, because this half of the device
 *   flow is unauthenticated by design. It asks `https://github.com/login/device/code` for
 *   a real code using `GITHUB_OAUTH_CLIENT_ID`, the client id this application actually
 *   ships, and confirms GitHub answers with a real user code shaped the way the panel
 *   promises to render it. It then polls `https://github.com/login/oauth/access_token`
 *   once for real with that device code and confirms GitHub answers "not yet" rather than
 *   a hard error - which is the honest answer, since nobody approves it in this run - and
 *   stops there rather than waiting the full ~15 minutes for the code to expire.
 * - **`MBM_TEST_GITHUB_TOKEN`** - a real, already-issued token (any working GitHub token;
 *   this was run against `gh auth token`'s own OAuth token, so no new credential had to be
 *   minted for the check). Runs `verifyToken` against the real `GET /user` and, when the
 *   token can see it, `checkRepositoryAccess` against this project's own public
 *   repository. Both are read-only GitHub calls; neither mutates anything on the account.
 *
 * ## What this still does not prove
 *
 * Nobody has clicked "Authorize" on GitHub's verification page for this application's
 * client id. That step needs a human in a browser - it is the one part of the device flow
 * that is deliberately impossible to automate, on GitHub's side, not this application's -
 * so a full device-flow sign-in ending in `signed-in` remains unexercised against the real
 * server. See the article's own callout for the precise scope of what is left.
 *
 * ## Why `MBM_TEST_GITHUB_TOKEN` is read at run time and never written anywhere
 *
 * The token is read once from `process.env`, used only inside `Authorization` headers,
 * and never appears in an assertion, a log line, or a snapshot. A failing expectation in
 * this file must never be able to print it; that is why every assertion below compares
 * shapes and specific fields (`login`, `scopes`, `private`) rather than whole response
 * objects that might carry it.
 */

import { describe, expect, it } from "vitest";
import { GITHUB_OAUTH_CLIENT_ID, REQUIRED_SCOPES } from "./config.js";
import { pollForAccessToken, requestDeviceCode } from "./deviceFlow.js";
import { checkRepositoryAccess, verifyToken } from "./token.js";

const LIVE = process.env["MBM_TEST_GITHUB_LIVE"] === "1";
const TOKEN = process.env["MBM_TEST_GITHUB_TOKEN"];
const REPO = process.env["MBM_TEST_GITHUB_REPO"] ?? "Ding-Ding-Projects/worldlens";

/* -------------------------------------------------------------------------- */
/* The device flow's two live endpoints, unauthenticated                      */
/* -------------------------------------------------------------------------- */

if (!LIVE) {
    describe("the device flow - a real github.com", () => {
        it("is skipped because MBM_TEST_GITHUB_LIVE is not set to 1", () => {
            // Recorded as a passing test rather than silence, so a run that never touched
            // the real device-flow endpoint cannot be mistaken for one that did. Set
            // MBM_TEST_GITHUB_LIVE=1 to exercise it: no credential is required for this
            // half, since requesting a device code is deliberately open to anyone who
            // knows a client id.
            expect(LIVE).toBe(false);
        });
    });
} else {
    describe("the device flow - a real github.com", () => {
        it("asks the real device-code endpoint for this application's own client id", async () => {
            const requested = await requestDeviceCode({
                clientId: GITHUB_OAUTH_CLIENT_ID,
                clientKind: "oauth",
                scopes: REQUIRED_SCOPES,
                fetch,
            });

            expect(requested.ok).toBe(true);
            if (!requested.ok) return;

            const grant = requested.grant;
            // Verbatim shape the panel promises to render: eight characters and a
            // hyphen, GitHub's own case.
            expect(grant.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
            expect(grant.verificationUri).toBe("https://github.com/login/device");
            expect(grant.deviceCode.length).toBeGreaterThan(0);
            expect(grant.expiresInSeconds).toBeGreaterThan(0);
            expect(grant.intervalSeconds).toBeGreaterThanOrEqual(1);

            // Step two: one real poll of the token endpoint with that device code.
            // Nobody approves it in this run, so the honest answer is "not yet" - and
            // that is exactly what is asserted: not a token, and not a hard failure
            // either, which is what a wrong client id or a disabled device flow would
            // produce instead.
            const polledBodies: Array<Record<string, unknown>> = [];
            const recordingFetch: typeof fetch = async (input, init) => {
                const response = await fetch(input, init);
                const url = typeof input === "string" ? input : input.toString();
                if (url.includes("/login/oauth/access_token")) {
                    const clone = response.clone();
                    try {
                        polledBodies.push((await clone.json()) as Record<string, unknown>);
                    } catch {
                        // Not JSON is itself a finding the assertions below will catch.
                    }
                }
                return response;
            };

            const controller = new AbortController();
            const polled = await pollForAccessToken({
                clientId: GITHUB_OAUTH_CLIENT_ID,
                grant,
                fetch: recordingFetch,
                // Real seconds would make this test wait out GitHub's interval; the
                // library's own timing is proven elsewhere (deviceFlow.test.ts), and
                // this test only needs the request to actually leave the machine.
                sleep: async () => {},
                onWaiting: (state) => {
                    // The first call happens before any poll has been sent (attempt
                    // 0). By the time onWaiting reports attempt 1, exactly one real
                    // poll has already completed - that is the one this test wants -
                    // so stop here rather than looping for the full ~15 minutes.
                    if (state.attempt >= 1) controller.abort();
                },
                signal: controller.signal,
            });

            // A real poll left the machine and came back.
            expect(polledBodies.length).toBe(1);
            const answer = polledBodies[0];
            expect(answer).toBeDefined();
            // GitHub's two legitimate "not yet" answers. Anything else here (a typo'd
            // client id producing "incorrect_client_credentials", a disabled device
            // flow producing "device_flow_disabled", a malformed device code) would
            // fail this assertion, which is the point.
            expect(["authorization_pending", "slow_down"]).toContain(answer?.["error"]);

            // The library itself reports this as a cancellation, because the test
            // aborted it on purpose after the one real attempt - not because GitHub
            // refused anything.
            expect(polled.ok).toBe(false);
            if (!polled.ok) expect(polled.failure.code).toBe("cancelled");
        }, 20_000);
    });
}

/* -------------------------------------------------------------------------- */
/* Token verification and repository access, with a real credential          */
/* -------------------------------------------------------------------------- */

if (TOKEN === undefined || TOKEN.trim() === "") {
    describe("verifyToken and checkRepositoryAccess - a real account", () => {
        it("is skipped because MBM_TEST_GITHUB_TOKEN is not set", () => {
            // Set MBM_TEST_GITHUB_TOKEN to any real, working GitHub token to exercise
            // this. It is read once, used only in Authorization headers, and never
            // logged, asserted on directly, or written anywhere.
            expect(TOKEN === undefined || TOKEN.trim() === "").toBe(true);
        });
    });
} else {
    describe("verifyToken and checkRepositoryAccess - a real account", () => {
        it("identifies the real account behind the token, against the real API", async () => {
            const verified = await verifyToken(TOKEN, { fetch });

            // Whatever this token can and cannot do, GitHub answered with a real
            // account - not a network failure, not a malformed body, not a 401. That
            // is the fact this test exists to establish: the request shape, the
            // header names and the response parsing are correct against the live
            // server, not merely against a fixture shaped like it.
            if (verified.ok) {
                expect(verified.identity.login.length).toBeGreaterThan(0);
                expect(Array.isArray(verified.scopes)).toBe(true);
            } else {
                // insufficient-scopes is the one failure that still proves the round
                // trip worked: GitHub told this code exactly who the token belongs to
                // before saying it could not do the job.
                expect(verified.failure.code).toBe("insufficient-scopes");
                expect(verified.failure.identity?.login.length ?? 0).toBeGreaterThan(0);
            }
        }, 15_000);

        it("reads whether the token can see this project's own public repository", async () => {
            const [owner, repo] = REPO.split("/");
            expect(owner).toBeDefined();
            expect(repo).toBeDefined();
            if (owner === undefined || repo === undefined) return;

            const access = await checkRepositoryAccess(TOKEN, owner, repo, { fetch });

            // A public repository that exists: any working token, whatever its
            // scopes, can see it. A failure here would mean the request itself is
            // wrong - the URL shape, the header, or the response parsing - not a
            // permissions question.
            expect(access.ok).toBe(true);
            if (access.ok) {
                expect(access.fullName.toLowerCase()).toBe(REPO.toLowerCase());
                expect(access.private).toBe(false);
            }
        }, 15_000);
    });
}

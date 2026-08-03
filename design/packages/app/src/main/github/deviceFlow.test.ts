/**
 * Tests for GitHub's device flow.
 *
 * Almost everything here is about the answers that are not "yes". A device flow spends
 * nearly all of its life being told to wait, and the ways of getting that wrong are not
 * equally bad:
 *
 * - polling too slowly costs somebody a few seconds;
 * - polling too fast gets the client rate limited, which then presents as a sign-in that
 *   is broken for **everybody** using this application, not just the person who caused
 *   it;
 * - polling a code that has already expired never ends, and a screen that does it is
 *   indistinguishable from a hang.
 *
 * So the interesting assertions are the timing ones: that `slow_down` actually slows the
 * client down rather than being counted and ignored, and that the deadline stops the
 * loop rather than merely being displayed.
 *
 * The clock is a variable that `sleep` advances. That is not only for speed - it means
 * "did this wait fifteen seconds" is a fact a test can assert rather than a duration it
 * has to sit through.
 */

import { describe, expect, it } from "vitest";
import { pollForAccessToken, refreshAccessToken, requestDeviceCode } from "./deviceFlow.js";
import type { DeviceCodeGrant } from "./deviceFlow.js";

/** A 40-character device code, the length GitHub actually issues. */
const DEVICE_CODE = "0123456789abcdef0123456789abcdef01234567";

interface RecordedCall {
    readonly url: string;
    readonly fields: URLSearchParams;
}

function json(
    body: unknown,
    init: { status?: number; headers?: Record<string, string> } = {},
): Response {
    return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        ...(init.headers === undefined ? {} : { headers: init.headers }),
    });
}

/** A fetch that answers with the given responses in order and records what it was asked. */
function scriptedFetch(responses: (Response | (() => Response | never))[]): {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    calls: RecordedCall[];
} {
    const calls: RecordedCall[] = [];
    let index = 0;
    return {
        calls,
        fetch: (url, init) => {
            calls.push({ url, fields: new URLSearchParams(String(init?.body ?? "")) });
            const next = responses[Math.min(index, responses.length - 1)];
            index += 1;
            if (next === undefined) throw new Error("scripted fetch ran out of responses");
            return Promise.resolve(typeof next === "function" ? next() : next.clone());
        },
    };
}

/** A clock that only moves when something sleeps, so waits are assertable. */
function fakeClock(start = 1_000_000): {
    now: () => number;
    sleep: (ms: number) => Promise<void>;
    waits: number[];
} {
    let time = start;
    const waits: number[] = [];
    return {
        now: () => time,
        sleep: (ms) => {
            waits.push(ms / 1000);
            time += ms;
            return Promise.resolve();
        },
        waits,
    };
}

function grantFor(
    clock: { now: () => number },
    overrides: Partial<DeviceCodeGrant> = {},
): DeviceCodeGrant {
    return {
        deviceCode: DEVICE_CODE,
        userCode: "D8DF-0DE4",
        verificationUri: "https://github.com/login/device",
        verificationUriComplete: null,
        expiresInSeconds: 899,
        expiresAt: clock.now() + 899 * 1000,
        intervalSeconds: 5,
        ...overrides,
    };
}

const DEVICE_CODE_BODY = {
    device_code: DEVICE_CODE,
    user_code: "D8DF-0DE4",
    verification_uri: "https://github.com/login/device",
    expires_in: 899,
    interval: 5,
};

describe("requestDeviceCode", () => {
    it("reports the codes and the deadline as GitHub gave them", async () => {
        const { fetch } = scriptedFetch([json(DEVICE_CODE_BODY)]);

        const result = await requestDeviceCode({
            clientId: "Ov23liJJhHYC2YP1iTFN",
            clientKind: "oauth",
            scopes: ["public_repo", "workflow", "read:user"],
            fetch,
            now: () => 1_000_000,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Verbatim, hyphen included. This is the string somebody types on the
        // verification page, so reformatting it produces a code GitHub rejects and no
        // way for the person to tell which of the two they are looking at.
        expect(result.grant.userCode).toBe("D8DF-0DE4");
        expect(result.grant.verificationUri).toBe("https://github.com/login/device");
        expect(result.grant.intervalSeconds).toBe(5);
        expect(result.grant.expiresInSeconds).toBe(899);
        expect(result.grant.expiresAt).toBe(1_000_000 + 899_000);
    });

    it("sends the scope list for an OAuth application", async () => {
        const { fetch, calls } = scriptedFetch([json(DEVICE_CODE_BODY)]);

        await requestDeviceCode({
            clientId: "Ov23liJJhHYC2YP1iTFN",
            clientKind: "oauth",
            scopes: ["public_repo", "workflow", "read:user"],
            fetch,
        });

        expect(calls[0]?.url).toBe("https://github.com/login/device/code");
        expect(calls[0]?.fields.get("client_id")).toBe("Ov23liJJhHYC2YP1iTFN");
        expect(calls[0]?.fields.get("scope")).toBe("public_repo workflow read:user");
    });

    it("sends no scope at all for a GitHub App", async () => {
        const { fetch, calls } = scriptedFetch([json(DEVICE_CODE_BODY)]);

        await requestDeviceCode({
            clientId: "Iv23liPCatYTLpipKJYS",
            clientKind: "app",
            // Deliberately passed, and deliberately ignored: a GitHub App's permissions
            // come from its own configuration and its installations. An empty `scope` is
            // not the same thing as no `scope`, so the parameter must be absent entirely.
            scopes: ["public_repo", "workflow", "read:user"],
            fetch,
        });

        expect(calls[0]?.fields.get("client_id")).toBe("Iv23liPCatYTLpipKJYS");
        expect(calls[0]?.fields.has("scope")).toBe(false);
    });

    it("says so when the application has the device flow turned off", async () => {
        const { fetch } = scriptedFetch([json({ error: "device_flow_disabled" })]);

        const result = await requestDeviceCode({
            clientId: "Ov1",
            clientKind: "oauth",
            scopes: [],
            fetch,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("device-flow-disabled");
        expect(result.failure.message).toContain("personal access token");
    });

    it("reports a reply that is not JSON rather than crashing on it", async () => {
        const { fetch } = scriptedFetch([new Response("<html>proxy sign-in</html>")]);

        const result = await requestDeviceCode({
            clientId: "Ov1",
            clientKind: "oauth",
            scopes: [],
            fetch,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("malformed-response");
    });
});

describe("pollForAccessToken", () => {
    it("waits the interval, then returns the token once it is approved", async () => {
        const clock = fakeClock();
        const { fetch, calls } = scriptedFetch([
            json({ error: "authorization_pending" }),
            json({
                access_token: "gho_" + "a".repeat(36),
                token_type: "bearer",
                scope: "public_repo,workflow,read:user",
            }),
        ]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.grant.scopes).toEqual(["public_repo", "workflow", "read:user"]);
        expect(clock.waits).toEqual([5, 5]);
        expect(calls[0]?.fields.get("grant_type")).toBe(
            "urn:ietf:params:oauth:grant-type:device_code",
        );
        expect(calls[0]?.fields.get("device_code")).toBe(DEVICE_CODE);
    });

    it("actually slows down when told to, and never speeds back up", async () => {
        const clock = fakeClock();
        const { fetch } = scriptedFetch([
            json({ error: "authorization_pending" }),
            json({ error: "slow_down", interval: 5 }),
            // No interval this time: the documented five seconds is added instead.
            json({ error: "slow_down" }),
            json({ access_token: "gho_" + "b".repeat(36) }),
        ]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(true);
        // The whole point: 5, then 5 again while pending, then 10 after the first
        // slow_down and 15 after the second. A client that recorded the instruction and
        // carried on at 5 would produce [5, 5, 5, 5] and get itself rate limited.
        expect(clock.waits).toEqual([5, 5, 10, 15]);
    });

    it("stops when the code expires instead of polling a dead one forever", async () => {
        const clock = fakeClock();
        const { fetch, calls } = scriptedFetch([json({ error: "authorization_pending" })]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            // Three seconds left, and the first wait is five.
            grant: grantFor(clock, { expiresAt: clock.now() + 3000, expiresInSeconds: 3 }),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("expired");
        expect(result.failure.message).toContain("Start sign-in again");
        // Nothing was asked after the deadline passed.
        expect(calls).toHaveLength(0);
    });

    it("treats GitHub's own expired_token as the same ending", async () => {
        const clock = fakeClock();
        const { fetch } = scriptedFetch([json({ error: "expired_token" })]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("expired");
    });

    it("reports a refusal as a refusal, not as an error", async () => {
        const clock = fakeClock();
        const { fetch } = scriptedFetch([json({ error: "access_denied" })]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("denied");
        expect(result.failure.message).toContain("Nothing was stored");
    });

    it("waits out a dropped connection rather than abandoning the sign-in", async () => {
        const clock = fakeClock();
        let attempts = 0;
        const { fetch } = scriptedFetch([
            () => {
                attempts += 1;
                if (attempts <= 2) throw new Error("connect ECONNRESET");
                return json({ access_token: "gho_" + "c".repeat(36) });
            },
        ]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(true);
        expect(clock.waits).toEqual([5, 5, 5]);
    });

    it("gives up after enough consecutive transport failures, without leaking the device code", async () => {
        const clock = fakeClock();
        const { fetch } = scriptedFetch([
            () => {
                // The shape of a failure that carries the request with it, which is how a
                // credential ends up in a log file that somebody then pastes into an issue.
                throw new Error(`request failed: POST body=device_code=${DEVICE_CODE}`);
            },
        ]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
            maxNetworkRetries: 2,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("network");
        expect(result.failure.message).not.toContain(DEVICE_CODE);
        expect(result.failure.message).toContain("[redacted]");
    });

    it("stops when it is cancelled", async () => {
        const clock = fakeClock();
        const controller = new AbortController();
        controller.abort();
        const { fetch, calls } = scriptedFetch([json({ error: "authorization_pending" })]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
            signal: controller.signal,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        expect(calls).toHaveLength(0);
    });

    it("reports the countdown while it waits, so a screen can show it", async () => {
        const clock = fakeClock();
        const seen: number[] = [];
        const { fetch } = scriptedFetch([
            json({ error: "authorization_pending" }),
            json({ access_token: "gho_" + "d".repeat(36) }),
        ]);

        await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
            onWaiting: (state) => seen.push(state.secondsRemaining),
        });

        expect(seen).toEqual([899, 894]);
    });
});

describe("token shapes", () => {
    it("reads a GitHub App's expiring token, refresh token and both lifetimes", async () => {
        const clock = fakeClock();
        const { fetch } = scriptedFetch([
            json({
                access_token: "ghu_" + "e".repeat(36),
                refresh_token: "ghr_" + "f".repeat(36),
                expires_in: 28800,
                refresh_token_expires_in: 15897600,
                token_type: "bearer",
            }),
        ]);

        const result = await pollForAccessToken({
            clientId: "Iv1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.grant.refreshToken).toBe("ghr_" + "f".repeat(36));
        expect(result.grant.expiresInSeconds).toBe(28800);
        expect(result.grant.refreshTokenExpiresInSeconds).toBe(15897600);
    });

    it("reads an OAuth App's non-expiring token as non-expiring rather than as a missing field", async () => {
        const clock = fakeClock();
        const { fetch } = scriptedFetch([
            json({
                access_token: "gho_" + "g".repeat(36),
                token_type: "bearer",
                scope: "public_repo",
            }),
        ]);

        const result = await pollForAccessToken({
            clientId: "Ov1",
            grant: grantFor(clock),
            fetch,
            sleep: clock.sleep,
            now: clock.now,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.grant.refreshToken).toBeNull();
        expect(result.grant.expiresInSeconds).toBeNull();
        expect(result.grant.refreshTokenExpiresInSeconds).toBeNull();
    });
});

describe("refreshAccessToken", () => {
    it("trades a refresh token for a new pair", async () => {
        const { fetch, calls } = scriptedFetch([
            json({
                access_token: "ghu_" + "h".repeat(36),
                refresh_token: "ghr_" + "i".repeat(36),
                expires_in: 28800,
                refresh_token_expires_in: 15897600,
            }),
        ]);

        const result = await refreshAccessToken({
            clientId: "Iv23liPCatYTLpipKJYS",
            refreshToken: "ghr_" + "f".repeat(36),
            fetch,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.grant.token).toBe("ghu_" + "h".repeat(36));
        expect(result.grant.refreshToken).toBe("ghr_" + "i".repeat(36));
        expect(calls[0]?.fields.get("grant_type")).toBe("refresh_token");
        // No secret was configured, so none was sent. GitHub's answer decides what
        // happens next rather than this code assuming it knows.
        expect(calls[0]?.fields.has("client_secret")).toBe(false);
    });

    it("reports a refused refresh without printing either credential", async () => {
        const { fetch } = scriptedFetch([
            json({
                error: "bad_refresh_token",
                error_description: "The refresh token is invalid.",
            }),
        ]);

        const result = await refreshAccessToken({
            clientId: "Iv1",
            refreshToken: "ghr_" + "j".repeat(36),
            fetch,
            clientSecret: "supersecretvalue",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain("The refresh token is invalid.");
        expect(result.failure.message).not.toContain("ghr_");
        expect(result.failure.message).not.toContain("supersecretvalue");
    });
});

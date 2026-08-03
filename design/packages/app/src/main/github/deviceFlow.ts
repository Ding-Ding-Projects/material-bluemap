/**
 * GitHub's OAuth device flow, which is how this application signs somebody in.
 *
 * The flow is: ask GitHub for a pair of codes, show the person the short one, send them
 * to a page where they type it, and poll until they have. It was chosen over the usual
 * redirect-based authorization code flow for three reasons, and each of them is a real
 * constraint rather than a preference:
 *
 * 1. A desktop application cannot keep a client secret. The bundle is on the user's
 *    disk. The authorization code flow's confidential variant needs one; the device flow
 *    needs none, so there is no secret to fail to protect.
 * 2. There is no redirect to catch. The alternatives are a loopback HTTP server on a
 *    port the app has to guess, or a custom URL scheme registered with the operating
 *    system. Both are more moving parts, and both are more attack surface, for a sign-in
 *    that happens once.
 * 3. The machine rendering a world need not be the machine with a browser on it. The
 *    user code is eight characters and a hyphen; it can be typed on a phone.
 *
 * Nothing here touches Electron, the filesystem, or the clock directly, so all of it is
 * testable: `fetch`, `sleep` and `now` are parameters.
 */

import { GITHUB_OAUTH_BASE } from "./config.js";
import type { GitHubClientKind } from "./config.js";
import { describeError, redactSecrets } from "./redact.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Milliseconds. A parameter so a test does not wait through a real interval. */
export type SleepLike = (milliseconds: number) => Promise<void>;

export type DeviceFlowFailureCode =
    /** No OAuth application is configured, so the flow cannot even be started. */
    | "no-client-configured"
    /** The request never reached GitHub, or the response never came back. */
    | "network"
    /** GitHub answered, with something other than success. */
    | "http"
    /** GitHub answered with a body this code cannot make sense of. */
    | "malformed-response"
    /** The application exists but does not have the device flow turned on. */
    | "device-flow-disabled"
    /** The person said no on the verification page. */
    | "denied"
    /** The user code ran out of time before it was entered. */
    | "expired"
    /** The app or the person stopped waiting. */
    | "cancelled"
    /** Anything else the OAuth endpoint reported, passed through with its description. */
    | "oauth";

export interface DeviceFlowFailure {
    readonly code: DeviceFlowFailureCode;
    /** Written to be shown as-is. Never contains a credential. */
    readonly message: string;
}

/**
 * What GitHub hands back when a device flow starts.
 *
 * `userCode` is shown to the person **exactly as it arrives**, hyphen included, because
 * that is what the verification page expects them to type. Reformatting it, stripping
 * the hyphen or upper-casing something GitHub did not upper-case turns a working code
 * into one that is rejected, and the person has no way to tell which of the two they
 * are looking at.
 */
export interface DeviceCodeGrant {
    /** The credential the poll is made with. Never displayed, never logged. */
    readonly deviceCode: string;
    /** `XXXX-XXXX`. Displayed verbatim. */
    readonly userCode: string;
    /** Where the person types the code. Opened in the system browser. */
    readonly verificationUri: string;
    /** The same page with the code pre-filled, when GitHub offers one. */
    readonly verificationUriComplete: string | null;
    /** As reported. About 15 minutes at the time of writing. */
    readonly expiresInSeconds: number;
    /** Epoch milliseconds, computed once from `now` so the deadline cannot drift. */
    readonly expiresAt: number;
    /** Seconds GitHub asks the client to wait between polls. Typically 5. */
    readonly intervalSeconds: number;
}

export type DeviceCodeResult =
    | { readonly ok: true; readonly grant: DeviceCodeGrant }
    | { readonly ok: false; readonly failure: DeviceFlowFailure };

/**
 * A token, and what is known about how long it lives.
 *
 * The two client kinds answer differently and both answers are legitimate:
 *
 * - an **OAuth App** returns a token and nothing else. It does not expire, so
 *   `refreshToken` and `expiresInSeconds` are null and that is not a missing field.
 * - a **GitHub App** with expiring tokens turned on returns a token good for about eight
 *   hours, a refresh token good for about six months, and the lifetime of each.
 *
 * Treating the OAuth shape as an error would break the fallback path; treating the App
 * shape as non-expiring would produce a token that dies mid-render while the app reports
 * something unrelated. So both are represented, and nothing is inferred from silence.
 */
export interface AccessTokenGrant {
    readonly token: string;
    /** The scopes GitHub actually granted. Always empty for a GitHub App, which has none. */
    readonly scopes: readonly string[];
    readonly tokenType: string;
    /** Null when the token does not expire. */
    readonly refreshToken: string | null;
    /** Null when the token does not expire. */
    readonly expiresInSeconds: number | null;
    /** Null when there is no refresh token to expire. */
    readonly refreshTokenExpiresInSeconds: number | null;
}

export type PollResult =
    | { readonly ok: true; readonly grant: AccessTokenGrant }
    | { readonly ok: false; readonly failure: DeviceFlowFailure };

/**
 * When GitHub says `slow_down` without saying by how much.
 *
 * GitHub's documentation describes adding five seconds to the minimum interval, and the
 * response usually carries an `interval` as well. The two descriptions can be read as
 * "the new interval" or "the amount to add"; this code adds it, which is never faster
 * than either reading. Polling too slowly costs a few seconds of somebody's time.
 * Polling too fast gets the client rate limited, and that presents as a sign-in that is
 * broken for everybody, not just the person who caused it.
 */
const SLOW_DOWN_INCREMENT_SECONDS = 5;

/** No interval this code obeys ever grows past this. The deadline bounds the wait anyway. */
const MAXIMUM_INTERVAL_SECONDS = 60;

/** GitHub's own floor. A server that asks for less than this is still polled at this rate. */
const MINIMUM_INTERVAL_SECONDS = 1;

/** Consecutive transport failures tolerated before the poll gives up. */
const DEFAULT_NETWORK_RETRIES = 5;

const EXPIRED_MESSAGE =
    "The sign-in code expired before it was entered. Start sign-in again to get a fresh code.";

export interface DeviceCodeOptions {
    readonly clientId: string;
    /**
     * Decides whether a `scope` parameter is sent at all.
     *
     * A GitHub App has no scopes: its permissions come from the App's configuration and
     * from the repositories it was installed on. Sending `scope` to an App client is
     * meaningless, so for `app` the parameter is omitted entirely rather than sent empty
     * - an empty `scope` on an OAuth client means "no scopes", and the two must not be
     * confused with one another.
     */
    readonly clientKind: GitHubClientKind;
    /** Ignored for a GitHub App. See {@link DeviceCodeOptions.clientKind}. */
    readonly scopes: readonly string[];
    readonly fetch: FetchLike;
    /** Epoch milliseconds. Defaults to the real clock. */
    readonly now?: (() => number) | undefined;
    readonly oauthBase?: string | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Step one: ask for a pair of codes.
 *
 * Fails with a value rather than throwing, because every one of these failures is
 * something the sign-in screen has to render, and an exception would have to be caught
 * and converted at every call site to say the same thing.
 */
export async function requestDeviceCode(options: DeviceCodeOptions): Promise<DeviceCodeResult> {
    const base = options.oauthBase ?? GITHUB_OAUTH_BASE;
    const now = options.now ?? Date.now;

    const fields: Record<string, string> =
        options.clientKind === "app"
            ? { client_id: options.clientId }
            : // GitHub takes the scope list space separated in one field.
              { client_id: options.clientId, scope: options.scopes.join(" ") };

    const posted = await postForm(
        `${base}/login/device/code`,
        fields,
        options.fetch,
        [],
        options.signal,
    );
    if (!posted.ok) return { ok: false, failure: posted.failure };

    const body = posted.body;
    const deviceCode = readString(body, "device_code");
    const userCode = readString(body, "user_code");
    const verificationUri = readString(body, "verification_uri");

    const reportedError = readString(body, "error");
    if (reportedError !== null) {
        return { ok: false, failure: oauthFailure(reportedError, body, []) };
    }

    if (deviceCode === null || userCode === null || verificationUri === null) {
        return {
            ok: false,
            failure: {
                code: "malformed-response",
                message:
                    "GitHub's reply to the sign-in request was missing the codes it should" +
                    " contain. Try again, and if it keeps happening check whether something" +
                    " on this network is rewriting requests to github.com.",
            },
        };
    }

    const expiresInSeconds = readNumber(body, "expires_in") ?? 900;
    const intervalSeconds = clampInterval(readNumber(body, "interval") ?? 5);

    return {
        ok: true,
        grant: {
            deviceCode,
            // Verbatim. See the doc comment on DeviceCodeGrant.
            userCode,
            verificationUri,
            verificationUriComplete: readString(body, "verification_uri_complete"),
            expiresInSeconds,
            expiresAt: now() + expiresInSeconds * 1000,
            intervalSeconds,
        },
    };
}

/** Reported to the caller before each wait, so a sign-in screen can count down honestly. */
export interface PollWaitState {
    /** How long this client is about to wait, after any `slow_down` the server asked for. */
    readonly intervalSeconds: number;
    /** Until the user code is dead. The screen shows this; at zero it says so. */
    readonly secondsRemaining: number;
    /** 0 before the first request. */
    readonly attempt: number;
}

export interface PollOptions {
    readonly clientId: string;
    readonly grant: DeviceCodeGrant;
    readonly fetch: FetchLike;
    readonly sleep: SleepLike;
    readonly now?: (() => number) | undefined;
    readonly oauthBase?: string | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly onWaiting?: ((state: PollWaitState) => void) | undefined;
    readonly maxNetworkRetries?: number | undefined;
}

/**
 * Step two: wait for the person to approve, then take the token.
 *
 * The loop obeys three separate limits, and mixing them up is the usual bug:
 *
 * - the **interval**, which is how long to wait between requests and which only ever
 *   grows, on the server's instruction;
 * - the **deadline**, which is when the user code dies (about fifteen minutes) and
 *   after which polling is pointless; a client that keeps going past it is indis-
 *   tinguishable from a hang, because the server keeps answering the same way forever;
 * - the **transport retry budget**, which is separate from both, because a dropped
 *   connection says nothing about whether the person has approved yet.
 */
export async function pollForAccessToken(options: PollOptions): Promise<PollResult> {
    const base = options.oauthBase ?? GITHUB_OAUTH_BASE;
    const now = options.now ?? Date.now;
    const maxNetworkRetries = options.maxNetworkRetries ?? DEFAULT_NETWORK_RETRIES;
    const secrets = [options.grant.deviceCode];

    let intervalSeconds = clampInterval(options.grant.intervalSeconds);
    let consecutiveTransportFailures = 0;
    let attempt = 0;

    // A function rather than a read: `aborted` is declared readonly, so a direct
    // comparison is narrowed to false for the rest of the loop body and the check after
    // the wait - the one that matters - would be compiled away.
    const aborted = (): boolean => options.signal?.aborted === true;

    for (;;) {
        if (aborted()) return cancelled();

        const remainingMs = options.grant.expiresAt - now();
        if (remainingMs <= 0) return expired();

        options.onWaiting?.({
            intervalSeconds,
            secondsRemaining: Math.ceil(remainingMs / 1000),
            attempt,
        });

        await options.sleep(intervalSeconds * 1000);

        if (aborted()) return cancelled();
        // Re-checked after the wait: the interval can have been raised past whatever was
        // left, and asking about a code that is already dead only invites a rate limit.
        if (options.grant.expiresAt - now() <= 0) return expired();

        attempt += 1;
        const posted = await postForm(
            `${base}/login/oauth/access_token`,
            {
                client_id: options.clientId,
                device_code: options.grant.deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            },
            options.fetch,
            secrets,
            options.signal,
        );

        if (!posted.ok) {
            if (posted.retryable) {
                consecutiveTransportFailures += 1;
                if (consecutiveTransportFailures <= maxNetworkRetries) continue;
                return {
                    ok: false,
                    failure: {
                        code: "network",
                        message:
                            `Lost contact with GitHub while waiting for the sign-in to be` +
                            ` approved, ${consecutiveTransportFailures} times in a row. Last` +
                            ` error: ${posted.failure.message}`,
                    },
                };
            }
            return { ok: false, failure: posted.failure };
        }
        consecutiveTransportFailures = 0;

        const body = posted.body;
        const token = readString(body, "access_token");
        if (token !== null) return { ok: true, grant: readGrant(body, token) };

        const error = readString(body, "error");
        switch (error) {
            case "authorization_pending":
                // The expected answer for most of the wait: nobody has typed the code yet.
                continue;

            case "slow_down": {
                const reported = readNumber(body, "interval");
                const increment =
                    reported !== null && reported > 0
                        ? Math.round(reported)
                        : SLOW_DOWN_INCREMENT_SECONDS;
                intervalSeconds = clampInterval(intervalSeconds + increment);
                continue;
            }

            case "expired_token":
                return expired();

            case "access_denied":
                return {
                    ok: false,
                    failure: {
                        code: "denied",
                        message:
                            "Sign-in was refused on the GitHub page. Nothing was stored." +
                            " Start again if that was not what you meant to do.",
                    },
                };

            case null:
                return {
                    ok: false,
                    failure: {
                        code: "malformed-response",
                        message:
                            "GitHub answered the sign-in poll with neither a token nor an" +
                            " error. Nothing was stored.",
                    },
                };

            default:
                return { ok: false, failure: oauthFailure(error, body, secrets) };
        }
    }
}

/**
 * Reads a token response, whichever of the two shapes it is.
 *
 * Absence is meaningful here rather than an omission: no `refresh_token` means the token
 * does not expire, which is the normal OAuth App answer, and it is recorded as null so
 * nothing downstream schedules a refresh that would fail.
 */
function readGrant(body: Record<string, unknown>, token: string): AccessTokenGrant {
    return {
        token,
        scopes: parseScopeList(readString(body, "scope")),
        tokenType: readString(body, "token_type") ?? "bearer",
        refreshToken: readString(body, "refresh_token"),
        expiresInSeconds: readNumber(body, "expires_in"),
        refreshTokenExpiresInSeconds: readNumber(body, "refresh_token_expires_in"),
    };
}

export interface RefreshOptions {
    readonly clientId: string;
    readonly refreshToken: string;
    readonly fetch: FetchLike;
    readonly oauthBase?: string | undefined;
    /**
     * Null on a shipped build.
     *
     * GitHub's documented parameters for the refresh grant include the application's own
     * client secret, which a desktop application does not have. This code sends one when
     * a build has been configured with it and otherwise sends the request without, so the
     * outcome is GitHub's answer rather than this code's assumption. Either way a refusal
     * is reported as a sign-in that has to be done again, which is a sentence somebody
     * can act on, rather than as an unexplained failure later.
     */
    readonly clientSecret?: string | null | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Trades a refresh token for a new access token.
 *
 * Only ever called for a GitHub App with expiring tokens: an OAuth App has no refresh
 * token, and calling this without one is a bug rather than a runtime condition.
 */
export async function refreshAccessToken(options: RefreshOptions): Promise<PollResult> {
    const base = options.oauthBase ?? GITHUB_OAUTH_BASE;
    const secrets = [options.refreshToken, options.clientSecret ?? null].filter(
        (value): value is string => typeof value === "string",
    );

    const fields: Record<string, string> = {
        client_id: options.clientId,
        grant_type: "refresh_token",
        refresh_token: options.refreshToken,
    };
    if (typeof options.clientSecret === "string" && options.clientSecret !== "") {
        fields["client_secret"] = options.clientSecret;
    }

    const posted = await postForm(
        `${base}/login/oauth/access_token`,
        fields,
        options.fetch,
        secrets,
        options.signal,
    );
    if (!posted.ok) return { ok: false, failure: posted.failure };

    const token = readString(posted.body, "access_token");
    if (token !== null) return { ok: true, grant: readGrant(posted.body, token) };

    const error = readString(posted.body, "error");
    if (error === null) {
        return {
            ok: false,
            failure: {
                code: "malformed-response",
                message:
                    "GitHub answered the token refresh with neither a token nor an error." +
                    " Sign in again to get a fresh one.",
            },
        };
    }
    return { ok: false, failure: oauthFailure(error, posted.body, secrets) };
}

function expired(): PollResult {
    return { ok: false, failure: { code: "expired", message: EXPIRED_MESSAGE } };
}

function cancelled(): PollResult {
    return {
        ok: false,
        failure: { code: "cancelled", message: "Sign-in was cancelled. Nothing was stored." },
    };
}

/* -------------------------------------------------------------------------- */
/* The transport                                                              */
/* -------------------------------------------------------------------------- */

type PostResult =
    | { readonly ok: true; readonly body: Record<string, unknown> }
    | {
          readonly ok: false;
          readonly failure: DeviceFlowFailure;
          /** True for a blip worth waiting out; false for something a retry cannot fix. */
          readonly retryable: boolean;
      };

async function postForm(
    url: string,
    fields: Record<string, string>,
    fetchImpl: FetchLike,
    secrets: readonly string[],
    signal: AbortSignal | undefined,
): Promise<PostResult> {
    const body = new URLSearchParams(fields).toString();

    let response: Response;
    try {
        response = await fetchImpl(url, {
            method: "POST",
            headers: {
                // Without this the endpoint answers in form-encoding, and the error cases
                // become much harder to tell apart than they need to be.
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "material-bluemap",
            },
            body,
            ...(signal === undefined ? {} : { signal }),
        });
    } catch (error) {
        if (signal?.aborted === true) {
            return {
                ok: false,
                retryable: false,
                failure: {
                    code: "cancelled",
                    message: "Sign-in was cancelled. Nothing was stored.",
                },
            };
        }
        return {
            ok: false,
            retryable: true,
            failure: {
                code: "network",
                // The request body carries the device code, and some fetch implementations
                // put the request into the error. Redaction is not paranoia here.
                message: `Could not reach GitHub: ${describeError(error, secrets)}`,
            },
        };
    }

    const text = await readBodyText(response, secrets);

    if (!response.ok) {
        return {
            ok: false,
            // A 5xx is GitHub having a moment; a 4xx is this client being wrong, and
            // repeating a wrong request more slowly does not make it right.
            retryable: response.status >= 500,
            failure: {
                code: "http",
                message:
                    `GitHub refused the sign-in request with HTTP ${response.status}.` +
                    (text === "" ? "" : ` ${truncate(text, 300)}`),
            },
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return {
            ok: false,
            retryable: false,
            failure: {
                code: "malformed-response",
                message:
                    "GitHub's reply to the sign-in request was not the JSON it should have" +
                    " been. Something on this network may be intercepting requests to" +
                    " github.com.",
            },
        };
    }

    if (typeof parsed !== "object" || parsed === null) {
        return {
            ok: false,
            retryable: false,
            failure: {
                code: "malformed-response",
                message: "GitHub's reply to the sign-in request was not an object.",
            },
        };
    }

    return { ok: true, body: parsed as Record<string, unknown> };
}

async function readBodyText(response: Response, secrets: readonly string[]): Promise<string> {
    try {
        return await response.text();
    } catch (error) {
        return redactSecrets(describeError(error, secrets), secrets);
    }
}

function oauthFailure(
    error: string,
    body: Record<string, unknown>,
    secrets: readonly string[],
): DeviceFlowFailure {
    const description = readString(body, "error_description");
    const detail = description === null ? error : `${description} (${error})`;

    if (error === "device_flow_disabled") {
        return {
            code: "device-flow-disabled",
            message:
                "This GitHub application does not have the device flow enabled, so it" +
                " cannot sign anyone in this way. Sign in with a personal access token" +
                " instead, or turn on 'Enable Device Flow' in the application's settings.",
        };
    }
    if (error === "access_denied") {
        return { code: "denied", message: "Sign-in was refused on the GitHub page." };
    }
    if (error === "expired_token") {
        return { code: "expired", message: EXPIRED_MESSAGE };
    }

    return {
        code: "oauth",
        message: `GitHub refused the sign-in request: ${redactSecrets(truncate(detail, 300), secrets)}`,
    };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function clampInterval(seconds: number): number {
    if (!Number.isFinite(seconds)) return 5;
    return Math.min(
        MAXIMUM_INTERVAL_SECONDS,
        Math.max(MINIMUM_INTERVAL_SECONDS, Math.round(seconds)),
    );
}

function readString(body: Record<string, unknown>, key: string): string | null {
    const value = body[key];
    return typeof value === "string" && value !== "" ? value : null;
}

function readNumber(body: Record<string, unknown>, key: string): number | null {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // The endpoint has been known to answer with numbers as strings.
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/** `"public_repo,workflow"` and `"public_repo workflow"` are both seen in the wild. */
export function parseScopeList(raw: string | null): readonly string[] {
    if (raw === null) return [];
    return raw
        .split(/[,\s]+/)
        .map((scope) => scope.trim())
        .filter((scope) => scope !== "");
}

function truncate(text: string, limit: number): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit)}...`;
}

/**
 * Signing in, staying signed in, and signing out.
 *
 * This is the piece that decides what actually happens; the modules underneath it each
 * do one thing and know nothing about the others. Three ways in, all ending in the same
 * place:
 *
 * - the **OAuth App** device flow, which is how sign-in works by default;
 * - the **GitHub App** device flow, for somebody who would rather grant access one
 *   repository at a time and is willing to install it and live with tokens that expire.
 *   When an App sign-in cannot reach the repository somebody is trying to render, the
 *   OAuth path is offered rather than leaving them at a dead end;
 * - a **personal access token** pasted by hand, because the device endpoint is a POST to
 *   github.com that a corporate proxy can and does block, and because some people simply
 *   already have a token and would rather use it.
 *
 * All three end at the same place: the token is checked against the API before it is
 * believed, the account and its real permissions are reported back, and the token is
 * handed to the operating system's credential store. A refusal to store it is not a
 * failure to sign in - the session continues in memory and says so.
 *
 * Nothing in this file imports Electron. Everything that would need to (the credential
 * store, the browser, the clock) arrives as a parameter, which is what makes the whole
 * flow testable without a window.
 */

import {
    REQUIRED_SCOPES,
    fallbackOAuthClient,
    scopesForClient,
    tokenSourceForClient,
} from "./config.js";
import type { GitHubClient, TokenSource } from "./config.js";
import type { AccessTokenGrant, DeviceCodeGrant, FetchLike, SleepLike } from "./deviceFlow.js";
import { pollForAccessToken, refreshAccessToken, requestDeviceCode } from "./deviceFlow.js";
import type { StoredCredential, StoredSecret, TokenStore } from "./storage.js";
import { checkRepositoryAccess, revokeToken, verifyToken } from "./token.js";
import type { RepositoryAccess, TokenVerification } from "./token.js";

export interface GitHubAccount {
    readonly login: string;
    readonly userId: number | null;
    readonly name: string | null;
    readonly scopes: readonly string[];
    /** False for a GitHub App or fine-grained token, neither of which reports scopes. */
    readonly scopesReported: boolean;
    readonly source: TokenSource;
    readonly signedInAt: string;
    /** Null when the token does not expire, which is the normal OAuth App answer. */
    readonly expiresAt: string | null;
    /** True when a refresh token is held, so an expiry can be dealt with silently. */
    readonly refreshable: boolean;
    /**
     * False when the credential store refused it. The interface says so, because the
     * difference only shows up at the next launch, when the person is signed out again
     * and has no idea why.
     */
    readonly persisted: boolean;
    /** Things worth saying about this token. Shown next to the account. */
    readonly warnings: readonly string[];
}

export interface GitHubFailure {
    readonly code: string;
    readonly message: string;
    /** Populated for `insufficient-scopes`, so the interface can name them. */
    readonly missingScopes: readonly string[];
    /** True when signing in with the OAuth application instead would likely work. */
    readonly offerOAuthFallback: boolean;
}

export type SignInResult =
    | { readonly ok: true; readonly account: GitHubAccount }
    | { readonly ok: false; readonly failure: GitHubFailure };

export type AccessTokenResult =
    | { readonly ok: true; readonly token: string }
    | { readonly ok: false; readonly failure: GitHubFailure };

export interface SignOutResult {
    readonly signedOut: boolean;
    /** True only when GitHub confirmed the revocation. See `revokeToken`. */
    readonly revoked: boolean;
    readonly reason: string | null;
    readonly manageUrl: string | null;
}

export interface GitHubStatus {
    readonly signedIn: boolean;
    readonly account: GitHubAccount | null;
    /** False when this build has no client configured; only the token path is available. */
    readonly clientConfigured: boolean;
    readonly clientKind: "app" | "oauth" | null;
    /** False when this machine has no credential store; a token will not be persisted. */
    readonly encryptionAvailable: boolean;
    readonly requiredScopes: readonly string[];
    readonly signingIn: boolean;
}

/**
 * What the sign-in screen is told, as it happens.
 *
 * `code` carries the deadline because the screen has to show it. A user code lives about
 * fifteen minutes, and a screen that shows the code with no clock, then silently keeps
 * polling a code that died four minutes ago, is indistinguishable from a hang. When the
 * deadline passes the poll stops on its own and a `failed` event with code `expired`
 * follows, which is the screen's cue to offer a fresh code rather than a spinner.
 */
export type GitHubAuthEvent =
    | {
          readonly type: "code";
          readonly userCode: string;
          readonly verificationUri: string;
          readonly verificationUriComplete: string | null;
          readonly expiresAt: string;
          readonly expiresInSeconds: number;
          readonly intervalSeconds: number;
          /** False when the browser could not be opened; the screen shows the address. */
          readonly browserOpened: boolean;
      }
    | {
          readonly type: "waiting";
          readonly secondsRemaining: number;
          readonly intervalSeconds: number;
      }
    | { readonly type: "signed-in"; readonly account: GitHubAccount }
    | { readonly type: "failed"; readonly failure: GitHubFailure }
    | { readonly type: "cancelled" }
    | { readonly type: "signed-out" };

export interface GitHubSessionOptions {
    readonly store: TokenStore;
    readonly fetch: FetchLike;
    readonly sleep: SleepLike;
    /** The configured client, read on every call so an environment change takes effect. */
    readonly client: () => GitHubClient | null;
    /** The OAuth application to fall back to. Defaults to the built-in one. */
    readonly oauthFallbackClient?: (() => GitHubClient | null) | undefined;
    readonly clientSecret?: (() => string | null) | undefined;
    /** Opens a URL in the system browser. False when it was refused. */
    readonly openExternal: (url: string) => Promise<boolean>;
    readonly onEvent?: ((event: GitHubAuthEvent) => void) | undefined;
    readonly now?: (() => number) | undefined;
    readonly apiBase?: string | undefined;
    readonly oauthBase?: string | undefined;
    readonly requiredScopes?: readonly string[] | undefined;
    readonly maxNetworkRetries?: number | undefined;
}

/**
 * How long before expiry a token is refreshed.
 *
 * A GitHub App token lives about eight hours, and a render can run for far longer than
 * that. Refreshing only once a request has already failed means the failure happens
 * first, somewhere in the middle of a job, and gets reported as whatever that job was
 * doing. Five minutes of margin is enough to cover a slow round trip and a clock that
 * disagrees with GitHub's by a little.
 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class GitHubSession {
    readonly #options: GitHubSessionOptions;
    /** The credential for this run, held so the store is not decrypted on every request. */
    #secret: StoredSecret | null = null;
    #record: StoredCredential | null = null;
    #account: GitHubAccount | null = null;
    #signIn: AbortController | null = null;

    constructor(options: GitHubSessionOptions) {
        this.#options = options;
    }

    /**
     * Who is signed in, and what this machine can do.
     *
     * Reads the stored metadata rather than the secret, so asking does not decrypt
     * anything. The account it reports is marked `persisted` because it came off disk.
     */
    status(): GitHubStatus {
        const client = this.#options.client();
        const account = this.#account ?? accountFromRecord(this.#options.store.metadata());
        return {
            signedIn: account !== null,
            account,
            clientConfigured: client !== null,
            clientKind: client?.kind ?? null,
            encryptionAvailable: this.#options.store.encryptionAvailable(),
            requiredScopes: this.#options.requiredScopes ?? REQUIRED_SCOPES,
            signingIn: this.#signIn !== null,
        };
    }

    /**
     * The token, for anything in the main process that needs to call GitHub.
     *
     * Refreshes it first when it is about to expire and there is a refresh token to do it
     * with. A token that does not expire is returned untouched: absence of an expiry is a
     * fact about an OAuth App token, not a missing field, and refreshing one would fail.
     */
    async accessToken(): Promise<AccessTokenResult> {
        const loaded = this.#load();
        if (loaded === null) {
            return this.#failure({
                code: "signed-out",
                message: "Nobody is signed in to GitHub on this computer.",
            });
        }

        const now = (this.#options.now ?? Date.now)();
        const expiresAt = parseTime(loaded.record.expiresAt);
        if (expiresAt === null || expiresAt - now > REFRESH_MARGIN_MS) {
            return { ok: true, token: loaded.secret.token };
        }

        return await this.#refresh(loaded.secret, loaded.record, now);
    }

    /** Stops a sign-in that is waiting for approval. False when none is running. */
    cancelSignIn(): boolean {
        if (this.#signIn === null) return false;
        this.#signIn.abort();
        this.#signIn = null;
        this.#emit({ type: "cancelled" });
        return true;
    }

    /**
     * The device flow, start to finish.
     *
     * Resolves when it is over, whichever way it went; progress arrives through the
     * event callback in the meantime, because this call takes as long as the person
     * takes to walk to their phone.
     *
     * `useOAuthFallback` forces the OAuth application. On a default build that is the
     * client anyway, so it changes nothing; it matters on a build configured to use the
     * GitHub App, where the App has not been installed on the repository somebody wants
     * to render and the alternative to offering this is leaving them at "not found".
     */
    async startDeviceSignIn(options: { useOAuthFallback?: boolean } = {}): Promise<SignInResult> {
        if (this.#signIn !== null) {
            return this.#failure({
                code: "already-signing-in",
                message: "A sign-in is already waiting for approval on GitHub.",
            });
        }

        const client =
            options.useOAuthFallback === true
                ? (this.#options.oauthFallbackClient ?? fallbackOAuthClient)()
                : this.#options.client();

        if (client === null) {
            return this.#failure({
                code: "no-client-configured",
                message:
                    "This build has no GitHub application configured, so it cannot start the" +
                    " browser sign-in. Sign in with a personal access token instead, or set" +
                    " WORLDLENS_GITHUB_CLIENT_ID to your own application's client id" +
                    " and WORLDLENS_GITHUB_CLIENT_KIND to app or oauth.",
            });
        }

        const controller = new AbortController();
        this.#signIn = controller;

        try {
            const requested = await requestDeviceCode({
                clientId: client.id,
                clientKind: client.kind,
                // Empty for a GitHub App, which has no scopes; `requestDeviceCode` omits
                // the parameter entirely in that case rather than sending an empty one.
                scopes: scopesForClient(
                    client.kind,
                    this.#options.requiredScopes ?? REQUIRED_SCOPES,
                ),
                fetch: this.#options.fetch,
                ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
                ...(this.#options.oauthBase === undefined
                    ? {}
                    : { oauthBase: this.#options.oauthBase }),
                signal: controller.signal,
            });
            if (!requested.ok) return this.#failure(requested.failure);

            const grant = requested.grant;
            const browserOpened = await this.#openVerificationPage(grant);
            this.#emit({
                type: "code",
                // Verbatim, hyphen and all: it is what the person types.
                userCode: grant.userCode,
                verificationUri: grant.verificationUri,
                verificationUriComplete: grant.verificationUriComplete,
                expiresAt: new Date(grant.expiresAt).toISOString(),
                expiresInSeconds: grant.expiresInSeconds,
                intervalSeconds: grant.intervalSeconds,
                browserOpened,
            });

            const polled = await pollForAccessToken({
                clientId: client.id,
                grant,
                fetch: this.#options.fetch,
                sleep: this.#options.sleep,
                ...(this.#options.now === undefined ? {} : { now: this.#options.now }),
                ...(this.#options.oauthBase === undefined
                    ? {}
                    : { oauthBase: this.#options.oauthBase }),
                ...(this.#options.maxNetworkRetries === undefined
                    ? {}
                    : { maxNetworkRetries: this.#options.maxNetworkRetries }),
                signal: controller.signal,
                onWaiting: (state) =>
                    this.#emit({
                        type: "waiting",
                        secondsRemaining: state.secondsRemaining,
                        intervalSeconds: state.intervalSeconds,
                    }),
            });
            if (!polled.ok) return this.#failure(polled.failure);

            return await this.#accept(polled.grant, tokenSourceForClient(client.kind), client.id);
        } finally {
            this.#signIn = null;
        }
    }

    /**
     * The pasted-token path.
     *
     * Checked against the API on the way in rather than on the way out. Somebody who
     * pastes a token with the wrong scopes finds out here, in one sentence naming what
     * is missing, instead of at the first render two screens later.
     */
    async signInWithToken(rawToken: string): Promise<SignInResult> {
        const token = rawToken.trim();
        if (token === "") {
            return this.#failure({
                code: "empty-token",
                message: "Paste a token to sign in with.",
            });
        }
        return await this.#accept(
            {
                token,
                scopes: [],
                tokenType: "bearer",
                refreshToken: null,
                expiresInSeconds: null,
                refreshTokenExpiresInSeconds: null,
            },
            "personal-access-token",
            null,
        );
    }

    /**
     * Whether the signed-in account can actually reach a repository.
     *
     * Asked before a render rather than during one, because the answer for a GitHub App
     * is very often "you have not installed me there", which is invisible until something
     * is attempted and reads as "the repository does not exist" when it finally is.
     */
    async checkRepository(owner: string, repo: string): Promise<RepositoryAccess> {
        const token = await this.accessToken();
        if (!token.ok) {
            return {
                ok: false,
                failure: {
                    code: "invalid-token",
                    message: token.failure.message,
                    manageUrl: null,
                    offerOAuthFallback: false,
                },
            };
        }

        return await checkRepositoryAccess(token.token, owner, repo, {
            fetch: this.#options.fetch,
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
            source:
                this.#record?.kind ??
                this.#options.store.metadata()?.kind ??
                "personal-access-token",
        });
    }

    /** Deletes the stored token, attempts to revoke it, and reports honestly which happened. */
    async signOut(): Promise<SignOutResult> {
        // Read before clearing, and without refreshing: an expired token is still the
        // thing to ask GitHub to forget.
        const loaded = this.#load();
        const cleared = this.#options.store.clear() || loaded !== null;

        this.#secret = null;
        this.#record = null;
        this.#account = null;

        if (loaded === null) {
            this.#emit({ type: "signed-out" });
            return { signedOut: cleared, revoked: false, reason: null, manageUrl: null };
        }

        const outcome = await revokeToken(loaded.secret.token, loaded.record.kind, {
            fetch: this.#options.fetch,
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
            clientId: loaded.record.clientId ?? this.#options.client()?.id ?? null,
            clientSecret: this.#options.clientSecret?.() ?? null,
            source: loaded.record.kind,
        });

        this.#emit({ type: "signed-out" });
        return {
            signedOut: true,
            revoked: outcome.revoked,
            reason: outcome.reason,
            manageUrl: outcome.manageUrl,
        };
    }

    /* ---------------------------------------------------------------------- */

    /** Verifies a token, stores it if it can, and turns it into an account. */
    async #accept(
        grant: AccessTokenGrant,
        source: TokenSource,
        clientId: string | null,
    ): Promise<SignInResult> {
        const verification: TokenVerification = await verifyToken(grant.token, {
            fetch: this.#options.fetch,
            ...(this.#options.apiBase === undefined ? {} : { apiBase: this.#options.apiBase }),
            ...(this.#options.requiredScopes === undefined
                ? {}
                : { requiredScopes: this.#options.requiredScopes }),
            source,
        });

        if (!verification.ok) {
            return this.#failure({
                code: verification.failure.code,
                message: verification.failure.message,
                missingScopes: verification.failure.missingScopes,
            });
        }

        const now = (this.#options.now ?? Date.now)();
        const secret: StoredSecret = { token: grant.token, refreshToken: grant.refreshToken };
        const meta = {
            kind: source,
            login: verification.identity.login,
            userId: verification.identity.id,
            scopes: verification.scopes,
            scopesReported: verification.scopesReported,
            clientId,
            expiresAt: futureTime(now, grant.expiresInSeconds),
            refreshTokenExpiresAt: futureTime(now, grant.refreshTokenExpiresInSeconds),
        };

        const saved = this.#options.store.save(secret, meta);
        const warnings = saved.ok
            ? verification.warnings
            : [...verification.warnings, saved.message];

        const record: StoredCredential = saved.ok
            ? saved.record
            : { ...meta, storedAt: new Date(now).toISOString() };

        const account: GitHubAccount = {
            login: verification.identity.login,
            userId: verification.identity.id,
            name: verification.identity.name,
            scopes: verification.scopes,
            scopesReported: verification.scopesReported,
            source,
            signedInAt: record.storedAt,
            expiresAt: record.expiresAt,
            refreshable: secret.refreshToken !== null,
            persisted: saved.ok,
            warnings,
        };

        this.#secret = secret;
        this.#record = record;
        this.#account = account;
        this.#emit({ type: "signed-in", account });
        return { ok: true, account };
    }

    /** The credential, from memory if it is there and from the store if it is not. */
    #load(): { secret: StoredSecret; record: StoredCredential } | null {
        if (this.#secret !== null && this.#record !== null) {
            return { secret: this.#secret, record: this.#record };
        }
        const read = this.#options.store.read();
        if (!read.ok) return null;
        this.#secret = read.secret;
        this.#record = read.record;
        this.#account ??= accountFromRecord(read.record);
        return { secret: read.secret, record: read.record };
    }

    /**
     * Trades the refresh token for a new access token.
     *
     * The two ways this can fail are told apart deliberately. Having no refresh token at
     * all means the sign-in is simply over and has to be done again. Having one that
     * GitHub refuses means the same thing in practice, but for a reason worth repeating -
     * so both say "sign in again" rather than leaving somebody looking at a render that
     * stopped for no stated reason.
     */
    async #refresh(
        secret: StoredSecret,
        record: StoredCredential,
        now: number,
    ): Promise<AccessTokenResult> {
        if (secret.refreshToken === null || record.clientId === null) {
            return this.#failure({
                code: "session-expired",
                message:
                    "This GitHub sign-in has expired and cannot be renewed on its own." +
                    " Sign in again to carry on.",
            });
        }

        const refreshed = await refreshAccessToken({
            clientId: record.clientId,
            refreshToken: secret.refreshToken,
            fetch: this.#options.fetch,
            ...(this.#options.oauthBase === undefined
                ? {}
                : { oauthBase: this.#options.oauthBase }),
            clientSecret: this.#options.clientSecret?.() ?? null,
        });

        if (!refreshed.ok) {
            return this.#failure({
                code: "session-expired",
                message: `${refreshed.failure.message} Sign in again to carry on.`,
            });
        }

        const grant = refreshed.grant;
        const nextSecret: StoredSecret = {
            token: grant.token,
            // GitHub returns a new refresh token with each refresh; keeping the old one
            // when it does not is what makes the next refresh fail instead of this one.
            refreshToken: grant.refreshToken ?? secret.refreshToken,
        };
        const meta = {
            kind: record.kind,
            login: record.login,
            userId: record.userId,
            scopes: record.scopes,
            scopesReported: record.scopesReported,
            clientId: record.clientId,
            expiresAt: futureTime(now, grant.expiresInSeconds),
            refreshTokenExpiresAt:
                futureTime(now, grant.refreshTokenExpiresInSeconds) ?? record.refreshTokenExpiresAt,
        };

        const saved = this.#options.store.save(nextSecret, meta);
        this.#secret = nextSecret;
        this.#record = saved.ok ? saved.record : { ...meta, storedAt: new Date(now).toISOString() };
        this.#account = accountFromRecord(this.#record, nextSecret.refreshToken !== null);

        return { ok: true, token: nextSecret.token };
    }

    async #openVerificationPage(grant: DeviceCodeGrant): Promise<boolean> {
        // The complete URL carries the code already filled in, which removes the step
        // where somebody mistypes it. It is not always offered, so the plain page is the
        // fallback, and a browser that will not open is reported rather than swallowed.
        const target = grant.verificationUriComplete ?? grant.verificationUri;
        try {
            return await this.#options.openExternal(target);
        } catch {
            return false;
        }
    }

    #failure(partial: Pick<GitHubFailure, "code" | "message"> & Partial<GitHubFailure>): {
        readonly ok: false;
        readonly failure: GitHubFailure;
    } {
        const failure: GitHubFailure = {
            code: partial.code,
            message: partial.message,
            missingScopes: partial.missingScopes ?? [],
            offerOAuthFallback: partial.offerOAuthFallback ?? false,
        };
        this.#emit({ type: "failed", failure });
        return { ok: false, failure };
    }

    #emit(event: GitHubAuthEvent): void {
        this.#options.onEvent?.(event);
    }
}

/**
 * The account as it is known from disk alone, before anything is decrypted.
 *
 * Exported for `accounts.ts`, which builds the same cold-start summary for every stored
 * account rather than only the one this class itself is holding - the multi-account
 * registry has many `StoredCredential` records to turn into `GitHubAccount`s and this is
 * the one place that already knows how.
 */
export function accountFromRecord(
    record: StoredCredential | null,
    refreshable = false,
): GitHubAccount | null {
    if (record === null) return null;
    return {
        login: record.login,
        userId: record.userId,
        name: null,
        scopes: record.scopes,
        scopesReported: record.scopesReported,
        source: record.kind,
        signedInAt: record.storedAt,
        expiresAt: record.expiresAt,
        // A record on its own cannot say; the caller that has just decrypted one can.
        refreshable: refreshable || record.refreshTokenExpiresAt !== null,
        persisted: true,
        warnings: [],
    };
}

function parseTime(value: string | null): number | null {
    if (value === null) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Null in, null out: a token with no stated lifetime is one that does not expire. */
function futureTime(now: number, seconds: number | null): string | null {
    if (seconds === null || !Number.isFinite(seconds)) return null;
    return new Date(now + seconds * 1000).toISOString();
}

/**
 * Checking a token before trusting it, and letting go of it afterwards.
 *
 * A token that is wrong is not rare. Somebody pastes the one from another tool, or one
 * they made two years ago for a different job, or a fine-grained one that cannot see
 * this repository at all. Every one of those is indistinguishable from a working token
 * until something is actually attempted with it, and by then the person is halfway
 * through starting a render and the failure reads as the render being broken.
 *
 * So a token is checked the moment it arrives, against `GET /user`, and what comes back
 * is reported in full: who it belongs to and exactly which scopes it carries. That turns
 * three separate late failures into one immediate sentence.
 */

import {
    APP_INSTALLATIONS_URL,
    GITHUB_API_BASE,
    PERSONAL_ACCESS_TOKEN_SETTINGS_URL,
    REQUIRED_SCOPES,
    authorizedApplicationUrl,
} from "./config.js";
import type { TokenSource } from "./config.js";
import type { FetchLike } from "./deviceFlow.js";
import { parseScopeList } from "./deviceFlow.js";
import { describeError } from "./redact.js";

export interface GitHubIdentity {
    readonly login: string;
    readonly id: number | null;
    readonly name: string | null;
}

export type TokenFailureCode =
    /** GitHub does not recognise it, or it has been revoked. */
    | "invalid-token"
    /** It is a real token for a real account, but it cannot do this job. */
    | "insufficient-scopes"
    /** The request never completed. */
    | "network"
    | "http"
    | "malformed-response";

export interface TokenFailure {
    readonly code: TokenFailureCode;
    readonly message: string;
    /** Known for `insufficient-scopes`, since the token identified an account first. */
    readonly identity: GitHubIdentity | null;
    readonly scopes: readonly string[];
    readonly missingScopes: readonly string[];
}

export interface TokenAcceptance {
    readonly ok: true;
    readonly identity: GitHubIdentity;
    /** As reported by GitHub, not as requested. */
    readonly scopes: readonly string[];
    /**
     * False for a fine-grained personal access token, which reports no scope header at
     * all. The token may well be fine; this code simply cannot prove it, and says so
     * rather than implying a check it did not make.
     */
    readonly scopesReported: boolean;
    /** Shown next to the account. Empty when there is nothing worth saying. */
    readonly warnings: readonly string[];
}

export type TokenVerification =
    TokenAcceptance | { readonly ok: false; readonly failure: TokenFailure };

export interface VerifyTokenOptions {
    readonly fetch: FetchLike;
    readonly apiBase?: string | undefined;
    readonly requiredScopes?: readonly string[] | undefined;
    readonly source?: TokenSource | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Which granted scopes satisfy which required one.
 *
 * GitHub's scopes nest: `repo` contains `public_repo`, and `user` contains `read:user`.
 * A table is used rather than a prefix rule because the nesting is not derivable from
 * the names - `workflow` looks like it should fall under `repo` and does not, which is
 * exactly the mistake that produces a sign-in that reports success and then cannot
 * dispatch anything.
 */
const SCOPE_IMPLICATIONS: Readonly<Record<string, readonly string[]>> = {
    "read:org": ["read:org", "write:org", "admin:org"],
    "write:org": ["write:org", "admin:org"],
    "admin:org": ["admin:org"],
    "read:project": ["read:project", "project"],
    project: ["project"],
    public_repo: ["public_repo", "repo"],
    repo: ["repo"],
    workflow: ["workflow"],
    "read:user": ["read:user", "user"],
    user: ["user"],
};

/** Trim, case-fold, remove empty values, and deduplicate a GitHub OAuth scope list. */
export function normalizeScopes(scopes: readonly string[]): readonly string[] {
    return [
        ...new Set(
            scopes.map((scope) => scope.trim().toLowerCase()).filter((scope) => scope.length > 0),
        ),
    ];
}

/** True when `granted` covers `required`, following the nesting above. */
export function scopeSatisfied(granted: readonly string[], required: string): boolean {
    const normalizedRequired = required.trim().toLowerCase();
    const accepted = SCOPE_IMPLICATIONS[normalizedRequired] ?? [normalizedRequired];
    const normalizedGranted = normalizeScopes(granted);
    return accepted.some((scope) => normalizedGranted.includes(scope));
}

/**
 * Normalize requested scopes and remove a narrower request already covered by another
 * requested scope. GitHub may omit such redundant scopes from the granted scope list.
 */
export function normalizeRequiredScopes(scopes: readonly string[]): readonly string[] {
    const normalized = normalizeScopes(scopes);
    return normalized.filter(
        (required) =>
            !normalized.some(
                (candidate) => candidate !== required && scopeSatisfied([candidate], required),
            ),
    );
}

/** Every required scope this token does not have. Empty means it can do the job. */
export function missingScopes(
    granted: readonly string[],
    required: readonly string[] = REQUIRED_SCOPES,
): readonly string[] {
    return normalizeRequiredScopes(required).filter((scope) => !scopeSatisfied(granted, scope));
}

/**
 * Things worth telling somebody about a token that nonetheless works.
 *
 * The `repo` case is the one that matters. It is a common thing to reach for, it grants
 * read and write to every private repository the account can see, and this application
 * never needs it. Saying so at sign-in is the only moment where the person can act on it
 * cheaply, by making a narrower token before they have built anything on this one.
 */
export function scopeWarnings(
    granted: readonly string[],
    required: readonly string[] = REQUIRED_SCOPES,
): readonly string[] {
    const warnings: string[] = [];

    if (granted.includes("repo")) {
        warnings.push(
            "This token carries the full 'repo' scope, which grants read and write access" +
                " to every private repository on the account. Nothing here needs it:" +
                " 'public_repo' is enough. Consider replacing it with a narrower token.",
        );
    }

    const extra = granted.filter(
        (scope) =>
            scope !== "repo" &&
            !required.some((neededScope) => scopeSatisfied([scope], neededScope)),
    );
    if (extra.length > 0) {
        warnings.push(
            `This token also carries ${extra.join(", ")}, which this application never uses.`,
        );
    }

    return warnings;
}

/**
 * Asks GitHub who a token belongs to and what it may do.
 *
 * Never throws, and never puts the token into what it returns. The token is passed to
 * `describeError` as a secret for every failure path precisely because the failure paths
 * are where request details leak.
 */
export async function verifyToken(
    token: string,
    options: VerifyTokenOptions,
): Promise<TokenVerification> {
    const apiBase = options.apiBase ?? GITHUB_API_BASE;
    const required = options.requiredScopes ?? REQUIRED_SCOPES;

    let response: Response;
    try {
        response = await options.fetch(`${apiBase}/user`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "worldlens",
            },
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
    } catch (error) {
        return failure({
            code: "network",
            message: `Could not reach GitHub to check the token: ${describeError(error, [token])}`,
        });
    }

    if (response.status === 401) {
        return failure({
            code: "invalid-token",
            message:
                "GitHub does not recognise that token. It may have been revoked, it may" +
                " have expired, or a character may have been lost when it was copied.",
        });
    }

    if (!response.ok) {
        const detail = await safeText(response, token);
        return failure({
            code: "http",
            message:
                `GitHub answered the token check with HTTP ${response.status}.` +
                (detail === "" ? "" : ` ${detail}`),
        });
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(await response.text());
    } catch (error) {
        return failure({
            code: "malformed-response",
            message: `GitHub's answer to the token check was not JSON: ${describeError(error, [token])}`,
        });
    }

    if (typeof parsed !== "object" || parsed === null) {
        return failure({
            code: "malformed-response",
            message: "GitHub's answer to the token check was not an account.",
        });
    }

    const account = parsed as Record<string, unknown>;
    const login = typeof account["login"] === "string" ? account["login"] : null;
    if (login === null) {
        return failure({
            code: "malformed-response",
            message: "GitHub's answer to the token check carried no account name.",
        });
    }

    const identity: GitHubIdentity = {
        login,
        id: typeof account["id"] === "number" ? account["id"] : null,
        name: typeof account["name"] === "string" ? account["name"] : null,
    };

    // Classic tokens and OAuth tokens report their scopes in this header. Fine-grained
    // tokens do not send it at all, which is a different thing from sending it empty:
    // empty means "no scopes", absent means "this kind of token has no scope list".
    const rawScopes = response.headers.get("x-oauth-scopes");
    const scopesReported = rawScopes !== null;
    const scopes = parseScopeList(rawScopes);

    if (!scopesReported) {
        return {
            ok: true,
            identity,
            scopes: [],
            scopesReported: false,
            warnings: [
                noScopeListWarning(identity.login, options.source ?? "personal-access-token"),
            ],
        };
    }

    const missing = missingScopes(scopes, required);
    if (missing.length > 0) {
        return failure({
            code: "insufficient-scopes",
            message:
                `That token belongs to ${identity.login} but is missing ${missing.join(", ")}.` +
                ` It carries ${scopes.length === 0 ? "no scopes at all" : scopes.join(", ")}.` +
                ` This application needs ${required.join(", ")}.`,
            identity,
            scopes,
            missingScopes: missing,
        });
    }

    return {
        ok: true,
        identity,
        scopes,
        scopesReported: true,
        warnings: scopeWarnings(scopes, required),
    };
}

/** What to say about a token that reports no scope list, which depends on why it does not. */
function noScopeListWarning(login: string, source: TokenSource): string {
    if (source === "github-app") {
        return (
            `Signed in as ${login} through the GitHub App. An App user token carries no` +
            " scopes: what it can reach depends on which repositories the App has been" +
            " installed on, so that is where to look if something is refused."
        );
    }
    return (
        `Signed in as ${login}. This is a fine-grained token, which does not tell the app` +
        " what it is allowed to do, so its permissions could not be checked here. It needs" +
        " read and write access to Actions and to Contents on the repository you render" +
        " from; if it does not have them, the first render will be refused."
    );
}

function failure(
    partial: Pick<TokenFailure, "code" | "message"> & Partial<TokenFailure>,
): TokenVerification {
    return {
        ok: false,
        failure: {
            code: partial.code,
            message: partial.message,
            identity: partial.identity ?? null,
            scopes: partial.scopes ?? [],
            missingScopes: partial.missingScopes ?? [],
        },
    };
}

async function safeText(response: Response, token: string): Promise<string> {
    try {
        const text = await response.text();
        return describeError(text.replace(/\s+/g, " ").trim().slice(0, 300), [token]);
    } catch {
        return "";
    }
}

/* -------------------------------------------------------------------------- */
/* Can this token see that repository?                                        */
/* -------------------------------------------------------------------------- */

export type RepositoryAccessFailureCode =
    /** A GitHub App sign-in that has not been given this repository. */
    | "app-not-installed"
    /** No such repository, or the account genuinely cannot see it. */
    | "not-found"
    | "forbidden"
    | "invalid-token"
    | "network"
    | "http";

export interface RepositoryAccessFailure {
    readonly code: RepositoryAccessFailureCode;
    readonly message: string;
    /** Where the person fixes it, when there is such a place. */
    readonly manageUrl: string | null;
    /**
     * True when signing in with the OAuth application instead would very likely work.
     * The interface offers that rather than leaving somebody at a dead end.
     */
    readonly offerOAuthFallback: boolean;
}

export type RepositoryAccess =
    | { readonly ok: true; readonly fullName: string; readonly private: boolean }
    | { readonly ok: false; readonly failure: RepositoryAccessFailure };

export interface RepositoryAccessOptions {
    readonly fetch: FetchLike;
    readonly apiBase?: string | undefined;
    readonly source?: TokenSource | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * The sentence a 404 deserves when the token came from a GitHub App.
 *
 * GitHub answers 404 both for a repository that does not exist and for one the caller is
 * not allowed to know exists - deliberately, so that probing cannot enumerate private
 * repositories. That is good for GitHub and terrible for an error message, because a
 * GitHub App is only ever installed on some repositories, so its most common 404 by far
 * is "you have not given me this one" while the words say "not found".
 *
 * Somebody told "repository not found" checks their spelling, then their account, then
 * whether the repository was deleted. None of that is the problem, and none of it leads
 * anywhere near the installation settings page where the problem actually is.
 */
export function describeMissingInstallation(owner: string, repo: string): RepositoryAccessFailure {
    return {
        code: "app-not-installed",
        message:
            `GitHub answered "not found" for ${owner}/${repo}. With a GitHub App sign-in that` +
            " usually means the App has not been given access to that repository rather than" +
            " that the repository is missing: GitHub returns the same answer for both, so this" +
            " cannot be told apart from the reply alone. Add the repository to the App's" +
            " installation, or sign in with the OAuth application instead, which reaches" +
            " everything the account can already see.",
        manageUrl: APP_INSTALLATIONS_URL,
        offerOAuthFallback: true,
    };
}

/**
 * Whether a signed-in token can actually reach a repository.
 *
 * Worth asking before a render rather than during one: the App-installation case is
 * invisible until something is attempted, and it is much cheaper to explain here.
 */
export async function checkRepositoryAccess(
    token: string,
    owner: string,
    repo: string,
    options: RepositoryAccessOptions,
): Promise<RepositoryAccess> {
    const apiBase = options.apiBase ?? GITHUB_API_BASE;
    const source = options.source ?? "personal-access-token";

    let response: Response;
    try {
        response = await options.fetch(
            `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "worldlens",
                },
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
        );
    } catch (error) {
        return {
            ok: false,
            failure: {
                code: "network",
                message: `Could not reach GitHub: ${describeError(error, [token])}`,
                manageUrl: null,
                offerOAuthFallback: false,
            },
        };
    }

    if (response.status === 404) {
        if (source === "github-app") {
            return { ok: false, failure: describeMissingInstallation(owner, repo) };
        }
        return {
            ok: false,
            failure: {
                code: "not-found",
                message:
                    `GitHub has no repository ${owner}/${repo} that this account can see.` +
                    " Check the owner and the name, and that the account has access to it if" +
                    " it is private.",
                manageUrl: null,
                offerOAuthFallback: false,
            },
        };
    }

    if (response.status === 401) {
        return {
            ok: false,
            failure: {
                code: "invalid-token",
                message: "GitHub no longer recognises this sign-in. Sign in again to replace it.",
                manageUrl: null,
                offerOAuthFallback: false,
            },
        };
    }

    if (response.status === 403) {
        return {
            ok: false,
            failure: {
                code: "forbidden",
                message:
                    `This sign-in reached ${owner}/${repo} but is not allowed to use it.` +
                    (source === "github-app"
                        ? " A GitHub App also needs the right permissions on its installation," +
                          " not only the repository in its list."
                        : ""),
                manageUrl: source === "github-app" ? APP_INSTALLATIONS_URL : null,
                offerOAuthFallback: source === "github-app",
            },
        };
    }

    if (!response.ok) {
        return {
            ok: false,
            failure: {
                code: "http",
                message: `GitHub answered HTTP ${response.status} for ${owner}/${repo}.`,
                manageUrl: null,
                offerOAuthFallback: false,
            },
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(await response.text());
    } catch {
        parsed = null;
    }
    const body =
        typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};

    return {
        ok: true,
        fullName: typeof body["full_name"] === "string" ? body["full_name"] : `${owner}/${repo}`,
        private: body["private"] === true,
    };
}

/* -------------------------------------------------------------------------- */
/* Letting go of a token                                                      */
/* -------------------------------------------------------------------------- */

export interface RevocationOutcome {
    /** True only when GitHub confirmed it. Never optimistic. */
    readonly revoked: boolean;
    /** Why not, when it was not. Written to be shown. */
    readonly reason: string | null;
    /** Where the person can finish the job themselves. */
    readonly manageUrl: string | null;
}

export interface RevokeOptions {
    readonly fetch: FetchLike;
    readonly apiBase?: string | undefined;
    /** Null on every shipped build. See `GITHUB_CLIENT_SECRET_ENV` in `config.ts`. */
    readonly clientId?: string | null | undefined;
    readonly clientSecret?: string | null | undefined;
    /** Decides where the person is sent to finish the job by hand. */
    readonly source?: TokenSource | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Asks GitHub to invalidate a token, and is honest when it cannot.
 *
 * GitHub's revocation endpoint authenticates as the OAuth application itself, with the
 * client id **and secret** in basic auth. A desktop application does not have a secret -
 * that is the whole reason it uses the device flow - so on a shipped build this call
 * cannot be made at all. Pretending otherwise would be the worst outcome: somebody who
 * signed out believing the authorization was gone would be wrong, and would have no
 * reason to go and check.
 *
 * So sign-out always deletes the local copy, this function reports plainly whether the
 * authorization on GitHub's side is really gone, and the caller shows the link that
 * finishes the job.
 */
export async function revokeToken(
    token: string,
    source: TokenSource,
    options: RevokeOptions,
): Promise<RevocationOutcome> {
    if (source === "personal-access-token") {
        return {
            revoked: false,
            reason:
                "The token was deleted from this computer. A personal access token can only" +
                " be revoked by the person who made it, on GitHub.",
            manageUrl: PERSONAL_ACCESS_TOKEN_SETTINGS_URL,
        };
    }

    const clientId = options.clientId ?? null;
    const clientSecret = options.clientSecret ?? null;
    const manageUrl =
        (options.source ?? source) === "github-app"
            ? APP_INSTALLATIONS_URL
            : clientId === null
              ? null
              : authorizedApplicationUrl(clientId);

    if (clientId === null || clientSecret === null) {
        return {
            revoked: false,
            reason:
                "The token was deleted from this computer. GitHub only accepts a revocation" +
                " request signed with the application's own secret, which a desktop app does" +
                " not have, so the authorization is still listed on your account until you" +
                " remove it there.",
            manageUrl,
        };
    }

    const apiBase = options.apiBase ?? GITHUB_API_BASE;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");

    try {
        const response = await options.fetch(
            `${apiBase}/applications/${encodeURIComponent(clientId)}/token`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Basic ${credentials}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                    "User-Agent": "worldlens",
                },
                body: JSON.stringify({ access_token: token }),
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
        );

        if (response.status === 204) {
            return { revoked: true, reason: null, manageUrl: null };
        }

        return {
            revoked: false,
            reason:
                `The token was deleted from this computer, but GitHub answered the` +
                ` revocation request with HTTP ${response.status}, so the authorization may` +
                ` still be active.`,
            manageUrl,
        };
    } catch (error) {
        return {
            revoked: false,
            reason:
                "The token was deleted from this computer, but the revocation request could" +
                ` not be sent: ${describeError(error, [token, clientSecret])}`,
            manageUrl,
        };
    }
}

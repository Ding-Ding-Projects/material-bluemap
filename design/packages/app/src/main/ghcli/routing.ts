/**
 * Deciding whether a failed GitHub operation should be retried through the OTHER credential
 * store this application knows about (`gh`'s own, see `accounts.ts`), and whether that retry
 * is safe to run without asking first.
 *
 * ## Why this exists as its own module
 *
 * `cirender/transport.ts`'s `resolveTransport` already falls back from the application's own
 * sign-in to `gh` for one specific operation - probing whether a workflow file is readable -
 * before a render starts. That is choosing a route ONCE, up front, and it stays exactly as
 * it is; nothing here replaces it. This module is for the different, more general problem
 * several surfaces now share: an operation has already been ATTEMPTED through one credential
 * and failed, and the question is whether trying the exact same operation through the OTHER
 * credential is a reasonable thing to do automatically, or whether it needs a person's say-so
 * first. Every pure decision lives here so a CI render surface, a repository-bootstrap
 * operation, a backup, or anything else that talks to GitHub through both `main/github/` and
 * `main/ghcli/` can share one answer rather than each re-deriving its own retry rules and,
 * worse, quietly disagreeing about them.
 *
 * ## The pieces, and how a caller composes them
 *
 *  1. {@link classifyRoutableFailure} - is this failure the kind another credential might
 *     answer differently, or is it the kind every credential would hit identically? Two
 *     adapters, {@link routableFromGitHubFailure} and {@link routableFromHttpLikeStatus},
 *     turn this application's two existing failure shapes (`main/github/session.ts`'s
 *     `GitHubFailure`, and `cirender/actions.ts`'s `ActionsCallError`) into the one shape
 *     this classifier reads, so nothing here needs to import either module.
 *  2. {@link chooseAccountForScope} - of two known accounts, which one (if either) actually
 *     holds the scope an operation needs, so a route can be picked *before* failing rather
 *     than after. Useful on its own, ahead of even trying the primary route, for an
 *     operation whose required scope is known up front (a workflow dispatch always needs
 *     `workflow`; a repository creation always needs `repo`).
 *  3. {@link decideWriteRoute} - for an operation that CHANGES something on GitHub, is the
 *     account the fallback would run as the one the person already selected, or does
 *     proceeding need to be confirmed first because it would act as somebody else?
 *  4. {@link routeWithFallback} - the orchestrator that ties the three together around an
 *     actual pair of async operations: try the primary, and only when it fails in a
 *     retry-worthy way, run the fallback - gated by (3) for a write - and report a single
 *     honest outcome, including the two shapes that matter most: a fallback that succeeded
 *     where the primary got an ambiguous 404 (an access difference between the two accounts,
 *     not "found it after all, never mind"), and both routes failing (reported side by side,
 *     the same diagnostic value `resolveTransport`'s own combined message already has, never
 *     collapsed into one generic apology).
 *
 * ## The one rule that holds across every function here
 *
 * A WRITE is never carried out through a fallback account that differs from the one the
 * person selected, without asking first. Reading something is low-stakes enough to fall back
 * on automatically - worst case, one extra network round trip. Creating a repository,
 * pushing a workflow file, or dispatching a run as an identity nobody chose in the interface
 * is a genuine surprise, and could put something under the wrong account's name entirely.
 *
 * ## Nothing here ever sees a token
 *
 * Every function in this module takes and returns account logins, hosts, scopes and failure
 * facts - never a credential. `routeWithFallback`'s `run`/`runFallback` callbacks are the
 * caller's own functions, closed over whatever token they need; this module never reads,
 * logs, or threads one through.
 */

/* -------------------------------------------------------------------------- */
/* Classifying a failure                                                      */
/* -------------------------------------------------------------------------- */

export interface RoutableFailure {
    /** An HTTP-like status, or null when the failure carries none at all (a network failure, a timeout, `gh` not being on PATH). */
    readonly status: number | null;
    /** The caller's own failure code, when it has a more specific one than a bare status (e.g. `"insufficient-scopes"`, `"malformed-response"`). */
    readonly code?: string | undefined;
    /** Scopes the caller's own failure already knows are missing, if any. */
    readonly missingScopes?: readonly string[] | undefined;
    /** The failure's own message. Sniffed only for a rate-limit phrase; never parsed for anything else, and never a token. */
    readonly message?: string | undefined;
}

export type FailureRoutabilityReason =
    | "unauthorized"
    | "forbidden"
    | "ambiguous-not-found"
    | "missing-scope"
    | "network"
    | "rate-limited"
    | "malformed-request"
    | "unclassified";

export type FailureRoutability =
    | { readonly retryOtherRoute: true; readonly reason: "unauthorized" | "forbidden" | "ambiguous-not-found" | "missing-scope" }
    | { readonly retryOtherRoute: false; readonly reason: "network" | "rate-limited" | "malformed-request" | "unclassified" };

const RATE_LIMIT_PHRASE = /\brate limit|secondary rate limit|abuse detection\b/i;

/**
 * Whether a failure is worth retrying through the other credential store.
 *
 * **Retried** (identity, permission or visibility problems, which a different account can
 * genuinely answer differently):
 *  - 401 - the credential itself is no longer accepted.
 *  - 403 that is not a rate limit - a permission problem, and the other account may simply
 *    have more of it.
 *  - 404 - GitHub's own "either it does not exist or you cannot see it"; the only way to
 *    tell those two apart is to ask with a different credential.
 *  - an explicit missing-scope failure, regardless of status.
 *
 * **Never retried** (failures every credential on this network would hit identically, so a
 * retry only doubles the wait before the same answer):
 *  - no status at all - a network failure or a timeout.
 *  - a rate limit (403 or 429 with rate-limit wording) - a second identity does not make
 *    GitHub answer faster.
 *  - a malformed request (400/422, or the caller's own `"malformed-response"` code) - the
 *    request or GitHub's answer to it is the problem, not who sent it.
 *  - anything this function does not recognise - it fails closed rather than retrying a
 *    failure nobody has reasoned about yet.
 */
export function classifyRoutableFailure(failure: RoutableFailure): FailureRoutability {
    if ((failure.missingScopes?.length ?? 0) > 0 || failure.code === "insufficient-scopes") {
        return { retryOtherRoute: true, reason: "missing-scope" };
    }
    if (failure.code === "malformed-response") {
        return { retryOtherRoute: false, reason: "malformed-request" };
    }

    const rateLimited =
        failure.status === 429 || (failure.status === 403 && RATE_LIMIT_PHRASE.test(failure.message ?? ""));
    if (rateLimited) return { retryOtherRoute: false, reason: "rate-limited" };

    if (failure.status === 401) return { retryOtherRoute: true, reason: "unauthorized" };
    if (failure.status === 403) return { retryOtherRoute: true, reason: "forbidden" };
    if (failure.status === 404) return { retryOtherRoute: true, reason: "ambiguous-not-found" };
    if (failure.status === 400 || failure.status === 422) return { retryOtherRoute: false, reason: "malformed-request" };
    if (failure.status === null || failure.status === 0) return { retryOtherRoute: false, reason: "network" };

    return { retryOtherRoute: false, reason: "unclassified" };
}

/**
 * Turns `main/github/session.ts`'s own `GitHubFailure` shape into a {@link RoutableFailure}.
 *
 * `app-not-installed` is mapped alongside `not-found` at 404 deliberately: it is GitHub App
 * language for "this credential's App has not been given this repository", and a personal
 * `gh` sign-in is not an App install at all, so a different credential is exactly the thing
 * worth trying rather than a failure every credential would share.
 */
export function routableFromGitHubFailure(failure: {
    readonly code: string;
    readonly message: string;
    readonly missingScopes?: readonly string[] | undefined;
}): RoutableFailure {
    const statusByCode: Readonly<Record<string, number | null>> = {
        "invalid-token": 401,
        "session-expired": 401,
        "insufficient-scopes": 403,
        forbidden: 403,
        "not-found": 404,
        "app-not-installed": 404,
        network: null,
    };
    return {
        status: Object.hasOwn(statusByCode, failure.code) ? (statusByCode[failure.code] ?? null) : null,
        code: failure.code,
        missingScopes: failure.missingScopes ?? [],
        message: failure.message,
    };
}

/**
 * Turns a bare HTTP-like status and message into a {@link RoutableFailure} - the shape
 * `cirender/actions.ts`'s `ActionsCallError` already carries (`.status`, `.message`), and
 * `main/backup/github.ts`'s equivalent. Kept as a plain function rather than an import of
 * `ActionsCallError` itself, so this module never needs a runtime dependency on `cirender/`.
 */
export function routableFromHttpLikeStatus(status: number, message: string): RoutableFailure {
    return { status: status === 0 ? null : status, message };
}

/* -------------------------------------------------------------------------- */
/* Choosing by scope, before anything is even tried                          */
/* -------------------------------------------------------------------------- */

export type RouteCandidateId = "app" | "gh";

export interface ScopeCandidate {
    readonly id: RouteCandidateId;
    readonly login: string | null;
    readonly scopes: readonly string[];
    /**
     * False when this credential's kind never reports a scope list at all (a GitHub App
     * token, a fine-grained personal access token). Such a candidate is never ruled OUT by
     * {@link chooseAccountForScope} - an unreported scope list is not evidence the scope is
     * missing, only that this credential does not say either way.
     */
    readonly scopesReported: boolean;
}

export interface ScopeChoice {
    /** The credential known to hold the scope, or null when that cannot be told from the given candidates. */
    readonly id: RouteCandidateId | null;
    readonly reason: string;
}

/**
 * Of the given credentials, which one demonstrably holds a required scope - decided from
 * facts already on hand (each account's own reported scope list), before either is tried
 * and possibly fails for want of it.
 */
export function chooseAccountForScope(
    candidates: readonly ScopeCandidate[],
    requiredScope: string,
): ScopeChoice {
    const holds = (candidate: ScopeCandidate): boolean | null => {
        if (!candidate.scopesReported) return null;
        return candidate.scopes.includes(requiredScope);
    };

    const verdicts = candidates.map((candidate) => ({ candidate, holds: holds(candidate) }));
    const holder = verdicts.find((entry) => entry.holds === true);
    if (holder !== undefined) {
        return {
            id: holder.candidate.id,
            reason: `${holder.candidate.login ?? holder.candidate.id} is known to hold the "${requiredScope}" scope.`,
        };
    }

    if (verdicts.length > 0 && verdicts.every((entry) => entry.holds === false)) {
        return { id: null, reason: `Neither known credential reports the "${requiredScope}" scope.` };
    }

    return { id: null, reason: `Which credential holds the "${requiredScope}" scope is not yet known.` };
}

/* -------------------------------------------------------------------------- */
/* Never a silent identity switch on a write                                 */
/* -------------------------------------------------------------------------- */

export type WriteRouteDecision =
    | { readonly proceed: true; readonly reason: "same-account" | "no-account-selected" }
    | {
          readonly proceed: false;
          readonly reason: "different-account";
          readonly selectedLogin: string;
          readonly fallbackLogin: string;
      };

/**
 * Whether a WRITE may proceed automatically on the fallback route.
 *
 * `selectedAccountLogin` is who the person chose in the interface for this operation -
 * ordinarily the application's own active account. Null means there is nothing to compare
 * against (the operation never asked, or nobody had signed in to the application at all),
 * and the fallback proceeds - there is no chosen identity for it to diverge from. Named
 * means the fallback may proceed automatically only when `fallbackAccountLogin` is the very
 * same login, compared case-insensitively because GitHub logins are. Any other login on the
 * fallback route stops here and names both accounts, so the interface can ask rather than
 * silently create, push, or dispatch something as somebody nobody selected.
 */
export function decideWriteRoute(
    selectedAccountLogin: string | null,
    fallbackAccountLogin: string,
): WriteRouteDecision {
    if (selectedAccountLogin === null) return { proceed: true, reason: "no-account-selected" };
    if (selectedAccountLogin.toLowerCase() === fallbackAccountLogin.toLowerCase()) {
        return { proceed: true, reason: "same-account" };
    }
    return {
        proceed: false,
        reason: "different-account",
        selectedLogin: selectedAccountLogin,
        fallbackLogin: fallbackAccountLogin,
    };
}

/* -------------------------------------------------------------------------- */
/* The orchestrator                                                           */
/* -------------------------------------------------------------------------- */

export interface RouteFallback<T> {
    /** One phrase naming this credential, for a message a person has to act on. */
    readonly describe: string;
    readonly accountLogin: string;
    readonly run: () => Promise<T>;
    /** Turns a thrown value from `run` into a {@link RoutableFailure}, for the both-failed report. Return null when the thrown value cannot be classified at all. */
    readonly classifyFailure: (error: unknown) => RoutableFailure | null;
}

export interface RouteWithFallbackOptions<T> {
    /** Reads may fall back automatically. Writes are gated by {@link decideWriteRoute}. */
    readonly kind: "read" | "write";
    /** The account selected in the interface for this operation, or null. Only consulted for a write. */
    readonly selectedAccountLogin: string | null;
    readonly describe: string;
    readonly run: () => Promise<T>;
    /** Turns a thrown value from `run` into a {@link RoutableFailure}. Return null when it cannot be classified at all - such a failure is never retried. */
    readonly classifyFailure: (error: unknown) => RoutableFailure | null;
    /** Null when there is no fallback available right now: `gh` not installed, no ready account, or the caller chose not to offer one. */
    readonly fallback: RouteFallback<T> | null;
}

export type RouteWithFallbackResult<T> =
    | { readonly outcome: "primary-succeeded"; readonly value: T; readonly message: string }
    | {
          readonly outcome: "fallback-succeeded";
          readonly value: T;
          readonly message: string;
          /** True when the primary failure was an ambiguous 404 - this is an access difference, not "it was missing after all". */
          readonly accessDifference: boolean;
      }
    | {
          readonly outcome: "needs-confirmation";
          readonly selectedLogin: string;
          readonly fallbackLogin: string;
          readonly retryReason: FailureRoutabilityReason;
          readonly message: string;
      }
    | { readonly outcome: "not-retried"; readonly primaryError: unknown; readonly message: string }
    | { readonly outcome: "gh-unavailable"; readonly primaryError: unknown; readonly message: string }
    | {
          readonly outcome: "both-failed";
          readonly primaryError: unknown;
          readonly fallbackError: unknown;
          readonly message: string;
      };

function describeThrown(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `options.run`, and only when it fails in a retry-worthy way (per
 * {@link classifyRoutableFailure}) tries `options.fallback.run` instead - gated, for a
 * write, by {@link decideWriteRoute} - and reports one honest outcome covering every shape
 * that can genuinely happen. See the module doc comment for the full design; the two
 * outcomes worth reading twice are `fallback-succeeded` with `accessDifference: true` (the
 * primary's 404 turned out to mean "you cannot see it", not "it is not there") and
 * `both-failed` (both routes' own messages, side by side, never collapsed into one apology).
 */
export async function routeWithFallback<T>(
    options: RouteWithFallbackOptions<T>,
): Promise<RouteWithFallbackResult<T>> {
    let value: T;
    try {
        value = await options.run();
    } catch (primaryError) {
        const primaryFailure = options.classifyFailure(primaryError);
        const routability = primaryFailure === null ? null : classifyRoutableFailure(primaryFailure);

        if (primaryFailure === null || routability === null || !routability.retryOtherRoute) {
            return {
                outcome: "not-retried",
                primaryError,
                message:
                    primaryFailure === null
                        ? `${options.describe} failed in a way this application does not recognise, so no` +
                          " automatic fallback was attempted."
                        : `${options.describe} failed (${routability?.reason ?? "unclassified"}), which is not a` +
                          " credential problem another sign-in would solve, so no automatic fallback was" +
                          " attempted.",
            };
        }

        if (options.fallback === null) {
            return {
                outcome: "gh-unavailable",
                primaryError,
                message:
                    `${options.describe} failed in a way another signed-in account might resolve, but the gh` +
                    " command-line tool is not available on this computer to try. Install it from the System" +
                    " dependencies section of Settings, or sign in with a different account in this application.",
            };
        }

        if (options.kind === "write") {
            const decision = decideWriteRoute(options.selectedAccountLogin, options.fallback.accountLogin);
            if (!decision.proceed) {
                return {
                    outcome: "needs-confirmation",
                    selectedLogin: options.selectedAccountLogin ?? "",
                    fallbackLogin: options.fallback.accountLogin,
                    retryReason: routability.reason,
                    message:
                        `${options.describe} failed, and ${options.fallback.describe} would perform this as` +
                        ` ${options.fallback.accountLogin}, a different account from the one selected` +
                        ` (${options.selectedAccountLogin ?? "none"}). This would change something on GitHub, so` +
                        " it is not attempted automatically - confirm the account, or switch to it, before it runs.",
                };
            }
        }

        let fallbackValue: T;
        try {
            fallbackValue = await options.fallback.run();
        } catch (fallbackError) {
            const fallbackFailure = options.fallback.classifyFailure(fallbackError);
            const bothAmbiguousNotFound = primaryFailure.status === 404 && fallbackFailure?.status === 404;
            return {
                outcome: "both-failed",
                primaryError,
                fallbackError,
                message: bothAmbiguousNotFound
                    ? `Neither route could see this. Both ${options.describe} and ${options.fallback.describe}` +
                      " answered 404, and two different accounts agreeing is the better evidence that it" +
                      " genuinely does not exist rather than that one of them merely cannot see it."
                    : `Neither GitHub route could complete this. ${options.describe}:` +
                      ` ${describeThrown(primaryError)} ${options.fallback.describe}:` +
                      ` ${describeThrown(fallbackError)}`,
            };
        }

        const accessDifference = primaryFailure.status === 404;
        return {
            outcome: "fallback-succeeded",
            value: fallbackValue,
            accessDifference,
            message: accessDifference
                ? `${options.describe} could not see this - GitHub answers 404 the same way for "does not` +
                  ` exist" and "you cannot see it" - and ${options.fallback.describe} could. That is an access` +
                  " difference between the two accounts, not evidence that nothing was there."
                : `${options.describe} failed, so this ran through ${options.fallback.describe} instead, which` +
                  " succeeded.",
        };
    }

    return { outcome: "primary-succeeded", value, message: `Used ${options.describe}.` };
}

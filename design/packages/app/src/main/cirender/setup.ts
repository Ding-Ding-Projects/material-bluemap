/**
 * Data the guided Render-on-GitHub screen's "What, and where" card needs before the
 * repository field is anything more than a blank box: who could own the repository, a
 * name worth trying, and whether that name is actually free.
 *
 * Three separate jobs, deliberately kept apart from `sync.ts`:
 *
 * - {@link listCiOwnerChoices} - the signed-in login plus every organisation `/user/orgs`
 *   reports, mirroring the same "person, then their orgs" shape `main/pages/hosting.ts`'s
 *   `owners()` already uses for the `gh` transport. This is a **convenience list**, not a
 *   permission guarantee - exactly like `listWritableRepositories` in `../backup/github.js`
 *   is a convenience beside a field somebody can still type into. An org whose settings
 *   forbid a member from creating a repository will say so if it is ever asked to create
 *   one; this build never asks, because the CI-render flow only ever reads a repository
 *   that already exists (see `actions.ts` - there is no create-repository call anywhere in
 *   this directory).
 * - {@link suggestCiRepositoryName} - a pure sanitizer, no network, turning a world or map
 *   name into something GitHub's naming rules will actually accept.
 * - {@link checkCiRepositoryNameAvailability} - one read of `GET /repos/{owner}/{repo}`,
 *   authenticated when a token is available and anonymous when it is not, so a suggestion
 *   can be labelled taken or free before anyone presses the button that finds out for real.
 *
 * ## Never a guessed verdict
 *
 * A network failure, an unexpected status, or nobody being signed in are all reported as
 * `"unknown"` with a sentence saying why - never folded into `"available"`. Guessing
 * "available" from a failed check is exactly the mistake that would send somebody to
 * create a repository GitHub was about to refuse, or - worse - to believe a taken name is
 * free and lose the minute they spent typing it.
 *
 * Nothing here imports Electron. The token, like everywhere else in this directory, is a
 * function resolved per call by the caller from the session `github/session.ts` holds.
 */

import { GITHUB_API_BASE } from "../backup/index.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** One person or organisation the signed-in account could publish a render under. */
export interface CiOwnerChoice {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export type CiOwnerChoicesAnswer =
    | { readonly ok: true; readonly login: string; readonly owners: readonly CiOwnerChoice[] }
    | {
          readonly ok: false;
          /** False when the reason is simply that nobody is signed in yet. */
          readonly signedIn: boolean;
          readonly message: string;
      };

export interface CiOwnerChoicesOptions {
    /** The signed-in token, resolved per call. Null or empty means nobody is signed in. */
    readonly token: () => Promise<string | null> | string | null;
    /** Overridable so a test never touches the network. */
    readonly fetch?: FetchLike | undefined;
    readonly apiBase?: string | undefined;
    /** Bounded the same way `listWritableRepositories` bounds its pages. */
    readonly maxOrganizations?: number | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * The signed-in login, plus every organisation `/user/orgs` reports for it.
 *
 * Returns a **result**, never a throw, for the one failure every caller has to tell apart
 * from the rest: nobody being signed in. Everything else - a bad token, a network failure,
 * an answer this build could not read - is still `ok: false`, but with `signedIn: true`, so
 * the screen can offer "try again" instead of "sign in" for a person who very much is.
 */
export async function listCiOwnerChoices(options: CiOwnerChoicesOptions): Promise<CiOwnerChoicesAnswer> {
    const token = await Promise.resolve(options.token());
    if (typeof token !== "string" || token.length === 0) {
        return {
            ok: false,
            signedIn: false,
            message:
                "Nobody is signed in to GitHub on this computer. Sign in from Settings to choose" +
                " an owner.",
        };
    }

    const fetchImpl = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
    const apiBase = options.apiBase ?? GITHUB_API_BASE;
    const maxOrganizations = options.maxOrganizations ?? 100;
    const init: RequestInit = {
        headers: authHeaders(token),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };

    try {
        const meResponse = await fetchImpl(`${apiBase}/user`, init);
        if (!meResponse.ok) {
            return {
                ok: false,
                // 401 means the stored token is no longer accepted, which is the same
                // situation as not being signed in from the screen's point of view.
                signedIn: meResponse.status !== 401,
                message: await refusalMessage(meResponse, "Reading the signed-in account"),
            };
        }
        const login = readLogin(await meResponse.json());
        if (login === null) {
            return {
                ok: false,
                signedIn: true,
                message: "GitHub answered with an account this build could not read.",
            };
        }

        const owners: CiOwnerChoice[] = [{ login, kind: "user" }];

        // An organisations call that fails outright is not fatal to the whole answer: the
        // person themself is still a valid owner, and a repository under an org they belong
        // to can still be typed into the field by hand.
        try {
            const orgsResponse = await fetchImpl(
                `${apiBase}/user/orgs?per_page=${String(maxOrganizations)}`,
                init,
            );
            if (orgsResponse.ok) {
                const body: unknown = await orgsResponse.json();
                if (Array.isArray(body)) {
                    for (const entry of body) {
                        const name = readLogin(entry);
                        if (name !== null) owners.push({ login: name, kind: "organization" });
                    }
                }
            }
        } catch {
            // The login above is still real; an org list that could not be read is simply
            // left off rather than turning a partial success into a whole failure.
        }

        return { ok: true, login, owners };
    } catch (error) {
        return { ok: false, signedIn: true, message: sentence(error) };
    }
}

/* -------------------------------------------------------------------------------------- */
/* Suggesting a name                                                                        */
/* -------------------------------------------------------------------------------------- */

/**
 * GitHub's own limit. Longer names are refused outright rather than truncated server-side,
 * so a suggestion that ignored this would offer something that fails the moment it is used.
 */
export const MAX_CI_REPOSITORY_NAME_LENGTH = 100;

/** What a repository name falls back to when nothing usable survives sanitising. */
export const CI_REPOSITORY_NAME_FALLBACK = "minecraft-map";

const RESERVED_REPOSITORY_NAMES = new Set([".", ".."]);

/**
 * A world or map name, sanitized to a name GitHub will actually accept.
 *
 * GitHub repository names may hold only ASCII letters, digits, `.`, `-` and `_`; may not
 * be exactly `.` or `..`; may not end in `.git`; and are capped at
 * {@link MAX_CI_REPOSITORY_NAME_LENGTH} characters. This is pure and does no network call -
 * it is a *suggestion*, and {@link checkCiRepositoryNameAvailability} is what finds out
 * whether GitHub actually agrees it is free.
 */
export function suggestCiRepositoryName(sourceName: string): string {
    // Accented Latin letters lose their accent rather than their letter - "Café" becomes
    // "Cafe", not "Caf". Anything left outside ASCII after that is not a letter this
    // sanitizer knows how to keep, and is treated like any other disallowed character.
    const normalized = sourceName.normalize("NFKD").replace(/[̀-ͯ]/g, "");

    let candidate = normalized.replace(/[^A-Za-z0-9._-]+/g, "-");
    candidate = candidate.replace(/-{2,}/g, "-");
    candidate = candidate.replace(/^[.-]+|[.-]+$/g, "");

    if (/\.git$/i.test(candidate)) {
        candidate = candidate.slice(0, -".git".length).replace(/[.-]+$/g, "");
    }

    if (candidate.length > MAX_CI_REPOSITORY_NAME_LENGTH) {
        candidate = candidate.slice(0, MAX_CI_REPOSITORY_NAME_LENGTH).replace(/[.-]+$/g, "");
        // The cap can land exactly on a `.git` boundary that was not there before the cut -
        // "a".repeat(96) + ".git" + "bcd" ends in "bcd" pre-truncation, but slicing to 100
        // characters reveals a trailing ".git" that never existed at the string's real end.
        // Looped rather than a single strip, so a pathological run of repeated ".git"
        // suffixes exposed the same way cannot survive either.
        while (/\.git$/i.test(candidate)) {
            candidate = candidate.slice(0, -".git".length).replace(/[.-]+$/g, "");
        }
    }

    if (candidate === "" || RESERVED_REPOSITORY_NAMES.has(candidate)) {
        return CI_REPOSITORY_NAME_FALLBACK;
    }
    return candidate;
}

/* -------------------------------------------------------------------------------------- */
/* Checking availability                                                                    */
/* -------------------------------------------------------------------------------------- */

export type CiRepositoryNameAvailability =
    | { readonly status: "available"; readonly owner: string; readonly repo: string }
    | {
          readonly status: "taken";
          readonly owner: string;
          readonly repo: string;
          readonly private: boolean;
          readonly htmlUrl: string | null;
      }
    | {
          readonly status: "unknown";
          readonly owner: string;
          readonly repo: string;
          /** Why this could not be answered - offline, unauthorized, an odd status. */
          readonly message: string;
      };

export interface CheckCiRepositoryNameOptions {
    /** The signed-in token, resolved per call. Absent is fine: the check still runs. */
    readonly token: () => Promise<string | null> | string | null;
    readonly fetch?: FetchLike | undefined;
    readonly apiBase?: string | undefined;
    readonly signal?: AbortSignal | undefined;
}

/**
 * Whether `owner/repo` is free, read straight from GitHub.
 *
 * Authenticated when a token is available, so a private repository the account already
 * owns is correctly reported taken rather than looking free the way it would to a stranger.
 * Run with no token at all - offline availability checking is still worth doing for a
 * public name - and the same call still works, just answering for what an anonymous
 * request can see.
 */
export async function checkCiRepositoryNameAvailability(
    owner: string,
    repo: string,
    options: CheckCiRepositoryNameOptions,
): Promise<CiRepositoryNameAvailability> {
    const trimmedOwner = owner.trim();
    const trimmedRepo = repo.trim();
    if (trimmedOwner === "" || trimmedRepo === "") {
        return {
            status: "unknown",
            owner: trimmedOwner,
            repo: trimmedRepo,
            message: "An owner and a repository name are required to check.",
        };
    }

    const fetchImpl = options.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
    const apiBase = options.apiBase ?? GITHUB_API_BASE;
    const token = await Promise.resolve(options.token());
    const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "material-bluemap",
    };
    if (typeof token === "string" && token.length > 0) {
        headers["authorization"] = `Bearer ${token}`;
    }

    const url = `${apiBase}/repos/${encodeURIComponent(trimmedOwner)}/${encodeURIComponent(trimmedRepo)}`;
    let response: Response;
    try {
        response = await fetchImpl(url, {
            headers,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
    } catch (error) {
        return {
            status: "unknown",
            owner: trimmedOwner,
            repo: trimmedRepo,
            message: `Could not reach GitHub to check: ${sentence(error)}`,
        };
    }

    if (response.status === 404) {
        return { status: "available", owner: trimmedOwner, repo: trimmedRepo };
    }
    if (response.ok) {
        const record = readMinimalRepository(await response.json());
        return {
            status: "taken",
            owner: trimmedOwner,
            repo: trimmedRepo,
            private: record?.private ?? false,
            htmlUrl: record?.htmlUrl ?? null,
        };
    }

    return {
        status: "unknown",
        owner: trimmedOwner,
        repo: trimmedRepo,
        message: `GitHub answered ${String(response.status)} and this could not be checked.`,
    };
}

/* -------------------------------------------------------------------------------------- */
/* Shared helpers                                                                           */
/* -------------------------------------------------------------------------------------- */

function authHeaders(token: string): Record<string, string> {
    return {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "material-bluemap",
        authorization: `Bearer ${token}`,
    };
}

function readLogin(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return null;
    const login = (value as Record<string, unknown>)["login"];
    return typeof login === "string" && login.length > 0 ? login : null;
}

function readMinimalRepository(value: unknown): { private: boolean; htmlUrl: string | null } | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    return {
        private: record["private"] === true,
        htmlUrl: typeof record["html_url"] === "string" ? record["html_url"] : null,
    };
}

async function refusalMessage(response: Response, what: string): Promise<string> {
    let detail = "";
    try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string") detail = ` GitHub said: ${body.message}`;
    } catch {
        // A body that is not JSON is not worth failing over; the status carries the fact.
    }
    return `${what} failed: GitHub answered ${String(response.status)}.${detail}`;
}

/** One sentence from whatever was thrown, never a stack and never an empty string. */
function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "GitHub could not be reached, and said no more.";
}

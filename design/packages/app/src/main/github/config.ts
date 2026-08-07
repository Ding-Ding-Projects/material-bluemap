/**
 * Which GitHub application the desktop app signs in as, and what it asks for.
 *
 * Everything here is deliberately in one file, because these are the facts somebody
 * forking this repository has to change, and hunting them through five modules is how a
 * fork ends up shipping with the upstream application's identity.
 *
 * There are two registered clients. The **OAuth application is the default**, and the
 * GitHub App is available to anyone who prefers it, through the environment. They are
 * **not interchangeable**, and the differences are handled throughout this module rather
 * than papered over, because each one produces a wrong-looking failure somewhere else if
 * it is ignored:
 *
 * - an **OAuth App** takes a scope list, issues a token that does not expire, and can see
 *   whatever the account can see;
 * - a **GitHub App** takes no `scope` parameter at all (its permissions come from its own
 *   configuration and from which repositories the user installed it on), its user token
 *   can expire and has to be refreshed, and it can only see repositories it has been
 *   installed on - which also means its "not found" usually means "not installed here".
 */

/**
 * The OAuth application, which is how sign-in works by default.
 *
 * This is public by design and committing it is correct. GitHub's device flow exists
 * precisely because a desktop application cannot keep a secret: the bundle is on the
 * user's disk, so anything baked into it can be read out of it with a text editor. The
 * flow therefore uses no client secret at all, and a client id identifies an application
 * without authenticating it. Treating it as sensitive would buy nothing and would only
 * make the app harder to configure.
 *
 * A fork points at its own application through the environment rather than by editing
 * this line, so the change survives a rebase.
 */
export const GITHUB_OAUTH_CLIENT_ID = "Ov23liJJhHYC2YP1iTFN";

/**
 * The GitHub App, which is an option rather than the default.
 *
 * Worth having for somebody who would rather grant access one repository at a time: an
 * App reaches only the repositories it has been installed on, where the OAuth
 * application can see whatever the account can. That narrowness is not free - it means
 * an installation step per repository, a token that expires every few hours and has to
 * be refreshed, and a "not found" that usually means "not installed here" - so it is
 * offered to people who want it rather than imposed on everyone.
 *
 * Reached by setting both {@link GITHUB_CLIENT_ID_ENV} to this value and
 * {@link GITHUB_CLIENT_KIND_ENV} to `app`.
 */
export const GITHUB_APP_CLIENT_ID = "Iv23liPCatYTLpipKJYS";

/**
 * Which of the two a client id is.
 *
 * This is not cosmetic. Sending a `scope` to an App client is meaningless, an App's
 * token can expire while an OAuth App's does not, and a 404 from an App means something
 * different from a 404 from an OAuth App. Everything downstream branches on this.
 */
export type GitHubClientKind = "app" | "oauth";

export interface GitHubClient {
    readonly id: string;
    readonly kind: GitHubClientKind;
}

/**
 * Where a token came from, which decides how its silences are read.
 *
 * A GitHub App user token and a fine-grained personal access token both report no
 * scopes, and they report none for different reasons: the App's permissions live on the
 * App and on its installations, the fine-grained token's live on the token. A 404 means
 * different things to each as well. Saying the wrong one sends somebody to the wrong
 * settings page, so this travels with the token everywhere it goes, including onto disk.
 */
export type TokenSource = "github-app" | "oauth-app" | "personal-access-token";

/** The token a given client kind issues. */
export function tokenSourceForClient(kind: GitHubClientKind): TokenSource {
    return kind === "app" ? "github-app" : "oauth-app";
}

/** Overrides the client id at runtime. Empty or unset means the default. */
export const GITHUB_CLIENT_ID_ENV = "WORLDLENS_GITHUB_CLIENT_ID";
export const LEGACY_GITHUB_CLIENT_ID_ENV = "MATERIAL_BLUEMAP_GITHUB_CLIENT_ID";

/** `app` or `oauth`. Says which kind an overridden client id is, since it cannot be guessed. */
export const GITHUB_CLIENT_KIND_ENV = "WORLDLENS_GITHUB_CLIENT_KIND";
export const LEGACY_GITHUB_CLIENT_KIND_ENV = "MATERIAL_BLUEMAP_GITHUB_CLIENT_KIND";

/**
 * A client secret, which this application never ships and does not normally need.
 *
 * Two GitHub endpoints authenticate as the application itself rather than as the user:
 * token revocation, and the refresh-token grant. A shipped desktop build has no secret -
 * that is the whole reason it uses the device flow - so on such a build sign-out deletes
 * the local copy and says plainly that the authorization is still listed on GitHub, and
 * an expired App token is answered by signing in again rather than by a silent refresh.
 * A self-hosted build that genuinely holds a secret can set this and get both.
 */
export const GITHUB_CLIENT_SECRET_ENV = "WORLDLENS_GITHUB_CLIENT_SECRET";
export const LEGACY_GITHUB_CLIENT_SECRET_ENV = "MATERIAL_BLUEMAP_GITHUB_CLIENT_SECRET";

/**
 * The smallest set of scopes that can do the job. **OAuth App only.**
 *
 * - `public_repo` dispatches the render workflow and publishes and reads release assets
 *   on public repositories.
 * - `workflow` is required on its own to dispatch anything under `.github/workflows`;
 *   no repository scope implies it.
 * - `read:user` is how the app can show who is signed in.
 *
 * `repo` is deliberately absent. It carries read and write access to every private
 * repository the account can reach, including ones this application has no business
 * touching, and nothing here needs it. A token that happens to carry it still works,
 * because `repo` implies `public_repo`, but the app says so rather than staying quiet.
 *
 * A GitHub App is never sent any of this. Its permissions are configured on the App and
 * granted per repository at install time, so a `scope` parameter would be ignored at
 * best and rejected at worst.
 */
export const REQUIRED_SCOPES: readonly string[] = ["public_repo", "workflow", "read:user"];

/** Where the device flow's two endpoints live. Overridable so a test never leaves the machine. */
export const GITHUB_OAUTH_BASE = "https://github.com";

/** The REST API, used to identify a token's account and read the scopes it was granted. */
export const GITHUB_API_BASE = "https://api.github.com";

/** Where somebody manages an OAuth application's authorization. */
export function authorizedApplicationUrl(clientId: string): string {
    return `https://github.com/settings/connections/applications/${encodeURIComponent(clientId)}`;
}

/**
 * Where somebody adds a repository to a GitHub App they have already installed.
 *
 * Deliberately the account-wide installations page rather than a guessed per-app URL:
 * the per-app one needs the App's slug, which is not derivable from the client id, and a
 * link that 404s is worse than one that takes an extra click.
 */
export const APP_INSTALLATIONS_URL = "https://github.com/settings/installations";

/** Where somebody manages personal access tokens. Shown when a pasted token is signed out. */
export const PERSONAL_ACCESS_TOKEN_SETTINGS_URL = "https://github.com/settings/tokens";

/** Only the variables this module reads, so a test does not have to build a whole environment. */
export type EnvironmentLike = Readonly<Record<string, string | undefined>>;

/**
 * The kind of a client id, from its prefix.
 *
 * GitHub issues App client ids beginning `Iv` and OAuth ones beginning `Ov`. That is a
 * convention rather than a promise, so it is only ever a fallback: an explicit
 * {@link GITHUB_CLIENT_KIND_ENV} always wins, and a fork with an unrecognised id is told
 * to say which kind it is instead of being guessed at.
 */
export function clientKindFromId(clientId: string): GitHubClientKind | null {
    if (clientId.startsWith("Iv")) return "app";
    if (clientId.startsWith("Ov")) return "oauth";
    return null;
}

/**
 * The client in force, or null when there is none.
 *
 * The OAuth application is the default. Nothing selects the GitHub App unless a client
 * id is given explicitly **and** it is an App id - either declared through
 * {@link GITHUB_CLIENT_KIND_ENV} or recognisable from GitHub's own `Iv` prefix.
 *
 * A declared kind on its own is deliberately ignored. It says which sort of application
 * an id is; it does not say which application to use, and applying `app` to the built-in
 * OAuth id would send an App-shaped request - no `scope` at all - to a client that needs
 * one, signing somebody in with no permissions and no error to explain it.
 *
 * Null is a real answer rather than a crash. A build with no application configured can
 * still sign in with a personal access token, and the honest thing is to say the device
 * flow is unavailable and point at the other path, instead of starting a flow GitHub
 * will refuse with an error nobody can act on.
 */
export function resolveClient(
    environment: EnvironmentLike = process.env,
    fallback: GitHubClient = { id: GITHUB_OAUTH_CLIENT_ID, kind: "oauth" },
): GitHubClient | null {
    const override =
        environment[GITHUB_CLIENT_ID_ENV] ?? environment[LEGACY_GITHUB_CLIENT_ID_ENV];
    const overriddenId = typeof override === "string" ? override.trim() : "";

    const rawKind =
        environment[GITHUB_CLIENT_KIND_ENV] ?? environment[LEGACY_GITHUB_CLIENT_KIND_ENV];
    const declaredKind =
        typeof rawKind === "string" && (rawKind.trim() === "app" || rawKind.trim() === "oauth")
            ? (rawKind.trim() as GitHubClientKind)
            : null;

    if (overriddenId !== "") {
        // An unrecognised id with no declared kind is treated as `oauth`, which is the
        // conservative guess: an OAuth-shaped request sends a scope list an App would
        // ignore, whereas an App-shaped request omits scopes an OAuth App genuinely needs.
        return {
            id: overriddenId,
            kind: declaredKind ?? clientKindFromId(overriddenId) ?? "oauth",
        };
    }

    const baked = fallback.id.trim();
    if (baked === "") return null;

    // The declared kind only applies to an id it can actually be true of; see above.
    const bakedKind = clientKindFromId(baked) ?? fallback.kind;
    return { id: baked, kind: declaredKind === bakedKind ? declaredKind : fallback.kind };
}

/** The OAuth-App fallback client, or null when the build has none. */
export function fallbackOAuthClient(
    fallback: string = GITHUB_OAUTH_CLIENT_ID,
): GitHubClient | null {
    const id = fallback.trim();
    return id === "" ? null : { id, kind: "oauth" };
}

/** The client secret in force, or null. Null on every shipped build; see the constant above. */
export function resolveClientSecret(environment: EnvironmentLike = process.env): string | null {
    const value =
        environment[GITHUB_CLIENT_SECRET_ENV] ?? environment[LEGACY_GITHUB_CLIENT_SECRET_ENV];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The scopes to ask a given client for.
 *
 * Empty for an App, which is the whole point: `requestDeviceCode` omits the parameter
 * entirely rather than sending an empty one, because an empty `scope` on an OAuth client
 * means "no scopes" and the two must not be confused.
 */
export function scopesForClient(
    kind: GitHubClientKind,
    required: readonly string[] = REQUIRED_SCOPES,
): readonly string[] {
    return kind === "app" ? [] : required;
}

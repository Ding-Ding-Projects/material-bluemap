/**
 * Which GitHub token a download runs under.
 *
 * Three sources, tried in this order: the account somebody signed in to on this computer,
 * then `GH_TOKEN` from the environment, then nothing at all.
 *
 * The order is the whole point of this file. The downloader used to read `GH_TOKEN` and
 * only `GH_TOKEN`, which meant signing in to GitHub inside the application did not make a
 * private release fetchable: the sign-in screen said "signed in as ...", the download said
 * "release not found", and the two statements were both true and completely unconnected.
 * Somebody in that position has no way to tell that the credential they just went and
 * approved on their phone is being ignored by the only thing they wanted it for.
 *
 * The environment stays as the second source rather than being replaced. A continuous
 * integration runner has no sign-in and never will, and neither does somebody who exported
 * a token in a shell before starting the application; both of those worked before this
 * file existed and must keep working.
 *
 * ## Nothing here throws
 *
 * Every failure degrades to the next source. A session that rejects, a refresh GitHub
 * refuses, a store that cannot be decrypted - each of those is a reason this computer has
 * no signed-in token *right now*, and none of them is a reason to refuse a download of a
 * public release that never needed one. The alternative is a twenty-gigabyte world that
 * stops because a credential nobody asked it to use could not be renewed.
 *
 * ## The token is asked for again every time
 *
 * `accessToken()` renews a token that is close to expiring, so the answer is only good for
 * the operation that asked. A value captured once at startup would be the one thing in the
 * process that cannot renew, and it would be wrong in both directions: stale after a
 * refresh, and absent for ever for somebody who signed in a minute after the window opened.
 */

/**
 * The part of the GitHub sign-in a download needs.
 *
 * Structural rather than an import of `GitHubSession`, so that `download/` keeps depending
 * on nothing under `github/`: the two folders meet in `main/index.ts`, which is where the
 * application decides that the thing downloading releases and the thing holding the
 * credential are the same product. It also means a test hands over four lines rather than
 * standing up a token store.
 */
export interface SignedInSession {
    /**
     * The token for the signed-in account, renewed first when it is near expiry.
     *
     * `{ ok: false }` for every reason there is no usable token - nobody signed in, a
     * session that expired, a refresh GitHub refused - because a download treats all of
     * them the same way: carry on without one.
     */
    accessToken(): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false }>;
}

export interface ReleaseTokenOptions {
    /** The sign-in, when the application has one. Null is "not signed in", not an error. */
    readonly session?: SignedInSession | null | undefined;
    /** Overridable so a test does not have to write to `process.env`. */
    readonly environment?: (() => string | null | undefined) | undefined;
}

/**
 * Builds the function the downloader asks for a token, once per operation.
 *
 * An empty string counts as no token, from either source. `GH_TOKEN=` in a shell profile
 * is somebody unsetting it, and treating it as a token present but blank is worse than
 * useless: it picks the API asset URL, which is the one route that needs authentication,
 * and then sends no credential with it.
 */
export function releaseTokenSource(
    options: ReleaseTokenOptions = {},
): () => Promise<string | null> {
    const readEnvironment =
        options.environment ?? ((): string | undefined => process.env["GH_TOKEN"]);

    return async (): Promise<string | null> => {
        const session = options.session ?? null;
        if (session !== null) {
            const signedIn = await signedInToken(session);
            if (signedIn !== null) return signedIn;
        }
        return usable(readEnvironment());
    };
}

/** The signed-in token, or null for every way there is not one. */
async function signedInToken(session: SignedInSession): Promise<string | null> {
    try {
        const result = await session.accessToken();
        return result.ok ? usable(result.token) : null;
    } catch {
        // Deliberately swallowed. `accessToken` reports its refusals by returning them,
        // so a rejection here is something unexpected below it - and whatever it was, the
        // download it happened during is not the place to surface it. The sign-in surface
        // is, and it asks the session itself.
        return null;
    }
}

function usable(value: string | null | undefined): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

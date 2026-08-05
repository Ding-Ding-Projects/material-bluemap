/**
 * The seam between the GitHub sign-in section and the main process.
 *
 * Every type here is a structural mirror of one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
 * `settings/settingsBridge.ts` and `world/worldBridge.ts` restate theirs: this package
 * compiles and runs in three places and only one of them has a preload. In a browser tab
 * there is no main process to ask, and under Vitest the whole surface is driven by a fake.
 *
 * **The token is deliberately absent from every type in this file.** The main process is
 * the only side that holds a credential and the only side that talks to GitHub; this
 * surface learns who is signed in, what that account may do and whether the credential
 * survived being stored. The one place a token exists in the renderer at all is the
 * pasted-token field, which hands its value straight to
 * {@link GitHubBridge.githubSignInWithToken} and keeps nothing.
 *
 * **Nothing here invents a capability.** Each method is optional and is feature-detected
 * one at a time, because a released shell can load a newer renderer than the one it was
 * built beside, and a Sign in button that throws when it is pressed is worse than a
 * sentence saying this build cannot sign in.
 */

/** Which kind of credential a sign-in produced. Mirrors `TokenSource` in the main process. */
export type GitHubTokenSource = "github-app" | "oauth-app" | "personal-access-token";

/**
 * Who is signed in.
 *
 * `persisted` and `scopesReported` are the two fields worth reading carefully. A sign-in
 * that was not persisted lasts until the app closes, and the difference only shows up at
 * the next launch when somebody is signed out again with no idea why - so the section says
 * it now. `scopesReported` is false for a GitHub App token and for a fine-grained personal
 * access token, neither of which reports a scope list at all; that is a fact about the
 * token rather than a gap in the reading, and an empty scope list must not be shown as
 * "this account may do nothing".
 */
export interface GitHubAccountReadout {
    readonly login: string;
    readonly userId: number | null;
    readonly name: string | null;
    readonly scopes: readonly string[];
    readonly scopesReported: boolean;
    readonly source: GitHubTokenSource;
    readonly signedInAt: string;
    /** Null when the token does not expire, which is the normal OAuth App answer. */
    readonly expiresAt: string | null;
    readonly refreshable: boolean;
    /** False when this machine has no credential store; the sign-in lasts this run only. */
    readonly persisted: boolean;
    readonly warnings: readonly string[];
}

/**
 * Why a sign-in did not happen, in the main process's own words.
 *
 * `message` is written to be shown as written - it is the most precise statement
 * available and it is what somebody would search for - so this surface never rewrites it.
 */
export interface GitHubFailureReadout {
    readonly code: string;
    readonly message: string;
    /** Populated for `insufficient-scopes`, so the section can name them. */
    readonly missingScopes: readonly string[];
    /** True when signing in with the OAuth application instead would likely work. */
    readonly offerOAuthFallback: boolean;
}

export type GitHubSignInOutcome =
    | { readonly ok: true; readonly account: GitHubAccountReadout }
    | { readonly ok: false; readonly failure: GitHubFailureReadout };

/**
 * What signing out actually managed to do.
 *
 * `revoked` is true only when GitHub confirmed the revocation, never merely because it
 * was asked. A desktop application holds no client secret and GitHub's revocation
 * endpoint wants one, so on a shipped build the honest answer is usually false with a
 * reason and a link for finishing the job on github.com.
 */
export interface GitHubSignOutReadout {
    readonly signedOut: boolean;
    readonly revoked: boolean;
    readonly reason: string | null;
    readonly manageUrl: string | null;
    /**
     * Who this fell back to when another account was stored, or null when the sign-out was
     * complete. The legacy single-account channel now falls back to another stored account
     * rather than always leaving nobody signed in, so a screen that ignores this can end up
     * reporting "signed out" beside a still-live "signed in" card for the account it fell
     * back to. Mirrors {@link GitHubRemoveAccountReadout.fallbackAccount}.
     */
    readonly fallbackAccount: GitHubAccountReadout | null;
}

export interface GitHubStatusReadout {
    readonly signedIn: boolean;
    readonly account: GitHubAccountReadout | null;
    /** False when this build has no client configured; only the token path is available. */
    readonly clientConfigured: boolean;
    readonly clientKind: "app" | "oauth" | null;
    /** False when this machine has no credential store; a sign-in will not be persisted. */
    readonly encryptionAvailable: boolean;
    readonly requiredScopes: readonly string[];
    readonly signingIn: boolean;
}

/**
 * What the screen is told while a device sign-in waits.
 *
 * This is the **only** channel the user code, the verification address, the countdown and
 * the expiry arrive on. A device sign-in is a wait of unknown length - as long as it takes
 * somebody to reach their phone - and none of that is available to a screen that can only
 * ask "are we there yet". So the panel renders exactly what these events carried and
 * nothing else: no code it composed, no clock it started on its own, no outcome it
 * assumed.
 */
export type GitHubAuthEventReadout =
    | {
          readonly type: "code";
          /** Shown exactly as it arrives, hyphen included: it is what the person types. */
          readonly userCode: string;
          readonly verificationUri: string;
          readonly verificationUriComplete: string | null;
          readonly expiresAt: string;
          readonly expiresInSeconds: number;
          readonly intervalSeconds: number;
          /** False when the browser could not be opened; show the address instead. */
          readonly browserOpened: boolean;
      }
    | { readonly type: "waiting"; readonly secondsRemaining: number; readonly intervalSeconds: number }
    | { readonly type: "signed-in"; readonly account: GitHubAccountReadout }
    | { readonly type: "failed"; readonly failure: GitHubFailureReadout }
    | { readonly type: "cancelled" }
    | { readonly type: "signed-out" };

/** Whether the signed-in account can reach one repository. Mirrors `RepositoryAccess`. */
export type GitHubRepositoryAccessReadout =
    | { readonly ok: true; readonly fullName: string; readonly private: boolean }
    | {
          readonly ok: false;
          readonly failure: {
              readonly code: string;
              readonly message: string;
              readonly manageUrl: string | null;
              readonly offerOAuthFallback: boolean;
          };
      };

/**
 * One stored account, as the multi-account list shows it - the same facts
 * {@link GitHubAccountReadout} carries, plus the two a list needs that a single "who is
 * signed in" readout never had to: an id to act on, and whether this is the one every
 * legacy single-account channel currently resolves to.
 */
export interface GitHubAccountSummaryReadout extends GitHubAccountReadout {
    readonly id: string;
    readonly active: boolean;
}

export interface GitHubAccountsListReadout {
    readonly accounts: readonly GitHubAccountSummaryReadout[];
    readonly activeId: string | null;
}

/**
 * What removing one stored account actually did.
 *
 * `fallbackAccount` is the honest answer to "which account is now active", not a guess:
 * null means genuinely signed out, and a value names exactly who this fell back to. A
 * screen that removed the active account and said nothing about what replaced it would be
 * lying by omission about the very question somebody just asked.
 */
export interface GitHubRemoveAccountReadout {
    readonly removed: boolean;
    readonly wasActive: boolean;
    readonly newActiveId: string | null;
    readonly revoked: boolean;
    readonly reason: string | null;
    readonly manageUrl: string | null;
    readonly fallbackAccount: GitHubAccountReadout | null;
}

export interface GitHubSetActiveAccountReadout {
    readonly ok: boolean;
    readonly activeId: string | null;
    readonly account: GitHubAccountReadout | null;
    readonly reason: string | null;
}

/** Never carries the token itself - that never crosses IPC, refreshed or not. */
export interface GitHubRefreshAccountReadout {
    readonly ok: boolean;
    readonly account: GitHubAccountReadout | null;
    readonly failure: GitHubFailureReadout | null;
}

/**
 * The preload's GitHub namespace, every method optional.
 *
 * `githubCheckRepository` is declared and deliberately unused by this surface: it belongs
 * to the render path, which asks it before starting a job so that a repository a GitHub
 * App was never installed on is reported as exactly that rather than as "not found". It is
 * named here so the namespace this file mirrors is the whole namespace.
 *
 * The four `github*Account*` methods are additive, on top of the single-account contract
 * above rather than instead of it: `githubSignIn`/`githubSignInWithToken` still work
 * exactly as documented and, on a build that has them, now add an account and make it
 * active rather than replacing "the" one. A build whose preload predates multi-account
 * support simply has none of these four, and the section falls back to the single-account
 * facts it always showed.
 */
export interface GitHubBridge {
    githubStatus?: () => Promise<GitHubStatusReadout>;
    githubSignIn?: (options?: { useOAuthFallback?: boolean }) => Promise<GitHubSignInOutcome>;
    githubCancelSignIn?: () => Promise<boolean>;
    githubSignInWithToken?: (token: string) => Promise<GitHubSignInOutcome>;
    githubSignOut?: () => Promise<GitHubSignOutReadout>;
    githubCheckRepository?: (owner: string, repo: string) => Promise<GitHubRepositoryAccessReadout>;
    /** Subscribes to sign-in progress. Returns the unsubscribe function. */
    onGitHubAuthEvent?: (listener: (event: GitHubAuthEventReadout) => void) => () => void;
    /**
     * Not part of the sign-in contract, and detected separately.
     *
     * It is what the copy affordance beside the user code uses when it is there; the
     * browser's own clipboard is the fallback, and a build with neither shows the code
     * to be typed rather than a Copy button that does nothing.
     */
    writeClipboardText?: (text: string) => Promise<void>;

    /** Every account this computer has stored, richest first. */
    githubListAccounts?: () => Promise<GitHubAccountsListReadout>;
    /** Removes one specific account's stored token, active or not. */
    githubRemoveAccount?: (id: string) => Promise<GitHubRemoveAccountReadout>;
    /** Switches which stored account every single-account channel resolves to. */
    githubSetActiveAccount?: (id: string) => Promise<GitHubSetActiveAccountReadout>;
    /** Renews one specific account's token ahead of its own expiry. */
    githubRefreshAccount?: (id: string) => Promise<GitHubRefreshAccountReadout>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload, or null when there is none. Every method on it is still optional. */
export function resolveGitHubBridge(): GitHubBridge | null {
    const host = (globalThis as { materialBluemap?: GitHubBridge }).materialBluemap;
    return host ?? null;
}

/** True when this build can say who is signed in. False in a browser tab. */
export function canReadGitHubStatus(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubStatus);
}

/**
 * True when the browser sign-in can be both started **and** watched.
 *
 * Both halves are required. A `githubSignIn` with no event stream would start a flow
 * whose user code never reaches the screen, leaving a spinner for as long as a quarter of
 * an hour with nothing to type anywhere - which is a hang wearing a progress indicator.
 */
export function canStartDeviceSignIn(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubSignIn) && isFunction(bridge?.onGitHubAuthEvent);
}

/** True when a sign-in that is waiting for approval can be stopped. */
export function canCancelSignIn(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubCancelSignIn);
}

/** True when a pasted personal access token can be used. */
export function canSignInWithToken(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubSignInWithToken);
}

/** True when the stored credential can be deleted and revocation attempted. */
export function canSignOut(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubSignOut);
}

/** True when the app's own clipboard write is available. */
export function canWriteClipboard(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.writeClipboardText);
}

/**
 * True when the section can do anything at all.
 *
 * Reading the status alone is not enough to be useful, and neither is a sign-in method
 * with no way to report what came of it; the section says "this build cannot sign in to
 * GitHub" unless at least one whole route exists.
 */
export function canSignInToGitHub(bridge: GitHubBridge | null): boolean {
    return canStartDeviceSignIn(bridge) || canSignInWithToken(bridge);
}

/** True when every stored account can be listed. This is what turns on the accounts list. */
export function canListGitHubAccounts(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubListAccounts);
}

/** True when one specific account, active or not, can be removed. */
export function canRemoveGitHubAccount(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubRemoveAccount);
}

/** True when which account is active can be switched. */
export function canSetActiveGitHubAccount(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubSetActiveAccount);
}

/** True when one specific account's token can be refreshed on demand. */
export function canRefreshGitHubAccount(bridge: GitHubBridge | null): boolean {
    return isFunction(bridge?.githubRefreshAccount);
}

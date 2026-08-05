/**
 * The GitHub sign-in channel between the main process and the interface.
 *
 * Built to the same shape as `render/ipc.ts` and `download/ipc.ts`: this is the only
 * file under `github/` that imports Electron, everything else takes what it needs as a
 * parameter, and progress is **pushed** rather than polled.
 *
 * The pushing matters more here than it looks. A device-flow sign-in is a wait of
 * unknown length - as long as it takes somebody to pick up their phone - and the screen
 * has to show a code, a countdown and, when the code dies, the fact that it died. None
 * of that is available to a renderer that can only ask "are we there yet".
 *
 * The token itself never crosses this boundary. The renderer learns the account name,
 * the scopes and whether it was stored; the token stays in the main process, which is
 * the only side that talks to GitHub.
 *
 * ## Multiple accounts, one legacy contract
 *
 * `GitHubAccountsController` (`accounts.ts`) is what actually backs `session` here now,
 * not a bare `GitHubSession`. Every channel that existed before this file learned about
 * multiple accounts - `github:status`, `github:signIn`, `github:cancelSignIn`,
 * `github:signInWithToken`, `github:signOut`, `github:checkRepository` - is untouched
 * below: same name, same request shape, same response shape. They all resolve to
 * whichever account is active, which is exactly what "the signed-in account" meant before
 * there could be more than one.
 *
 * Four channels are new, and only new: `github:listAccounts`, `github:removeAccount`,
 * `github:setActiveAccount`, `github:refreshAccount`. None of them replace anything.
 */

import { BrowserWindow, app, ipcMain, safeStorage } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { GitHubAccountsController, migrateLegacyAccount } from "./accounts.js";
import type {
    AccountsList,
    GitHubSessionLike,
    RefreshAccountResult,
    RemoveAccountResult,
    SetActiveAccountResult,
} from "./accounts.js";
import { fallbackOAuthClient, resolveClient, resolveClientSecret } from "./config.js";
import type { FetchLike } from "./deviceFlow.js";
import { openExternalHttps } from "./external.js";
import type { GitHubAuthEvent, GitHubStatus, SignInResult, SignOutResult } from "./session.js";
import type { RepositoryAccess } from "./token.js";

/** Every sign-in event arrives on this channel. */
export const GITHUB_EVENT_CHANNEL = "github:event";

/**
 * Where the (now legacy) single credential file used to live, under the user's own
 * profile. Only read once, to migrate a sign-in made before multi-account support
 * existed; never written to again.
 */
export const CREDENTIAL_FILE_NAME = "github-credential.json";

/** Where every account's files live: the registry plus one credential file each. */
export const ACCOUNTS_DIRECTORY_NAME = "github-accounts";

export interface GitHubIpcOptions {
    /** The accounts directory. Defaults to one under `userData`. */
    readonly directory?: string | undefined;
    /** Overridable so a test never touches the network. */
    readonly fetch?: FetchLike | undefined;
    /** Overridable so a test can watch what was broadcast. Defaults to every window. */
    readonly broadcast?: ((event: GitHubAuthEvent) => void) | undefined;
}

export interface GitHubIpc {
    /**
     * The legacy single-account surface, now backed by whichever account is active.
     *
     * Typed structurally (`GitHubSessionLike`) rather than as the concrete `GitHubSession`
     * class, precisely so this keeps satisfying every existing caller that was handed a
     * `GitHubSession` before - `download/token.ts`'s `SignedInSession`, `main/index.ts`'s
     * `github.session.status()` - none of which need anything beyond these methods.
     */
    readonly session: GitHubSessionLike;
    /** The same object as `session`, typed for the multi-account methods it also has. */
    readonly accounts: GitHubAccountsController;
    dispose(): void;
}

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
const GITHUB_CHANNELS = [
    "github:status",
    "github:signIn",
    "github:cancelSignIn",
    "github:signInWithToken",
    "github:signOut",
    "github:checkRepository",
    "github:listAccounts",
    "github:removeAccount",
    "github:setActiveAccount",
    "github:refreshAccount",
] as const;

function broadcastToWindows(event: GitHubAuthEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        window.webContents.send(GITHUB_EVENT_CHANNEL, event);
    }
}

export function installGitHubIpc(options: GitHubIpcOptions = {}): GitHubIpc {
    const directory = options.directory ?? join(app.getPath("userData"), ACCOUNTS_DIRECTORY_NAME);

    // One-time, best-effort: bring a pre-multi-account sign-in forward so an update does
    // not silently sign anybody out. See `accounts.ts` for the exact rule.
    migrateLegacyAccount({
        legacyFile: join(app.getPath("userData"), CREDENTIAL_FILE_NAME),
        directory,
        safeStorage,
    });

    const accounts = new GitHubAccountsController({
        directory,
        safeStorage,
        fetch: options.fetch ?? ((url, init) => fetch(url, init)),
        sleep: (milliseconds) =>
            new Promise((resolve) => {
                setTimeout(resolve, milliseconds);
            }),
        client: () => resolveClient(),
        oauthFallbackClient: () => fallbackOAuthClient(),
        clientSecret: () => resolveClientSecret(),
        openExternal: openExternalHttps,
        onEvent: options.broadcast ?? broadcastToWindows,
    });

    ipcMain.handle("github:status", (): GitHubStatus => accounts.status());

    // Deliberately not awaited anywhere else: this resolves only when the person has
    // approved, refused, or let the code expire, which can be a quarter of an hour. Adds
    // the resulting account and makes it active; existing accounts are left untouched.
    ipcMain.handle(
        "github:signIn",
        async (
            _event: IpcMainInvokeEvent,
            request: { useOAuthFallback?: boolean } | undefined,
        ): Promise<SignInResult> =>
            await accounts.startDeviceSignIn(
                request?.useOAuthFallback === true ? { useOAuthFallback: true } : {},
            ),
    );

    ipcMain.handle("github:cancelSignIn", (): boolean => accounts.cancelSignIn());

    ipcMain.handle(
        "github:signInWithToken",
        async (_event: IpcMainInvokeEvent, token: unknown): Promise<SignInResult> => {
            if (typeof token !== "string") {
                return {
                    ok: false,
                    failure: {
                        code: "empty-token",
                        message: "Paste a token to sign in with.",
                        missingScopes: [],
                        offerOAuthFallback: false,
                    },
                };
            }
            return await accounts.signInWithToken(token);
        },
    );

    // Signs out the ACTIVE account. With another account stored, that account becomes
    // active rather than leaving the app signed out; `github:status` reflects it
    // immediately and a `signed-in` event is broadcast the same as an explicit sign-in.
    ipcMain.handle("github:signOut", async (): Promise<SignOutResult> => await accounts.signOut());

    // Asked before a render, so that a GitHub App which has not been installed on the
    // repository is reported as exactly that rather than as "not found" during the job.
    ipcMain.handle(
        "github:checkRepository",
        async (
            _event: IpcMainInvokeEvent,
            request: { owner?: unknown; repo?: unknown } | undefined,
        ): Promise<RepositoryAccess> => {
            const owner = typeof request?.owner === "string" ? request.owner : "";
            const repo = typeof request?.repo === "string" ? request.repo : "";
            if (owner === "" || repo === "") {
                return {
                    ok: false,
                    failure: {
                        code: "not-found",
                        message: "Give a repository owner and name to check.",
                        manageUrl: null,
                        offerOAuthFallback: false,
                    },
                };
            }
            return await accounts.checkRepository(owner, repo);
        },
    );

    /* -------------------------------- new, additive channels -------------------------- */

    ipcMain.handle("github:listAccounts", (): AccountsList => accounts.listAccounts());

    ipcMain.handle(
        "github:removeAccount",
        async (_event: IpcMainInvokeEvent, request: { id?: unknown } | undefined): Promise<RemoveAccountResult> => {
            const id = typeof request?.id === "string" ? request.id : "";
            if (id === "") {
                return {
                    removed: false,
                    wasActive: false,
                    newActiveId: accounts.activeAccountId(),
                    revoked: false,
                    reason: null,
                    manageUrl: null,
                    fallbackAccount: null,
                };
            }
            return await accounts.removeAccount(id);
        },
    );

    ipcMain.handle(
        "github:setActiveAccount",
        (_event: IpcMainInvokeEvent, request: { id?: unknown } | undefined): SetActiveAccountResult => {
            const id = typeof request?.id === "string" ? request.id : "";
            if (id === "") {
                return {
                    ok: false,
                    activeId: accounts.activeAccountId(),
                    account: null,
                    reason: "Give an account id to switch to.",
                };
            }
            return accounts.setActiveAccount(id);
        },
    );

    ipcMain.handle(
        "github:refreshAccount",
        async (
            _event: IpcMainInvokeEvent,
            request: { id?: unknown } | undefined,
        ): Promise<RefreshAccountResult> => {
            const id = typeof request?.id === "string" ? request.id : "";
            if (id === "") {
                return {
                    ok: false,
                    account: null,
                    failure: {
                        code: "no-such-account",
                        message: "Give an account id to refresh.",
                        missingScopes: [],
                        offerOAuthFallback: false,
                    },
                };
            }
            return await accounts.refreshAccount(id);
        },
    );

    return {
        session: accounts,
        accounts,
        dispose(): void {
            accounts.cancelSignIn();
            for (const channel of GITHUB_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

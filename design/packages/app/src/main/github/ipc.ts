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
 */

import { BrowserWindow, app, ipcMain, safeStorage } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { fallbackOAuthClient, resolveClient, resolveClientSecret } from "./config.js";
import type { FetchLike } from "./deviceFlow.js";
import { openExternalHttps } from "./external.js";
import { GitHubSession } from "./session.js";
import type { GitHubAuthEvent, GitHubStatus, SignInResult, SignOutResult } from "./session.js";
import { TokenStore } from "./storage.js";
import type { RepositoryAccess } from "./token.js";

/** Every sign-in event arrives on this channel. */
export const GITHUB_EVENT_CHANNEL = "github:event";

/** Where the encrypted credential lives, under the user's own profile. */
export const CREDENTIAL_FILE_NAME = "github-credential.json";

export interface GitHubIpcOptions {
    /** Absolute path of the credential file. Defaults to one under `userData`. */
    readonly file?: string | undefined;
    /** Overridable so a test never touches the network. */
    readonly fetch?: FetchLike | undefined;
    /** Overridable so a test can watch what was broadcast. Defaults to every window. */
    readonly broadcast?: ((event: GitHubAuthEvent) => void) | undefined;
}

export interface GitHubIpc {
    readonly session: GitHubSession;
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
] as const;

function broadcastToWindows(event: GitHubAuthEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        window.webContents.send(GITHUB_EVENT_CHANNEL, event);
    }
}

export function installGitHubIpc(options: GitHubIpcOptions = {}): GitHubIpc {
    const store = new TokenStore({
        file: options.file ?? join(app.getPath("userData"), CREDENTIAL_FILE_NAME),
        safeStorage,
    });

    const session = new GitHubSession({
        store,
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

    ipcMain.handle("github:status", (): GitHubStatus => session.status());

    // Deliberately not awaited anywhere else: this resolves only when the person has
    // approved, refused, or let the code expire, which can be a quarter of an hour.
    ipcMain.handle(
        "github:signIn",
        async (
            _event: IpcMainInvokeEvent,
            request: { useOAuthFallback?: boolean } | undefined,
        ): Promise<SignInResult> =>
            await session.startDeviceSignIn(
                request?.useOAuthFallback === true ? { useOAuthFallback: true } : {},
            ),
    );

    ipcMain.handle("github:cancelSignIn", (): boolean => session.cancelSignIn());

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
            return await session.signInWithToken(token);
        },
    );

    ipcMain.handle("github:signOut", async (): Promise<SignOutResult> => await session.signOut());

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
            return await session.checkRepository(owner, repo);
        },
    );

    return {
        session,
        dispose(): void {
            session.cancelSignIn();
            for (const channel of GITHUB_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

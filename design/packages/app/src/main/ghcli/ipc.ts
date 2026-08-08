/**
 * The `gh` command-line tool's account and GUI-login IPC boundary.
 *
 * Login progress is pushed as a deliberately secret-free state object. The OAuth device
 * code and access token never enter an IPC value: `login.ts` retains them in the main
 * process and writes the approved token directly to `gh` over stdin.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { listGhCliAccounts, switchGhCliAccount } from "./accounts.js";
import type { GhCliAccountsStatus, GhCliSwitchResult } from "./accounts.js";
import {
    loginGhCli,
    type GhCliLoginOptions,
    type GhCliLoginResult,
} from "./login.js";
import type { FetchLike, SleepLike } from "../github/deviceFlow.js";
import type { ProcessRunner } from "../cirender/gh.js";

/** Every invoke channel this module registers, so `dispose` cannot drift from `register`. */
export const GH_CLI_CHANNELS = [
    "ghCli:listAccounts",
    "ghCli:switchAccount",
    "ghCli:startLogin",
    "ghCli:cancelLogin",
] as const;

/** The only event channel. Its payload is always the secret-free login state from `login.ts`. */
export const GH_CLI_LOGIN_STATE_CHANNEL = "ghCli:loginState" as const;

export interface GhCliCancelLoginResult {
    readonly cancelled: boolean;
    readonly message: string;
}

export type GhCliLoginRunner = (options: GhCliLoginOptions) => Promise<GhCliLoginResult>;

export interface GhCliIpcOptions {
    /** The real process runner in production; a fake in every test. */
    readonly runner: ProcessRunner;
    /** Injectable because unit tests never contact GitHub. */
    readonly fetch?: FetchLike | undefined;
    /** Injectable because unit tests never wait through a real polling interval. */
    readonly sleep?: SleepLike | undefined;
    /** Opens the verification page in the system browser after its URL is allowlisted. */
    readonly openExternal?: ((url: string) => Promise<boolean>) | undefined;
    /** Injectable state machine for the IPC-only tests. */
    readonly login?: GhCliLoginRunner | undefined;
}

export interface GhCliIpc {
    dispose(): void;
}

function busyLogin(expectedLogin: string | null): GhCliLoginResult {
    return {
        ok: false,
        state: {
            stage: "failed",
            host: "github.com",
            expectedLogin,
            userCode: null,
            verificationUri: null,
            verificationUriComplete: null,
            expiresAt: null,
            secondsRemaining: null,
            attempt: 0,
            browserOpened: false,
            account: null,
            failureCode: "login-already-running",
            message:
                "Another gh sign-in is already running. Finish or cancel it before starting another.",
        },
    };
}

function expectedLoginFrom(request: { expectedLogin?: unknown } | undefined): string | null {
    if (typeof request?.expectedLogin !== "string") return null;
    const login = request.expectedLogin.trim();
    return login.length === 0 || login.length > 100 ? null : login;
}

/** Registers account listing/switching plus one process-wide GUI sign-in at a time. */
export function registerGhCliHandlers(ipcMain: IpcMain, options: GhCliIpcOptions): GhCliIpc {
    let activeLogin: { readonly senderId: number; readonly controller: AbortController } | null =
        null;

    ipcMain.handle(
        "ghCli:listAccounts",
        async (_event: IpcMainInvokeEvent): Promise<GhCliAccountsStatus> =>
            await listGhCliAccounts({ runner: options.runner }),
    );

    ipcMain.handle(
        "ghCli:switchAccount",
        async (
            _event: IpcMainInvokeEvent,
            request: { host?: unknown; login?: unknown } | undefined,
        ): Promise<GhCliSwitchResult> => {
            const host = typeof request?.host === "string" ? request.host : "";
            const login = typeof request?.login === "string" ? request.login : "";
            if (host === "" || login === "") {
                return {
                    ok: false,
                    account: null,
                    message: "Give a host and a login to switch to.",
                };
            }
            return await switchGhCliAccount({ runner: options.runner }, host, login);
        },
    );

    ipcMain.handle(
        "ghCli:startLogin",
        async (
            event: IpcMainInvokeEvent,
            request: { expectedLogin?: unknown } | undefined,
        ): Promise<GhCliLoginResult> => {
            const expectedLogin = expectedLoginFrom(request);
            if (activeLogin !== null) return busyLogin(expectedLogin);

            const controller = new AbortController();
            activeLogin = { senderId: event.sender.id, controller };
            const cancelWhenSenderCloses = (): void => controller.abort();
            event.sender.once("destroyed", cancelWhenSenderCloses);
            const runLogin = options.login ?? loginGhCli;
            const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

            try {
                return await runLogin({
                    runner: options.runner,
                    fetch: fetchImpl,
                    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
                    ...(expectedLogin === null ? {} : { expectedLogin }),
                    ...(options.openExternal === undefined
                        ? {}
                        : { openExternal: options.openExternal }),
                    signal: controller.signal,
                    onState: (state) => {
                        if (!event.sender.isDestroyed()) {
                            event.sender.send(GH_CLI_LOGIN_STATE_CHANNEL, state);
                        }
                    },
                });
            } finally {
                event.sender.removeListener("destroyed", cancelWhenSenderCloses);
                if (activeLogin?.controller === controller) activeLogin = null;
            }
        },
    );

    ipcMain.handle(
        "ghCli:cancelLogin",
        async (event: IpcMainInvokeEvent): Promise<GhCliCancelLoginResult> => {
            if (activeLogin === null || activeLogin.senderId !== event.sender.id) {
                return {
                    cancelled: false,
                    message: "There is no gh sign-in from this window to cancel.",
                };
            }
            activeLogin.controller.abort();
            return { cancelled: true, message: "Cancelling gh sign-in." };
        },
    );

    return {
        dispose(): void {
            activeLogin?.controller.abort();
            activeLogin = null;
            for (const channel of GH_CLI_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/**
 * The `gh` command-line tool's own accounts, over IPC - a channel of its own, deliberately
 * separate from `main/github/ipc.ts`'s `github:*` channels.
 *
 * Built to the same shape `sysdeps/ipc.ts` uses: Electron arrives as a *type* only, `IpcMain`
 * is a parameter, and the real process runner (`cirender/gh.ts`'s `nodeProcessRunner()`) is
 * supplied by the caller - so this module and the rest of `main/ghcli/` run, and are tested,
 * with no Electron runtime and no real `gh` process at all.
 *
 * Two channels only:
 *
 *  - **`ghCli:listAccounts`** ({@link listGhCliAccounts}, `accounts.ts`) reads `gh`'s own
 *    account list. Cheap - a couple of short-lived processes - and safe to call as often as
 *    the settings screen opens.
 *  - **`ghCli:switchAccount`** ({@link switchGhCliAccount}, `accounts.ts`) changes which
 *    account is active on a host, **for the whole computer**. Never trusts `gh`'s own exit
 *    code: it re-reads the list afterwards and only reports success once the switch
 *    genuinely took, and its message always names the machine-wide consequence.
 *
 * Nothing here ever reads, logs, or forwards a token: both underlying functions only ever
 * see account logins, hosts and scopes.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { listGhCliAccounts, switchGhCliAccount } from "./accounts.js";
import type { GhCliAccountsStatus, GhCliSwitchResult } from "./accounts.js";
import type { ProcessRunner } from "../cirender/gh.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const GH_CLI_CHANNELS = ["ghCli:listAccounts", "ghCli:switchAccount"] as const;

export interface GhCliIpcOptions {
    /** The real process runner in production; a fake in every test. */
    readonly runner: ProcessRunner;
}

export interface GhCliIpc {
    dispose(): void;
}

/**
 * Registers `gh`'s own account handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take the handlers off again without
 * leaving a duplicate registration behind - `ipcMain.handle` throws on a channel that
 * already has one, exactly as every sibling `register*Handlers` function in this codebase
 * already documents.
 */
export function registerGhCliHandlers(ipcMain: IpcMain, options: GhCliIpcOptions): GhCliIpc {
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
                return { ok: false, account: null, message: "Give a host and a login to switch to." };
            }
            return await switchGhCliAccount({ runner: options.runner }, host, login);
        },
    );

    return {
        dispose(): void {
            for (const channel of GH_CLI_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/**
 * The world-repository channel between the main process and the interface.
 *
 * Built to the same shape `pages/ipc.ts` established, for the same reasons: `IpcMain`
 * arrives as a **parameter** and Electron only as a *type*, every channel is named once in
 * {@link WORLD_REPO_CHANNELS} so `dispose` cannot drift from installation, and every
 * progress event is **pushed** rather than polled.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { WorldRepoHost } from "./repo.js";
import type {
    WorldRepoEvent,
    WorldRepoHostOptions,
    WorldRepoOwner,
    WorldRepoPreflight,
    WorldRepoRecord,
    WorldRepoRemoveResult,
    WorldRepoSyncRequest,
    WorldRepoSyncResult,
    WorldRepoTarget,
} from "./repo.js";

/** The channel every phase, log, progress and outcome event arrives on. */
export const WORLD_REPO_EVENT_CHANNEL = "worldrepo:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const WORLD_REPO_CHANNELS = [
    "worldrepo:owners",
    "worldrepo:preflight",
    "worldrepo:sync",
    "worldrepo:remove",
    "worldrepo:cancel",
    "worldrepo:active",
    "worldrepo:records",
    "worldrepo:resume",
    "worldrepo:remoteTip",
] as const;

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export interface WorldRepoIpcOptions extends WorldRepoHostOptions {
    readonly ipcMain: IpcMain;
    readonly broadcast: (event: WorldRepoEvent) => void;
}

export interface WorldRepoIpc {
    readonly host: WorldRepoHost;
    dispose(): void;
}

export function installWorldRepoIpc(options: WorldRepoIpcOptions): WorldRepoIpc {
    const host = new WorldRepoHost({
        workRoot: options.workRoot,
        onEvent: options.broadcast,
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.committer === undefined ? {} : { committer: options.committer }),
        ...(options.remoteUrl === undefined ? {} : { remoteUrl: options.remoteUrl }),
    });

    options.ipcMain.handle("worldrepo:owners", async (): Promise<Answer<readonly WorldRepoOwner[]>> => {
        try {
            return { ok: true, value: await host.owners() };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle(
        "worldrepo:preflight",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<WorldRepoPreflight>> => {
            const parsed = readTarget(request);
            if (parsed === null) {
                return { ok: false, message: "A world folder, a repository owner and a name are required." };
            }
            try {
                return { ok: true, value: await host.preflight(parsed) };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "worldrepo:sync",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<WorldRepoSyncResult> => {
            const parsed = readSync(request);
            if (parsed === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A world folder, a repository owner and a name are required.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            return await host.sync(parsed);
        },
    );

    options.ipcMain.handle(
        "worldrepo:remove",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<WorldRepoRemoveResult> => {
            const parsed = readTarget(request);
            if (parsed === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A world folder, a repository owner and a name are required.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            return await host.remove(parsed);
        },
    );

    options.ipcMain.handle("worldrepo:cancel", (_event: IpcMainInvokeEvent, key: unknown) => {
        const value = readText(key);
        return value !== null && host.cancel(value);
    });

    options.ipcMain.handle("worldrepo:active", () => host.activeKeys());

    options.ipcMain.handle("worldrepo:records", async (): Promise<Answer<readonly WorldRepoRecord[]>> => {
        try {
            return { ok: true, value: await host.records() };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle(
        "worldrepo:resume",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<WorldRepoSyncResult> => {
            const parsed = readTarget(request);
            if (parsed === null) {
                return {
                    ok: false,
                    failure: {
                        code: "invalid-request",
                        message: "A world folder, a repository owner and a name are required to resume.",
                        detail: null,
                        needsGhSignIn: false,
                    },
                };
            }
            return await host.resume(parsed);
        },
    );

    options.ipcMain.handle(
        "worldrepo:remoteTip",
        async (
            _event: IpcMainInvokeEvent,
            request: unknown,
        ): Promise<Answer<{ readonly exists: boolean; readonly sha: string | null }>> => {
            const row = typeof request === "object" && request !== null ? (request as Record<string, unknown>) : null;
            const owner = readText(row?.["owner"]);
            const repo = readText(row?.["repo"]);
            const branch = readText(row?.["branch"]);
            if (owner === null || repo === null) {
                return { ok: false, message: "A repository owner and a name are required." };
            }
            try {
                return {
                    ok: true,
                    value: await host.remoteTip(owner, repo, branch ?? undefined),
                };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    return {
        host,
        dispose(): void {
            for (const channel of WORLD_REPO_CHANNELS) options.ipcMain.removeHandler(channel);
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Reading a request                                                          */
/* -------------------------------------------------------------------------- */

function readTarget(value: unknown): WorldRepoTarget | null {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    const worldPath = readText(row["worldPath"]);
    const owner = readText(row["owner"]);
    const repo = readText(row["repo"]);
    if (worldPath === null || owner === null || repo === null) return null;
    const branch = readText(row["branch"]);
    return { worldPath, owner, repo, ...(branch === null ? {} : { branch }) };
}

function readSync(value: unknown): WorldRepoSyncRequest | null {
    const target = readTarget(value);
    if (target === null) return null;
    const row = value as Record<string, unknown>;
    const visibility = row["visibility"];
    return {
        ...target,
        acknowledgeSync: row["acknowledgeSync"] === true,
        ...(visibility === "public" || visibility === "private" ? { visibility } : {}),
    };
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const value = String(error);
    return value.length > 0 ? value : "The world could not be synced, and nothing said why.";
}

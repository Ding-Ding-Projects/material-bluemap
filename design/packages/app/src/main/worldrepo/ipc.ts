/**
 * The world-repository channel between the main process and the interface.
 *
 * Built to the same shape `pages/ipc.ts` established, for the same reasons: `IpcMain`
 * arrives as a **parameter** and Electron only as a *type*, every channel is named once in
 * {@link WORLD_REPO_CHANNELS} so `dispose` cannot drift from installation, and every
 * progress event is **pushed** rather than polled.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { nodeProcessRunner } from "../cirender/gh.js";
import { buildAdoptionPlan, probeAdoptionCandidates } from "./adopt.js";
import type { AdoptionCandidateInput, AdoptionPlan, AdoptionSignal } from "./adopt.js";
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
    "worldrepo:adoptionProbe",
    "worldrepo:adoptionPlan",
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
    // Adoption reads through the same runner `host` itself spawns `git`/`gh` with, so a test
    // that injects one sees adoption's own `gh api` calls exactly as it sees a sync's.
    const runner = options.runner ?? nodeProcessRunner();
    const host = new WorldRepoHost({
        workRoot: options.workRoot,
        onEvent: options.broadcast,
        runner,
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

    /**
     * Recognising, in a repository list, which ones this application has likely already
     * prepared - see `adopt.ts`'s own doc comment for what "prepared" means and why it is
     * never reported as a certainty. Bounded by `probeAdoptionCandidates` itself, so a long
     * list of candidates never turns into an unbounded number of round trips just because
     * the renderer asked about all of them at once.
     */
    options.ipcMain.handle(
        "worldrepo:adoptionProbe",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<readonly AdoptionSignal[]>> => {
            const parsed = readAdoptionProbeRequest(request);
            if (parsed === null) {
                return { ok: false, message: "A list of repositories to check is required." };
            }
            try {
                return {
                    ok: true,
                    value: await probeAdoptionCandidates(host, runner, parsed.candidates, {
                        ...(parsed.branch === null ? {} : { branch: parsed.branch }),
                        ...(parsed.maxProbes === null ? {} : { maxProbes: parsed.maxProbes }),
                    }),
                };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    /**
     * What adopting one repository would restore - or an honest refusal, including the
     * `ci-bootstrap-only` case where the repository is recognisable but carries no project
     * to restore, and the `project-too-new` case where it carries one this build cannot
     * safely read. Never writes anything; see `adopt.ts`'s own doc comment.
     */
    options.ipcMain.handle(
        "worldrepo:adoptionPlan",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<AdoptionPlan>> => {
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
                    value: await buildAdoptionPlan(host, runner, { owner, repo, ...(branch === null ? {} : { branch }) }),
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

interface AdoptionProbeRequest {
    readonly candidates: readonly AdoptionCandidateInput[];
    readonly branch: string | null;
    readonly maxProbes: number | null;
}

function readAdoptionProbeRequest(value: unknown): AdoptionProbeRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    if (!Array.isArray(row["candidates"])) return null;
    const candidates: AdoptionCandidateInput[] = [];
    for (const entry of row["candidates"]) {
        if (typeof entry !== "object" || entry === null) continue;
        const owner = readText((entry as Record<string, unknown>)["owner"]);
        const repo = readText((entry as Record<string, unknown>)["repo"]);
        if (owner !== null && repo !== null) candidates.push({ owner, repo });
    }
    const maxProbesRaw = row["maxProbes"];
    return {
        candidates,
        branch: readText(row["branch"]),
        maxProbes: typeof maxProbesRaw === "number" && Number.isFinite(maxProbesRaw) ? maxProbesRaw : null,
    };
}

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

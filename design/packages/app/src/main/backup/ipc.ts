/**
 * The backup channel between the main process and the interface.
 *
 * The twin of `download/ipc.ts` and `config/ipc.ts`, deliberately built to the same shape:
 * `IpcMain` arrives as a **parameter** and Electron only as a *type*, every channel is
 * named once in {@link BACKUP_CHANNELS} so `dispose` cannot drift from `install`, and
 * every progress event is **pushed** rather than polled. Nothing else under `backup/`
 * imports Electron, which is what lets the pack, the split, the pointer and the upload
 * all be tested with no Electron runtime anywhere near them.
 *
 * ## What crosses, and what never does
 *
 * Plain objects, built field by field, because Electron structured-clones what crosses
 * and refuses what it cannot. Errors cross as one sentence: a rejection is turned into a
 * failure object whose message says what could not be done and why, so a subsystem's
 * stack never becomes interface copy.
 *
 * The **token never crosses**. It is resolved here, per call, from the session the main
 * process holds, exactly as `download/ipc.ts` resolves it. The renderer is told who is
 * signed in and what that account may do, and never the credential.
 *
 * ## Two channels that look alike and are not
 *
 * `backup:inspectRepository` reads a repository so the interface can warn about a public
 * one *before* anything is packed. `backup:start` reads it again and refuses to proceed
 * against a public repository without an explicit acknowledgement. The second check is not
 * redundant: the first is a courtesy to the person, the second is the guard, and a guard
 * that lives only in the renderer is not a guard.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { listBackups } from "./catalog.js";
import type { BackupListing } from "./catalog.js";
import { createRepository, isRepositoryNameTakenError, listWritableRepositories } from "./github.js";
import type { FetchLike, RepositoryChoice } from "./github.js";
import { BackupRunner } from "./runner.js";
import type {
    BackupEvent,
    BackupRequest,
    BackupResult,
    BackupRunnerOptions,
    RepositoryReport,
} from "./runner.js";
import { inspectBackupSource } from "./source.js";
import type { BackupSourceKind } from "./source.js";

/** The channel every progress, phase, log and outcome event arrives on. */
export const BACKUP_EVENT_CHANNEL = "backup:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const BACKUP_CHANNELS = [
    "backup:repositories",
    "backup:createRepository",
    "backup:inspectRepository",
    "backup:inspectSource",
    "backup:list",
    "backup:start",
    "backup:cancel",
    "backup:active",
] as const;

/** What creating a repository from this screen needs, and what it answers with. */
export interface CreateRepositoryRequest {
    readonly ownerLogin: string;
    readonly ownerKind: "user" | "organization";
    readonly name: string;
    readonly private: boolean;
}

export type CreateRepositoryFailureCode = "name-taken" | "not-signed-in" | "other";

export type CreateRepositoryAnswer =
    | { readonly ok: true; readonly value: RepositoryChoice }
    | { readonly ok: false; readonly code: CreateRepositoryFailureCode; readonly message: string };

export interface BackupIpcOptions {
    readonly ipcMain: IpcMain;
    /** Where backups are staged. A function, so a moved storage folder takes effect. */
    readonly storageDir: () => string;
    /** The signed-in token, resolved per operation. Null means nobody is signed in. */
    readonly token: () => Promise<string | null> | string | null;
    /** Overridable so a test can watch what was broadcast. */
    readonly broadcast: (event: BackupEvent) => void;
    /** Overridable so a test never touches the network. */
    readonly fetch?: FetchLike | undefined;
    readonly appVersion?: string | null | undefined;
    readonly apiBase?: string | undefined;
    readonly uploadsBase?: string | undefined;
}

export interface BackupIpc {
    readonly runner: BackupRunner;
    dispose(): void;
}

/** Everything a channel answers with, so a rejection never crosses as a raw stack. */
type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export function installBackupIpc(options: BackupIpcOptions): BackupIpc {
    const runnerOptions: BackupRunnerOptions = {
        storageDir: options.storageDir,
        token: options.token,
        onEvent: options.broadcast,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
        ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
        ...(options.uploadsBase === undefined ? {} : { uploadsBase: options.uploadsBase }),
    };
    const runner = new BackupRunner(runnerOptions);

    const callOptions = async (): Promise<
        | { readonly ok: true; readonly token: string }
        | { readonly ok: false; readonly message: string }
    > => {
        const token = await options.token();
        if (typeof token !== "string" || token.length === 0) {
            return {
                ok: false,
                message:
                    "Nobody is signed in to GitHub on this computer. Sign in from Settings to" +
                    " back up to a repository, or to see the backups one already holds.",
            };
        }
        return { ok: true, token };
    };

    options.ipcMain.handle(
        "backup:repositories",
        async (): Promise<Answer<readonly RepositoryChoice[]>> => {
            const resolved = await callOptions();
            if (!resolved.ok) return { ok: false, message: resolved.message };
            try {
                const repositories = await listWritableRepositories({
                    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
                    token: resolved.token,
                    ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
                });
                return { ok: true, value: repositories };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    /**
     * Creates a brand-new repository, for somebody who has none suitable to pick from the
     * list `backup:repositories` already offers.
     *
     * This never overwrites anything: GitHub itself refuses a name that already exists
     * (see {@link isRepositoryNameTakenError}), so there is no "re-initialise" path here
     * to gate behind a confirmation - the destructive operation this feature could
     * plausibly need super-confirmation for simply does not exist in this module.
     */
    options.ipcMain.handle(
        "backup:createRepository",
        async (
            _event: IpcMainInvokeEvent,
            request: { ownerLogin?: unknown; ownerKind?: unknown; name?: unknown; private?: unknown },
        ): Promise<CreateRepositoryAnswer> => {
            const ownerLogin = readText(request?.ownerLogin);
            const ownerKind = request?.ownerKind === "organization" ? "organization" : "user";
            const name = readText(request?.name);
            if (ownerLogin === null || name === null) {
                return {
                    ok: false,
                    code: "other",
                    message: "A repository owner and a name are required to create one.",
                };
            }
            const resolved = await callOptions();
            if (!resolved.ok) return { ok: false, code: "not-signed-in", message: resolved.message };
            try {
                const created = await createRepository(
                    { ownerLogin, ownerKind, name, private: request?.private === true },
                    {
                        fetch: options.fetch ?? ((url, init) => fetch(url, init)),
                        token: resolved.token,
                        ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
                    },
                );
                return { ok: true, value: created };
            } catch (error) {
                return {
                    ok: false,
                    code: isRepositoryNameTakenError(error) ? "name-taken" : "other",
                    message: sentence(error),
                };
            }
        },
    );

    options.ipcMain.handle(
        "backup:inspectRepository",
        async (
            _event: IpcMainInvokeEvent,
            request: { owner?: unknown; repo?: unknown },
        ): Promise<Answer<RepositoryReport>> => {
            const owner = readText(request?.owner);
            const repo = readText(request?.repo);
            if (owner === null || repo === null) {
                return { ok: false, message: "A repository owner and name are required." };
            }
            try {
                return { ok: true, value: await runner.inspectRepository(owner, repo) };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "backup:inspectSource",
        async (
            _event: IpcMainInvokeEvent,
            request: { kind?: unknown; folder?: unknown },
        ): Promise<Answer<{ kind: BackupSourceKind; folder: string; label: string; files: number; bytes: number; skipped: readonly { name: string; reason: string }[] }>> => {
            const kind = readKind(request?.kind);
            const folder = readText(request?.folder);
            if (kind === null || folder === null) {
                return { ok: false, message: "A folder and what kind of thing it is are required." };
            }
            const inspected = await inspectBackupSource(kind, folder);
            if (!inspected.ok) return { ok: false, message: inspected.failure.message };
            const source = inspected.source;
            return {
                ok: true,
                value: {
                    kind: source.kind,
                    folder: source.folder,
                    label: source.label,
                    files: source.files,
                    bytes: source.bytes,
                    skipped: source.skipped.map((entry) => ({ ...entry })),
                },
            };
        },
    );

    options.ipcMain.handle(
        "backup:list",
        async (
            _event: IpcMainInvokeEvent,
            request: { owner?: unknown; repo?: unknown },
        ): Promise<Answer<readonly BackupListing[]>> => {
            const owner = readText(request?.owner);
            const repo = readText(request?.repo);
            if (owner === null || repo === null) {
                return { ok: false, message: "A repository owner and name are required." };
            }
            const resolved = await callOptions();
            if (!resolved.ok) return { ok: false, message: resolved.message };
            try {
                const listings = await listBackups(owner, repo, {
                    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
                    token: resolved.token,
                    ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
                });
                return { ok: true, value: listings };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "backup:start",
        async (_event: IpcMainInvokeEvent, request: BackupRequest): Promise<BackupResult> =>
            await runner.backup(request),
    );

    options.ipcMain.handle("backup:cancel", (_event: IpcMainInvokeEvent, backupId: unknown) => {
        return typeof backupId === "string" && runner.cancel(backupId);
    });

    options.ipcMain.handle("backup:active", () => runner.activeBackupIds());

    return {
        runner,
        dispose(): void {
            for (const channel of BACKUP_CHANNELS) options.ipcMain.removeHandler(channel);
        },
    };
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readKind(value: unknown): BackupSourceKind | null {
    return value === "render" || value === "world" ? value : null;
}

/** One sentence from whatever was thrown, never a stack and never an empty string. */
function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "The backup could not be carried out, and said no more.";
}

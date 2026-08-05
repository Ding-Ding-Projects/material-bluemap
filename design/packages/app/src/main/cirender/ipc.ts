/**
 * The CI-render channel between the main process and the interface.
 *
 * The fourth of its kind, built to the shape `backup/ipc.ts`, `download/ipc.ts` and
 * `config/ipc.ts` established: `IpcMain` arrives as a **parameter** and Electron only as a
 * *type*, every channel is named once in {@link CIRENDER_CHANNELS} so `dispose` cannot
 * drift from `install`, and every progress event is **pushed** rather than polled. Nothing
 * else under `cirender/` imports Electron, which is what lets the whole loop - the
 * fingerprint, the plan, the dispatch, the polling, the collector - be tested with no
 * Electron runtime anywhere near it.
 *
 * ## The token never crosses, and neither does the EULA decision
 *
 * The credential is resolved here, per call, from the session the main process holds,
 * exactly as the backup and download channels resolve theirs. The renderer learns whether
 * somebody is signed in only from a refusal that says so.
 *
 * `eulaAccepted` is a **reader** the application supplies, and there is deliberately no
 * channel that sets it. Mojang's licence is accepted in the one place that already asks,
 * and a second door onto that decision - especially one a render screen could push
 * somebody through - is how a legal acceptance becomes a button people click to get on
 * with what they were doing.
 *
 * ## Two checks that look alike and are not
 *
 * `cirender:preflight` reads the repository so the interface can warn about a public one,
 * and say what would be uploaded, *before* anything is packed. `cirender:start` reads it
 * again and refuses to proceed without the acknowledgements. The second is not redundant:
 * the first is a courtesy, the second is the guard, and a guard that lives only in the
 * renderer is not a guard.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { FetchLike, RepositoryReport } from "../backup/index.js";
import type { LocalMapHandler } from "../render/LocalMapHandler.js";
import { CiRenderSync } from "./sync.js";
import type {
    BackupSurface,
    CiPreflight,
    CiSyncEvent,
    CiSyncRequest,
    CiSyncResult,
    CiRenderSyncOptions,
} from "./sync.js";
import type { CiSyncState } from "./state.js";
import type { ProcessRunner } from "./gh.js";
import type { CiRoute } from "./transport.js";
import { checkCiRepositoryNameAvailability, listCiOwnerChoices, suggestCiRepositoryName } from "./setup.js";
import type { CiOwnerChoicesAnswer, CiRepositoryNameAvailability } from "./setup.js";

/** The channel every phase, log, run-state and outcome event arrives on. */
export const CIRENDER_EVENT_CHANNEL = "cirender:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const CIRENDER_CHANNELS = [
    "cirender:preflight",
    "cirender:start",
    "cirender:check",
    "cirender:list",
    "cirender:cancel",
    "cirender:active",
    // The "What, and where" setup card's own data: who could own the repository, a name
    // worth trying, and whether GitHub already has it. Pure additions beside the sync
    // loop above - none of the three touches `sync`, `state.js` or a running job.
    "cirender:owners",
    "cirender:suggestRepoName",
    "cirender:checkRepoName",
] as const;

export interface CiRenderIpcOptions {
    readonly ipcMain: IpcMain;
    /** Where maps and sync records live. A function, so a moved storage folder takes effect. */
    readonly storageDir: () => string;
    /**
     * The signed-in token, resolved per operation. Null means nobody is signed in.
     *
     * Given an account id - see {@link CiSyncRequest.accountId} - resolves that specific
     * stored account's own token; called with none, exactly as every caller before the
     * setup card's account picker existed, this resolves to whichever account is active.
     */
    readonly token: (accountId?: string | undefined) => Promise<string | null> | string | null;
    /** Whether Mojang's EULA has been accepted here. Read only; never set from a channel. */
    readonly eulaAccepted: () => boolean | Promise<boolean>;
    /** The one backup runner the application owns. The upload is a backup, not a copy of one. */
    readonly backup: BackupSurface;
    /**
     * The signed-in login, for a message naming which credential drove a render.
     *
     * Takes the same optional account id `token` does, so the message names the account a
     * request actually chose rather than always the active one.
     */
    readonly account?: ((accountId?: string | undefined) => string | null | Promise<string | null>) | undefined;
    /** How `gh` is run. Left out, real child processes; injected in every test. */
    readonly runner?: ProcessRunner | undefined;
    /** Overridable so a test can watch what was broadcast. */
    readonly broadcast: (event: CiSyncEvent) => void;
    readonly mounts?: LocalMapHandler | undefined;
    /** Overridable so a test never touches the network. */
    readonly fetch?: FetchLike | undefined;
    readonly appVersion?: string | null | undefined;
    readonly apiBase?: string | undefined;
    /** Where release assets are PUT. Overridable so a test never uploads to GitHub. */
    readonly uploadsBase?: string | undefined;
    readonly pollIntervalMs?: number | undefined;
    readonly runLookupAttempts?: number | undefined;
    readonly sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
}

export interface CiRenderIpc {
    readonly sync: CiRenderSync;
    dispose(): void;
}

/** Everything a channel answers with, so a rejection never crosses as a raw stack. */
type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export function installCiRenderIpc(options: CiRenderIpcOptions): CiRenderIpc {
    const syncOptions: CiRenderSyncOptions = {
        storageDir: options.storageDir,
        token: options.token,
        eulaAccepted: options.eulaAccepted,
        backup: options.backup,
        onEvent: options.broadcast,
        ...(options.account === undefined ? {} : { account: options.account }),
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.mounts === undefined ? {} : { mounts: options.mounts }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
        ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
        ...(options.uploadsBase === undefined ? {} : { uploadsBase: options.uploadsBase }),
        ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
        ...(options.runLookupAttempts === undefined
            ? {}
            : { runLookupAttempts: options.runLookupAttempts }),
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    };
    const sync = new CiRenderSync(syncOptions);

    options.ipcMain.handle(
        "cirender:preflight",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<Answer<CiPreflight>> => {
            const parsed = readRequest(request);
            if (parsed === null) {
                return { ok: false, message: "A world folder, a repository owner and a name are required." };
            }
            try {
                const result = await sync.preflight(parsed);
                return result.ok
                    ? { ok: true, value: result.preflight }
                    : { ok: false, message: result.failure.message };
            } catch (error) {
                return { ok: false, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:start",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<CiSyncResult> => {
            const parsed = readRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "invalid-request",
                        message: "A world folder, a repository owner and a name are required.",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                };
            }
            return await sync.sync(parsed);
        },
    );

    options.ipcMain.handle(
        "cirender:check",
        async (_event: IpcMainInvokeEvent, syncId: unknown): Promise<CiSyncResult> => {
            const id = readText(syncId);
            if (id === null) {
                return {
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "invalid-request",
                        message: "A sync id is required.",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                };
            }
            return await sync.check(id);
        },
    );

    options.ipcMain.handle("cirender:list", async (): Promise<Answer<readonly CiSyncState[]>> => {
        try {
            const ids = await sync.knownSyncIds();
            const states: CiSyncState[] = [];
            for (const id of ids) {
                const state = await sync.readState(id);
                // A record this build cannot read is left out rather than represented by a
                // half-filled row. `readCiSyncState` already refuses to guess; showing an
                // invented entry here would undo that.
                if (state !== null) states.push(state);
            }
            return { ok: true, value: states };
        } catch (error) {
            return { ok: false, message: sentence(error) };
        }
    });

    options.ipcMain.handle("cirender:cancel", (_event: IpcMainInvokeEvent, syncId: unknown) => {
        const id = readText(syncId);
        return id !== null && sync.cancel(id);
    });

    // What this process is actively driving right now, independent of what has been
    // persisted to disk. `cirender:list` answers "every sync this computer has a record
    // of" by reading `storageDir()`, and a sync writes its first record only partway
    // through `sync()` - after the repository is read, the world is fingerprinted, and
    // (when reusable) GitHub is asked whether the previous asset is still there. A window
    // that opens in that gap would see nothing for a render already running elsewhere,
    // exactly the failure `backup/ipc.ts`'s own `backup:active` exists to close for
    // backups. The bridge (`ciRenderBridge.ts`) wires this to `CiRenders.reconcile()`.
    options.ipcMain.handle("cirender:active", () => sync.activeSyncIds());

    // The setup card's own three answers. Each resolves the token the same way `sync`
    // does - per call, from whatever `options.token` reads right now - and none of them
    // holds anything between calls.
    //
    // `cirender:owners` takes an optional account id so the account picker can re-resolve
    // this list for whichever stored account was chosen rather than always the active one.
    // Omitted, this behaves exactly as it did before the picker existed.
    options.ipcMain.handle(
        "cirender:owners",
        async (
            _event: IpcMainInvokeEvent,
            request: { accountId?: unknown } | undefined,
        ): Promise<CiOwnerChoicesAnswer> => {
            const accountId = readText(request?.accountId);
            try {
                return await listCiOwnerChoices({
                    token: () => options.token(accountId ?? undefined),
                    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
                    ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
                });
            } catch (error) {
                // listCiOwnerChoices already turns its own failures into a result rather
                // than a throw; this is a last resort for anything that got past that.
                return { ok: false, signedIn: true, message: sentence(error) };
            }
        },
    );

    options.ipcMain.handle(
        "cirender:suggestRepoName",
        (_event: IpcMainInvokeEvent, sourceName: unknown): string =>
            suggestCiRepositoryName(typeof sourceName === "string" ? sourceName : ""),
    );

    options.ipcMain.handle(
        "cirender:checkRepoName",
        async (
            _event: IpcMainInvokeEvent,
            request: unknown,
        ): Promise<CiRepositoryNameAvailability> => {
            const record =
                typeof request === "object" && request !== null
                    ? (request as Record<string, unknown>)
                    : {};
            return await checkCiRepositoryNameAvailability(
                readText(record["owner"]) ?? "",
                readText(record["repo"]) ?? "",
                {
                    token: options.token,
                    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
                    ...(options.apiBase === undefined ? {} : { apiBase: options.apiBase }),
                },
            );
        },
    );

    return {
        sync,
        dispose(): void {
            for (const channel of CIRENDER_CHANNELS) options.ipcMain.removeHandler(channel);
        },
    };
}

/**
 * The request, field by field, or null.
 *
 * Built rather than cast, because everything on this object decides where gigabytes go.
 * A renderer that sent `acknowledgePublic: "yes"` must not have that read as truthy: the
 * two acknowledgements are checked for `true` exactly, so anything else is an absent
 * acknowledgement and the main process refuses.
 */
function readRequest(value: unknown): CiSyncRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const worldFolder = readText(record["worldFolder"]);
    const owner = readText(record["owner"]);
    const repo = readText(record["repo"]);
    if (worldFolder === null || owner === null || repo === null) return null;

    const mapId = readText(record["mapId"]);
    const output = record["output"];
    const route = record["route"];
    const accountId = readText(record["accountId"]);
    return {
        worldFolder,
        owner,
        repo,
        ...(mapId === null ? {} : { mapId }),
        ...(accountId === null ? {} : { accountId }),
        acknowledgeUpload: record["acknowledgeUpload"] === true,
        acknowledgePublic: record["acknowledgePublic"] === true,
        forceUpload: record["forceUpload"] === true,
        follow: record["follow"] !== false,
        ...(typeof record["budgetMinutes"] === "number" ? { budgetMinutes: record["budgetMinutes"] } : {}),
        ...(typeof record["maxJobs"] === "number" ? { maxJobs: record["maxJobs"] } : {}),
        ...(output === "artifact" || output === "artifact-and-pages" ? { output } : {}),
        // Only the two names this build knows. Anything else is not a route, and is
        // dropped so the probe chooses rather than a typo forcing a credential nobody has.
        ...(route === "session" || route === "gh" ? { route: route as CiRoute } : {}),
    };
}

function readText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** One sentence from whatever was thrown, never a stack and never an empty string. */
function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "The CI render could not be carried out, and said no more.";
}

export type { RepositoryReport };

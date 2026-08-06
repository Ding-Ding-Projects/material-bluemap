/**
 * The application-settings history channel between the main process and the interface.
 *
 * Built to the same shape as `profiles/ipc.ts`. See that file's doc comment for what "this is
 * not yet the renderer's source of truth" means here too: today's settings surfaces
 * (`packages/ui/src/components/settings/`, `appearanceStore.ts`, `dockPlacement.ts` and the
 * rest) still persist to their own `localStorage` keys and do not call this channel.
 * `docs/config-history.md` names the migration this is the main-process half of.
 *
 * Nothing on this channel rejects, for the same structural reason `history/ipc.ts` states:
 * every handler resolves, always, with a value that describes what happened.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { DEFAULT_REVISION_LIMIT, type HistoryWrite, type RestoreResult } from "../history/index.js";

import {
    appSettingsHistoryListing,
    appSettingsHistoryRoot,
    discardOlderAppSettingsRevisions,
    restoreAppSettingsRevision,
    type AppSettingsHistoryListing,
    type AppSettingsHistoryOptions,
} from "./history.js";
import { saveAppSettingsState, type AppSettingsSaveResult } from "./save.js";
import { readAppSettingsState, type AppSettingsState } from "./store.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const APP_SETTINGS_HISTORY_CHANNELS = [
    "settingsHistory:read",
    "settingsHistory:save",
    "settingsHistory:list",
    "settingsHistory:restore",
    "settingsHistory:discardOlder",
] as const;

export type AppSettingsHistoryIpcOptions = AppSettingsHistoryOptions;

export interface AppSettingsHistoryIpc {
    dispose(): void;
}

/** Where the application settings' history is kept, so a diagnostic can show it. */
export function appSettingsHistoryLocation(options: AppSettingsHistoryIpcOptions): string {
    return appSettingsHistoryRoot(options.dataDir);
}

/* -------------------------------------------------------------------------- */
/* Argument checking                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The largest settings payload this channel accepts, in JSON text.
 *
 * Generous relative to `profiles/ipc.ts`'s cap, because a settings bag can carry a whole
 * exported appearance theme. Still bounded, so a renderer bug cannot turn a save into an
 * unbounded write; hitting it reads as a refusal rather than a silent truncation.
 */
export const MAX_APP_SETTINGS_BYTES = 8 * 1024 * 1024;

function checkRevision(value: unknown): { ok: true; id: string } | { ok: false; message: string } {
    if (typeof value !== "string") {
        return { ok: false, message: "A revision has to be given as text." };
    }
    const trimmed = value.trim();
    if (!/^[0-9a-f]{7,64}$/i.test(trimmed)) {
        return { ok: false, message: "That is not a revision this history recognises, so nothing was done." };
    }
    return { ok: true, id: trimmed.toLowerCase() };
}

/**
 * An application-settings state, checked for shape and for size rather than trusted. See
 * `profiles/ipc.ts`'s `checkProfilesInput` for why this is stricter than the tolerant reader
 * in `store.ts`.
 */
function checkAppSettingsInput(value: unknown): { ok: true; state: AppSettingsState } | { ok: false; message: string } {
    if (typeof value !== "object" || value === null) {
        return { ok: false, message: "The application settings have to be given as an object." };
    }
    const record = value as { values?: unknown };
    if (typeof record.values !== "object" || record.values === null || Array.isArray(record.values)) {
        return { ok: false, message: "The application settings' `values` field has to be an object." };
    }

    const serialised = JSON.stringify(record.values);
    if (serialised.length > MAX_APP_SETTINGS_BYTES) {
        return { ok: false, message: "That is far more text than the application settings hold, so nothing was written." };
    }

    return { ok: true, state: { version: 1, values: { ...(record.values as Record<string, unknown>) } } };
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registers the application-settings history handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has one.
 */
export function registerAppSettingsHistoryHandlers(
    ipcMain: IpcMain,
    options: AppSettingsHistoryIpcOptions,
): AppSettingsHistoryIpc {
    ipcMain.handle(
        "settingsHistory:read",
        async (): Promise<AppSettingsState> => await readAppSettingsState(options.dataDir),
    );

    ipcMain.handle(
        "settingsHistory:save",
        async (
            _event: IpcMainInvokeEvent,
            state: unknown,
        ): Promise<AppSettingsSaveResult | { ok: false; message: string }> => {
            const checked = checkAppSettingsInput(state);
            if (!checked.ok) return { ok: false, message: checked.message };
            return await saveAppSettingsState(options, checked.state);
        },
    );

    ipcMain.handle(
        "settingsHistory:list",
        async (_event: IpcMainInvokeEvent, limit: unknown): Promise<AppSettingsHistoryListing> => {
            const count = typeof limit === "number" && Number.isFinite(limit) ? limit : DEFAULT_REVISION_LIMIT;
            return await appSettingsHistoryListing(options, count);
        },
    );

    ipcMain.handle(
        "settingsHistory:restore",
        async (_event: IpcMainInvokeEvent, id: unknown): Promise<RestoreResult> => {
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };
            return await restoreAppSettingsRevision(options, revision.id);
        },
    );

    ipcMain.handle(
        "settingsHistory:discardOlder",
        async (_event: IpcMainInvokeEvent, keep: unknown): Promise<HistoryWrite> => {
            if (typeof keep !== "number" || !Number.isFinite(keep) || keep < 1) {
                return {
                    ok: false,
                    message: "How many revisions to keep has to be a whole number of at least one.",
                };
            }
            return await discardOlderAppSettingsRevisions(options, Math.floor(keep));
        },
    );

    return {
        dispose(): void {
            for (const channel of APP_SETTINGS_HISTORY_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

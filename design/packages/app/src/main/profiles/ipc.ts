/**
 * The profile-list history channel between the main process and the interface.
 *
 * Built to the same shape as `history/ipc.ts` and `project/ipc.ts`: Electron arrives as a
 * *type*, `IpcMain` is a parameter, and every channel is named once in
 * {@link PROFILES_HISTORY_CHANNELS} so `dispose` cannot drift from the registration.
 *
 * ## This is not yet the renderer's source of truth
 *
 * `packages/ui/src/stores/profiles.ts` still persists to `localStorage` and does not call
 * anything here - see `docs/config-history.md` for the migration this module is the main-
 * process half of, and what wiring the renderer side still needs. What this file guarantees
 * on its own, today: given a profiles state, it will write it to disk beside the
 * application's data and keep an append-only, restorable history of every version saved
 * through it, with a failed history write never turning a successful save into a failure.
 *
 * ## Nothing on this channel rejects
 *
 * Exactly the rule `history/ipc.ts` states and for the same reason: a disk that is full, a
 * git that is missing, or a repository deleted from under the process must never turn into an
 * unhandled rejection that could take a caller down. Every handler here resolves.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { DEFAULT_REVISION_LIMIT, type RestoreResult } from "../history/index.js";

import { profilesHistoryListing, profilesHistoryRoot, restoreProfilesRevision, type ProfilesHistoryListing, type ProfilesHistoryOptions } from "./history.js";
import { saveProfilesState, type ProfilesSaveResult } from "./save.js";
import { readProfilesState, type ProfileRecord, type ProfilesState } from "./store.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const PROFILES_HISTORY_CHANNELS = [
    "profilesHistory:read",
    "profilesHistory:save",
    "profilesHistory:list",
    "profilesHistory:restore",
] as const;

export type ProfilesHistoryIpcOptions = ProfilesHistoryOptions;

export interface ProfilesHistoryIpc {
    dispose(): void;
}

/** Where the profile list's history is kept, so a diagnostic can show it is not `localStorage`. */
export function profilesHistoryLocation(options: ProfilesHistoryIpcOptions): string {
    return profilesHistoryRoot(options.dataDir);
}

/* -------------------------------------------------------------------------- */
/* Argument checking                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The largest profiles payload this channel accepts, in JSON text.
 *
 * A real profile list - server addresses, names, a handful of rendered maps - is a few
 * kilobytes. The cap exists so a renderer bug cannot turn a save into an unbounded write, and
 * it is stated rather than silent so hitting it reads as a refusal rather than a truncation.
 */
export const MAX_PROFILES_BYTES = 1024 * 1024;

/**
 * A revision identifier, checked for shape rather than trusted.
 *
 * Hexadecimal only, exactly as every other history channel checks one: a revision name
 * reaches git as an argument, and refusing everything that is not a hash costs nothing
 * because a hash is all a panel ever sends.
 */
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
 * A profiles state, checked for shape and for size rather than trusted.
 *
 * Deliberately stricter than {@link parseProfilesState}'s tolerance for the file already on
 * disk: reading an old file with a stray field should not fail, but a caller sending
 * malformed input right now is a bug on the other side of the bridge, and the honest answer
 * to that is a refusal with a sentence rather than silently writing a state nobody sent.
 */
function checkProfilesInput(value: unknown): { ok: true; state: ProfilesState } | { ok: false; message: string } {
    if (typeof value !== "object" || value === null) {
        return { ok: false, message: "The profile list has to be given as an object." };
    }
    const record = value as { profiles?: unknown; activeId?: unknown };
    if (!Array.isArray(record.profiles)) {
        return { ok: false, message: "The profile list's `profiles` field has to be an array." };
    }

    const profiles: ProfileRecord[] = [];
    let bytes = 0;
    for (const entry of record.profiles) {
        if (typeof entry !== "object" || entry === null) {
            return { ok: false, message: "Every profile has to be an object." };
        }
        const row = entry as Record<string, unknown>;
        if (typeof row["id"] !== "string" || typeof row["name"] !== "string" || typeof row["url"] !== "string") {
            return { ok: false, message: "Every profile needs an id, a name and a url, each given as text." };
        }
        if (row["dataRoot"] !== undefined && typeof row["dataRoot"] !== "string") {
            return { ok: false, message: "A profile's data root has to be text when it is present." };
        }
        bytes += row["id"].length + row["name"].length + row["url"].length + (row["dataRoot"]?.toString().length ?? 0);
        if (bytes > MAX_PROFILES_BYTES) {
            return { ok: false, message: "That is far more text than a profile list holds, so nothing was written." };
        }
        profiles.push({
            id: row["id"],
            name: row["name"],
            url: row["url"],
            trustCustomizations: row["trustCustomizations"] === true,
            ...(typeof row["dataRoot"] === "string" ? { dataRoot: row["dataRoot"] } : {}),
        });
    }

    if (record.activeId !== null && record.activeId !== undefined && typeof record.activeId !== "string") {
        return { ok: false, message: "The active profile id has to be text or null." };
    }

    return {
        ok: true,
        state: {
            version: 1,
            profiles,
            activeId: typeof record.activeId === "string" ? record.activeId : null,
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registers the profile-list history handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has one.
 */
export function registerProfilesHistoryHandlers(
    ipcMain: IpcMain,
    options: ProfilesHistoryIpcOptions,
): ProfilesHistoryIpc {
    ipcMain.handle("profilesHistory:read", async (): Promise<ProfilesState> => await readProfilesState(options.dataDir));

    ipcMain.handle(
        "profilesHistory:save",
        async (_event: IpcMainInvokeEvent, state: unknown): Promise<ProfilesSaveResult | { ok: false; message: string }> => {
            const checked = checkProfilesInput(state);
            if (!checked.ok) return { ok: false, message: checked.message };
            return await saveProfilesState(options, checked.state);
        },
    );

    ipcMain.handle(
        "profilesHistory:list",
        async (_event: IpcMainInvokeEvent, limit: unknown): Promise<ProfilesHistoryListing> => {
            const count = typeof limit === "number" && Number.isFinite(limit) ? limit : DEFAULT_REVISION_LIMIT;
            return await profilesHistoryListing(options, count);
        },
    );

    ipcMain.handle(
        "profilesHistory:restore",
        async (_event: IpcMainInvokeEvent, id: unknown): Promise<RestoreResult> => {
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };
            return await restoreProfilesRevision(options, revision.id);
        },
    );

    return {
        dispose(): void {
            for (const channel of PROFILES_HISTORY_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

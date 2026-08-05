/**
 * The main-process copy of the application's own preferences.
 *
 * The interface keeps its preferences scattered across a dozen `localStorage` keys today -
 * `appearanceStore.ts`, `dockPlacement.ts`, `palettePrefs.ts`, `menuPrefs.ts`,
 * `setupPrefs.ts`, `tabStorage.ts`, `eulaStorage.ts`, `remoteTargets.ts` and more, one file
 * per settings surface - because each was built where it was needed and none of them had
 * anywhere in the main process to be kept instead. This module is that place: one JSON file,
 * beside the application's own data, that the version history can snapshot.
 *
 * It deliberately does not know what any individual setting means. A `values` bag keyed by
 * whatever the caller wants to call a setting, rather than a typed field per preference,
 * because typing every one of them here would make this file the thing every settings
 * surface has to agree with before it can save anything - and there are, today, more
 * settings surfaces than there is time to migrate them all in one pass. `docs/config-history.md`
 * says plainly which ones this build actually wires through here and which are still
 * `localStorage`-only.
 *
 * Reading is tolerant, writing is not - the same split `profiles/store.ts` makes, for the
 * same reason: a file this application maintains for itself should not refuse to start
 * because of a stray character in it, but a caller sending malformed input right now is a bug
 * the boundary in `ipc.ts` should refuse rather than silently coerce.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The directory inside the application's data folder holding the live settings file. */
export const APP_SETTINGS_STORE_DIRECTORY = "app-settings-store";

/** The file's name inside that directory. */
export const APP_SETTINGS_FILE = "settings.json";

/** Current shape of {@link APP_SETTINGS_FILE}, so a future change can migrate rather than guess. */
export const APP_SETTINGS_FORMAT_VERSION = 1;

export interface AppSettingsState {
    readonly version: number;
    /** Arbitrary settings, keyed by whatever name the saving surface gives them. */
    readonly values: Readonly<Record<string, unknown>>;
}

/** Where the live settings file lives. Pure: it creates nothing. */
export function appSettingsFolder(dataDir: string): string {
    return join(dataDir, APP_SETTINGS_STORE_DIRECTORY);
}

/** An empty state, which is also what an unreadable file degrades to. */
export function emptyAppSettingsState(): AppSettingsState {
    return { version: APP_SETTINGS_FORMAT_VERSION, values: {} };
}

/**
 * Parses a settings file's text, or answers null when it is not one.
 *
 * Pure and exported so both the tolerant on-disk reader below and the strict IPC input
 * checker in `ipc.ts` share one notion of "what a settings file looks like".
 */
export function parseAppSettingsState(text: string): AppSettingsState | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { values?: unknown };
    if (typeof record.values !== "object" || record.values === null || Array.isArray(record.values)) return null;
    return { version: APP_SETTINGS_FORMAT_VERSION, values: { ...(record.values as Record<string, unknown>) } };
}

/** Reads the live settings file, treating every failure as "there is nothing saved yet". */
export async function readAppSettingsState(dataDir: string): Promise<AppSettingsState> {
    let text: string;
    try {
        text = await readFile(join(appSettingsFolder(dataDir), APP_SETTINGS_FILE), "utf8");
    } catch {
        return emptyAppSettingsState();
    }
    return parseAppSettingsState(text) ?? emptyAppSettingsState();
}

/**
 * Writes the live settings file through a temporary file and a rename, exactly as
 * `profiles/store.ts` writes the profile list, and for the same reason: a rename is atomic
 * on every platform this ships to, so a crash mid-write leaves the old state rather than half
 * of the new one.
 */
export async function writeAppSettingsState(dataDir: string, state: AppSettingsState): Promise<void> {
    const folder = appSettingsFolder(dataDir);
    await mkdir(folder, { recursive: true });
    const target = join(folder, APP_SETTINGS_FILE);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 4)}\n`, "utf8");
    await rename(temporary, target);
}

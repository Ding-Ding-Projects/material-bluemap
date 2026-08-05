/**
 * The main-process copy of the server-profile / maps-and-servers list.
 *
 * `design/packages/ui/src/stores/profiles.ts` is the renderer's own copy of this same idea,
 * and it is the one the interface actually reads and writes today - straight to the
 * browser's `localStorage`, which the main process cannot see and therefore cannot keep a
 * history of. This module is the other half of the fix Issue #35 asks for: a place in the
 * main process this data can *also* live, on disk, beside the application's own data, so the
 * history machinery in `../history/` has something real to snapshot.
 *
 * It is deliberately not a re-export of anything in `packages/ui`. That package renders three
 * different places - a browser tab, a test runner, the Electron renderer - and none of them
 * is this process; borrowing its types would borrow an assumption about Vue reactivity this
 * file has no business making. The shape here is the plain data the renderer's `ServerProfile`
 * already is, restated as an ordinary interface with no framework attached.
 *
 * ## Where the file lives, and why it is a real directory rather than a bare file path
 *
 * `profilesFolder(dataDir)` is a real directory - `<userData>/profiles-store/` - holding
 * exactly one file, `profiles.json`. A directory rather than a lone file so the same
 * `HistorySource` shape every other history binding uses (`read`/`write`/`remove` against a
 * *folder*) applies unchanged in `history.ts`: there is one kind of "where does this live"
 * argument in the whole history system, not a special case for things that happen to be a
 * single file.
 *
 * ## Reading is tolerant, writing is not
 *
 * {@link readProfilesState} degrades every failure - a missing file, a truncated one, one
 * edited by hand into nonsense - to the empty state, for the same reason
 * `history/store.ts`'s `readIndex` does: this file is a convenience the application maintains
 * for itself, and refusing to start because of a stray character in it would turn a cosmetic
 * problem into an outage. {@link writeProfilesState} has no such tolerance to offer, because
 * by the time something is writing, the shape has already been checked - that check belongs
 * to `ipc.ts`, which is the boundary a renderer's untrusted JSON actually crosses.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The directory inside the application's data folder holding the live profiles file. */
export const PROFILES_STORE_DIRECTORY = "profiles-store";

/** The file's name inside that directory. */
export const PROFILES_FILE = "profiles.json";

/** Current shape of {@link PROFILES_FILE}, so a future change can migrate rather than guess. */
export const PROFILES_FORMAT_VERSION = 1;

/** One server or rendered map, exactly as `packages/ui/src/stores/profiles.ts` defines it. */
export interface ProfileRecord {
    readonly id: string;
    readonly name: string;
    /** Base URL as entered by the user. Empty for a local map. */
    readonly url: string;
    /** Whether remote settings.json scripts[]/styles[] injection is trusted. */
    readonly trustCustomizations: boolean;
    /** Where a locally rendered map's data lives. Absent for a remote profile. */
    readonly dataRoot?: string;
}

export interface ProfilesState {
    readonly version: number;
    readonly profiles: readonly ProfileRecord[];
    readonly activeId: string | null;
}

/** Where the live profiles file lives. Pure: it creates nothing. */
export function profilesFolder(dataDir: string): string {
    return join(dataDir, PROFILES_STORE_DIRECTORY);
}

/** An empty state, which is also what an unreadable file degrades to. */
export function emptyProfilesState(): ProfilesState {
    return { version: PROFILES_FORMAT_VERSION, profiles: [], activeId: null };
}

/**
 * Parses a profiles file's text, or answers null when it is not one.
 *
 * Pure and exported so both the tolerant on-disk reader below and the strict IPC input
 * checker in `ipc.ts` can share one notion of "what a profile record looks like" rather than
 * validating the same shape twice and risking the two definitions drifting apart. A field
 * with the wrong type is dropped from that one record rather than failing the whole file,
 * the same tolerance `history/store.ts` extends to a damaged mapping entry.
 */
export function parseProfilesState(text: string): ProfilesState | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { profiles?: unknown; activeId?: unknown };
    if (!Array.isArray(record.profiles)) return null;

    const profiles: ProfileRecord[] = [];
    for (const entry of record.profiles) {
        if (typeof entry !== "object" || entry === null) continue;
        const row = entry as Record<string, unknown>;
        const id = typeof row["id"] === "string" ? row["id"] : null;
        const name = typeof row["name"] === "string" ? row["name"] : null;
        const url = typeof row["url"] === "string" ? row["url"] : null;
        if (id === null || name === null || url === null) continue;
        const dataRoot = typeof row["dataRoot"] === "string" ? row["dataRoot"] : undefined;
        profiles.push({
            id,
            name,
            url,
            trustCustomizations: row["trustCustomizations"] === true,
            ...(dataRoot === undefined ? {} : { dataRoot }),
        });
    }

    const activeId = typeof record.activeId === "string" ? record.activeId : null;
    return { version: PROFILES_FORMAT_VERSION, profiles, activeId };
}

/** Reads the live profiles file, treating every failure as "there is nothing saved yet". */
export async function readProfilesState(dataDir: string): Promise<ProfilesState> {
    let text: string;
    try {
        text = await readFile(join(profilesFolder(dataDir), PROFILES_FILE), "utf8");
    } catch {
        return emptyProfilesState();
    }
    return parseProfilesState(text) ?? emptyProfilesState();
}

/**
 * Writes the live profiles file through a temporary file and a rename.
 *
 * A rename is atomic on every platform this ships to, so a crash mid-write leaves the old
 * state rather than half of the new one - the same reasoning `history/store.ts` writes its
 * mapping file with.
 */
export async function writeProfilesState(dataDir: string, state: ProfilesState): Promise<void> {
    const folder = profilesFolder(dataDir);
    await mkdir(folder, { recursive: true });
    const target = join(folder, PROFILES_FILE);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 4)}\n`, "utf8");
    await rename(temporary, target);
}

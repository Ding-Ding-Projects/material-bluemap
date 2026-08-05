import { reactive, watch } from "vue";
import { simpleHistorySaveFn } from "../components/history/simpleHistoryHost.js";

export interface ServerProfile {
    id: string;
    name: string;
    /** Base URL as entered by the user (remote BlueMap instance root). Empty for a local map. */
    url: string;
    /** Whether remote settings.json scripts[]/styles[] injection is trusted (default no). */
    trustCustomizations: boolean;
    /**
     * Where this map's data actually lives.
     *
     * A remote profile has none, and is served through the embedded server's proxy at
     * `/remote/{id}`. A map this machine rendered has one - `/local/{renderId}`, which
     * `LocalMapHandler` serves off the disk - and setting it is what lets a finished
     * render be opened in the viewer through exactly the same switching, persistence and
     * map-list machinery a remote server uses.
     */
    dataRoot?: string;
}

/**
 * A locally rendered map, as opposed to somebody else's server.
 *
 * The distinction is load-bearing rather than cosmetic: only remote profiles are
 * registered with the embedded server's proxy, because registering a local one would
 * hand it an empty base URL to forward requests to.
 */
export function isLocalProfile(profile: ServerProfile): boolean {
    return typeof profile.dataRoot === "string" && profile.dataRoot.length > 0;
}

interface ProfilesState {
    profiles: ServerProfile[];
    activeId: string | null;
}

/** Exported so a test can point a stand-in `localStorage` at the same key this store writes. */
export const STORAGE_KEY = "material-bluemap-profiles";

function load(): ProfilesState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ProfilesState;
    } catch {
        // fall through to defaults
    }
    // The demo is offered, not opened. `activeId` is deliberately null on a fresh
    // install: making somebody else's server the active default means every launch of
    // every copy contacts a machine another person pays for, before the user has asked
    // for anything. It is one click away in the profile list instead.
    //
    // This is also what the capture harness's offline guard catches, because a default
    // that phones home is indistinguishable from a bug that does.
    return {
        profiles: [
            {
                id: "demo",
                name: "BlueMap Demo (bluecolored.de)",
                url: "https://bluecolored.de/bluemap",
                trustCustomizations: false,
            },
        ],
        activeId: null,
    };
}

export const profilesStore = reactive<ProfilesState>(load());

/**
 * In the Electron app, keep the embedded server's remote proxy in sync.
 *
 * Locally rendered maps are deliberately left out. They are served by `LocalMapHandler`
 * straight off the disk, and registering one here would give the proxy an empty base URL
 * to forward `/remote/{id}` requests to.
 */
function syncToBridge(): void {
    window.materialBluemap?.syncProfiles(
        profilesStore.profiles
            .filter((p) => !isLocalProfile(p))
            .map((p) => ({ id: p.id, name: p.name, baseUrl: p.url })),
    );
}

/**
 * Mirrors the current profile list into the main process's own version history,
 * fire-and-forget.
 *
 * `main/profiles/history.ts` and its `profilesHistory:save` channel have been registered
 * and tested since before this call existed (`docs/config-history.md`); what was missing
 * was a live mutation site that actually asked it to record something. This is that site -
 * the one place every profile add, remove, rename and active-id change already funnels
 * through to reach `localStorage`.
 *
 * Never awaited past its own `void`, and any rejection is swallowed: the rule this history
 * exists under is that a failed history write must never fail the save a person actually
 * asked for, and that save already happened above, into `localStorage`, which stays this
 * store's real source of truth. `window.materialBluemap` is absent in a browser tab and in
 * every test that mounts no bridge, and `simpleHistorySaveFn` answers null there rather
 * than throwing, so this is a plain no-op on every build that cannot keep a history at all.
 */
function recordProfilesHistory(): void {
    const save = simpleHistorySaveFn(typeof window === "undefined" ? null : window.materialBluemap, "profilesHistory");
    if (save === null) return;
    void save({
        version: 1,
        profiles: profilesStore.profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
            url: profile.url,
            trustCustomizations: profile.trustCustomizations,
            ...(profile.dataRoot !== undefined ? { dataRoot: profile.dataRoot } : {}),
        })),
        activeId: profilesStore.activeId,
    }).catch(() => {
        // Fire-and-forget: a history mirror that could not be written must never surface
        // as a failed profile save.
    });
}

watch(
    () => JSON.stringify(profilesStore),
    (value) => {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch {
            // Private mode or a full quota. The reactive state this watcher fired from
            // already holds the change - only the persisted copy is lost - so a profile
            // add/remove/rename stays usable for the rest of the session instead of
            // throwing inside this watcher and taking the mutation down with it.
        }
        syncToBridge();
        recordProfilesHistory();
    },
);
syncToBridge();

export function activeProfile(): ServerProfile | undefined {
    return profilesStore.profiles.find((p) => p.id === profilesStore.activeId);
}

export function addProfile(profile: Omit<ServerProfile, "id">): ServerProfile {
    const id = crypto.randomUUID().slice(0, 8);
    const created = { ...profile, id };
    profilesStore.profiles.push(created);
    return created;
}

export function removeProfile(id: string): void {
    const index = profilesStore.profiles.findIndex((p) => p.id === id);
    if (index >= 0) profilesStore.profiles.splice(index, 1);
    if (profilesStore.activeId === id) {
        profilesStore.activeId = profilesStore.profiles[0]?.id ?? null;
    }
}

/**
 * The data root the viewer should load from.
 *
 * A locally rendered map carries its own (`/local/{renderId}`, served off the disk by
 * `LocalMapHandler`). Everything else is a remote server mounted at `/remote/{id}`, which
 * the desktop shell registers with the embedded server so the path resolves same-origin.
 */
export function profileDataRoot(profile: ServerProfile): string {
    return profile.dataRoot ?? `/remote/${profile.id}`;
}

/**
 * Adds a finished local render to the map list and returns it.
 *
 * Reuses the id already in the data root rather than minting a new one, so opening the
 * same render twice updates the existing entry instead of stacking duplicates up in the
 * list every time somebody re-renders a world.
 */
export function addLocalMap(dataRoot: string, name: string): ServerProfile {
    const id = dataRoot.split("/").filter(Boolean).pop() ?? crypto.randomUUID().slice(0, 8);
    const existing = profilesStore.profiles.find((p) => p.id === id);
    if (existing) {
        existing.name = name;
        existing.dataRoot = dataRoot;
        return existing;
    }
    const created: ServerProfile = { id, name, url: "", trustCustomizations: false, dataRoot };
    profilesStore.profiles.push(created);
    return created;
}

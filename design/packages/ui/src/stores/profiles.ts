import { reactive, watch } from "vue";

export interface ServerProfile {
    id: string;
    name: string;
    /** Base URL as entered by the user (remote BlueMap instance root). */
    url: string;
    /** Whether remote settings.json scripts[]/styles[] injection is trusted (default no). */
    trustCustomizations: boolean;
}

interface ProfilesState {
    profiles: ServerProfile[];
    activeId: string | null;
}

const STORAGE_KEY = "material-bluemap-profiles";

function load(): ProfilesState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as ProfilesState;
    } catch {
        // fall through to defaults
    }
    return {
        profiles: [
            {
                id: "demo",
                name: "BlueMap Demo (bluecolored.de)",
                url: "https://bluecolored.de/bluemap",
                trustCustomizations: false,
            },
        ],
        activeId: "demo",
    };
}

export const profilesStore = reactive<ProfilesState>(load());

/** In the Electron app, keep the embedded server's remote proxy in sync. */
function syncToBridge(): void {
    window.materialBluemap?.syncProfiles(
        profilesStore.profiles.map((p) => ({ id: p.id, name: p.name, baseUrl: p.url })),
    );
}

watch(
    () => JSON.stringify(profilesStore),
    (value) => {
        localStorage.setItem(STORAGE_KEY, value);
        syncToBridge();
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
 * The data root the viewer should load from. In the Electron app / embedded server the
 * profile is mounted at /remote/{id}; the desktop shell registers profiles with the
 * embedded server so this path resolves same-origin.
 */
export function profileDataRoot(profile: ServerProfile): string {
    return `/remote/${profile.id}`;
}

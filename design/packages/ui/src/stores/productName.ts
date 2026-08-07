import { ref } from "vue";
import {
    DISPLAY_NAME_STORAGE_KEY,
    WORLDLENS_IDENTITY,
    resolveDisplayName,
} from "@worldlens/shared";
import { recordAppSetting } from "./appSettingsHistorySync.js";

export interface DisplayNameStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function browserStorage(): DisplayNameStorage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

function readStoredDisplayName(storage: DisplayNameStorage | null): string {
    if (storage === null) return WORLDLENS_IDENTITY.shippedName;
    try {
        return resolveDisplayName(storage.getItem(DISPLAY_NAME_STORAGE_KEY));
    } catch {
        return WORLDLENS_IDENTITY.shippedName;
    }
}

/** The cosmetic name rendered by application chrome. Machine identity never reads this. */
export const productDisplayName = ref(readStoredDisplayName(browserStorage()));

function applyDocumentTitle(name: string): void {
    if (typeof document !== "undefined") document.title = name;
}

applyDocumentTitle(productDisplayName.value);

export function setProductDisplayName(
    value: unknown,
    storage: DisplayNameStorage | null = browserStorage(),
): string {
    const name = resolveDisplayName(value);
    productDisplayName.value = name;
    applyDocumentTitle(name);
    if (storage !== null) {
        try {
            storage.setItem(DISPLAY_NAME_STORAGE_KEY, name);
        } catch {
            // A cosmetic preference failing to persist must not stop the application.
        }
    }
    recordAppSetting("productDisplayName", name);
    return name;
}

export function resetProductDisplayName(storage: DisplayNameStorage | null = browserStorage()): void {
    productDisplayName.value = WORLDLENS_IDENTITY.shippedName;
    applyDocumentTitle(productDisplayName.value);
    if (storage !== null) {
        try {
            storage.removeItem(DISPLAY_NAME_STORAGE_KEY);
        } catch {
            // Same non-fatal persistence boundary as setProductDisplayName.
        }
    }
    recordAppSetting("productDisplayName", productDisplayName.value);
}


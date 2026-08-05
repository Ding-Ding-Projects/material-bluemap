/**
 * The two things about the palette that outlive one opening: how big it is, and the key
 * that opens it.
 *
 * **Size is a user choice and it is remembered.** A search box that swallows the whole
 * window is overwhelming on a large display and frightening when it was opened by mistake,
 * so the default is the bounded card and the full-window view is something somebody asks
 * for. Having asked once, they should not have to ask again on the next launch, which is
 * the only reason this module writes to storage at all.
 *
 * Storage failure is not an error worth showing anybody. A private-mode browser and a full
 * quota both throw on write, and the consequence is that a preference does not survive a
 * restart - annoying, and nowhere near a notification. The read is guarded the same way, and
 * a stored value that is not one of the two known sizes is discarded rather than trusted,
 * because the file on disk is editable by hand and by an older version of this app.
 */

import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** The sizes the palette offers, in the order the setting lists them. */
export const PALETTE_SIZES = ["card", "full"] as const;

export type PaletteSize = (typeof PALETTE_SIZES)[number];

/** The bounded card, which is what somebody who has not chosen gets. */
export const DEFAULT_PALETTE_SIZE: PaletteSize = "card";

const STORAGE_KEY = "material-bluemap-palette";

/** True for a value that came out of storage and is one of the sizes this build knows. */
export function isPaletteSize(value: unknown): value is PaletteSize {
    return typeof value === "string" && (PALETTE_SIZES as readonly string[]).includes(value);
}

/**
 * A storage the preference can be kept in.
 *
 * Narrowed to the two methods used so a test can pass a plain object, and so a caller
 * cannot reach the rest of `localStorage` through it.
 */
export interface PaletteStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): PaletteStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

/** The stored size, or the default when there is none, it is unreadable, or it is junk. */
export function readPaletteSize(storage: PaletteStorage | null = defaultStorage()): PaletteSize {
    if (storage === null) return DEFAULT_PALETTE_SIZE;
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_PALETTE_SIZE;
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") return DEFAULT_PALETTE_SIZE;
        const size = (parsed as { size?: unknown }).size;
        return isPaletteSize(size) ? size : DEFAULT_PALETTE_SIZE;
    } catch {
        return DEFAULT_PALETTE_SIZE;
    }
}

/** Writes the size, silently doing nothing where storage refuses. */
export function writePaletteSize(size: PaletteSize, storage: PaletteStorage | null = defaultStorage()): void {
    // Fire-and-forget mirror into the main process's own settings history, whether or not
    // there is a local `storage` to write to - see `appSettingsHistorySync.ts`'s own doc
    // comment.
    recordAppSetting("palette", { size });
    if (storage === null) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ size }));
    } catch {
        // Private mode or a full quota. A remembered window size is not worth a toast.
    }
}

/**
 * Whether a keystroke is the palette's shortcut.
 *
 * **Control+Shift+F**, and not Alt. This used to be Ctrl+K, on the reasoning that Ctrl+K is
 * what every application with a palette uses and muscle memory is worth more than
 * consistency. That reasoning was wrong twice over. Ctrl+K is already spoken for in a text
 * field on several platforms, and - the part that actually decided it - the documentation
 * site next door binds Ctrl+Shift+F, so the product shipped two different shortcuts for the
 * same feature and whichever one a person learned was wrong half the time. One shortcut, and
 * this is it.
 *
 * Alt is excluded rather than ignored, so that a future Ctrl+Alt+Shift+F belongs to whoever
 * wants it instead of silently opening this. Shift is now required rather than rejected, which
 * is the whole change.
 *
 * `event.key` rather than `event.code`, so the key labelled F on the user's own layout is the
 * one that works. `code` would hard-code the position of F on a US keyboard, which on a Dvorak
 * or AZERTY layout is a different key entirely. Shift makes `event.key` arrive as `"F"` on
 * most layouts and `"f"` on some, so both cases are accepted; comparing case-insensitively is
 * not optional here the way it was for an unshifted letter.
 */
export function isPaletteShortcut(event: KeyboardEvent): boolean {
    if (event.altKey) return false;
    if (!event.shiftKey) return false;
    if (!event.ctrlKey && !event.metaKey) return false;
    return event.key === "f" || event.key === "F";
}

/**
 * Binds the shortcut for as long as the calling component is mounted.
 *
 * It toggles rather than only opening, because the same keystroke arriving twice should not
 * leave somebody with a palette they now have to find the Escape key for - and because the
 * shortcut is the one part of this feature people learn by muscle memory rather than by
 * reading.
 *
 * The listener sits on `window` in the capture phase. A palette is meant to be reachable
 * from anywhere in the application, including from inside a text field on a settings form,
 * and a bubbling listener can be beaten by anything that stops propagation on its way up.
 * `preventDefault` is called only when the shortcut actually matched, so every other
 * keystroke reaches whatever it was aimed at untouched.
 */
export function usePaletteShortcut(open: Ref<boolean>): void {
    function onKeydown(event: KeyboardEvent): void {
        if (!isPaletteShortcut(event)) return;
        event.preventDefault();
        open.value = !open.value;
    }

    onMounted(() => {
        globalThis.addEventListener("keydown", onKeydown, true);
    });

    onBeforeUnmount(() => {
        globalThis.removeEventListener("keydown", onKeydown, true);
    });
}

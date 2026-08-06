/**
 * Where rendered maps are written, and what counts as a usable answer.
 *
 * The renderer process has no `node:path` and no home directory, so the default cannot
 * simply be computed here. Two routes, in order:
 *
 *  1. the preload bridge's `mapStorageDirectory()`, which answers with the folder maps
 *     are written to now and the default, both already expanded. Then the field shows a
 *     real absolute path, which is the honest thing to show and the thing a person can
 *     paste into a file manager;
 *  2. failing that, the platform's own environment token (`%APPDATA%` on Windows,
 *     `~` elsewhere) followed by the rest of the path.
 *
 * The token form is a real value rather than a placeholder standing in for one: the main
 * process expands it when a render starts, it is what a person would type themselves,
 * and the step says so in as many words instead of letting it look like sample text.
 * `expandsAtRenderTime()` is what the copy keys off, so the explanation cannot drift
 * from the value being shown.
 */

import { setupStorage } from "./setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

export type SetupPlatform = "windows" | "macos" | "linux";

const STORAGE_DIR_KEY = "material-bluemap.maps.directory";

/**
 * `electron-builder.config.cjs`'s `productName` - the display name in the installer, the
 * window title and the Start-menu shortcut. Used below only for the macOS and Linux cases,
 * neither of which this app ships a desktop build for (it is Windows-only in practice), so
 * there is no real `userData` directory on either platform to be truthful about.
 */
const PRODUCT_DIRECTORY = "Material BlueMap";

/**
 * Electron's real `userData` directory leaf on Windows - not a guess.
 *
 * This constant used to be `PRODUCT_DIRECTORY` here too, with a comment claiming it "is
 * also the leaf of its userData directory". That was wrong: this app never calls
 * `app.setName()`, so Electron does not read `productName` for `userData` - it falls back
 * to the raw `"name"` field in `packages/app/package.json`, `@material-bluemap/app`, joined
 * as a path exactly as written. The `/` becomes a second directory level, so `userData` is
 * really `%APPDATA%\@material-bluemap\app` - two folders deep, not the flat
 * `%APPDATA%\Material BlueMap` this file used to show.
 *
 * **Do not "fix" this by calling `app.setName()`, or by renaming the npm package.** Either
 * one would rename every existing profile's `userData` directory out from under itself -
 * consent, the first-run flag, the GitHub credential, project history, cached maps, all
 * silently orphaned, because nothing here migrates the old folder's contents to the new
 * path. That migration is real work, scheduled for a later change; this constant only has
 * to describe where things already are, truthfully.
 */
const WINDOWS_USER_DATA_DIRECTORY = "@material-bluemap\\app";

/** Reads the platform out of a user-agent string. Exported so a test can pass one in. */
export function detectPlatform(userAgent: string): SetupPlatform {
    if (/windows|win32|win64/i.test(userAgent)) return "windows";
    if (/macintosh|mac os x|darwin/i.test(userAgent)) return "macos";
    return "linux";
}

/** The running platform, or Linux when there is no navigator to ask (tests, Node). */
export function currentPlatform(): SetupPlatform {
    const agent = globalThis.navigator?.userAgent;
    return typeof agent === "string" ? detectPlatform(agent) : "linux";
}

export function pathSeparator(platform: SetupPlatform): string {
    return platform === "windows" ? "\\" : "/";
}

/**
 * The environment token the default path starts with, so the copy can name the exact
 * text on screen rather than saying "the placeholder above".
 */
export function pathToken(platform: SetupPlatform): string {
    return platform === "windows" ? "%APPDATA%" : "~";
}

/**
 * The default folder, matching where Electron puts `userData` on each platform so the
 * maps sit beside the data the app already keeps rather than in a second place.
 */
export function defaultMapStorageDir(platform: SetupPlatform): string {
    switch (platform) {
        case "windows":
            return `%APPDATA%\\${WINDOWS_USER_DATA_DIRECTORY}\\maps`;
        case "macos":
            return `~/Library/Application Support/${PRODUCT_DIRECTORY}/maps`;
        default:
            return `~/.config/${PRODUCT_DIRECTORY}/maps`;
    }
}

/** A concrete example for the validation message, in the platform's own notation. */
export function mapStorageExample(platform: SetupPlatform): string {
    switch (platform) {
        case "windows":
            return "D:\\minecraft\\maps";
        case "macos":
            return "/Users/you/minecraft/maps";
        default:
            return "/home/you/minecraft/maps";
    }
}

/** True when the value still contains a token the main process expands at render time. */
export function expandsAtRenderTime(value: string, platform: SetupPlatform): boolean {
    const trimmed = value.trim();
    if (platform === "windows") return /^%[^%]+%/.test(trimmed);
    return trimmed.startsWith("~") || /^\$\{?\w+/.test(trimmed);
}

/**
 * True for a path that names one place on this machine: a drive letter, a UNC share, a
 * POSIX root, or an environment token that expands into one of those.
 */
export function isAbsolutePath(value: string, platform: SetupPlatform): boolean {
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (expandsAtRenderTime(trimmed, platform)) return true;
    if (platform === "windows") {
        return /^[A-Za-z]:[\\/]/.test(trimmed) || /^\\\\[^\\]/.test(trimmed);
    }
    return trimmed.startsWith("/");
}

/** Trims and drops trailing separators, so `/maps/` and `/maps` are the same answer. */
export function normalizeMapStorageDir(value: string, platform: SetupPlatform): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "";
    const separator = pathSeparator(platform);
    let end = trimmed.length;
    while (end > 1 && (trimmed[end - 1] === "\\" || trimmed[end - 1] === "/")) end -= 1;
    // A bare root ("/" or "C:\") keeps its separator; anything else loses the trailing one.
    if (platform === "windows" && /^[A-Za-z]:$/.test(trimmed.slice(0, end))) {
        return `${trimmed.slice(0, end)}${separator}`;
    }
    return trimmed.slice(0, end);
}

export type MapStorageProblem = "empty" | "relative" | null;

/** Why a value cannot be used, or null when it can. */
export function validateMapStorageDir(value: string, platform: SetupPlatform): MapStorageProblem {
    if (value.trim().length === 0) return "empty";
    if (!isAbsolutePath(value, platform)) return "relative";
    return null;
}

/** Joins a chosen parent folder to the product's own subfolder, for a folder picker. */
export function joinMapStorageDir(parent: string, platform: SetupPlatform): string {
    const base = normalizeMapStorageDir(parent, platform);
    if (base.length === 0) return "";
    const separator = pathSeparator(platform);
    return base.endsWith(separator) ? `${base}maps` : `${base}${separator}maps`;
}

/** The stored choice, or null when setup has not made one yet. */
export function readMapStorageDir(): string | null {
    const raw = setupStorage().read(STORAGE_DIR_KEY);
    return raw !== null && raw.trim().length > 0 ? raw : null;
}

export function writeMapStorageDir(value: string, platform: SetupPlatform): string {
    const normalized = normalizeMapStorageDir(value, platform);
    setupStorage().write(STORAGE_DIR_KEY, normalized);
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // write above - see `appSettingsHistorySync.ts`'s own doc comment.
    recordAppSetting("mapStorageDir", normalized);
    return normalized;
}

export function clearMapStorageDir(): void {
    setupStorage().remove(STORAGE_DIR_KEY);
}

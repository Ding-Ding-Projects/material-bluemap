/**
 * How big the whole interface is drawn: the novice dial for people who find 14px chrome
 * too small to read or too fiddly to click, which is most children, many older readers,
 * and anyone on a dense laptop panel sitting further away than a spec sheet assumes.
 *
 * The appearance editor can already resize any *text* the app renders, element by element
 * or globally, and that is the right tool for taste. It is the wrong tool for "I cannot
 * read this": it reaches only the elements wrapped in an appearance target, it leaves
 * icons, paddings and click targets at their designed size, and it asks somebody who is
 * struggling to see the interface to operate that same interface's most detailed editor
 * first. This dial scales everything at once - text, icons, buttons, the click targets
 * themselves - the same way a browser's own zoom does, and it lives one tab into Settings
 * with five labelled stops rather than a free field that can be typed into a corner.
 *
 * The five stops are 100/125/150/175/200 percent, deliberately the same four scale points
 * the project's own sizing rule already requires every layout to hold at ("layouts that
 * hold at 100/125/150/200% scale"), plus the 175 midpoint. Nothing below 100: a dial that
 * can make the interface *smaller* is a dial that can be escaped from only by finding the
 * now-tiny control that changes it back.
 *
 * ## How the scale is actually applied
 *
 * In the desktop shell, through the preload's `setUiZoom`, which calls Chromium's own
 * `webFrame.setZoomFactor` - the identical mechanism behind Ctrl+plus in a browser. That
 * route scales the map canvas's device pixel ratio along with the chrome, so the
 * three.js viewer re-renders crisp rather than being stretched. In a browser tab, where
 * there is no preload, the standard CSS `zoom` property on the document root is the
 * fallback: the map is upscaled rather than re-rendered there, which is the same trade
 * every plain web page makes under CSS zoom.
 *
 * Feature-detected per call, exactly as every other bridge capability in this package is:
 * a released shell can load a newer renderer than the one it was built beside, and a
 * bridge without `setUiZoom` gets the CSS fallback rather than a thrown error.
 */

import { ref } from "vue";
import { setupStorage } from "../setup/setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** The zoom half of the preload bridge. Mirrors `WorldlensBridge.setUiZoom`. */
export interface UiZoomBridge {
    setUiZoom(factor: number): void;
}

/**
 * The bridge, or null when this build applies zoom through CSS instead.
 *
 * Resolved per call rather than cached, the same way `resolveWindowBridge` is: a test
 * swaps the global between cases, and the application itself only ever calls this a
 * handful of times per session.
 */
export function resolveUiZoomBridge(): UiZoomBridge | null {
    const host = (globalThis as { worldlens?: Partial<UiZoomBridge> }).worldlens;
    if (host === undefined || typeof host.setUiZoom !== "function") return null;
    const complete = host as UiZoomBridge;
    return { setUiZoom: (factor) => complete.setUiZoom(factor) };
}

/** One stop on the dial. */
export interface UiSizeLevel {
    readonly level: 1 | 2 | 3 | 4 | 5;
    /** What the whole interface is scaled to, as a percentage of its designed size. */
    readonly percent: number;
}

/**
 * The five stops. 100% first and the default, because the designed size is the right
 * answer for most people and a dial that defaults anywhere else second-guesses them.
 */
export const UI_SIZE_LEVELS: readonly UiSizeLevel[] = [
    { level: 1, percent: 100 },
    { level: 2, percent: 125 },
    { level: 3, percent: 150 },
    { level: 4, percent: 175 },
    { level: 5, percent: 200 },
];

export const DEFAULT_UI_SIZE_LEVEL: UiSizeLevel["level"] = 1;

/** Where the chosen level is remembered. */
export const UI_SIZE_KEY = "worldlens.display.uiSize";

/** True for a value that names one of the five stops. */
export function isUiSizeLevel(value: unknown): value is UiSizeLevel["level"] {
    return typeof value === "number" && UI_SIZE_LEVELS.some((stop) => stop.level === value);
}

/** The stop a level number names. */
export function uiSizeLevelByNumber(level: UiSizeLevel["level"]): UiSizeLevel {
    // The array is a closed set indexed 0..4 by construction, so this cannot miss; the
    // fallback is for the type system, not for a case that can happen.
    return UI_SIZE_LEVELS.find((stop) => stop.level === level) ?? UI_SIZE_LEVELS[0]!;
}

/** The zoom factor a level sets: 1 for 100%, 2 for 200%. */
export function uiZoomFactor(level: UiSizeLevel["level"]): number {
    return uiSizeLevelByNumber(level).percent / 100;
}

/** The stored level, or the shipped default when nothing has been chosen or it does not parse. */
export function readUiSizeLevel(): UiSizeLevel["level"] {
    const raw = setupStorage().read(UI_SIZE_KEY);
    if (raw === null) return DEFAULT_UI_SIZE_LEVEL;
    const parsed = Number(raw);
    return isUiSizeLevel(parsed) ? parsed : DEFAULT_UI_SIZE_LEVEL;
}

/**
 * Remembers a chosen level, and mirrors it into the settings history bag under `uiSize` -
 * fire-and-forget, exactly like every other key `recordAppSetting` carries; see its own
 * doc comment for why the mirror can never fail the real write.
 */
export function writeUiSizeLevel(level: UiSizeLevel["level"]): void {
    setupStorage().write(UI_SIZE_KEY, String(level));
    recordAppSetting("uiSize", level);
}

/**
 * Scales the running interface to a level's factor, through whichever of the two routes
 * this build has.
 *
 * The CSS fallback writes an empty value rather than `zoom: 1` at 100%, so a browser that
 * predates the standardized `zoom` property is left with a stylesheet it fully
 * understands whenever the dial is at its default.
 */
export function applyUiSize(level: UiSizeLevel["level"]): void {
    const factor = uiZoomFactor(level);

    const bridge = resolveUiZoomBridge();
    if (bridge !== null) {
        bridge.setUiZoom(factor);
        return;
    }

    const root = typeof document === "undefined" ? null : document.documentElement;
    if (root === null) return;
    if (factor === 1) root.style.removeProperty("zoom");
    else root.style.setProperty("zoom", String(factor));
}

/**
 * The level the interface is drawn at right now, shared between the settings row and the
 * startup install below. A module-level ref rather than component state for the same
 * reason `stores/notices.ts` is a singleton: there is exactly one interface to size, and
 * two components each holding their own copy of "what size is it" is how a row shows
 * Standard while the window is drawn at Large.
 */
export const currentUiSizeLevel = ref<UiSizeLevel["level"]>(readUiSizeLevel());

/** Changes the level: remembers it, applies it live, and updates the shared readout. */
export function changeUiSize(level: UiSizeLevel["level"]): void {
    currentUiSizeLevel.value = level;
    writeUiSizeLevel(level);
    applyUiSize(level);
}

/**
 * Applies the persisted level once, at startup, before the first frame a person reads.
 *
 * Called from `main.ts` rather than from the settings row's own mount, because the row
 * exists only while its settings tab is open and the size choice has to hold from the
 * first paint of every launch.
 */
export function installUiSize(): void {
    currentUiSizeLevel.value = readUiSizeLevel();
    applyUiSize(currentUiSizeLevel.value);
}

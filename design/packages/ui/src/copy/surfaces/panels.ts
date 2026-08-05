/**
 * Resizing and moving a `DockedSurface`: the resize splitter on a docked edge, the resize
 * handles and the move handle on a floating panel, and the status line said out loud when
 * a drag or a keystroke had to be kept inside the window.
 *
 * ## Not yet registered
 *
 * Unlike every other module in this folder, this one is **not** spread into
 * `SURFACE_VOICED` / `SURFACE_FIXED` / `SURFACE_FACTS` by `index.ts`, and it is not listed
 * in `catalogueCoverage.test.ts`'s `COVERED_SURFACES` yet. `DockedSurface.vue` still calls
 * `t()` with these keys and their English fallback, so every string on screen is correct
 * today; it simply is not yet reachable in Cantonese, bilingual mode, or at a funny level
 * other than whatever the fallback happens to read as. Wiring both of those files is
 * integration's job, once the surfaces that already own them are free to take the edit -
 * see `HANDOFF.md`.
 *
 * ## Short names versus what a handle actually says
 *
 * A handle's accessible *name* - which edge or corner it resizes, or that it moves the
 * panel - is FIXED: "Resize {title} from the right edge" does not read differently at five
 * funny levels, and a name a screen reader has to sit through before every single arrow-key
 * press is a name that has to stay short regardless of the setting. The two readouts
 * (`panels.resize.valueText`, `panels.resize.valueTextSize`, `panels.move.valueText`) are
 * FIXED for the same reason: they are announced on every step of a drag or a keypress, and
 * a value announcement that gets more verbose at level 5 is a value announcement nobody can
 * use to actually judge how big the panel just got.
 *
 * What *is* VOICED is the one-time instructional text next to each handle (read once, on
 * focus, not on every step) and the status line shown when a drag or a keyboard step had to
 * be kept inside the window - the same "say it out loud rather than silently clamp" pattern
 * `dock.adjusted.*` in `settings.ts` already uses for the placement chooser's own
 * adjustments.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const PANELS_VOICED = {
    /*
     * Read once when the handle receives focus, via `aria-describedby` - not re-announced
     * on every arrow-key press, which is what the two `valueText` FIXED entries are for.
     */
    "panels.resize.instructions": {
        en: [
            "Press an arrow key to resize {title}. Hold Shift for a bigger step.",
            "Press an arrow key to resize {title}. Hold Shift for a bigger step.",
            "Press an arrow key to resize {title}. Holding Shift moves it in bigger steps.",
            "Nudge {title} bigger or smaller with an arrow key; hold Shift if a step feels too small.",
            "Poke an arrow key to resize {title}; hold Shift when a nibble is not enough.",
        ],
        yue: [
            "撳箭嘴掣可以調校 {title} 嘅大小，撳住 Shift 會郁大步啲。",
            "撳箭嘴掣可以調校 {title} 嘅大小，撳住 Shift 會郁大步啲。",
            "撳箭嘴掣就可以調校 {title} 嘅大小，撳住 Shift 就會郁大步啲。",
            "箭嘴掣可以郁 {title} 嘅大小，如果一步太細，撳住 Shift 就得。",
            "篤箭嘴掣就可以郁 {title} 嘅大小，如果一啖唔夠飽，撳住 Shift 大口啲食。",
        ],
    },
    "panels.move.instructions": {
        en: [
            "Press an arrow key to move {title}. Hold Shift for a bigger step.",
            "Press an arrow key to move {title}. Hold Shift for a bigger step.",
            "Press an arrow key to move {title} around. Holding Shift moves it in bigger steps.",
            "Nudge {title} around with an arrow key; hold Shift if a step feels too small.",
            "Poke an arrow key to send {title} on its way; hold Shift when a nibble is not enough.",
        ],
        yue: [
            "撳箭嘴掣可以郁動 {title}，撳住 Shift 會郁大步啲。",
            "撳箭嘴掣可以郁動 {title}，撳住 Shift 會郁大步啲。",
            "撳箭嘴掣就可以郁動 {title}，撳住 Shift 就會郁大步啲。",
            "箭嘴掣可以周圍郁 {title}，如果一步太細，撳住 Shift 就得。",
            "篤箭嘴掣就可以帶住 {title} 周圍走，如果一啖唔夠飽，撳住 Shift 大口啲行。",
        ],
    },
    /*
     * Said out loud, exactly as `dock.adjusted.*` already does for the placement chooser:
     * the one invariant this whole feature promises is that a floating panel can never be
     * dragged or stepped somewhere the window itself does not reach, and a panel that
     * quietly stops moving at the edge reads as broken rather than as protected.
     */
    "panels.geometry.clamped": {
        en: [
            "{title} was kept fully inside the window, so it can always be reached again.",
            "{title} was kept fully inside the window, so it can always be reached again.",
            "{title} was kept fully inside the window and within its usable size, so it can always be reached again.",
            "{title} stayed fully inside the window and never grew past what still works, so it never becomes impossible to grab back.",
            "{title} was gently nudged back inside the window and its usable size, so it never wanders off somewhere you cannot grab it back from.",
        ],
        yue: [
            "{title}會保持喺視窗範圍之內，即係話你隨時都撳返到佢。",
            "{title}會保持喺視窗範圍之內，即係話你隨時都撳返到佢。",
            "{title}會保持喺視窗範圍之內，大小都控制喺仲可以用嘅程度，所以你隨時都撳返到佢。",
            "{title}無論點郁都留咗喺視窗入面，大細亦冇超過仲用得嘅範圍，所以你唔會撳唔返佢。",
            "{title}俾人輕輕推返入視窗度，大細都keep住喺仲用得嘅範圍，唔會走去一個你撳都撳唔返嘅地方。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const PANELS_FIXED = {
    /* The accessible name of each handle. Short and literal at every level - see the header note. */
    "panels.resize.left": { en: "Resize {title} from the left edge", yue: "喺左邊調校 {title} 嘅大小" },
    "panels.resize.right": { en: "Resize {title} from the right edge", yue: "喺右邊調校 {title} 嘅大小" },
    "panels.resize.top": { en: "Resize {title} from the top edge", yue: "喺頂部調校 {title} 嘅大小" },
    "panels.resize.bottom": { en: "Resize {title} from the bottom edge", yue: "喺底部調校 {title} 嘅大小" },
    "panels.resize.corner": { en: "Resize {title} from the corner", yue: "喺角位調校 {title} 嘅大小" },
    "panels.move.handle": { en: "Move {title}", yue: "郁動 {title}" },

    /*
     * Value readouts, announced on every arrow-key step and on every drag frame a screen
     * reader chooses to pick up - kept short and factual at every funny level for exactly
     * that reason.
     */
    "panels.resize.valueText": { en: "{value} pixels", yue: "{value} 像素" },
    "panels.resize.valueTextSize": { en: "{width} by {height} pixels", yue: "{width} 乘 {height} 像素" },
    "panels.move.valueText": {
        en: "{left} pixels from the left, {top} pixels from the top",
        yue: "距離左邊 {left} 像素，距離頂部 {top} 像素",
    },
} as const satisfies Record<string, FixedString>;

export const PANELS_FACTS = {
    "panels.resize.instructions": { en: ["arrow key", "Shift"], yue: ["箭嘴掣", "Shift"] },
    "panels.move.instructions": { en: ["arrow key", "Shift"], yue: ["箭嘴掣", "Shift"] },
    "panels.geometry.clamped": { en: ["{title}", "window"], yue: ["{title}", "視窗"] },
} as const satisfies Record<keyof typeof PANELS_VOICED, { en: readonly string[]; yue: readonly string[] }>;

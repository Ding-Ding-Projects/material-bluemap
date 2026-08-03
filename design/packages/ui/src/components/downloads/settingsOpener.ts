/**
 * The route from a failure to the setting that fixes it, provided rather than passed.
 *
 * A download that cannot write reports which settings row owns the folder it failed on,
 * and that row is worth a button. The trouble is where the button's press has to go: the
 * downloads surface is mounted several components deep inside the create-a-map wizard, and
 * only the screen at the top of that tree knows how to open a settings anchor. Threading
 * an emit through every step in between would make each of those steps carry a concern
 * none of them has, and would change components that have nothing to do with downloading.
 *
 * So the opener is provided by whatever mounts the surface, and injected where the button
 * lives. An absent opener is a first-class answer and not an error: the surface then names
 * the setting in words instead of rendering a button with nowhere to go, which is the one
 * outcome worth avoiding. A control that looks pressable and does nothing is worse than a
 * sentence, because the sentence can be acted on.
 */

import { inject, provide, type InjectionKey } from "vue";
import type { SettingsTarget } from "./downloadBridge.js";

export type SettingsOpener = (target: SettingsTarget) => void;

const SETTINGS_OPENER: InjectionKey<SettingsOpener> = Symbol("material-bluemap.settings-opener");

/** Offers every surface below this one a way to reveal a settings row. */
export function provideSettingsOpener(open: SettingsOpener): void {
    provide(SETTINGS_OPENER, open);
}

/** The opener, or null when nothing above has offered one. */
export function useSettingsOpener(): SettingsOpener | null {
    return inject(SETTINGS_OPENER, null);
}

/**
 * The object the rest of the site talks to about appearance.
 *
 * It owns the font list (including the optional installed-font grant), keeps the
 * managed stylesheet in step with the store, and exposes the one call that writes
 * the site-wide custom properties. Everything else here is a thin pass-through, so
 * there is exactly one place that knows how a stored appearance becomes CSS.
 */

import type { Preferences } from "../platform/Preferences.js";
import { applyAppearance, applyRootAppearance } from "./apply.js";
import type { RootAppearance } from "./apply.js";
import { AppearanceStore, appearanceStore } from "./store.js";
import type { FontFamilyEntry, LocalFontAccess } from "./type/fonts.js";
import {
    SYSTEM_FONT_FAMILIES,
    localFontAccessState,
    mergeFamilies,
    queryInstalledFonts,
    stackFor,
} from "./type/fonts.js";

export class AppearanceController {
    readonly store: AppearanceStore;
    readonly prefs: Preferences;

    private familyList: readonly FontFamilyEntry[] = SYSTEM_FONT_FAMILIES;
    private access: LocalFontAccess = localFontAccessState();
    private installedCount = 0;
    private readonly listeners = new Set<() => void>();

    constructor(prefs: Preferences, store: AppearanceStore = appearanceStore) {
        this.prefs = prefs;
        this.store = store;
        this.store.subscribe(() => {
            this.apply();
            this.emit();
        });
        this.apply();
    }

    families(): readonly FontFamilyEntry[] {
        return this.familyList;
    }

    stackFor(id: string): string {
        return stackFor(this.familyList, id);
    }

    /**
     * The note shown under the font list.
     *
     * It always states which list is on screen. A control that shows twenty stacks
     * while implying it enumerated the machine is the failure mode worth avoiding.
     */
    installedNoteKey(): string {
        switch (this.access) {
            case "granted":
                return "type.fontsGranted";
            case "denied":
                return "type.fontsDenied";
            case "failed":
                return "type.fontsFailed";
            case "unsupported":
                return "type.fontsUnsupported";
            default:
                return "type.fontsSystem";
        }
    }

    installedFontCount(): number {
        return this.installedCount;
    }

    /** Prompt for the installed-font list. Returns the note key describing the outcome. */
    async requestInstalledFonts(): Promise<string> {
        const result = await queryInstalledFonts();
        this.access = result.state;
        if (result.state === "granted") {
            this.installedCount = result.families.length;
            this.familyList = mergeFamilies(SYSTEM_FONT_FAMILIES, result.families);
            this.apply();
            this.emit();
        }
        return this.installedNoteKey();
    }

    /** Rebuild the managed stylesheet. Called on every store change. */
    apply(): void {
        applyAppearance(this.store, this.familyList);
    }

    applyRoot(values: RootAppearance): void {
        applyRootAppearance(document.documentElement, values);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}

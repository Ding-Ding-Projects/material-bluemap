/**
 * Theme controller.
 *
 * Owns the two appearance choices the shell persists and writes them onto <html> as
 * `data-theme` and `data-density`. tokens.css redeclares its colour roles under
 * `[data-theme="dark"]` and its density scale under `[data-density="compact"]`, so switching
 * is one attribute write and every component follows without knowing anything happened.
 *
 * `system` is the default and tracks prefers-color-scheme live, so a visitor who switches
 * their operating system to dark at dusk sees the page follow without reloading. Choosing
 * light or dark explicitly overrides that until they choose `system` again.
 */

import type { Preferences } from "../platform/Preferences.js";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export type ResolvedTheme = "light" | "dark";

const MODE_KEY = "theme.mode";
const DENSITY_KEY = "theme.density";

export class ThemeController {
    private readonly prefs: Preferences;
    private readonly media: MediaQueryList | null;
    private readonly listeners = new Set<() => void>();
    private currentMode: ThemeMode;
    private currentDensity: Density;

    constructor(prefs: Preferences) {
        this.prefs = prefs;
        this.media =
            typeof window !== "undefined" && typeof window.matchMedia === "function"
                ? window.matchMedia("(prefers-color-scheme: dark)")
                : null;

        // The pre-paint script in index.html writes `light` or `dark` directly; it cannot
        // write `system` because it resolves the media query itself. The stored value is the
        // authority, and its absence means the visitor has never chosen, which is `system`.
        this.currentMode = prefs.readOneOf<ThemeMode>(MODE_KEY, THEME_MODES, "system");
        this.currentDensity = prefs.readOneOf<Density>(DENSITY_KEY, DENSITIES, "comfortable");

        this.media?.addEventListener("change", () => {
            if (this.currentMode === "system") this.apply();
        });

        this.apply();
    }

    get mode(): ThemeMode {
        return this.currentMode;
    }

    get density(): Density {
        return this.currentDensity;
    }

    /** What the page is actually showing right now, after `system` is resolved. */
    get resolved(): ResolvedTheme {
        if (this.currentMode !== "system") return this.currentMode;
        return this.media?.matches === true ? "dark" : "light";
    }

    setMode(mode: ThemeMode): void {
        if (mode === this.currentMode) return;
        this.currentMode = mode;
        this.prefs.write(MODE_KEY, mode);
        this.apply();
    }

    setDensity(density: Density): void {
        if (density === this.currentDensity) return;
        this.currentDensity = density;
        this.prefs.write(DENSITY_KEY, density);
        this.apply();
    }

    /** Return both choices to their defaults and forget the stored values. */
    reset(): void {
        this.prefs.remove(MODE_KEY);
        this.prefs.remove(DENSITY_KEY);
        this.currentMode = "system";
        this.currentDensity = "comfortable";
        this.apply();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private apply(): void {
        const root = document.documentElement;
        root.dataset.theme = this.resolved;
        root.dataset.density = this.currentDensity;
        root.dataset.themeMode = this.currentMode;
        for (const listener of [...this.listeners]) listener();
    }
}

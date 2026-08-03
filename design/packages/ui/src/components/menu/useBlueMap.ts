import { computed, inject, onBeforeUnmount, provide, watch } from "vue";
import type { ComputedRef, InjectionKey } from "vue";
import { useTheme } from "vuetify";
import type { BlueMapApp } from "@material-bluemap/viewer";

/**
 * Upstream reaches the running app through the `$bluemap` global property installed in
 * `webapp/src/main.js`. This port has no global: the shell owns the {@link BlueMapApp}
 * instance (it is recreated whenever the server profile changes), so menu components take
 * it either as a `bluemap` prop or through this injection key.
 *
 * The value is a computed ref rather than the app itself because the shell creates the app
 * asynchronously; every menu surface has to render the "no app yet" state and then light up
 * when it arrives.
 */
export const blueMapKey = Symbol("material-bluemap.app") as InjectionKey<
    ComputedRef<BlueMapApp | null>
>;

/** Publishes the running app to every menu component below this one. */
export function provideBlueMap(app: ComputedRef<BlueMapApp | null>): void {
    provide(blueMapKey, app);
}

/**
 * Resolves the running app: an explicit `bluemap` prop wins, otherwise the injected one.
 * Returns null when neither is available so callers can render a disabled/empty state
 * instead of throwing during setup.
 */
export function useBlueMap(
    explicit?: () => BlueMapApp | null | undefined,
): ComputedRef<BlueMapApp | null> {
    const injected = inject(blueMapKey, null);
    return computed(() => explicit?.() ?? injected?.value ?? null);
}

const THEME_NAMES = new Set(["dark", "light", "contrast"]);

/**
 * Bridges `appState.theme` (upstream's null | 'dark' | 'light' | 'contrast') onto the
 * Vuetify MD3 theme.
 *
 * `BlueMapApp.setTheme()` only toggles `theme-*` classes on the viewer's root element,
 * which the MD3 chrome does not read. Without this bridge the theme buttons would change
 * the marker colours and nothing else, which is exactly the "looks finished, does nothing"
 * failure. `null` means "follow the system", so we also track `prefers-color-scheme`.
 */
export function useBlueMapTheme(app: ComputedRef<BlueMapApp | null>): void {
    const theme = useTheme();
    const media =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-color-scheme: light)")
            : null;

    const apply = (): void => {
        const selected = app.value?.appState.theme ?? null;
        if (selected && THEME_NAMES.has(selected)) {
            theme.change(selected);
            return;
        }
        theme.change(media?.matches ? "light" : "dark");
    };

    watch(() => app.value?.appState.theme ?? null, apply, { immediate: true });
    media?.addEventListener("change", apply);
    onBeforeUnmount(() => media?.removeEventListener("change", apply));
}

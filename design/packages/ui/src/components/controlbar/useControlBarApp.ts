import { computed } from "vue";
import type { ComputedRef } from "vue";
import type { BlueMapApp } from "@worldlens/viewer";
import { blueMapApp } from "../../stores/bluemap.js";

/**
 * Resolves the running {@link BlueMapApp} for a control-bar component.
 *
 * Upstream reached the single instance through the `$bluemap` global property installed in
 * `webapp/src/main.js`. This port has no global: the shell recreates the app whenever the
 * active server profile changes, so the instance lives in the shared `stores/bluemap` handle.
 * An explicit `app` prop still wins, which keeps every component drivable from a test without
 * touching module state.
 *
 * Returns `null` before the app has loaded so callers render nothing rather than throwing
 * during setup.
 */
export function useControlBarApp(
    explicit?: () => BlueMapApp | null | undefined,
): ComputedRef<BlueMapApp | null> {
    return computed(() => explicit?.() ?? blueMapApp.value);
}

/**
 * Whether the platform asked for reduced motion.
 *
 * The compass reset and the day/night fade are 300ms animations driven from JavaScript, so a
 * CSS media query cannot switch them off. Both check this and jump straight to the end value.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

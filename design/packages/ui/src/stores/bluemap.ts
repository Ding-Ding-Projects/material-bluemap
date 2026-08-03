import { computed, shallowRef } from "vue";
import type { ComputedRef, ShallowRef } from "vue";
import type { BlueMapApp } from "@material-bluemap/viewer";
import type { BlueMapAppState } from "@material-bluemap/viewer";
import type { MapViewerData } from "@material-bluemap/viewer";
import type { MarkerSetData } from "@material-bluemap/viewer";

/**
 * Single shared handle on the live viewer.
 *
 * Upstream reached the one BlueMapApp instance through `this.$bluemap` on every component.
 * The port keeps that single-instance model but hands it out through this module instead of a
 * global property, because the app is torn down and rebuilt whenever the active server profile
 * changes. `shallowRef` is deliberate: `BlueMapApp` owns three.js objects that must never be
 * wrapped in a deep reactive proxy. Its `appState`, `mapViewer.data` and marker data are
 * already individually reactive (the viewer builds them through `makeReactive`), so reading
 * them through these computeds is reactive all the way down.
 *
 * Components MUST NOT keep their own copy of anything reachable from here. `appState.controls`
 * in particular is read by the control bar, the settings menu, the position input and the zoom
 * buttons at once; a local mirror desynchronises the moment any one of them writes.
 */
export const blueMapApp: ShallowRef<BlueMapApp | null> = shallowRef(null);

/** Replaces the live instance (or clears it). Called by MapView, which owns the lifecycle. */
export function setBlueMapApp(instance: BlueMapApp | null): void {
    blueMapApp.value = instance;
}

/** Reactive `appState`: controls, menu, maps, theme, screenshot, debug. Null before load. */
export const appState: ComputedRef<BlueMapAppState | null> = computed(
    () => blueMapApp.value?.appState ?? null,
);

/** Reactive `mapViewer.data`: mapState, map, uniforms, view distances, super-sampling. */
export const mapViewerData: ComputedRef<MapViewerData | null> = computed(
    () => blueMapApp.value?.mapViewer.data ?? null,
);

/** Reactive root marker set data (the recursive tree the marker menu walks). */
export const markerSetData: ComputedRef<MarkerSetData | null> = computed(
    () => blueMapApp.value?.mapViewer.markers.data ?? null,
);

/**
 * `"unloaded" | "loading" | "loaded" | "errored"`. Drives the centred map-state message and
 * gates every control that would otherwise touch a map that is not there.
 */
export const mapState: ComputedRef<string> = computed(
    () => mapViewerData.value?.mapState ?? "unloaded",
);

/** Upstream's `showMapMenu`: the map is at least far enough along to accept interaction. */
export const showMapMenu: ComputedRef<boolean> = computed(
    () => mapState.value === "loading" || mapState.value === "loaded",
);

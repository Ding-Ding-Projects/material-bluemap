/**
 * The live placement state, shared by every docked surface and by the settings reset.
 *
 * One module-level `ref` rather than a provide/inject tree, for the same reason the
 * appearance store keeps one: the control that resets every surface's placement lives
 * inside a surface that has a placement of its own, and threading a provider through
 * would mean the one component somebody forgets is the one that stops updating. Every
 * write goes through the pure functions in `dockPlacement.ts`, so what is persisted and
 * what is on screen cannot be two different things.
 *
 * ## The registry is a fact, not a claim
 *
 * A surface registers itself while it is mounted and drops out when it unmounts, exactly
 * as an appearance target does. The alternative - a hard-coded inventory of every docked
 * dialog the application is supposed to have - is a list of claims, and its first stale
 * entry is indistinguishable from a bug in the chooser. So the settings surface lists the
 * surfaces that are open right now, and the global reset clears the *stored* record
 * regardless, because a surface that is closed still has a remembered placement and a
 * reset that missed it would be a reset that did not reset.
 */

import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from "vue";

import {
    clearDockPlacements,
    readDockPlacements,
    withPlacement,
    withoutPlacement,
    writeDockPlacements,
    type DockPlacement,
    type DockPlacementRecord,
} from "./dockPlacement.js";

const placements = ref<DockPlacementRecord>(readDockPlacements());

/** One docked surface that exists right now, for the chooser and the settings list. */
export interface DockedSurfaceInfo {
    readonly id: string;
    /** Already translated. The surface knows its own name in the running language. */
    readonly label: string;
    readonly defaultPlacement: DockPlacement;
}

const registered = ref<DockedSurfaceInfo[]>([]);

/** The whole record, read-only to anything that only wants to render it. */
export function dockPlacementState(): Ref<DockPlacementRecord> {
    return placements;
}

/** Re-reads from storage, which is what a test needs between cases. */
export function reloadDockPlacements(): void {
    placements.value = readDockPlacements();
}

/** The placement a surface should use: the stored choice, or its own default. */
export function placementFor(surfaceId: string, fallback: DockPlacement): DockPlacement {
    return placements.value[surfaceId] ?? fallback;
}

/** True when this surface has a stored choice that a reset would remove. */
export function hasStoredPlacement(surfaceId: string): boolean {
    return placements.value[surfaceId] !== undefined;
}

export function setDockPlacement(surfaceId: string, placement: DockPlacement): void {
    placements.value = withPlacement(placements.value, surfaceId, placement);
    writeDockPlacements(placements.value);
}

/** Puts one surface back to its own default. */
export function resetDockPlacement(surfaceId: string): void {
    placements.value = withoutPlacement(placements.value, surfaceId);
    writeDockPlacements(placements.value);
}

/**
 * Puts every surface back to its default, including surfaces that are not open.
 *
 * The stored record is cleared rather than only the registered ids, because the whole
 * point of a global reset is the surface somebody cannot find their way back to.
 */
export function resetAllDockPlacements(): void {
    placements.value = {};
    clearDockPlacements();
}

/** How many surfaces have a stored choice, which is what the reset control reports. */
export function customisedSurfaceCount(): number {
    return Object.keys(placements.value).length;
}

export function registerDockedSurface(info: DockedSurfaceInfo): void {
    if (registered.value.some((entry) => entry.id === info.id)) return;
    registered.value = [...registered.value, info];
}

export function unregisterDockedSurface(id: string): void {
    registered.value = registered.value.filter((entry) => entry.id !== id);
}

/** Every docked surface mounted right now, in registration order. */
export function dockedSurfaces(): ComputedRef<DockedSurfaceInfo[]> {
    return computed(() => [...registered.value]);
}

/**
 * Registers a surface for as long as the calling component is mounted.
 *
 * Paired deliberately: an entry that outlived its component would put a row in the
 * settings list offering to move a panel that is not on screen.
 */
export function useRegisteredDockedSurface(info: () => DockedSurfaceInfo): void {
    onMounted(() => registerDockedSurface(info()));
    onBeforeUnmount(() => unregisterDockedSurface(info().id));
}

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAccountGroupOutline,
    mdiImageFilterCenterFocus,
    mdiMapMarkerOutline,
    mdiMapOutline,
} from "@mdi/js";
import type { BlueMapApp, MarkerSetData } from "@material-bluemap/viewer";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import CompassButton from "./CompassButton.vue";
import ControlsSwitch from "./ControlsSwitch.vue";
import DayNightSwitch from "./DayNightSwitch.vue";
import IconButton from "./IconButton.vue";
import MenuButton from "./MenuButton.vue";
import PositionInput from "./PositionInput.vue";
import { useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/ControlBar.vue`: the persistent strip over the map.
 *
 * Upstream drew one flex row of square buttons separated by 1px rules, floating on a
 * drop-shadow. That is legacy chrome and is gone. What survives is the information
 * architecture: a menu button and the quick jumps on the left, the view and camera controls
 * plus the live coordinates on the right, and a hard mobile fallback that drops everything
 * marked "thin hide" so a phone keeps the menu button, the coordinates and the compass.
 *
 * The bar renders as two MD3 surfaces rather than one, so the gap between them stays
 * click-through and the map is still draggable under the middle of the screen. That is the
 * same effect upstream got from a `pointer-events: none` root with each button opting back in.
 *
 * ### Appearance
 *
 * The whole bar is one `AppearanceTarget`, under `controlbar.bar`. A right-click anywhere the
 * bar actually paints - a cluster, a button, the coordinate fields - reaches its **Edit
 * appearance...** command; the transparent gap between the clusters stays click-through to
 * the map exactly as it always has, because `pointer-events: none` there means there is
 * nothing to right-click in the first place.
 */
const props = withDefaults(defineProps<{ app?: BlueMapApp | null }>(), { app: null });

const app = useControlBarApp(() => props.app);
const { t } = useI18n();

const appState = computed(() => app.value?.appState ?? null);
const viewer = computed(() => app.value?.mapViewer.data ?? null);
const rootMarkerSet = computed(() => app.value?.mapViewer.markers.data ?? null);

/** Upstream `showMapMenu`: the map is at least far enough along to accept interaction. */
const showMapMenu = computed(
    () => viewer.value?.mapState === "loading" || viewer.value?.mapState === "loaded",
);

const menuOpen = computed(() => appState.value?.menu.isOpen ?? false);

/** Upstream shows the map jump only when there is a choice to make. */
const showMapsButton = computed(() => (appState.value?.maps.length ?? 0) > 1);

/** Upstream `showViewControls`: one available view is not a switch. */
const showViewControls = computed(() => (viewer.value?.map?.views.length ?? 0) > 1);

/**
 * Upstream synthesised a `{fake: true}` set when `bm-players` was missing purely so the
 * template could read `.fake`. Null carries the same meaning without the decoy object.
 */
const playerMarkerSet = computed<MarkerSetData | null>(
    () => rootMarkerSet.value?.markerSets.find((set) => set.id === "bm-players") ?? null,
);

/**
 * Upstream `hasMarkers`: recursive, and deliberately skipping `bm-players` and `bm-popup-set`.
 * Get this wrong and the Markers button shows up on a map that only has players online, or
 * disappears on a map whose markers are nested one level down.
 */
function hasMarkers(markerSet: MarkerSetData): boolean {
    if (markerSet.markers.length > 0) return true;
    for (const set of markerSet.markerSets) {
        if (set.id !== "bm-players" && set.id !== "bm-popup-set") {
            if (hasMarkers(set)) return true;
        }
    }
    return false;
}

const showMarkerMenu = computed(() =>
    rootMarkerSet.value ? hasMarkers(rootMarkerSet.value) : false,
);

function openMenu(): void {
    appState.value?.menu.reOpenPage();
}

/**
 * Page titles are passed as functions, which `MainMenu.openPage` stores behind a getter: an
 * open menu heading then re-translates when the language changes instead of freezing in the
 * language it was opened in.
 */
function openMaps(): void {
    appState.value?.menu.openPage("maps", () => t("maps.title", "Maps"));
}

function openMarkers(): void {
    const set = rootMarkerSet.value;
    if (!appState.value || !set) return;
    appState.value.menu.openPage("markers", () => t("markers.title", "Markers"), {
        markerSet: set,
    });
}

function openPlayers(): void {
    const set = playerMarkerSet.value;
    if (!appState.value || !set) return;
    appState.value.menu.openPage("markers", () => t("players.title", "Players"), {
        markerSet: set,
    });
}

function resetCamera(): void {
    app.value?.resetCamera();
}
</script>

<template>
    <AppearanceTarget
        v-if="app"
        id="controlbar.bar"
        :label="t('appearance.target.controlbar.bar', 'The map control bar')"
        as="div"
    >
        <div class="mb-cb">
            <div class="mb-cb__cluster mb-cb__cluster--start">
                <MenuButton
                    :label="t('menu.tooltip', 'Menu')"
                    :close="menuOpen"
                    :expanded="menuOpen"
                    @action="openMenu"
                />
                <IconButton
                    v-if="showMapsButton"
                    class="mb-cb__thin-hide"
                    :icon="mdiMapOutline"
                    :label="t('maps.tooltip', 'Map-List')"
                    @action="openMaps"
                />
                <IconButton
                    v-if="showMapMenu && showMarkerMenu"
                    class="mb-cb__thin-hide"
                    :icon="mdiMapMarkerOutline"
                    :label="t('markers.tooltip', 'Marker-List')"
                    @action="openMarkers"
                />
                <IconButton
                    v-if="showMapMenu && playerMarkerSet"
                    class="mb-cb__thin-hide"
                    :icon="mdiAccountGroupOutline"
                    :label="t('players.tooltip', 'Player-List')"
                    @action="openPlayers"
                />
            </div>

            <div v-if="showMapMenu" class="mb-cb__cluster mb-cb__cluster--end">
                <DayNightSwitch
                    class="mb-cb__thin-hide"
                    :app="app"
                    :label="t('lighting.dayNightSwitch.tooltip', 'Day/Night')"
                />
                <ControlsSwitch v-if="showViewControls" class="mb-cb__thin-hide" :app="app" />
                <IconButton
                    class="mb-cb__thin-hide"
                    :icon="mdiImageFilterCenterFocus"
                    :label="t('resetCamera.tooltip', 'Reset Camera & Position')"
                    @action="resetCamera"
                />
                <PositionInput class="mb-cb__position" :app="app" />
                <CompassButton :app="app" :label="t('compass.tooltip', 'Compass / Face North')" />
            </div>
        </div>
    </AppearanceTarget>
</template>

<style>
/*
 * Everything below is deliberately unscoped and namespaced under `.mb-cb-`: the bar has to
 * reach into Vuetify's own component internals (field padding, icon-button box) and a scoped
 * block cannot do that without `:deep()` on every rule.
 */
.mb-cb {
    position: fixed;
    /*
     * Below the application's own title bar, not over it. AppTitleBar publishes
     * --mb-titlebar-height on the document element in the desktop build (the same
     * property #map-container reads); anchored at a literal 0 this bar floated over
     * the window chrome - the menu button covered the logo and title, and the
     * top-right cluster sat exactly on the minimize/maximize/close buttons.
     * A browser build sets no property and keeps the whole viewport.
     */
    top: var(--mb-titlebar-height, 0px);
    right: 0;
    left: 0;
    z-index: 3;

    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    /* Respect notches / rounded display corners without clipping the first button. */
    padding-top: max(8px, env(safe-area-inset-top));
    padding-left: max(8px, env(safe-area-inset-left));
    padding-right: max(8px, env(safe-area-inset-right));

    /*
     * The bar floats over the map. Only the solid clusters take pointer input, so the gap
     * between them stays draggable, exactly as upstream's `pointer-events: none` root with
     * per-button opt-in did. `.mb-main { pointer-events: none }` in App.vue means anything
     * added here must opt back in explicitly.
     */
    pointer-events: none;

    --mb-cb-size: 40px;
}

/* Touch pointers get the 48px target the accessibility guidance asks for. */
@media (pointer: coarse) {
    .mb-cb {
        --mb-cb-size: 48px;
    }
}

.mb-cb__cluster {
    pointer-events: auto;

    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 4px;

    border-radius: calc(var(--mb-cb-size) / 2 + 4px);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    /* MD3 elevation level 2. */
    box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.3),
        0 2px 6px 2px rgba(0, 0, 0, 0.15);
}

/*
 * `flex: 0 1 auto` on purpose: a growing end cluster would paint its surface across the whole
 * remaining width and swallow the click-through gap in the middle of the bar.
 */
.mb-cb__cluster--end {
    flex: 0 1 auto;
}

.mb-cb__position {
    flex: 1 1 12rem;
    min-width: 9rem;
    max-width: 20rem;
}

/*
 * `flex: 0 0 auto` so a narrow viewport squeezes the coordinate fields, which can take it,
 * rather than deforming the round buttons below their hit target.
 */
.mb-cb-btn.v-btn--icon {
    flex: 0 0 auto;
    width: var(--mb-cb-size, 40px);
    height: var(--mb-cb-size, 40px);
    min-width: var(--mb-cb-size, 40px);
}

@media (max-width: 575.98px) {
    /*
     * This is the mobile information architecture, not a cosmetic tweak: below this width the
     * bar keeps only the menu button, the coordinates and the compass, and everything else is
     * reached through the side menu. Edge to edge on a solid surface, as upstream.
     */
    .mb-cb {
        flex-wrap: nowrap;
        gap: 0;
        padding: 0;
        padding-top: env(safe-area-inset-top);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);

        pointer-events: auto;
        background: rgb(var(--v-theme-surface));
        color: rgb(var(--v-theme-on-surface));
        box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.3),
            0 2px 6px 2px rgba(0, 0, 0, 0.15);
    }

    .mb-cb__cluster {
        border-radius: 0;
        background: none;
        box-shadow: none;
    }

    .mb-cb__cluster--end {
        flex: 1 1 auto;
        justify-content: flex-end;
    }

    .mb-cb__position {
        flex: 1 1 auto;
        max-width: none;
    }

    /*
     * `!important` because Vuetify's own `.v-btn { display: inline-grid }` has the same
     * specificity and there is no guaranteed stylesheet order between the two.
     */
    .mb-cb__thin-hide {
        display: none !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-cb *,
    .mb-cb *::before,
    .mb-cb *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
    }
}
</style>

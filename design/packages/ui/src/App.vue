<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiServerNetwork } from "@mdi/js";
import type { MenuPage } from "@material-bluemap/viewer";
import MapView from "./components/MapView.vue";
import ProfileManager from "./components/ProfileManager.vue";
import ZoomButtons from "./components/controls/ZoomButtons.vue";
import FreeFlightMobileControls from "./components/controls/FreeFlightMobileControls.vue";
import { ControlBar } from "./components/controlbar/index.js";
import { MainMenu, provideBlueMap, useBlueMapTheme } from "./components/menu/index.js";
import { MarkerMenu } from "./components/markers/index.js";
import type { AnyMarkerSetData } from "./components/markers/markerTypes.js";
import { profilesStore } from "./stores/profiles.js";
import { appState, blueMapApp, mapState, showMapMenu } from "./stores/bluemap.js";

const { t } = useI18n();

/**
 * The menu components resolve the running app through this injection key (their port of
 * upstream's `$bluemap` global property), and the theme bridge maps `appState.theme` onto the
 * Vuetify MD3 theme. Both belong to the shell, so they are installed once, here.
 */
const currentApp = computed(() => blueMapApp.value);
provideBlueMap(currentApp);
useBlueMapTheme(currentApp);

/** Port addition with no upstream counterpart: the server-profile manager. */
const profilesOpen = ref(false);

/** Upstream renders the map state as `$t("map." + mapState)`; these are the en.conf strings. */
const MAP_STATE_FALLBACK: Record<string, string> = {
    unloaded: "No map loaded.",
    loading: "Loading map...",
    errored: "There was an error trying to load this map!",
};

const mapStateMessage = computed(() =>
    t("map." + mapState.value, MAP_STATE_FALLBACK[mapState.value] ?? mapState.value),
);

/**
 * `appState.controls.state` is the single source of truth for the view mode. It is written
 * only at the end of a view transition, so read it, never mirror it.
 */
const freeFlight = computed(() => appState.value?.controls.state === "free");

const showFreeFlightControls = computed(() => mapState.value === "loaded" && freeFlight.value);

const showZoomButtons = computed(
    () =>
        showMapMenu.value &&
        (appState.value?.controls.showZoomButtons ?? false) &&
        !freeFlight.value,
);

/**
 * `MenuPage` carries page data behind an index signature, so the marker set the page was
 * opened with arrives as `unknown`.
 */
function pageMarkerSet(page: MenuPage | null | undefined): AnyMarkerSetData | null {
    return (page?.markerSet as AnyMarkerSetData | undefined) ?? null;
}
</script>

<template>
    <v-app class="mb-app">
        <v-main class="mb-main">
            <MapView v-if="profilesStore.activeId" :key="profilesStore.activeId" />

            <!--
                Render order mirrors upstream's #app: the free-flight arrows, the zoom buttons,
                the control bar, the map-state message, then the menu. Every interactive leaf
                opts back into pointer events (`.mb-interactive`, or its own rule) because
                v-main stays click-through so the map can be dragged between the controls.
            -->
            <FreeFlightMobileControls v-if="showFreeFlightControls" />
            <ZoomButtons v-if="showZoomButtons" />

            <ControlBar />

            <div v-if="mapState !== 'loaded'" class="mb-map-state" role="status" aria-live="polite">
                {{ mapStateMessage }}
            </div>

            <!--
                The menu owns the page stack (`appState.menu`), which the control bar pushes
                onto. Its "markers" page is a slot because the marker list lives in its own
                component; `page.markerSet` is whatever the opener put there, which is the root
                set for the Markers button and the `bm-players` set for the Players button.
            -->
            <MainMenu>
                <template #markers="{ page, menu }">
                    <MarkerMenu
                        v-if="blueMapApp"
                        :app="blueMapApp"
                        :menu="menu"
                        :marker-set="pageMarkerSet(page)"
                    />
                </template>
            </MainMenu>

            <!--
                Shell-only control: server profiles have no upstream counterpart, so they are
                not in the ported menu. It sits opposite the zoom cluster and lifts clear of
                the free-flight movement arrows when those are on screen.
            -->
            <v-tooltip :text="t('servers.title', 'Servers')" location="end">
                <template #activator="{ props: tooltipProps }">
                    <v-btn
                        v-bind="tooltipProps"
                        class="mb-shell-fab mb-interactive"
                        :class="{ 'mb-shell-fab--lifted': showFreeFlightControls }"
                        :icon="mdiServerNetwork"
                        color="surface"
                        variant="flat"
                        elevation="3"
                        :aria-label="t('servers.title', 'Servers')"
                        :aria-expanded="profilesOpen"
                        @click="profilesOpen = true"
                    />
                </template>
            </v-tooltip>

            <v-overlay v-model="profilesOpen" class="align-center justify-center" contained>
                <ProfileManager @close="profilesOpen = false" />
            </v-overlay>
        </v-main>
    </v-app>
</template>

<style scoped>
/*
 * Layering, pointer-events and the map/chrome stacking order all live in styles/global.scss,
 * because they are properties of the #app / #map-container pair rather than of this component.
 */
.mb-map-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: min(90vw, 40rem);
    padding: 0 1rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
    text-align: center;
    text-wrap: balance;
    pointer-events: none;
}

.mb-shell-fab {
    position: fixed;
    left: calc(12px + env(safe-area-inset-left, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: 48px;
    height: 48px;
    opacity: 0.94;
}

.mb-shell-fab:hover,
.mb-shell-fab:focus-visible {
    opacity: 1;
}

/*
 * The free-flight movement cluster takes the bottom-left corner, so this steps above it.
 * The sizes come from the shared tokens in global.scss so the two cannot drift apart.
 */
.mb-shell-fab--lifted {
    bottom: calc(
        24px + env(safe-area-inset-bottom, 0px) + 2 * var(--mb-ff-size) + var(--mb-ff-gap)
    );
}

.mb-shell-fab :deep(.v-icon) {
    color: rgb(var(--v-theme-primary));
}
</style>

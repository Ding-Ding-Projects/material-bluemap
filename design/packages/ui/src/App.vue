<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCog, mdiServerNetwork } from "@mdi/js";
import type { MenuPage } from "@material-bluemap/viewer";
import MapView from "./components/MapView.vue";
import ProfileManager from "./components/ProfileManager.vue";
import ZoomButtons from "./components/controls/ZoomButtons.vue";
import FreeFlightMobileControls from "./components/controls/FreeFlightMobileControls.vue";
import { ControlBar } from "./components/controlbar/index.js";
import { MainMenu, provideBlueMap, useBlueMapTheme } from "./components/menu/index.js";
import { MarkerMenu } from "./components/markers/index.js";
import type { AnyMarkerSetData } from "./components/markers/markerTypes.js";
import { AppTitleBar } from "./components/shell/index.js";
import { FirstRunSetup } from "./components/setup/index.js";
import { AppSettings, type SettingsAnchor } from "./components/settings/index.js";
import { WorldScreen } from "./components/world/index.js";
import type { SettingsTarget } from "./components/world/index.js";
import { addLocalMap, profilesStore } from "./stores/profiles.js";
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

/* -------------------------------------------------------------------------- */
/* Making a map                                                               */
/* -------------------------------------------------------------------------- */

/**
 * With nothing chosen, the application offers to make a map rather than saying it has none.
 *
 * "No map loaded." was literally true and completely useless: it named a state without
 * naming the one action that leaves it, on the first screen of a fresh install, where
 * that action is the only thing anybody wants. The wizard behind it was built, tested and
 * unreachable - which is this project's recurring defect, not a missing feature.
 */
const showWorldScreen = computed(() => profilesStore.activeId === null);

/**
 * A finished render becomes an entry in the same map list a remote server uses, and is
 * opened by making it active. The viewer needs no idea which of the two it is looking at:
 * the profile carries the data root, and `LocalMapHandler` serves it off the disk.
 */
function openRenderedMap(dataRoot: string, mapIds: readonly string[]): void {
    const label = mapIds.length > 0 ? mapIds.join(", ") : t("world.rendered", "Rendered map");
    const profile = addLocalMap(dataRoot, label);
    profilesStore.activeId = profile.id;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const settingsOpen = ref(false);
const settingsAnchor = ref<SettingsAnchor | null>(null);
const settingsMissing = ref(false);

function openSettings(anchor: SettingsAnchor | null = null, missing = false): void {
    settingsAnchor.value = anchor;
    settingsMissing.value = missing;
    settingsOpen.value = true;
}

/**
 * A render that failed for a fixable reason says which setting would fix it. This is the
 * other end of that: it opens the surface *and* reveals the exact control, because
 * landing somebody on a settings page and leaving them to find the row is the difference
 * between a remedy and a hint.
 */
function revealSetting(target: SettingsTarget): void {
    openSettings(target.anchor, target.missing);
}

/* -------------------------------------------------------------------------- */
/* Viewer chrome                                                              */
/* -------------------------------------------------------------------------- */

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
 * The map's own chrome is for a map. With the wizard up there is nothing behind it to
 * zoom, tilt or drop a marker on, so a control bar floating over it would be a row of
 * buttons that do nothing - which is the decorative-control failure this project keeps
 * finding, just at shell level.
 */
const showViewerChrome = computed(() => !showWorldScreen.value);

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
        <!--
            The window's own chrome. Frameless means the operating system draws no caption
            bar, so this is it; in a browser build the component renders nothing at all.
        -->
        <AppTitleBar />

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

            <ControlBar v-if="showViewerChrome" />

            <!--
                The one surface that is not an overlay: it fills the map area, takes pointer
                events, and scrolls, because the wizard is taller than a short window and the
                step buttons must never be the thing that ends up off-screen.
            -->
            <div v-if="showWorldScreen" class="mb-world-host mb-interactive">
                <WorldScreen
                    @consent="openSettings('mojang-download-consent')"
                    @settings="revealSetting"
                    @open-map="openRenderedMap"
                />
            </div>

            <div
                v-else-if="mapState !== 'loaded'"
                class="mb-map-state"
                role="status"
                aria-live="polite"
            >
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
                Shell-only controls: settings and server profiles have no upstream counterpart,
                so they are not in the ported menu. They sit opposite the zoom cluster and lift
                clear of the free-flight movement arrows when those are on screen.
            -->
            <div
                class="mb-shell-fabs"
                :class="{ 'mb-shell-fabs--lifted': showFreeFlightControls }"
            >
                <v-tooltip :text="t('settings.title', 'Settings')" location="end">
                    <template #activator="{ props: tooltipProps }">
                        <v-btn
                            v-bind="tooltipProps"
                            class="mb-shell-fab mb-interactive"
                            :icon="mdiCog"
                            color="surface"
                            variant="flat"
                            elevation="3"
                            :aria-label="t('settings.title', 'Settings')"
                            :aria-expanded="settingsOpen"
                            @click="openSettings()"
                        />
                    </template>
                </v-tooltip>

                <v-tooltip :text="t('servers.title', 'Servers')" location="end">
                    <template #activator="{ props: tooltipProps }">
                        <v-btn
                            v-bind="tooltipProps"
                            class="mb-shell-fab mb-interactive"
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
            </div>

            <v-overlay v-model="profilesOpen" class="align-center justify-center" contained>
                <ProfileManager @close="profilesOpen = false" />
            </v-overlay>

            <AppSettings
                :open="settingsOpen"
                :anchor="settingsAnchor"
                :anchor-missing="settingsMissing"
                @update:open="settingsOpen = $event"
            />
        </v-main>

        <!--
            First-run setup decides for itself whether this is a first launch and stays
            invisible when it is not. It is mounted outside v-main so its blocking dialog -
            the only one in this application - is never a child of a click-through layer.
        -->
        <FirstRunSetup />
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

/*
 * Opaque on purpose. There is no map behind the wizard - `#map-container` is empty until
 * one is opened - so a translucent panel would sit over the window background and read as
 * a rendering fault rather than as a surface.
 */
.mb-world-host {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: rgb(var(--v-theme-background));
}

.mb-shell-fabs {
    position: fixed;
    left: calc(12px + env(safe-area-inset-left, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/*
 * The free-flight movement cluster takes the bottom-left corner, so this steps above it.
 * The sizes come from the shared tokens in global.scss so the two cannot drift apart.
 */
.mb-shell-fabs--lifted {
    bottom: calc(
        24px + env(safe-area-inset-bottom, 0px) + 2 * var(--mb-ff-size) + var(--mb-ff-gap)
    );
}

.mb-shell-fab {
    width: 48px;
    height: 48px;
    opacity: 0.94;
}

.mb-shell-fab:hover,
.mb-shell-fab:focus-visible {
    opacity: 1;
}

.mb-shell-fab :deep(.v-icon) {
    color: rgb(var(--v-theme-primary));
}
</style>

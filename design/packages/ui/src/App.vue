<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCloudSyncOutline,
    mdiCloudUploadOutline,
    mdiCog,
    mdiFileCogOutline,
    mdiFolderMultipleOutline,
    mdiMapOutline,
    mdiMapPlus,
    mdiServerNetwork,
    mdiWeb,
} from "@mdi/js";
import type { MenuPage } from "@material-bluemap/viewer";
import MapView from "./components/MapView.vue";
import ProfileManager from "./components/ProfileManager.vue";
import ZoomButtons from "./components/controls/ZoomButtons.vue";
import FreeFlightMobileControls from "./components/controls/FreeFlightMobileControls.vue";
import { ControlBar } from "./components/controlbar/index.js";
import { ConfigNotifications, ConfigScreen } from "./components/config/index.js";
import { MainMenu, provideBlueMap, useBlueMapTheme } from "./components/menu/index.js";
import { MarkerMenu } from "./components/markers/index.js";
import type { AnyMarkerSetData } from "./components/markers/markerTypes.js";
import { AppTitleBar } from "./components/shell/index.js";
import { FirstRunSetup } from "./components/setup/index.js";
import { AppSettings, type SettingsAnchor } from "./components/settings/index.js";
import { WorldScreen } from "./components/world/index.js";
import { ProjectsScreen } from "./components/project/index.js";
import { CiRenderScreen } from "./components/cirender/index.js";
import { CommandPalette, usePaletteShortcut } from "./components/palette/index.js";
import { AppearanceTarget } from "./components/appearance/index.js";
import { TabbedNavigation, type TabPage } from "./components/tabs/index.js";
import { BackupScreen } from "./components/backup/index.js";
import PagesScreen from "./components/pages/PagesScreen.vue";
import { UpdateBanner, createUpdates } from "./components/update/index.js";
import type { SettingsTarget } from "./components/world/index.js";
import { addLocalMap, profilesStore } from "./stores/profiles.js";
import { appState, blueMapApp, mapState, showMapMenu } from "./stores/bluemap.js";
import { notices, raiseNotice } from "./stores/notices.js";

const { t } = useI18n();

/**
 * The menu components resolve the running app through this injection key (their port of
 * upstream's `$bluemap` global property), and the theme bridge maps `appState.theme` onto the
 * Vuetify MD3 theme. Both belong to the shell, so they are installed once, here.
 */
const currentApp = computed(() => blueMapApp.value);
provideBlueMap(currentApp);
useBlueMapTheme(currentApp);

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The shell is three pages behind one strip, not one screen that swaps itself out.
 *
 * Everything this application does used to happen in the same rectangle: the map filled it,
 * the wizard covered the map when no profile was chosen, and the server list arrived as an
 * overlay on top of both. Which of them you were looking at was decided by state you could
 * not see - `profilesStore.activeId === null` - so there was no way to open the wizard while
 * a map was loaded, and no way to look at the map without leaving the wizard. Tabs replace
 * that with a place you can point at: three destinations, all reachable at any time, and the
 * one you were last on restored on the next launch.
 *
 * The ids are constants rather than inline strings because each one is written three times -
 * in this list, in the template's slot name, and wherever something navigates to it - and a
 * page whose slot name has drifted from its id renders the tab system's honest "this build
 * has no content for that page" message rather than failing loudly.
 */
const PAGE_MAP = "map";
const PAGE_WORLD = "world";
const PAGE_PROJECTS = "projects";
const PAGE_CIRENDER = "cirender";
const PAGE_SERVERS = "servers";
const PAGE_BACKUPS = "backups";
const PAGE_PAGES = "pages";

const pages = computed<TabPage[]>(() => [
    { id: PAGE_MAP, label: t("tabs.page.map", "Map"), icon: mdiMapOutline },
    { id: PAGE_WORLD, label: t("tabs.page.world", "Make a map"), icon: mdiMapPlus },
    // Next to the guide rather than at the end of the strip, because they are the two ends
    // of one job: the guide asks five questions and writes a project, and this is where
    // every other setting that project can carry actually lives.
    { id: PAGE_PROJECTS, label: t("tabs.page.projects", "Projects"), icon: mdiFolderMultipleOutline },
    // The fourth answer to "where does this render run": GitHub's machines do the work and
    // this one only uploads and downloads. It is a page rather than a radio button on the
    // guide because it is a workflow - a repository, two consents, an upload, and a run
    // watched job by job - and the guide's "where it runs" card links straight to it, so all
    // four places are named in one list without four screens to discover separately.
    { id: PAGE_CIRENDER, label: t("tabs.page.ciRender", "GitHub runners"), icon: mdiCloudSyncOutline },
    { id: PAGE_SERVERS, label: t("tabs.page.servers", "Maps and servers"), icon: mdiServerNetwork },
    { id: PAGE_BACKUPS, label: t("tabs.page.backups", "Backups"), icon: mdiCloudUploadOutline },
    { id: PAGE_PAGES, label: t("tabs.page.pages", "Publish to Pages"), icon: mdiWeb },
]);

const tabs = ref<InstanceType<typeof TabbedNavigation> | null>(null);

/**
 * Navigating from outside the strip.
 *
 * The palette offers the same destinations the tabs do, and finishing a render is a reason to
 * land on the map. Both go through the tab component rather than through a second copy of the
 * shell's navigation state, because two sources of truth for "which page is showing" is how a
 * palette ends up sending somebody to a screen the strip stopped drawing.
 */
function revealPage(pageId: string): void {
    tabs.value?.revealPage(pageId);
}

/**
 * Which page is on screen, for the chrome that belongs to one of them.
 *
 * Read back from the tab component rather than mirrored here. Only the shell-level furniture
 * needs it: everything inside a page slot already knows, because a slot that is not the active
 * one is never rendered at all.
 */
const mapPageActive = computed(() => tabs.value?.activePage?.id === PAGE_MAP);

/**
 * Opening a link the application does not draw itself.
 *
 * `window.open` rather than a bridge call: the shell denies the popup and hands the URL to
 * the system browser, which is the one route that already refuses anything that is not
 * HTTPS. A renderer that opened URLs itself would be a second policy to keep in step.
 */
/**
 * The updater, mounted once for the whole shell.
 *
 * One controller, because two would each check on their own schedule and each stage their
 * own copy - and the banner and the settings row would then disagree about what is ready.
 * A refusal becomes an ordinary notice rather than a thrown error: "a render is running"
 * is a sentence, not a fault.
 */
const updates = createUpdates({
    onRefusal: (message: string) => {
        raiseNotice("warning", message);
    },
});
const restartingForUpdate = ref(false);

async function restartForUpdate(): Promise<void> {
    restartingForUpdate.value = true;
    try {
        await updates.restart();
    } finally {
        restartingForUpdate.value = false;
    }
}

function openInBrowser(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Restoring a backup, which is the downloads surface's job and not a second downloader.
 *
 * The backup screen has already chosen the release and the asset; the settings surface is
 * where the parts are fetched, verified against their published digests and rejoined. This
 * only carries the choice there and says what happened, because a Restore button that
 * silently changes a screen the person is not looking at reads as a button that did
 * nothing.
 */
function revealBackupRestore(where: { owner: string; repo: string; tag: string; asset: string }): void {
    openSettings();
    raiseNotice(
        "info",
        t(
            "backup.restoreHandoff",
            { asset: where.asset, repo: `${where.owner}/${where.repo}` },
            "Downloads is open. Fetch {asset} from {repo} there: every part is checked against its published digest before anything is written.",
        ),
    );
}

/* -------------------------------------------------------------------------- */
/* Making a map                                                               */
/* -------------------------------------------------------------------------- */

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

/**
 * A map that GitHub's runners produced, opened exactly as a local render's is.
 *
 * By the time this fires the map has already been downloaded and registered on this
 * machine, so there is no second case to handle: the profile carries a data root and the
 * viewer neither knows nor needs to know which of the four places drew the tiles.
 */
function openCiRenderedMap(where: { renderId: string; dataRoot: string; mapId: string }): void {
    openRenderedMap(where.dataRoot, [where.mapId]);
}

/**
 * Which world's project the projects page should open when it gets there.
 *
 * The guide writes a project and offers to open it, and the world somebody chose may
 * already have had one. Both land here, and the page reads it as a prop rather than being
 * called as a component: a tab panel that is not the active one is never rendered, so at
 * the moment this decides to navigate there is no component to call a method on.
 */
const projectToOpen = ref<string | null>(null);

function openProject(world: string): void {
    projectToOpen.value = world;
    revealPage(PAGE_PROJECTS);
}

/**
 * Choosing a map takes you to the map.
 *
 * The two places that set an active profile - the wizard finishing a render, and a row in the
 * maps-and-servers list - are both on a different page from the one the map draws on, so
 * without this the user's chosen map would load correctly and invisibly behind whichever page
 * they were still looking at. Watching the store rather than calling this from both sites is
 * what keeps a third caller from having to remember.
 */
watch(
    () => profilesStore.activeId,
    (id) => {
        if (id !== null) revealPage(PAGE_MAP);
    },
);

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const settingsOpen = ref(false);
const settingsAnchor = ref<SettingsAnchor | null>(null);
const settingsMissing = ref(false);

/**
 * Bumped every time the settings surface closes.
 *
 * The shell is the only thing that knows this happened. Settings is an in-app dialog rather
 * than another window, so a surface underneath it sees no focus or visibility event when it
 * closes - and the Mojang download consent, which the wizard and the projects screen both
 * point people at, is changed inside it.
 *
 * That was a real defect: the review step warned that consent was missing, its
 * **Open the setting** button opened Settings, accepting there worked and persisted, and
 * the warning stayed for the life of the window because consent had been sampled once at
 * mount and never read again. The counter is how the surfaces underneath find out.
 * `components/world/consentState.ts` records why this is a fallback for a shared store.
 */
const settingsEpoch = ref(0);

watch(settingsOpen, (open) => {
    if (!open) settingsEpoch.value += 1;
});

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
/* Server configuration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The options editor, which is a workbench rather than a page.
 *
 * Seven screens, a search that reaches every setting on all of them, and a save plan that
 * states what is about to be written - so it keeps the full-bleed host it has always had,
 * covering the whole shell including the tab strip, rather than becoming a fourth tab. That
 * is deliberate: a tab is somewhere you leave and come back to, and this is a surface you
 * either save or abandon. Escape is the way out, and the tab strip underneath is made inert
 * while it is open so nothing behind an opaque surface can still be reached with Tab.
 */
const configOpen = ref(false);
const configHost = ref<HTMLElement | null>(null);

/**
 * The button is found by id rather than by a template ref because it is a tooltip
 * activator, and `v-bind="tooltipProps"` carries a `ref` of Vuetify's own that quietly
 * wins over one written beside it - leaving the ref null and the focus on `<body>`. The id
 * is generated rather than spelled out so nothing else in the document can collide with it.
 */
const configFabId = useId();

function openConfig(): void {
    configOpen.value = true;
    // The host is focused so Escape works from the first keystroke. Left alone, focus stays
    // on the button the surface has just covered, and the key that closes this only works
    // once the user has clicked something inside it.
    void nextTick(() => configHost.value?.focus());
}

/** Escape and a finished save both land here, and focus goes back to the button that opened it. */
function closeConfig(): void {
    configOpen.value = false;
    void nextTick(() => document.getElementById(configFabId)?.focus());
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One shortcut over every command, setting and destination the app has.
 *
 * It opens nothing itself. Every destination it offers emits back to this component, so
 * the code that actually opens these surfaces stays in the one place that already owns it
 * rather than being copied into a second component that would then drift out of step -
 * which is how a palette ends up sending somebody to a screen the shell stopped using.
 *
 * `usePaletteShortcut` binds the window in the capture phase, so the chord works from
 * inside a text field, and calls `preventDefault` only when it actually matched.
 */
const paletteOpen = ref(false);
usePaletteShortcut(paletteOpen);

/**
 * A save happened, so the editor steps out of the way and says where it wrote.
 *
 * `saved(folder)` exists so a shell can offer to start a render, and this one deliberately
 * does not: nothing yet takes a config folder to the render engine, and an offer that
 * leads nowhere is worse than no offer. The folder is named because it is the one fact the
 * user cannot recover once this surface closes over it.
 */
function configSaved(folder: string): void {
    closeConfig();
    raiseNotice(
        "success",
        t("config.saved", { folder }, "Saved the BlueMap configuration in {folder}."),
    );
}

/* -------------------------------------------------------------------------- */
/* Viewer chrome                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `appState.controls.state` is the single source of truth for the view mode. It is written
 * only at the end of a view transition, so read it, never mirror it.
 */
const freeFlight = computed(() => appState.value?.controls.state === "free");

/**
 * The free-flight cluster is gated on the map page as well as on the view mode, because the
 * shell's own button column has to step above it and that column is on screen whatever page
 * is showing. Gate only on the mode and the buttons lift over an empty corner whenever
 * somebody in free flight looks at the server list.
 */
const showFreeFlightControls = computed(
    () => mapPageActive.value && mapState.value === "loaded" && freeFlight.value,
);

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
 * The map's own chrome is for a map, and now the page it belongs to says so.
 *
 * Its "is there anything behind this to zoom, tilt or drop a marker on" question used to be
 * answered by `!showWorldScreen`; the control bar lives inside the map page's slot now, and a
 * slot that is not the active one is never rendered, so the page answers it instead. What is
 * left is the case a page boundary cannot see: the options editor is an opaque surface laid
 * over the whole shell, and the control bar is `z-index: 3` against its `auto`, so without
 * this it would float on top of the editor aiming at a map nobody can see.
 */
const showViewerChrome = computed(() => !configOpen.value);

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

            It is the first appearance target because it is the first thing a person sees and
            the one piece of chrome that is on screen no matter what they are doing.
        -->
        <AppearanceTarget
            id="app.titleBar"
            :label="t('appearance.target.app.titleBar', 'The window title bar')"
            as="div"
        >
            <AppTitleBar />
        </AppearanceTarget>

        <!--
            Under the title bar and above everything else, because an update that is ready
            is worth seeing and worth nothing if it interrupts. It never covers a page, and
            it waits: restarting is the person's decision and the render guard is re-read
            at the moment they press it.
        -->
        <UpdateBanner
            :model="updates.banner.value"
            :busy="restartingForUpdate"
            @restart="restartForUpdate"
            @dismiss="updates.dismiss()"
            @open-notes="openInBrowser"
        />

        <v-main class="mb-main">
            <!--
                The viewer, which renders into #map-container rather than into this tree, so
                it stays mounted at shell level and keyed on the profile exactly as before.
                Putting it inside the map page's slot would dispose the whole renderer every
                time somebody glanced at another tab.
            -->
            <MapView v-if="profilesStore.activeId" :key="profilesStore.activeId" />

            <!--
                The strip and its pages. Made inert rather than unmounted while the options
                editor is open, for the same reason the editor's own comment gives: the page
                behind an opaque surface must not still be reachable with Tab, and tearing it
                down would lose whatever step of the wizard somebody was on.
            -->
            <div class="mb-shell-tabs" :inert="configOpen">
                <AppearanceTarget
                    id="app.tabBar"
                    :label="t('appearance.target.app.tabBar', 'The tab bar')"
                    as="div"
                >
                    <TabbedNavigation ref="tabs" :pages="pages">
                        <!--
                            The map page draws nothing of its own: the canvas is behind the
                            whole application layer, so this page is a transparent,
                            click-through frame that lets the map be dragged and carries the
                            chrome that only makes sense over one.
                        -->
                        <template #map>
                            <div class="mb-map-page">
                                <FreeFlightMobileControls v-if="showFreeFlightControls" />
                                <ZoomButtons v-if="showZoomButtons" />

                                <ControlBar v-if="showViewerChrome" />

                                <div v-if="mapState !== 'loaded'" class="mb-map-state">
                                    <!--
                                        The live region is the sentence and only the sentence.
                                        A button inside it would be re-announced every time the
                                        map moved between loading, loaded and errored, which
                                        turns a status update into a repeated instruction.
                                    -->
                                    <p class="mb-map-state__line" role="status" aria-live="polite">
                                        {{ mapStateMessage }}
                                    </p>

                                    <!--
                                        "No map loaded." names a state and not the one action
                                        that leaves it. With nothing chosen at all the message
                                        keeps its own tab company: the strip already offers the
                                        wizard, and this puts the same door where the person is
                                        actually looking.
                                    -->
                                    <v-btn
                                        v-if="profilesStore.activeId === null"
                                        class="mb-interactive"
                                        variant="tonal"
                                        :prepend-icon="mdiMapPlus"
                                        @click="revealPage(PAGE_WORLD)"
                                    >
                                        {{ t("tabs.page.world", "Make a map") }}
                                    </v-btn>
                                </div>

                                <!--
                                    The menu owns the page stack (`appState.menu`), which the
                                    control bar pushes onto, so it belongs to the same page the
                                    control bar does. Its "markers" page is a slot because the
                                    marker list lives in its own component; `page.markerSet` is
                                    whatever the opener put there, which is the root set for the
                                    Markers button and the `bm-players` set for the Players one.
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
                            </div>
                        </template>

                        <!--
                            The wizard is taller than a short window, so it keeps its own
                            scroll container: the step buttons must never be the thing that
                            ends up off-screen.
                        -->
                        <template #world>
                            <div class="mb-world-host mb-interactive">
                                <WorldScreen
                                    :settings-epoch="settingsEpoch"
                                    :can-open-ci="true"
                                    @consent="openSettings('mojang-download-consent')"
                                    @settings="revealSetting"
                                    @open-map="openRenderedMap"
                                    @open-project="openProject"
                                    @open-ci-render="revealPage(PAGE_CIRENDER)"
                                />
                            </div>
                        </template>

                        <!--
                            Projects: the settings a world renders with, all of them, before
                            a render starts. Its own scroll container for the same reason the
                            guide has one - the editor is far taller than a short window, and
                            the Save button must never be the thing that ends up off-screen.
                        -->
                        <template #projects>
                            <div class="mb-world-host mb-interactive">
                                <ProjectsScreen
                                    :settings-epoch="settingsEpoch"
                                    :open-world="projectToOpen"
                                    @consent="openSettings('mojang-download-consent')"
                                    @settings="revealSetting"
                                    @open-map="openRenderedMap"
                                />
                            </div>
                        </template>

                        <!--
                            Rendering on GitHub's runners: the answer for a machine that
                            cannot render a large world at all. Its own page rather than a
                            fourth choice on the guide, because it is a workflow with a
                            repository, two consents and a run to watch - and it refuses
                            before packing anything when a world would exceed a release
                            asset's ceiling, which is a message worth arriving early.

                            `rendered` carries a map that has already been downloaded and
                            registered, so it is opened exactly as a local render's is.
                            Mojang's licence is deliberately not accepted on that screen;
                            it points at the settings row that already asks.
                        -->
                        <template #cirender>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <CiRenderScreen
                                        :can-open-settings="true"
                                        @sign-in="openSettings()"
                                        @open-consent="openSettings('mojang-download-consent')"
                                        @open="openInBrowser"
                                        @rendered="openCiRenderedMap"
                                    />
                                </div>
                            </div>
                        </template>

                        <!--
                            The list is a card rather than a full-width screen, so it is
                            centred in its page instead of stretched across it. Its Close
                            button now goes back to the map, which is the only thing "close"
                            can honestly mean on a page that cannot be dismissed.
                        -->
                        <template #servers>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <ProfileManager @close="revealPage(PAGE_MAP)" />
                                </div>
                            </div>
                        </template>

                        <!--
                            Backing a world or a rendered map up to GitHub release assets.
                            Restoring is deliberately not a second downloader: the screen
                            names the release it wants and the existing downloads surface,
                            which already verifies every part against its published digest,
                            is what fetches it.
                        -->
                        <template #backups>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <BackupScreen
                                        :can-open-settings="true"
                                        @sign-in="openSettings()"
                                        @open="openInBrowser"
                                        @restore="revealBackupRestore"
                                    />
                                </div>
                            </div>
                        </template>

                        <template #pages>
                            <div class="mb-world-host mb-interactive">
                                <div class="mb-shell-centre">
                                    <PagesScreen @open="openInBrowser" />
                                </div>
                            </div>
                        </template>
                    </TabbedNavigation>
                </AppearanceTarget>
            </div>

            <!--
                The options editor gets a full-bleed host of its own, painted over the tab
                strip and everything under it. `tabindex="-1"` is what lets the region hold
                focus, so Escape reaches it before anything inside has been clicked.
            -->
            <div
                v-if="configOpen"
                ref="configHost"
                class="mb-world-host mb-interactive"
                tabindex="-1"
                role="region"
                :aria-label="t('config.title', 'Server configuration')"
                @keydown.esc="closeConfig"
            >
                <ConfigScreen
                    @consent="openSettings('mojang-download-consent')"
                    @saved="configSaved"
                />
            </div>

            <!--
                Shell-only controls: settings and the options editor have no upstream
                counterpart, so they are not in the ported menu, and neither of them is a
                page. The server list used to have a button here too and no longer does -
                it is a tab now, and a floating button that opens what a tab already opens is
                two navigation models arguing in the same corner of the screen.
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

                <v-tooltip :text="t('config.title', 'Server configuration')" location="end">
                    <template #activator="{ props: tooltipProps }">
                        <v-btn
                            :id="configFabId"
                            v-bind="tooltipProps"
                            class="mb-shell-fab mb-interactive"
                            :icon="mdiFileCogOutline"
                            color="surface"
                            variant="flat"
                            elevation="3"
                            :aria-label="t('config.title', 'Server configuration')"
                            :aria-expanded="configOpen"
                            @click="configOpen ? closeConfig() : openConfig()"
                        />
                    </template>
                </v-tooltip>
            </div>

            <AppSettings
                :open="settingsOpen"
                :anchor="settingsAnchor"
                :anchor-missing="settingsMissing"
                @update:open="settingsOpen = $event"
            />

            <!--
                Every destination emits back here rather than opening anything itself, so
                the shell keeps one copy of the code that opens each surface.
            -->
            <CommandPalette
                :open="paletteOpen"
                @update:open="paletteOpen = $event"
                @reveal-setting="revealSetting"
                @open-settings="openSettings()"
                @open-config="openConfig()"
                @open-profiles="revealPage(PAGE_SERVERS)"
            />
        </v-main>

        <!--
            First-run setup decides for itself whether this is a first launch and stays
            invisible when it is not. It is mounted outside v-main so its blocking dialog -
            the only one in this application - is never a child of a click-through layer.
        -->
        <FirstRunSetup />

        <!--
            The one notification corner, mounted for the same reason and in the same place:
            it is fixed to the bottom-right at z-index 2400 and must stack above everything,
            never as a child of the click-through layer. It lives here rather than inside the
            options editor so a message outlives the screen that raised it - a save that
            closes that surface can still report where it wrote. Exactly one instance reads
            the shared queue; a second would show every notice twice.
        -->
        <ConfigNotifications :state="notices" />
    </v-app>
</template>

<style scoped>
/*
 * Layering, pointer-events and the map/chrome stacking order all live in styles/global.scss,
 * because they are properties of the #app / #map-container pair rather than of this component.
 */

/*
 * The tabbed shell fills the map area and is click-through by default, exactly as v-main is:
 * the map canvas is behind the whole application layer, and a full-bleed navigation container
 * that swallowed pointer events would make the map undraggable everywhere except the gaps
 * between the floating controls. The strip and each page opt back in individually below.
 */
.mb-shell-tabs {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    pointer-events: none;
}

/*
 * The appearance wrapper is `display: contents` until somebody gives it a background, a border
 * or a padding to paint, at which point it becomes a real box - and a box between the flex
 * container and the tab shell would leave the panel with no height to fill. This gives it the
 * same shape the element it replaced had, so styling the tab bar cannot collapse the pages
 * underneath it.
 */
.mb-shell-tabs > .mb-appearance-target--box {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-block-size: 0;
}

.mb-shell-tabs :deep(.mb-tabs) {
    flex: 1 1 auto;
    min-block-size: 0;
}

/* Real chrome, so it takes pointer events, and it never gives up height to the panel. */
.mb-shell-tabs :deep(.mb-tabs-strip-row) {
    flex: 0 0 auto;
    pointer-events: auto;
}

/*
 * Positioned so a page can fill it with `inset: 0` and own its own scrolling, and left
 * click-through so the map page can hand a drag straight to the canvas. A page that wants
 * events asks for them with `.mb-interactive`, which is the same bargain every floating
 * control in this shell already makes.
 */
.mb-shell-tabs :deep(.mb-tabs__panel) {
    position: relative;
    pointer-events: none;
}

/*
 * Every tab closed. The tab system's empty state offers a button per page, and a button in a
 * click-through layer is a button nobody can press; it also needs a surface of its own,
 * because centred text floating over a map render is text nobody can read.
 */
.mb-shell-tabs :deep(.mb-tabs__empty) {
    pointer-events: auto;
    background: rgb(var(--v-theme-background));
}

/*
 * The control bar anchors itself under the title bar with `position: fixed`, which was right
 * when it was the topmost thing in the window and would now paint straight over the tab strip.
 * Inside the map page it becomes absolute instead, so it sits at the top of whatever space the
 * strip leaves rather than at a measured offset that would have to be kept in step with it.
 */
.mb-shell-tabs :deep(.mb-cb) {
    position: absolute;
    top: 0;
}

/*
 * The map page paints nothing: the canvas is a sibling of #app and shows through. Filling the
 * panel rather than sitting in its flow is what gives the control bar above something with the
 * panel's own geometry to anchor against.
 */
.mb-map-page {
    position: absolute;
    inset: 0;
}

.mb-map-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: min(90vw, 40rem);
    padding: 0 1rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
    text-align: center;
    text-wrap: balance;
    pointer-events: none;
}

.mb-map-state__line {
    margin: 0;
}

/*
 * Opaque on purpose. There is no map behind the wizard or the server list once the page is
 * on screen - and where there is one, showing it faintly through a form is worse than not
 * showing it at all - so a translucent panel would read as a rendering fault rather than as
 * a surface. Also the options editor's host, where it covers the whole shell.
 */
.mb-world-host {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: rgb(var(--v-theme-background));
}

/* The maps-and-servers card has its own width, so its page centres it rather than stretching it. */
.mb-shell-centre {
    display: flex;
    justify-content: center;
    padding: 16px;
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

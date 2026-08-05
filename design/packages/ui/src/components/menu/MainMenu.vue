<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VDivider, VList } from "vuetify/components";
import type { BlueMapApp } from "@material-bluemap/viewer";
import InfoPage from "./InfoPage.vue";
import MapsMenu from "./MapsMenu.vue";
import MenuOption from "./MenuOption.vue";
import MenuSideSheet from "./MenuSideSheet.vue";
import SettingsMenu from "./SettingsMenu.vue";
import { provideBlueMap, useBlueMap, useBlueMapTheme } from "./useBlueMap";

/**
 * MD3 port of upstream `Menu/MainMenu.vue`: the router for the side menu.
 *
 * The page stack itself is unchanged - it is still `appState.menu` (the viewer's own
 * `MainMenu` object), so the control bar, the marker menu and this component all push and
 * pop the same stack. Pages are opened with a title *thunk*, exactly as upstream does, so
 * an open page re-translates its heading when the language changes instead of freezing in
 * the old one.
 *
 * The Markers page is a slot: it lives in the marker components, not here.
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

/**
 * The Info page's "Browse the documentation" button lives two components below the shell,
 * exactly where the changelog fold does - and for the same reason `revealRequests.ts` exists
 * for the changelog, this cannot call the shell's `revealPage` directly. Unlike the changelog,
 * though, the docs browser is a real shell tab rather than a fold inside this menu, so the
 * fix is the ordinary one: forward the event up, the way `MarkerMenu`'s marker set already
 * flows down through this component's own `markers` slot in the other direction.
 *
 * The Info page's "Take the tour" button forwards the same way, for the same reason: the
 * tour overlay is mounted at the shell, not here.
 */
const emit = defineEmits<{ "open-docs": []; "open-tutorial": [] }>();

const app = useBlueMap(() => props.bluemap);
provideBlueMap(app);
useBlueMapTheme(app);

const { t } = useI18n();

const menu = computed(() => app.value?.appState.menu ?? null);
const page = computed(() => menu.value?.currentPage() ?? null);
const isOpen = computed(() => menu.value?.isOpen ?? false);
const canGoBack = computed(() => (menu.value?.pageStack.length ?? 0) > 1);

// Closing the last page empties the stack, and `currentPage()` then returns the "-" null
// page. Holding the last real title keeps the heading readable during the close animation.
const lastTitle = ref(t("menu.title", "Menu"));
watch(page, (value) => {
    if (value && value.id !== "-") lastTitle.value = value.title;
});

const title = computed(() => {
    const current = page.value;
    if (current && current.id !== "-") return current.title;
    return lastTitle.value;
});

const pageId = computed(() => page.value?.id ?? null);

const fullscreenAvailable = computed(() => document.fullscreenEnabled);

/**
 * Why "Go Fullscreen" is dimmed, when it is.
 *
 * A disabled `MenuOption` on its own tells nobody anything: a screen reader hears "Go
 * Fullscreen, dimmed" and a sighted person sees a greyed-out row, and neither learns
 * anything a click would not have told them anyway. `document.fullscreenEnabled` is false
 * when the browser itself refuses the Fullscreen API here - most often because this page
 * is embedded in a frame nobody granted the permission to - which is a fact about the
 * browser, not a bug in this app, so the reason is named rather than left as a mystery.
 * Empty while the option is enabled: `MenuOption` only renders a tooltip when it has text.
 */
const fullscreenTooltip = computed(() =>
    fullscreenAvailable.value ? "" : t("goFullscreen.unavailable", "Fullscreen is not available in this browser."),
);

function openPage(id: string, titleKey: string, fallback: string, data: object = {}): void {
    menu.value?.openPage(id, () => t(titleKey, fallback), data);
}

function openMarkers(): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.menu.openPage("markers", () => t("markers.title", "Markers"), {
        markerSet: instance.mapViewer.markers.data,
    });
}

function goBack(): void {
    menu.value?.closePage();
}

function closeAll(): void {
    menu.value?.closeAll();
}

function goFullscreen(): void {
    void document.body.requestFullscreen().catch((error: unknown) => {
        console.warn("[BlueMap] Fullscreen was refused", error);
    });
}

function resetCamera(): void {
    app.value?.resetCamera();
}

function takeScreenshot(): void {
    app.value?.takeScreenshot();
}

function updateMap(): void {
    void app.value?.updateMap();
}
</script>

<template>
    <MenuSideSheet
        v-if="app"
        :open="isOpen"
        :title="title"
        :back="canGoBack"
        @back="goBack"
        @close="closeAll"
    >
        <v-list v-if="pageId === 'root'" class="mb-main-menu__root" density="compact" nav>
            <MenuOption submenu @action="openPage('maps', 'maps.title', 'Maps')">
                {{ t("maps.button", "Maps") }}
            </MenuOption>
            <MenuOption submenu @action="openMarkers">
                {{ t("markers.button", "Markers") }}
            </MenuOption>
            <MenuOption submenu @action="openPage('settings', 'settings.title', 'Settings')">
                {{ t("settings.button", "Settings") }}
            </MenuOption>
            <MenuOption submenu @action="openPage('info', 'info.title', 'Info')">
                {{ t("info.button", "Info") }}
            </MenuOption>

            <v-divider class="my-2" />

            <MenuOption :disabled="!fullscreenAvailable" :tooltip="fullscreenTooltip" @action="goFullscreen">
                {{ t("goFullscreen.button", "Go Fullscreen") }}
            </MenuOption>
            <MenuOption @action="resetCamera">
                {{ t("resetCamera.button", "Reset Camera") }}
            </MenuOption>
            <MenuOption @action="takeScreenshot">
                {{ t("screenshot.button", "Take Screenshot") }}
            </MenuOption>
            <MenuOption :tooltip="t('updateMap.tooltip', 'Clear Tile Cache')" @action="updateMap">
                {{ t("updateMap.button", "Update Map") }}
            </MenuOption>
        </v-list>

        <MapsMenu v-else-if="pageId === 'maps'" />

        <!--
          The Markers page belongs to the marker components. The shell fills this slot with
          <MarkerSetMenu>; `page` carries the `markerSet` the page was opened with.
        -->
        <slot v-else-if="pageId === 'markers'" name="markers" :page="page" :menu="menu">
            <p class="mb-main-menu__empty">
                {{ t("markers.title", "Markers") }}
            </p>
        </slot>

        <SettingsMenu v-else-if="pageId === 'settings'" />

        <InfoPage
            v-else-if="pageId === 'info'"
            @open-docs="emit('open-docs')"
            @open-tutorial="emit('open-tutorial')"
        />
    </MenuSideSheet>
</template>

<style>
.mb-main-menu__empty {
    padding: 12px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

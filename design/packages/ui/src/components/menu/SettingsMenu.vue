<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VList } from "vuetify/components";
import type { BlueMapApp } from "@material-bluemap/viewer";
import MenuGroup from "./MenuGroup.vue";
import MenuOption from "./MenuOption.vue";
import MenuOptionList from "./MenuOptionList.vue";
import type { MenuChoiceOption } from "./MenuOptionList.vue";
import MenuSearchBar from "./MenuSearchBar.vue";
import MenuSlider from "./MenuSlider.vue";
import MenuSuperConfirm from "./MenuSuperConfirm.vue";
import MenuSwitch from "./MenuSwitch.vue";
import { useMenuSearch } from "./menuPrefs";
import { createMatcher } from "./regex";
import { useBlueMap, useBlueMapTheme } from "./useBlueMap";
import { i18nModule, languages, setLanguage } from "../../i18n";

/**
 * MD3 port of upstream `Menu/SettingsMenu.vue`.
 *
 * Every control here writes the same viewer state upstream wrote, through the same
 * `BlueMapApp` methods, and persists under the same `bluemap-*` localStorage keys, because
 * `saveUserSettings()` is what writes them. The two render-distance sliders and the
 * sensitivity slider apply on `update` and persist on `lazy`, exactly as upstream split
 * `@update` from `@lazy`, so dragging does not write localStorage on every pointer move.
 *
 * Deliberate deviations from upstream, each a fix rather than a redesign:
 *  - the theme buttons also drive the Vuetify MD3 theme (see `useBlueMapTheme`); upstream's
 *    `setTheme()` only toggles classes the MD3 chrome does not read;
 *  - chunk borders trigger a redraw, so the change shows up without moving the camera;
 *  - the language is written to `bluemap-lang` explicitly, because `saveUserSettings()`
 *    reads the viewer's i18n adapter, which the shell may not have installed yet;
 *  - "Reset all settings" is destructive and irreversible, so it goes through a super
 *    confirmation gate instead of firing on a single click.
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

const app = useBlueMap(() => props.bluemap);
useBlueMapTheme(app);

const { t, locale } = useI18n();

const resetOpen = ref(false);

// ---------------------------------------------------------------- slider bounds

const bounds = computed(() => {
    const settings = app.value?.settings;
    return {
        hiresSliderMin: settings?.hiresSliderMin ?? 50,
        hiresSliderMax: settings?.hiresSliderMax ?? 500,
        lowresSliderMin: settings?.lowresSliderMin ?? 500,
        lowresSliderMax: settings?.lowresSliderMax ?? 10000,
    };
});

function save(): void {
    app.value?.saveUserSettings();
}

// ---------------------------------------------------------------- view / controls

const mapData = computed(() => app.value?.mapViewer.data.map ?? null);

const showViewControls = computed(() => (mapData.value?.views.length ?? 0) > 1);

const viewOptions = computed<MenuChoiceOption[]>(() => {
    const map = mapData.value;
    if (!map) return [];
    const options: MenuChoiceOption[] = [];
    if (map.perspectiveView)
        options.push({ id: "perspective", name: t("controls.perspective.button", "Perspective") });
    if (map.flatView) options.push({ id: "flat", name: t("controls.flatView.button", "Flat") });
    if (map.freeFlightView)
        options.push({ id: "free", name: t("controls.freeFlight.button", "Free-Flight") });
    return options;
});

const viewSelection = computed(() => app.value?.appState.controls.state ?? null);

function setView(id: string): void {
    const instance = app.value;
    if (!instance) return;
    // Coming out of free flight, upstream lifts the camera to a minimum distance of 100.
    const fromFreeFlight = instance.appState.controls.state === "free";
    if (id === "perspective") instance.setPerspectiveView(500, fromFreeFlight ? 100 : 0);
    else if (id === "flat") instance.setFlatView(500, fromFreeFlight ? 100 : 0);
    else if (id === "free") instance.setFreeFlight(500);
}

// ---------------------------------------------------------------- lighting

const sunlight = computed(() => app.value?.mapViewer.data.uniforms.sunlightStrength.value ?? 0);
const ambientLight = computed(() => app.value?.mapViewer.data.uniforms.ambientLight.value ?? 0);

function setSunlight(value: number): void {
    const instance = app.value;
    if (!instance) return;
    instance.mapViewer.data.uniforms.sunlightStrength.value = value;
    instance.mapViewer.redraw();
}

function setAmbientLight(value: number): void {
    const instance = app.value;
    if (!instance) return;
    instance.mapViewer.data.uniforms.ambientLight.value = value;
    instance.mapViewer.redraw();
}

// ---------------------------------------------------------------- resolution

const qualityOptions = computed<MenuChoiceOption[]>(() => [
    { id: "2", name: t("resolution.high", "High (SSAA x2)") },
    { id: "1", name: t("resolution.normal", "Normal (Native x1)") },
    { id: "0.5", name: t("resolution.low", "Low (Upscaling x0.5)") },
]);

const qualitySelection = computed(() => {
    const value = app.value?.mapViewer.data.superSampling;
    return value === undefined ? null : String(value);
});

function setQuality(id: string): void {
    const instance = app.value;
    if (!instance) return;
    // The setter on MapViewer also resizes the render target; writing `data` would not.
    instance.mapViewer.superSampling = parseFloat(id);
    instance.saveUserSettings();
    instance.mapViewer.redraw();
}

// ---------------------------------------------------------------- render distance

const hiresDistance = computed(() => app.value?.mapViewer.data.loadedHiresViewDistance ?? 0);
const lowresDistance = computed(() => app.value?.mapViewer.data.loadedLowresViewDistance ?? 0);

function setHiresDistance(value: number): void {
    const instance = app.value;
    if (!instance) return;
    instance.mapViewer.data.loadedHiresViewDistance = value;
    instance.mapViewer.updateLoadedMapArea();
}

function setLowresDistance(value: number): void {
    const instance = app.value;
    if (!instance) return;
    instance.mapViewer.data.loadedLowresViewDistance = value;
    instance.mapViewer.updateLoadedMapArea();
}

function renderDistanceFormatter(value: number): string {
    return value === 0 ? t("renderDistance.off", "Off") : value.toFixed(0);
}

const loadHiresWhileMoving = computed(() => !(app.value?.appState.controls.pauseTileLoading ?? false));

function toggleLoadHiresWhileMoving(): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.controls.pauseTileLoading = !instance.appState.controls.pauseTileLoading;
    instance.saveUserSettings();
}

// ---------------------------------------------------------------- map controls

const showZoomButtons = computed(() => app.value?.appState.controls.showZoomButtons ?? false);

function toggleZoomButtons(): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.controls.showZoomButtons = !instance.appState.controls.showZoomButtons;
    instance.saveUserSettings();
}

// ---------------------------------------------------------------- free-flight controls

const mouseSensitivity = computed(() => app.value?.appState.controls.mouseSensitivity ?? 1);
const invertMouse = computed(() => app.value?.appState.controls.invertMouse ?? false);

function setMouseSensitivity(value: number): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.controls.mouseSensitivity = value;
    instance.updateControlsSettings();
}

function toggleInvertMouse(): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.controls.invertMouse = !instance.appState.controls.invertMouse;
    instance.updateControlsSettings();
    instance.saveUserSettings();
}

// ---------------------------------------------------------------- theme

const themeOptions = computed<MenuChoiceOption[]>(() => [
    { id: "default", name: t("theme.default", "Default (System/Browser)") },
    { id: "dark", name: t("theme.dark", "Dark") },
    { id: "light", name: t("theme.light", "Light") },
    { id: "contrast", name: t("theme.contrast", "Contrast") },
]);

const themeSelection = computed(() => app.value?.appState.theme ?? "default");

function setTheme(id: string): void {
    const instance = app.value;
    if (!instance) return;
    instance.setTheme(id === "default" ? null : id);
    instance.saveUserSettings();
}

// ---------------------------------------------------------------- screenshot

const screenshotClipboard = computed(() => app.value?.appState.screenshot.clipboard ?? false);

function toggleScreenshotClipboard(): void {
    const instance = app.value;
    if (!instance) return;
    instance.appState.screenshot.clipboard = !instance.appState.screenshot.clipboard;
    instance.saveUserSettings();
}

// ---------------------------------------------------------------- language

const languageOptions = computed<MenuChoiceOption[]>(() => {
    // Read the locale so the list re-renders once the language files have loaded.
    void locale.value;
    return languages.map((language) => ({ id: language.locale, name: language.name }));
});

const languageSelection = computed(() => locale.value);

function changeLanguage(id: string): void {
    void setLanguage(i18nModule, id).then(() => {
        const instance = app.value;
        if (!instance) return;
        instance.updatePageAddress();
        instance.saveUserSettings();
        // `saveUserSettings()` reads the viewer's own i18n adapter, which the shell may not
        // have installed; write the key the loader actually reads back explicitly.
        instance.saveUserSetting("lang", id);
    });
}

// ---------------------------------------------------------------- debug

const chunkBorders = computed(
    () => app.value?.mapViewer.data.uniforms.chunkBorders.value ?? false,
);
const debug = computed(() => app.value?.appState.debug ?? false);

function toggleChunkBorders(): void {
    const instance = app.value;
    if (!instance) return;
    instance.setChunkBorders(!instance.mapViewer.data.uniforms.chunkBorders.value);
    instance.saveUserSettings();
    // Upstream left this to the next camera move; a uniform change needs a frame to show.
    instance.mapViewer.redraw();
}

function toggleDebug(): void {
    const instance = app.value;
    if (!instance) return;
    instance.setDebug(!instance.appState.debug);
    instance.saveUserSettings();
}

function resetSettings(): void {
    resetOpen.value = false;
    app.value?.resetSettings();
}

// ---------------------------------------------------------------- labels and search

const labels = computed(() => ({
    controls: t("controls.title", "View / Controls"),
    lighting: t("lighting.title", "Lighting"),
    sunlight: t("lighting.sunlight", "Sunlight"),
    ambientLight: t("lighting.ambientLight", "Ambient-Light"),
    resolution: t("resolution.title", "Resolution"),
    renderDistance: t("renderDistance.title", "Render Distance"),
    hiresLayer: t("renderDistance.hiresLayer", "Hires layer"),
    lowresLayer: t("renderDistance.lowersLayer", "Lowres layer"),
    loadHiresWhileMoving: t("renderDistance.loadHiresWhileMoving", "Load hires while moving"),
    mapControls: t("mapControls.title", "Map Controls"),
    showZoomButtons: t("mapControls.showZoomButtons", "Show Zoom Buttons"),
    freeFlightControls: t("freeFlightControls.title", "Free-Flight Controls"),
    mouseSensitivity: t("freeFlightControls.mouseSensitivity", "Mouse-Sensitivity"),
    invertMouseY: t("freeFlightControls.invertMouseY", "Invert Mouse Y"),
    theme: t("theme.title", "Theme"),
    screenshot: t("screenshot.title", "Screenshot"),
    screenshotClipboard: t("screenshot.clipboard", "Copy to Clipboard"),
    language: t("language.title", "Language"),
    chunkBorders: t("chunkBorders.button", "Show chunk borders"),
    debug: t("debug.button", "Debug"),
    resetAll: t("resetAllSettings.button", "Reset All Settings"),
}));

const search = useMenuSearch("settings");
const matcher = computed(() => createMatcher(search.query, search.regex, search.flags));

/** True when any of the given labels matches the current filter (or there is no filter). */
function show(...candidates: string[]): boolean {
    if (!search.query) return true;
    return candidates.some((candidate) => matcher.value.test(candidate));
}

const searchable = computed(() => {
    const l = labels.value;
    return [
        ...Object.values(l),
        ...viewOptions.value.map((option) => option.name),
        ...qualityOptions.value.map((option) => option.name),
        ...themeOptions.value.map((option) => option.name),
        ...languageOptions.value.map((option) => option.name),
    ];
});

const matchCount = computed(
    () => searchable.value.filter((candidate) => matcher.value.test(candidate)).length,
);

const searchSummary = computed(() => {
    if (!search.query) return "";
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
    // the fallback as a message too and consumes `{shown}` and `{total}` as its own named
    // parameters, so a later `replace` finds nothing left and the counts vanish.
    return t(
        "search.summary",
        { shown: matchCount.value, total: searchable.value.length },
        "{shown} of {total}",
    );
});

const viewOptionNames = computed(() => viewOptions.value.map((option) => option.name));
const qualityOptionNames = computed(() => qualityOptions.value.map((option) => option.name));
const themeOptionNames = computed(() => themeOptions.value.map((option) => option.name));
const languageOptionNames = computed(() => languageOptions.value.map((option) => option.name));

/*
 * `MenuOptionList` renders whatever `options` array it is handed with no filtering of its
 * own (see its own source), so the four groups built on it - View/Controls, Resolution,
 * Theme, Language - used to show every one of their options the moment `show()` let the
 * surrounding `MenuGroup` through, which happens whenever *any single* option or the
 * group's own title matches. Searching "Perspective" still showed "Flat" and
 * "Free-Flight" beside it: a real defect, not the "jump to a section" design the settings
 * drawer's own search deliberately uses (see `AppSettings.vue`'s doc comment for that one).
 *
 * These narrow what actually reaches `MenuOptionList` to the options `show()` itself would
 * keep, using the same two-candidate call - the group's own title, plus that one option's
 * name - every switch- and slider-based group already uses per member. That keeps the
 * existing, deliberate "searching the category name reveals the whole category" behaviour
 * (checked against the group's title) while finally also hiding a sibling option whose own
 * name does not match, exactly what `matchCount`'s "N of {total}" summary already claims.
 */
const visibleViewOptions = computed(() =>
    viewOptions.value.filter((option) => show(labels.value.controls, option.name)),
);
const visibleQualityOptions = computed(() =>
    qualityOptions.value.filter((option) => show(labels.value.resolution, option.name)),
);
const visibleThemeOptions = computed(() =>
    themeOptions.value.filter((option) => show(labels.value.theme, option.name)),
);
const visibleLanguageOptions = computed(() =>
    languageOptions.value.filter((option) => show(labels.value.language, option.name)),
);
</script>

<template>
    <div class="mb-settings">
        <MenuSearchBar
            :state="search"
            :label="t('search.button', 'Search')"
            :placeholder="t('markers.searchPlaceholder', 'Search...')"
            :sample="searchable.join('\n')"
            :summary="searchSummary"
        />

        <p v-if="!app" class="mb-settings__empty">
            {{ t("map.unloaded", "No map loaded.") }}
        </p>

        <template v-else>
            <p v-if="search.query && matchCount === 0" class="mb-settings__empty">
                {{ t("search.noMatch", "Nothing matches that search.") }}
            </p>

            <MenuGroup
                v-if="showViewControls && show(labels.controls, ...viewOptionNames)"
                :title="labels.controls"
            >
                <MenuOptionList
                    :options="visibleViewOptions"
                    :selected="viewSelection"
                    :label="labels.controls"
                    @select="setView"
                />
            </MenuGroup>

            <MenuGroup
                v-if="show(labels.lighting, labels.sunlight, labels.ambientLight)"
                :title="labels.lighting"
            >
                <MenuSlider
                    v-if="show(labels.lighting, labels.sunlight)"
                    :model-value="sunlight"
                    :min="0"
                    :max="1"
                    :step="0.01"
                    :label="labels.sunlight"
                    @update="setSunlight"
                />
                <MenuSlider
                    v-if="show(labels.lighting, labels.ambientLight)"
                    :model-value="ambientLight"
                    :min="0"
                    :max="1"
                    :step="0.01"
                    :label="labels.ambientLight"
                    @update="setAmbientLight"
                />
            </MenuGroup>

            <MenuGroup
                v-if="show(labels.resolution, ...qualityOptionNames)"
                :title="labels.resolution"
            >
                <MenuOptionList
                    :options="visibleQualityOptions"
                    :selected="qualitySelection"
                    :label="labels.resolution"
                    @select="setQuality"
                />
            </MenuGroup>

            <MenuGroup
                v-if="
                    show(
                        labels.renderDistance,
                        labels.hiresLayer,
                        labels.lowresLayer,
                        labels.loadHiresWhileMoving,
                    )
                "
                :title="labels.renderDistance"
            >
                <MenuSlider
                    v-if="show(labels.renderDistance, labels.hiresLayer)"
                    :model-value="hiresDistance"
                    :min="bounds.hiresSliderMin"
                    :max="bounds.hiresSliderMax"
                    :step="10"
                    :label="labels.hiresLayer"
                    :formatter="renderDistanceFormatter"
                    @update="setHiresDistance"
                    @lazy="save"
                />
                <MenuSlider
                    v-if="show(labels.renderDistance, labels.lowresLayer)"
                    :model-value="lowresDistance"
                    :min="bounds.lowresSliderMin"
                    :max="bounds.lowresSliderMax"
                    :step="100"
                    :label="labels.lowresLayer"
                    @update="setLowresDistance"
                    @lazy="save"
                />
                <MenuSwitch
                    v-if="show(labels.renderDistance, labels.loadHiresWhileMoving)"
                    :on="loadHiresWhileMoving"
                    :label="labels.loadHiresWhileMoving"
                    @action="toggleLoadHiresWhileMoving"
                />
            </MenuGroup>

            <MenuGroup
                v-if="show(labels.mapControls, labels.showZoomButtons)"
                :title="labels.mapControls"
            >
                <MenuSwitch
                    :on="showZoomButtons"
                    :label="labels.showZoomButtons"
                    @action="toggleZoomButtons"
                />
            </MenuGroup>

            <MenuGroup
                v-if="
                    show(labels.freeFlightControls, labels.mouseSensitivity, labels.invertMouseY)
                "
                :title="labels.freeFlightControls"
            >
                <MenuSlider
                    v-if="show(labels.freeFlightControls, labels.mouseSensitivity)"
                    :model-value="mouseSensitivity"
                    :min="0.1"
                    :max="5"
                    :step="0.05"
                    :label="labels.mouseSensitivity"
                    @update="setMouseSensitivity"
                    @lazy="save"
                />
                <MenuSwitch
                    v-if="show(labels.freeFlightControls, labels.invertMouseY)"
                    :on="invertMouse"
                    :label="labels.invertMouseY"
                    @action="toggleInvertMouse"
                />
            </MenuGroup>

            <MenuGroup
                v-if="show(labels.theme, ...themeOptionNames)"
                :title="labels.theme"
                scrollable
            >
                <MenuOptionList
                    :options="visibleThemeOptions"
                    :selected="themeSelection"
                    :label="labels.theme"
                    @select="setTheme"
                />
            </MenuGroup>

            <MenuGroup
                v-if="show(labels.screenshot, labels.screenshotClipboard)"
                :title="labels.screenshot"
            >
                <MenuSwitch
                    :on="screenshotClipboard"
                    :label="labels.screenshotClipboard"
                    @action="toggleScreenshotClipboard"
                />
            </MenuGroup>

            <MenuGroup
                v-if="languageOptions.length > 1 && show(labels.language, ...languageOptionNames)"
                :title="labels.language"
                scrollable
            >
                <MenuOptionList
                    :options="visibleLanguageOptions"
                    :selected="languageSelection"
                    :label="labels.language"
                    @select="changeLanguage"
                />
            </MenuGroup>

            <v-list class="mb-settings__tail" density="compact" nav>
                <MenuSwitch
                    v-if="show(labels.chunkBorders)"
                    :on="chunkBorders"
                    :label="labels.chunkBorders"
                    @action="toggleChunkBorders"
                />
                <MenuSwitch
                    v-if="show(labels.debug)"
                    :on="debug"
                    :label="labels.debug"
                    @action="toggleDebug"
                />
                <MenuOption v-if="show(labels.resetAll)" @action="resetOpen = true">
                    {{ labels.resetAll }}
                </MenuOption>
            </v-list>

            <MenuSuperConfirm
                v-model="resetOpen"
                :title="labels.resetAll"
                :action="
                    t(
                        'resetAllSettings.warning',
                        'This clears every saved BlueMap setting in this browser and reloads the page. It cannot be undone.',
                    )
                "
                :affected="[
                    labels.resolution,
                    labels.renderDistance,
                    labels.freeFlightControls,
                    labels.mapControls,
                    labels.theme,
                    labels.language,
                    labels.screenshot,
                    labels.debug,
                ]"
                :confirm-label="labels.resetAll"
                @confirm="resetSettings"
            />
        </template>
    </div>
</template>

<style>
.mb-settings {
    padding-block-end: 8px;
}

.mb-settings__empty {
    padding: 12px 16px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

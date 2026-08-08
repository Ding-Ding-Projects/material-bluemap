<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentSave, mdiDelete, mdiDownload, mdiRestore, mdiUpload } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VDivider,
    VSelect,
    VSlider,
    VTab,
    VTabs,
    VTextField,
    VTooltip,
    VWindow,
    VWindowItem,
} from "vuetify/components";

import ColorField from "./ColorField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import TypographyEditor from "./TypographyEditor.vue";
import { SURFACE_PROPERTIES, type SurfacePropertyId } from "./appearanceRecord.js";
import {
    exportTheme,
    importErrorKey,
    importTheme,
    withoutPreset,
    withPreset,
    type AppearancePreset,
} from "./appearanceStore.js";
import {
    appearanceState,
    commitAppearance,
    fontCatalog,
    typographyCapabilities,
    useAppearanceTarget,
} from "./useAppearance.js";
import { resolveTarget } from "./appearanceStore.js";
import type { TypographyPropertyId, TypographySpec } from "./typographySpec.js";

/**
 * The appearance editor for one element.
 *
 * It is deliberately not a page. The contract asks for a non-modal surface anchored beside
 * the thing being edited, and the reason is that appearance is judged by looking at the
 * element, not by looking at a form: a full-screen editor with a preview swatch is a
 * different, worse product, because the preview is never quite the real thing. Everything
 * here changes the live element as it is touched.
 *
 * ## It edits itself
 *
 * The root carries the resolved appearance of `appearance.editor`, so pointing the editor at
 * its own chrome restyles it while it is open. That is the contract's "a theming feature that
 * cannot theme its own dialog is incomplete" clause, and it is also the cheapest possible
 * test of the whole feature: if the editor cannot restyle itself, it cannot restyle anything.
 *
 * ## Applying is immediate; there is no apply button
 *
 * Every change is written through as it happens, which makes the preview the element itself.
 * The counterpart to that is that reset has to be real and reachable, so there are three of
 * them - one property, one element, everything - and the destructive one is the only thing in
 * this panel that asks before it acts.
 *
 * ## Its three sections stay `v-tabs`, deliberately, not `TabbedNavigation`
 *
 * The tabbed-navigation rule asks every settings-style surface to use the project's own
 * `TabbedNavigation` rather than a bespoke tab strip, and `AppSettings.vue`, `ConfigScreen.vue`
 * and `ProjectEditor.vue` all now do. This editor is the documented exception the rule itself
 * anticipates, for reasons specific to what this surface *is* rather than a shortcut:
 *
 * - It is capped at `min(420px, 92vw)` and anchored beside the element it edits - the contract's
 *   own words for it are "not a page". `TabbedNavigation` brings a tab strip built for a whole
 *   screen: an overflow menu, a new-tab control, per-tab context menus, four searchable-tab
 *   surfaces and bulk-close actions. None of that has a referent here - there is no "closing"
 *   the Text tab, no reordering it away from Surface, nothing to pin - so the apparatus would
 *   be pure chrome around three fixed, uncloseable sections in a 420px popover.
 * - Its three tabs are permanent and exactly three; nothing ever opens a second "Surface" tab
 *   or a tab for a page this editor does not have. `TabbedNavigation`'s whole model - tabs as
 *   user-managed windows onto a smaller set of pages - has no work to do when the tab list and
 *   the page list are the same fixed three things every time.
 * - Persisting "which of three fixed tabs was last open" under its own storage key is not the
 *   kind of layout state the persistence clause is protecting; `tab` already resets to
 *   `"typography"` per instance, which is the same thing a settings surface with real optional
 *   tabs cannot do.
 *
 * What is not exempted: Surface and Presets each carry their own `ConfigSearchField` with the
 * full regex builder, exactly as the regex-builder rule requires of every settings surface
 * regardless of size - "it is small" is not an exemption there, and nothing about the tab strip
 * choice above touches that. If this editor ever grows a fourth, optional, or user-managed
 * section, that is the moment it stops being three fixed tabs and belongs on `TabbedNavigation`
 * like the rest.
 */
const props = defineProps<{
    /** The element being edited. */
    targetId: string;
    /** The element's own name, as the editor's heading shows it. */
    targetLabel: string;
}>();

const { t } = useI18n();

const state = appearanceState();
const fonts = fontCatalog();
const target = useAppearanceTarget(() => props.targetId);

/** The editor's own appearance, which is what makes it a target like any other. */
const self = useAppearanceTarget("appearance.editor");

const tab = ref<"typography" | "surface" | "presets">("typography");

/*
 * A search per tab, not one search over the editor.
 *
 * The Text tab has carried its own since it was written; Surface and Presets had none at
 * all, which is the shape of gap a guard test cannot see - a file with no search bar
 * passes a rule about search bars carrying builders, because it has nothing to check.
 *
 * Three fields rather than one because the rule is that a builder belongs to the field the
 * person is typing in. One shared query silently applying to whichever tab was last open
 * is exactly what that rule exists to prevent.
 */
const surfaceSearch = ref("");
const surfaceSearchRegex = ref(false);
const surfaceSearchFlags = ref("i");

const presetSearch = ref("");
const presetSearchRegex = ref(false);
const presetSearchFlags = ref("i");
const presetName = ref("");
const importMessage = ref("");
const importError = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

const resolved = computed(() => resolveTarget(state.value, props.targetId));
const style = computed(() => target.style.value);

const userPresets = computed(() => state.value.presets.filter((entry) => !entry.builtIn));

/** The surface properties this tab is showing, after its own search. */
const surfaceRows = computed(() => {
    const matcher = createSettingMatcher(
        surfaceSearch.value,
        surfaceSearchRegex.value,
        surfaceSearchFlags.value,
    );
    return SURFACE_PROPERTIES.filter((id) => matcher.test(`${surfaceLabel(id)} ${id}`));
});

const surfaceCorpus = computed(() =>
    SURFACE_PROPERTIES.map((id) => `${surfaceLabel(id)} ${id}`).join("\n"),
);

/** Presets after their own search. Built-in and saved alike: a name is a name. */
const visiblePresets = computed(() => {
    const matcher = createSettingMatcher(
        presetSearch.value,
        presetSearchRegex.value,
        presetSearchFlags.value,
    );
    return userPresets.value.filter((entry) => matcher.test(entry.name));
});

const presetCorpus = computed(() => state.value.presets.map((entry) => entry.name).join("\n"));

const presetChoices = computed(() => [
    { title: t("appearance.preset.none", "Do not follow a preset"), value: "" },
    ...state.value.presets.map((entry: AppearancePreset) => ({
        title: entry.name,
        value: entry.id,
    })),
]);

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

function setTypography(id: TypographyPropertyId, value: unknown): void {
    // The editor emits a value for a property it named, and the binding is generic over the
    // property. Narrowing that pair without a per-property switch is not expressible, so the
    // assertion is confined to this one line rather than spread through the editor.
    target.setTypography(id, value as TypographySpec[typeof id]);
}

/* -------------------------------------------------------------------------- */
/* Surface                                                                    */
/* -------------------------------------------------------------------------- */

const SURFACE_LABELS: Readonly<Record<SurfacePropertyId, string>> = {
    backgroundColor: "Background",
    borderColor: "Border colour",
    borderWidth: "Border width",
    borderStyle: "Border style",
    borderRadius: "Corner radius",
    paddingInline: "Space at the sides",
    paddingBlock: "Space above and below",
    elevation: "Elevation",
    opacity: "Opacity",
};

function surfaceLabel(id: SurfacePropertyId): string {
    return t(`appearance.surface.${id}`, SURFACE_LABELS[id]);
}

const borderStyles = computed(() =>
    (
        [
            ["none", "None"],
            ["solid", "Solid"],
            ["dashed", "Dashed"],
            ["dotted", "Dotted"],
            ["double", "Double"],
        ] as const
    ).map(([value, fallback]) => ({
        title: t(`appearance.surface.borderStyle.${value}`, fallback),
        value,
    })),
);

/* -------------------------------------------------------------------------- */
/* Presets, export and import                                                 */
/* -------------------------------------------------------------------------- */

function savePreset(): void {
    const name = presetName.value.trim();
    if (name === "") return;
    const id = `user.${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    commitAppearance(withPreset(state.value, id, name, target.record.value));
    presetName.value = "";
}

function deletePreset(id: string): void {
    commitAppearance(withoutPreset(state.value, id));
}

function setActivePreset(id: string): void {
    commitAppearance({ ...state.value, activePreset: id });
}

/**
 * Writes the theme to a file.
 *
 * Guarded because the object-URL route does not exist in every environment this component is
 * mounted in, and a test harness that lacks it should not take an exception on a button it
 * never pressed.
 */
function exportToFile(): void {
    const text = exportTheme(state.value);
    if (typeof URL.createObjectURL !== "function") return;

    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "worldlens-appearance.json";
    anchor.click();
    URL.revokeObjectURL(url);
}

async function onFileChosen(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file === undefined) return;

    const result = importTheme(await file.text());
    if (!result.ok) {
        importMessage.value = "";
        importError.value = t(
            importErrorKey(result.error),
            "That file is not an appearance theme.",
        );
        return;
    }

    commitAppearance(result.state);
    importError.value = "";
    importMessage.value =
        result.report.preservedKeys.length === 0
            ? t(
                  "appearance.import.clean",
                  { elements: result.report.elements, presets: result.report.presets },
                  "Imported {elements} elements and {presets} presets.",
              )
            : t(
                  "appearance.import.preserved",
                  {
                      elements: result.report.elements,
                      presets: result.report.presets,
                      kept: result.report.preservedKeys.join(", "),
                  },
                  "Imported {elements} elements and {presets} presets. These settings came from a version this build does not know, so they are stored but not applied: {kept}",
              );
}
</script>

<template>
    <section
        class="mb-appearance-editor"
        :style="self.style.value.style"
        :aria-label="
            t('appearance.editor.title', { element: targetLabel }, 'Appearance of {element}')
        "
    >
        <header class="mb-appearance-editor__head">
            <h2 class="mb-appearance-editor__title">
                {{
                    t(
                        "appearance.editor.title",
                        { element: targetLabel },
                        "Appearance of {element}",
                    )
                }}
            </h2>
            <v-btn
                v-if="target.customised.value"
                :prepend-icon="mdiRestore"
                size="small"
                variant="text"
                @click="target.resetElement()"
            >
                {{ t("appearance.editor.resetElement", "Reset this element") }}
            </v-btn>
        </header>

        <v-alert
            v-for="entry in style.unreadableColors"
            :key="entry.property"
            type="error"
            variant="tonal"
            density="compact"
        >
            {{
                t(
                    "appearance.editor.unreadableColor",
                    { property: entry.property, value: entry.authored },
                    "{property} is stored as {value}, which this app cannot read, so it is kept but not applied.",
                )
            }}
        </v-alert>

        <v-tabs
            v-model="tab"
            density="compact"
            :aria-label="t('appearance.editor.tabs', 'Appearance sections')"
        >
            <v-tab value="typography">{{ t("appearance.editor.typographyTab", "Text") }}</v-tab>
            <v-tab value="surface">{{ t("appearance.editor.surfaceTab", "Surface") }}</v-tab>
            <v-tab value="presets">{{ t("appearance.editor.presetsTab", "Presets") }}</v-tab>
        </v-tabs>

        <v-window v-model="tab" class="mb-appearance-editor__body">
            <v-window-item value="typography">
                <TypographyEditor
                    :spec="resolved.typography"
                    :overrides="target.record.value.typography"
                    :capabilities="typographyCapabilities"
                    :fonts="fonts"
                    :notes="style.notes"
                    @set="setTypography"
                    @reset="(id: TypographyPropertyId) => target.resetTypographyProperty(id)"
                />
            </v-window-item>

            <v-window-item value="surface">
                <ConfigSearchField
                    v-model="surfaceSearch"
                    v-model:regex="surfaceSearchRegex"
                    v-model:flags="surfaceSearchFlags"
                    :label="t('appearance.surface.search', 'Search the surface settings')"
                    :sample="surfaceCorpus"
                    :summary="
                        t(
                            'appearance.surface.searchSummary',
                            { shown: surfaceRows.length, total: SURFACE_PROPERTIES.length },
                            'Showing {shown} of {total} settings.',
                        )
                    "
                />

                <p v-if="surfaceRows.length === 0" class="mb-appearance-editor__hint">
                    {{ t("appearance.surface.noMatch", "No surface setting matches that search.") }}
                </p>

                <div class="mb-appearance-editor__surface">
                    <div v-for="id in surfaceRows" :key="id" class="mb-appearance-editor__row">
                        <ColorField
                            v-if="id === 'backgroundColor'"
                            :model-value="resolved.surface.backgroundColor"
                            :label="surfaceLabel(id)"
                            :contrast-foreground="resolved.typography.textColor"
                            @update:model-value="
                                (value: string) => target.setSurface('backgroundColor', value)
                            "
                        />
                        <ColorField
                            v-else-if="id === 'borderColor'"
                            :model-value="resolved.surface.borderColor"
                            :label="surfaceLabel(id)"
                            @update:model-value="
                                (value: string) => target.setSurface('borderColor', value)
                            "
                        />
                        <v-select
                            v-else-if="id === 'borderStyle'"
                            :model-value="resolved.surface.borderStyle"
                            :items="borderStyles"
                            :label="surfaceLabel(id)"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="
                                (value: 'none' | 'solid' | 'dashed' | 'dotted' | 'double') =>
                                    target.setSurface('borderStyle', value)
                            "
                        />
                        <template v-else>
                            <span class="mb-appearance-editor__rowLabel">{{
                                surfaceLabel(id)
                            }}</span>
                            <v-slider
                                :model-value="resolved.surface[id]"
                                :min="id === 'opacity' ? 0 : 0"
                                :max="id === 'opacity' ? 1 : id === 'elevation' ? 5 : 48"
                                :step="id === 'opacity' ? 0.01 : id === 'elevation' ? 1 : 1"
                                thumb-label
                                density="compact"
                                hide-details
                                :aria-label="surfaceLabel(id)"
                                @update:model-value="
                                    (value: number) => target.setSurface(id, value)
                                "
                            />
                        </template>

                        <v-btn
                            v-if="id in target.record.value.surface"
                            :icon="mdiRestore"
                            size="x-small"
                            variant="text"
                            :aria-label="
                                t(
                                    'appearance.surface.reset',
                                    { property: surfaceLabel(id) },
                                    'Reset {property}',
                                )
                            "
                            @click="target.resetSurfaceProperty(id)"
                        />
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="presets">
                <div class="mb-appearance-editor__presets">
                    <v-select
                        :model-value="target.record.value.inherit"
                        :items="presetChoices"
                        :label="t('appearance.preset.forElement', 'This element follows')"
                        density="compact"
                        variant="outlined"
                        hide-details
                        @update:model-value="(value: string) => target.setInherit(value)"
                    />

                    <v-select
                        :model-value="state.activePreset"
                        :items="presetChoices"
                        :label="t('appearance.preset.forEverything', 'Everything follows')"
                        density="compact"
                        variant="outlined"
                        hide-details
                        @update:model-value="setActivePreset"
                    />

                    <v-divider />

                    <div class="mb-appearance-editor__row">
                        <v-text-field
                            v-model="presetName"
                            :label="t('appearance.preset.name', 'Save this element as a preset')"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                        <v-btn
                            :prepend-icon="mdiContentSave"
                            size="small"
                            variant="tonal"
                            @click="savePreset"
                        >
                            {{ t("appearance.preset.save", "Save") }}
                        </v-btn>
                    </div>

                    <ConfigSearchField
                        v-if="userPresets.length > 0"
                        v-model="presetSearch"
                        v-model:regex="presetSearchRegex"
                        v-model:flags="presetSearchFlags"
                        :label="t('appearance.preset.search', 'Search the saved presets')"
                        :sample="presetCorpus"
                        :summary="
                            t(
                                'appearance.preset.searchSummary',
                                { shown: visiblePresets.length, total: userPresets.length },
                                'Showing {shown} of {total} saved presets.',
                            )
                        "
                    />

                    <p
                        v-if="userPresets.length > 0 && visiblePresets.length === 0"
                        class="mb-appearance-editor__hint"
                    >
                        {{ t("appearance.preset.noMatch", "No saved preset matches that search.") }}
                    </p>

                    <ul class="mb-appearance-editor__presetList">
                        <li
                            v-for="entry in visiblePresets"
                            :key="entry.id"
                            class="mb-appearance-editor__row"
                        >
                            <span class="mb-appearance-editor__rowLabel">{{ entry.name }}</span>
                            <!--
                                Gated, because a saved preset is user work with no copy
                                anywhere else: unlike an element override, which the element
                                itself can be used to rebuild, a deleted preset is gone and
                                every element that was following it silently changes at the
                                same moment.
                            -->
                            <ConfigSuperConfirm
                                :title="t('appearance.preset.deleteTitle', 'Delete this preset')"
                                :action="
                                    t(
                                        'appearance.preset.deleteAction',
                                        { name: entry.name },
                                        'This deletes the preset {name}. Elements following it go back to their own settings, and the preset cannot be recovered.',
                                    )
                                "
                                :affected="[entry.name]"
                                :confirm-label="
                                    t('appearance.preset.deleteConfirm', 'Delete the preset')
                                "
                                @confirm="deletePreset(entry.id)"
                            >
                                <template #activator="{ props: activatorProps }">
                                    <v-btn
                                        v-bind="activatorProps"
                                        :icon="mdiDelete"
                                        size="x-small"
                                        variant="text"
                                        :aria-label="
                                            t(
                                                'appearance.preset.delete',
                                                { name: entry.name },
                                                'Delete the preset {name}',
                                            )
                                        "
                                    />
                                </template>
                            </ConfigSuperConfirm>
                        </li>
                    </ul>

                    <p v-if="userPresets.length === 0" class="mb-appearance-editor__hint">
                        {{
                            t(
                                "appearance.preset.none.saved",
                                "No presets saved yet. The three built-in ones are always available.",
                            )
                        }}
                    </p>

                    <v-divider />

                    <div class="mb-appearance-editor__row">
                        <v-btn
                            :prepend-icon="mdiDownload"
                            size="small"
                            variant="tonal"
                            @click="exportToFile"
                        >
                            {{ t("appearance.theme.export", "Export the theme") }}
                        </v-btn>
                        <v-btn
                            :prepend-icon="mdiUpload"
                            size="small"
                            variant="tonal"
                            @click="fileInput?.click()"
                        >
                            {{ t("appearance.theme.import", "Import a theme") }}
                        </v-btn>
                        <input
                            ref="fileInput"
                            class="mb-appearance-editor__file"
                            type="file"
                            accept="application/json,.json"
                            :aria-label="t('appearance.theme.importField', 'Choose a theme file')"
                            @change="onFileChosen"
                        />
                    </div>

                    <v-alert v-if="importMessage" type="info" variant="tonal" density="compact">
                        {{ importMessage }}
                    </v-alert>
                    <v-alert v-if="importError" type="error" variant="tonal" density="compact">
                        {{ importError }}
                    </v-alert>

                    <v-divider />

                    <!--
                        The one control in this panel that asks before it acts. Every other
                        change here is undone by making the opposite change, and this one is
                        not: it throws away every override in the app at once, and there is
                        nothing on screen afterwards to rebuild them from.
                    -->
                    <ConfigSuperConfirm
                        :title="
                            t('appearance.editor.resetAllTitle', 'Reset every element in the app')
                        "
                        :action="
                            t(
                                'appearance.editor.resetAllAction',
                                { count: Object.keys(state.elements).length },
                                'This removes the appearance overrides on all {count} customised elements at once and cannot be undone. Saved presets are kept.',
                            )
                        "
                        :affected="Object.keys(state.elements)"
                        :confirm-label="
                            t('appearance.editor.resetAllConfirm', 'Reset every element')
                        "
                        :disabled="Object.keys(state.elements).length === 0"
                        @confirm="target.resetEverything()"
                    >
                        <template #activator="{ props: activatorProps }">
                            <v-btn
                                v-bind="activatorProps"
                                size="small"
                                variant="text"
                                color="error"
                            >
                                {{
                                    t(
                                        "appearance.editor.resetAll",
                                        "Reset every element in the app",
                                    )
                                }}
                                <v-tooltip
                                    activator="parent"
                                    location="top"
                                    :text="
                                        t(
                                            'appearance.editor.resetAllHint',
                                            'Removes every appearance override. Saved presets are kept.',
                                        )
                                    "
                                />
                            </v-btn>
                        </template>
                    </ConfigSuperConfirm>
                </div>
            </v-window-item>
        </v-window>
    </section>
</template>

<style>
.mb-appearance-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    inline-size: min(420px, 92vw);
    /*
     * Bounded and scrollable rather than merely capped. The typography tab has
     * twenty-seven rows and a short window would otherwise simply not show the last of
     * them, with nothing on screen to say they exist.
     */
    max-block-size: min(78vh, 720px);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px;
    border-radius: 16px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow:
        0 6px 10px 4px rgba(0, 0, 0, 0.15),
        0 2px 3px rgba(0, 0, 0, 0.3);
}

.mb-appearance-editor__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-appearance-editor__title {
    flex: 1 1 auto;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 500;
}

/*
 * `.mb-appearance-editor` is a column flexbox, and Vuetify's `v-tabs` (built on
 * `v-slide-group`) carries its own `overflow: hidden`. Per the flexbox spec, a flex
 * item's automatic minimum size resolves to 0 - not its content size - whenever the
 * item's own `overflow` is anything but `visible`. Left at the default `flex-shrink: 1`,
 * that let the tab strip collapse to a zero-height box in the flow while its `v-tab`
 * buttons kept painting at their real 36px, floating over whatever came next: the
 * Text tab's own search field, which starts exactly one `gap` below where the strip's
 * collapsed box ends, not below where the tabs actually are. Vuetify's `v-window`
 * transition and this project's own tab strips never hit it because neither wraps its
 * outer element in `overflow: hidden`. `flex-shrink: 0` is the standard fix: never let
 * this one item shrink below the content size the buttons are actually painted at.
 */
.mb-appearance-editor > .v-tabs {
    flex-shrink: 0;
}

.mb-appearance-editor__body {
    overflow: visible;
    min-inline-size: 0;
}

.mb-appearance-editor__surface,
.mb-appearance-editor__presets {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-block-start: 8px;
}

.mb-appearance-editor__row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
}

.mb-appearance-editor__row > :not(.mb-appearance-editor__rowLabel) {
    min-inline-size: 0;
}

.mb-appearance-editor__rowLabel {
    flex: 0 0 auto;
    inline-size: 140px;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-appearance-editor__presetList {
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-appearance-editor__hint {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/*
 * Present, focusable through its button, and never drawn: the native file input is one of
 * the few controls a browser will not let an application style, and the visible control is
 * the button above that clicks it.
 */
.mb-appearance-editor__file {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
}
</style>

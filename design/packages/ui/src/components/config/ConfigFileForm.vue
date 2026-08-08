<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiCodeBraces, mdiContentCopy, mdiTuneVariant } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VExpansionPanel,
    VExpansionPanelText,
    VExpansionPanelTitle,
    VExpansionPanels,
    VSwitch,
    VTextarea,
} from "vuetify/components";
import type { FieldMeta, PlainValue } from "@worldlens/config";
import ConfigField from "./ConfigField.vue";
import ConfigSearchField from "./ConfigSearchField.vue";
import { filterFields, sampleTextFor } from "./configSearch.js";
import { createSettingMatcher } from "./regexEngine.js";
import type { EditableConfigFile } from "./configModel.js";
import { UNKNOWN_WORLD, type WorldOrientation } from "./maskCanvas.js";

/**
 * A whole config file, rendered from its descriptor.
 *
 * Nothing here names a setting. The groups, the fields inside them, the controls,
 * the documentation and the defaults are all read from
 * `@worldlens/config`, so a setting added to the schema appears on this
 * form with no change to this component, and no setting can be forgotten by
 * somebody hand-writing a form.
 */
const props = withDefaults(
    defineProps<{
        file: EditableConfigFile;
        /** Shown above the form; defaults to the descriptor's own title. */
        title?: string;
        subtitle?: string;
        disabled?: boolean;
        /** A field path to reveal and mark, used when a search result is opened. */
        highlightPath?: string | null;
        world?: WorldOrientation;
    }>(),
    {
        title: "",
        subtitle: "",
        disabled: false,
        highlightPath: null,
        world: () => UNKNOWN_WORLD,
    },
);

const emit = defineEmits<{
    set: [field: FieldMeta, value: PlainValue];
    clear: [field: FieldMeta];
    consent: [];
    /** Raw text edited directly, for a file whose HOCON does not parse. */
    "update:text": [value: string];
}>();

const { t } = useI18n();

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a setting name, and
// `m` because a field's searchable text is several lines (label, key, Java field,
// upstream's explanation), so `^` and `$` are only useful per line.
const flags = ref("im");
const showAdvanced = ref(false);
const rawOpen = ref(false);
/**
 * The raw-source disclosure needs a real, stable target for its `aria-controls`.
 *
 * `file.path` is the config file's identity within a workspace, and normalising it
 * keeps the resulting DOM id valid even for map and storage paths such as
 * `maps/overworld.conf`.
 */
const rawPanelId = computed(
    () => `mb-config-form-source-${props.file.path.replace(/[^A-Za-z0-9_-]+/g, "-")}`,
);
const worldOrientation = computed<WorldOrientation>(() => props.world);
const copyState = ref("");

const descriptor = computed(() => props.file.descriptor);
const heading = computed(() => (props.title === "" ? descriptor.value.title : props.title));
const blurb = computed(() => (props.subtitle === "" ? descriptor.value.description : props.subtitle));

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

interface RenderedGroup {
    readonly id: string;
    readonly label: string;
    readonly description: string | undefined;
    readonly fields: readonly FieldMeta[];
    readonly hiddenByAdvanced: number;
}

const groups = computed<RenderedGroup[]>(() =>
    descriptor.value.groups
        .map((group) => {
            const all = descriptor.value.fields.filter((field) => field.group === group.id);
            const shown = filterFields(all, props.file, matcher.value, showAdvanced.value);
            return {
                id: group.id,
                label: group.label,
                description: group.description,
                fields: shown,
                hiddenByAdvanced: matcher.value.active ? 0 : all.filter((field) => field.advanced).length,
            };
        })
        .filter((group) => group.fields.length > 0),
);

const totalFields = computed(() => descriptor.value.fields.length);
const shownFields = computed(() => groups.value.reduce((total, group) => total + group.fields.length, 0));

const summary = computed(() => {
    if (matcher.value.error !== null) return t("config.form.badPattern", "The pattern is not valid, so nothing is shown.");
    if (!matcher.value.active && showAdvanced.value) return "";
    if (!matcher.value.active) {
        const advanced = totalFields.value - shownFields.value;
        // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
        // the message itself, so it consumes the counts as its own named parameters and a
        // later `replace` finds nothing left to substitute. A summary whose only content is
        // its numbers then reads "Showing  of  settings."
        return advanced === 0
            ? ""
            : t(
                  "config.form.advancedHidden",
                  { shown: shownFields.value, total: totalFields.value, advanced },
                  "Showing {shown} of {total} settings. {advanced} advanced ones are hidden.",
              );
    }
    return t(
        "config.form.matches",
        { shown: shownFields.value, total: totalFields.value },
        "{shown} of {total} settings match.",
    );
});

const sample = computed(() => sampleTextFor(descriptor.value.fields));

const errors = computed(() => props.file.issues.filter((issue) => issue.severity === "error"));
const fileWideErrors = computed(() => errors.value.filter((issue) => issue.path === ""));
const unknownKeys = computed(() => props.file.issues.filter((issue) => issue.kind === "unknown-key"));
const legacyKeys = computed(() => props.file.issues.filter((issue) => issue.kind === "legacy-key"));

/**
 * Which groups are expanded.
 *
 * `null` means the user has not chosen, in which case every group is open: a
 * settings screen that starts entirely collapsed hides the thing the person came
 * for behind a row of headings. Once they collapse one, their choice is kept.
 */
const chosenPanels = ref<number[] | null>(null);
const allPanels = computed(() => groups.value.map((_, index) => index));
const openPanels = computed<number[]>({
    get: () => chosenPanels.value ?? allPanels.value,
    set: (value) => {
        chosenPanels.value = value;
    },
});

/**
 * Opening a group because the search or the palette sent the user to a field
 * inside it, then bringing that field into view.
 *
 * Landing somebody on the right screen with the setting still folded away is
 * the failure this exists to prevent.
 */
watch(
    () => props.highlightPath,
    async (path) => {
        if (path === null || path === "") return;

        const index = groups.value.findIndex((group) => group.fields.some((field) => field.path === path));
        if (index >= 0 && !openPanels.value.includes(index)) chosenPanels.value = [...openPanels.value, index];

        await nextTick();
        const element = document.querySelector(`[data-field-path="${CSS.escape(path)}"]`);
        element?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    { immediate: true },
);

async function copyText(): Promise<void> {
    try {
        await navigator.clipboard.writeText(props.file.text);
        copyState.value = t("config.form.copied", "Copied the file exactly as it stands.");
    } catch {
        copyState.value = t("config.form.copyFailed", "Could not reach the clipboard.");
    }
}
</script>

<template>
    <section class="mb-config-form" :aria-label="heading">
        <header class="mb-config-form__head">
            <div>
                <h2 class="mb-config-form__title">{{ heading }}</h2>
                <p class="mb-config-form__blurb">{{ blurb }}</p>
                <p class="mb-config-form__path">{{ file.path }}</p>
            </div>
        </header>

        <v-alert v-if="file.readOnly" type="info" density="compact" variant="tonal" class="mb-3">
            {{ file.readOnlyReason }}
        </v-alert>

        <v-alert v-for="issue in fileWideErrors" :key="issue.message" type="error" density="compact" variant="tonal" class="mb-3" role="alert">
            {{ issue.message }}
        </v-alert>

        <v-alert v-for="issue in legacyKeys" :key="issue.path" type="error" density="compact" variant="tonal" class="mb-3" role="alert">
            <strong>{{ issue.path }}</strong> {{ issue.message }}
        </v-alert>

        <v-alert v-for="issue in unknownKeys" :key="issue.path" type="warning" density="compact" variant="tonal" class="mb-3">
            {{ issue.message }}
        </v-alert>

        <!-- The raw editor is the only way out of a file that does not parse. -->
        <template v-if="file.document === null">
            <v-textarea
                :model-value="file.text"
                :label="t('config.form.raw', 'File text')"
                class="mb-config-form__raw"
                rows="18"
                variant="outlined"
                density="compact"
                spellcheck="false"
                hide-details="auto"
                @update:model-value="(value: string) => emit('update:text', value)"
            />
            <p class="mb-config-form__blurb">
                {{
                    t(
                        "config.form.rawOnly",
                        "The controls come back as soon as the file parses. Nothing was changed or reformatted while it does not.",
                    )
                }}
            </p>
        </template>

        <template v-else>
            <div class="mb-config-form__tools">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('config.form.search', 'Search these settings')"
                    :placeholder="t('config.form.searchHint', 'name, key or anything in the explanation')"
                    :sample="sample"
                    :summary="summary"
                />
                <v-switch
                    v-model="showAdvanced"
                    :label="t('config.form.advanced', 'Show advanced settings')"
                    :prepend-icon="mdiTuneVariant"
                    color="primary"
                    density="compact"
                    hide-details
                    inset
                />
            </div>

            <p v-if="groups.length === 0" class="mb-config-form__empty">
                {{ t("config.form.noMatches", "Nothing on this screen matches. The search across every screen may still have results.") }}
            </p>

            <v-expansion-panels v-model="openPanels" multiple variant="accordion" class="mb-config-form__panels">
                <v-expansion-panel v-for="group in groups" :key="group.id">
                    <v-expansion-panel-title>
                        <span class="mb-config-form__group">{{ group.label }}</span>
                        <span class="mb-config-form__count">{{ group.fields.length }}</span>
                    </v-expansion-panel-title>
                    <v-expansion-panel-text>
                        <p v-if="group.description" class="mb-config-form__blurb">{{ group.description }}</p>
                        <ConfigField
                            v-for="field in group.fields"
                            :key="field.path"
                            :field="field"
                            :file="file"
                            :disabled="disabled || file.readOnly"
                            :highlighted="highlightPath === field.path"
                            :world="worldOrientation"
                            @set="(target, value) => emit('set', target, value)"
                            @clear="(target) => emit('clear', target)"
                            @consent="emit('consent')"
                        />
                    </v-expansion-panel-text>
                </v-expansion-panel>
            </v-expansion-panels>

            <v-card variant="tonal" class="mb-config-form__source">
                <v-card-title class="mb-config-form__source-head mb-responsive-card-title">
                    <v-btn
                        class="mb-responsive-card-title__action"
                        :prepend-icon="mdiCodeBraces"
                        :aria-expanded="rawOpen ? 'true' : 'false'"
                        :aria-controls="rawPanelId"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="rawOpen = !rawOpen"
                    >
                        {{ rawOpen ? t("config.form.hideSource", "Hide the file") : t("config.form.showSource", "Show the file as it will be written") }}
                    </v-btn>
                    <v-btn class="mb-responsive-card-title__action" :prepend-icon="mdiContentCopy" variant="text" size="small" density="comfortable" @click="copyText">
                        {{ t("config.form.copy", "Copy") }}
                    </v-btn>
                </v-card-title>
                <v-card-text v-if="rawOpen" :id="rawPanelId">
                    <pre class="mb-config-form__pre">{{ file.text }}</pre>
                </v-card-text>
            </v-card>
            <p class="mb-config-form__blurb" aria-live="polite">{{ copyState }}</p>
        </template>

        <p v-if="errors.length > 0" class="mb-config-form__errorline" role="status">
            <v-btn :prepend-icon="mdiAlertCircleOutline" variant="text" size="x-small" density="comfortable" disabled>
                {{ t("config.form.errorCount", { n: errors.length }, "{n} problems") }}
            </v-btn>
        </p>
    </section>
</template>

<style>
.mb-config-form__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-block-end: 8px;
}

.mb-config-form__title {
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1.3;
}

.mb-config-form__blurb,
.mb-config-form__empty {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-form__path {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-config-form__tools {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
    margin-block: 12px;
}

.mb-config-form__tools > *:first-child {
    flex: 1 1 260px;
    min-width: 0;
}

.mb-config-form__panels {
    border-radius: 12px;
    overflow: hidden;
}

.mb-config-form__group {
    font-weight: 500;
    /*
     * This translated schema label is a flex child of Vuetify's expansion-panel
     * title. Permit it to shrink and wrap instead of widening a narrow panel.
     */
    min-width: 0;
    overflow-wrap: anywhere;
}

.mb-config-form__count {
    margin-inline-start: auto;
    margin-inline-end: 12px;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-form__source {
    margin-block-start: 16px;
    border-radius: 12px;
}

.mb-config-form__source-head {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 8px;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * reaches every `.v-btn__content` inside too, so the "Show the file as it will be
     * written" / "Copy" buttons could be silently cut off at a narrow width or in
     * bilingual mode rather than wrapping to a second line. Same fix as
     * `DockerWorldSourcePanel.vue`'s `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}

.mb-config-form__pre,
.mb-config-form__raw textarea {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}

.mb-config-form__pre {
    margin: 0;
    max-height: 50vh;
    overflow: auto;
    white-space: pre;
}
</style>

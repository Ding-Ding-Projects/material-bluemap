<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBackupRestore, mdiTuneVariant } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VChip,
    VExpansionPanel,
    VExpansionPanelText,
    VExpansionPanelTitle,
    VExpansionPanels,
    VSwitch,
} from "vuetify/components";
import type { FieldMeta, PlainValue } from "@material-bluemap/config";
import ConfigField from "../config/ConfigField.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { filterFields, sampleTextFor } from "../config/configSearch.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { EditableConfigFile } from "../config/configModel.js";
import { defaultOpenGroups, optionFields, optionGroups, reachesRender } from "./wizardSteps.js";

/**
 * Step three: every remaining setting BlueMap's map config has.
 *
 * Not one of them is written out here. The groups, the fields inside them, the
 * controls, upstream's own documentation, the defaults and the re-render warnings
 * are all read from `@material-bluemap/config`, so a setting added to the schema
 * appears on this step with no change to this component. A hand-written list of
 * 92 fields is a list that quietly stops being 92 fields.
 *
 * The wizard can be finished by pressing through it. Every value already has
 * upstream's own default, groups that are entirely expert territory start folded,
 * and the advanced settings inside an everyday group are one switch away rather
 * than in a text editor.
 */
const props = defineProps<{
    file: EditableConfigFile;
    /** Highlighted after a search result or the review sends somebody to a setting. */
    highlightPath?: string | null;
    /** How many settings the person has changed, for the reset control. */
    changedCount: number;
}>();

const emit = defineEmits<{
    set: [field: FieldMeta, value: PlainValue];
    clear: [field: FieldMeta];
    consent: [];
    reset: [];
}>();

const { t } = useI18n();

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a setting name, and `m`
// because a field's searchable text is several lines, so `^` and `$` are only
// useful per line.
const flags = ref("im");
const showAdvanced = ref(false);

const groups = computed(() => optionGroups());
/**
 * Which groups are open.
 *
 * `null` means nobody has chosen, in which case the everyday groups are open and
 * the expert ones are folded. A first render should not require reading tile
 * geometry documentation; an expert should not have to leave the app to find it.
 */
const chosenPanels = ref<string[] | null>(null);
const openPanels = computed<string[]>({
    get: () => chosenPanels.value ?? defaultOpenGroups(groups.value),
    set: (value) => {
        chosenPanels.value = value;
    },
});

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const rendered = computed(() =>
    groups.value
        .map((group) => ({
            ...group,
            shown: filterFields(group.fields, props.file, matcher.value, showAdvanced.value),
        }))
        .filter((group) => group.shown.length > 0),
);

const total = computed(() => optionFields().length);
const shown = computed(() => rendered.value.reduce((sum, group) => sum + group.shown.length, 0));

const summary = computed(() => {
    if (matcher.value.error !== null) return t("world.options.badPattern", "The pattern is not valid, so nothing is shown.");
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
    // compiles the fallback as a message too and consumes `{shown}` and `{total}` as
    // its own named parameters, so a later `replace` has nothing to substitute and
    // the counts vanish from the sentence that exists to state them.
    if (matcher.value.active) {
        return t("world.options.matches", { shown: shown.value, total: total.value }, "{shown} of {total} settings match.");
    }
    const hidden = total.value - shown.value;
    return hidden === 0
        ? t("world.options.allShown", { total: total.value }, "All {total} settings are shown.")
        : t(
              "world.options.someHidden",
              { shown: shown.value, total: total.value, hidden },
              "Showing {shown} of {total} settings. {hidden} advanced ones are hidden.",
          );
});

const sample = computed(() => sampleTextFor(optionFields()));

/**
 * Searching opens every group that has a match.
 *
 * Landing a person on the right step with the setting still folded away is the
 * failure a search on a collapsed surface exists to prevent.
 */
function onQuery(value: string): void {
    query.value = value;
    if (value.trim() === "") return;
    chosenPanels.value = groups.value.map((group) => group.id);
}
</script>

<template>
    <section class="mb-world-step" :aria-label="t('world.wizard.step.options', 'Options')">
        <h3 class="mb-world-step__title">{{ t("world.options.title", "How the map should look") }}</h3>
        <p class="mb-world-step__blurb">
            {{
                t(
                    "world.options.blurb",
                    "Every one of these already has BlueMap's own default, so you can press straight through to the end. Change what you want to change; the rest stays as upstream ships it.",
                )
            }}
        </p>

        <div class="mb-world-options__tools">
            <ConfigSearchField
                :model-value="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('world.options.search', 'Search these settings')"
                :placeholder="t('world.options.searchHint', 'name, key or anything in the explanation')"
                :sample="sample"
                :summary="summary"
                @update:model-value="onQuery"
            />
            <v-switch
                v-model="showAdvanced"
                :label="t('world.options.advanced', 'Show advanced settings')"
                :prepend-icon="mdiTuneVariant"
                color="primary"
                density="compact"
                hide-details
                inset
            />
            <v-btn
                :prepend-icon="mdiBackupRestore"
                :disabled="changedCount === 0"
                variant="text"
                size="small"
                density="comfortable"
                @click="emit('reset')"
            >
                {{
                    changedCount === 0
                        ? t("world.options.noChanges", "Nothing changed yet")
                        : t("world.options.resetAll", { n: changedCount }, "Undo my {n} changes")
                }}
            </v-btn>
        </div>

        <p v-if="rendered.length === 0" class="mb-world-step__blurb">
            {{ t("world.options.noMatches", "Nothing on this step matches that search.") }}
        </p>

        <v-expansion-panels v-model="openPanels" multiple variant="accordion" class="mb-world-options__panels">
            <v-expansion-panel v-for="group in rendered" :key="group.id" :value="group.id">
                <v-expansion-panel-title>
                    <span class="mb-world-options__group">{{ group.label }}</span>
                    <v-chip v-if="group.advanced" size="x-small" variant="outlined" class="ml-2">
                        {{ t("world.options.advancedGroup", "Advanced") }}
                    </v-chip>
                    <span class="mb-world-options__count">{{ group.shown.length }}</span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                    <p v-if="group.description" class="mb-world-step__blurb">{{ group.description }}</p>
                    <div v-for="field in group.shown" :key="field.path" class="mb-world-options__field">
                        <ConfigField
                            :field="field"
                            :file="file"
                            :highlighted="highlightPath === field.path"
                            @set="(target, value) => emit('set', target, value)"
                            @clear="(target) => emit('clear', target)"
                            @consent="emit('consent')"
                        />
                        <p v-if="!reachesRender(field.path)" class="mb-world-options__carried">
                            {{
                                t(
                                    "world.options.carried",
                                    "Written into this map's config file. The review step says which settings this render reads.",
                                )
                            }}
                        </p>
                    </div>
                </v-expansion-panel-text>
            </v-expansion-panel>
        </v-expansion-panels>

        <v-alert v-if="file.document === null" type="error" density="compact" variant="tonal" class="mt-3" role="alert">
            {{
                t(
                    "world.options.unparsed",
                    "The map config built from these answers does not parse, which is a fault in this app rather than in anything you chose. The review step shows the file as it stands.",
                )
            }}
        </v-alert>
    </section>
</template>

<style>
.mb-world-options__tools {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
    margin-block: 16px;
}

.mb-world-options__tools > *:first-child {
    flex: 1 1 260px;
    min-width: 0;
}

.mb-world-options__panels {
    border-radius: 12px;
    overflow: hidden;
}

.mb-world-options__group {
    font-weight: 500;
}

.mb-world-options__count {
    margin-inline-start: auto;
    margin-inline-end: 12px;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-options__carried {
    margin-block: -6px 10px;
    font-size: 0.6875rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}
</style>

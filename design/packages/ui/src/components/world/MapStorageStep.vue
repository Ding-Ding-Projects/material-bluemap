<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentSaveCheckOutline, mdiFolderSearchOutline, mdiRestore } from "@mdi/js";
import { VAlert, VBtn, VIcon, VProgressCircular, VTextField } from "vuetify/components";
import { findField, type FieldMeta, type PlainValue } from "@worldlens/config";
import ConfigField from "../config/ConfigField.vue";
import { useConfigHost } from "../config/configHost.js";
import type { EditableConfigFile } from "../config/configModel.js";
import { mapDescriptor } from "./wizardSteps.js";

/**
 * Step four: where the rendered map is written.
 *
 * Two different things live here and they are kept visibly apart, because
 * confusing them is how somebody ends up with a map nobody can find. The folder
 * is where this app writes renders on this machine; it belongs to the app, so
 * changing it changes it everywhere. The storage name below it is BlueMap's own
 * setting naming which storage config the map's tiles go through, and it is the
 * last of the map settings the wizard asks for in its own words.
 */
const props = defineProps<{
    modelValue: string;
    defaultDirectory: string;
    /** True when the app told us the folder rather than it being typed in here. */
    known: boolean;
    applying: boolean;
    /** A refused change, in the main process's own words. Null when there is none. */
    applyFailure: string | null;
    /** True once the folder on screen is the folder the app will actually use. */
    applied: boolean;
    file: EditableConfigFile;
    problems: readonly string[];
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
    /** Asks the shell to point rendering at this folder. */
    apply: [value: string];
    set: [field: FieldMeta, value: PlainValue];
    clear: [field: FieldMeta];
    consent: [];
}>();

const { t } = useI18n();
const host = useConfigHost();

const directory = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const storageField = computed(() => findField(mapDescriptor(), "storage") ?? null);

const changed = computed(() => props.modelValue.trim() !== props.defaultDirectory.trim());

async function browse(): Promise<void> {
    if (host === null) return;
    const chosen = await host.pickDirectory({
        title: t("world.storage.pick", "Choose where rendered maps are written"),
        ...(props.modelValue.trim() === "" ? {} : { startIn: props.modelValue.trim() }),
    });
    if (chosen === null) return;
    emit("update:modelValue", chosen);
    emit("apply", chosen);
}
</script>

<template>
    <section class="mb-world-step" :aria-label="t('world.wizard.step.storage', 'Where it goes')">
        <h3 class="mb-world-step__title">{{ t("world.storage.title", "Where the map is written") }}</h3>
        <p class="mb-world-step__blurb">
            {{
                t(
                    "world.storage.blurb",
                    "Rendered tiles, the copy of the viewer that serves them, and the files the engine needs while it works all go under this folder. A full render of a large world can be several gigabytes, so choose a drive with room on it.",
                )
            }}
        </p>

        <div class="mb-world-step__row">
            <v-text-field
                v-model="directory"
                :label="t('world.storage.folder', 'Folder for rendered maps')"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                hide-details="auto"
                @blur="emit('apply', directory)"
                @keydown.enter="emit('apply', directory)"
            />
            <v-btn :prepend-icon="mdiFolderSearchOutline" :disabled="host === null" variant="tonal" @click="browse">
                {{ t("world.storage.browse", "Browse") }}
            </v-btn>
            <v-btn
                :prepend-icon="mdiRestore"
                :disabled="!changed || defaultDirectory === ''"
                variant="text"
                @click="
                    emit('update:modelValue', defaultDirectory);
                    emit('apply', defaultDirectory);
                "
            >
                {{ t("world.storage.useDefault", "Use the default") }}
            </v-btn>
        </div>

        <div v-if="applying" class="mb-world-step__checking" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("world.storage.applying", "Pointing rendering at that folder...") }}</span>
        </div>

        <v-alert v-else-if="applyFailure" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ applyFailure }}
        </v-alert>

        <p v-else-if="applied" class="mb-world-step__applied" role="status">
            <v-icon :icon="mdiContentSaveCheckOutline" size="16" aria-hidden="true" />
            {{ t("world.storage.applied", "Renders will be written here, from now on and not only this one.") }}
        </p>

        <v-alert v-if="!known" type="info" density="compact" variant="tonal" class="mt-2">
            {{
                t(
                    "world.storage.unknown",
                    "The app did not say where it writes maps, so this is whatever is typed above. In the desktop app it arrives filled in with the real folder.",
                )
            }}
        </v-alert>

        <v-alert v-for="problem in problems" :key="problem" type="warning" density="compact" variant="tonal" class="mt-2">
            {{ problem }}
        </v-alert>

        <div v-if="storageField" class="mb-world-storage__setting">
            <h4 class="mb-world-storage__subtitle">{{ t("world.storage.settingTitle", "The map's own storage setting") }}</h4>
            <ConfigField
                :field="storageField"
                :file="file"
                @set="(target, value) => emit('set', target, value)"
                @clear="(target) => emit('clear', target)"
                @consent="emit('consent')"
            />
        </div>
    </section>
</template>

<style>
.mb-world-storage__setting {
    margin-block-start: 20px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-world-storage__subtitle {
    font-size: 0.9375rem;
    font-weight: 500;
    margin-block-end: 4px;
}

.mb-world-step__applied {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-block-start: 8px;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

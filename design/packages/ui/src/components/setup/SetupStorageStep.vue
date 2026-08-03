<script setup lang="ts">
import { computed } from "vue";
import { VBtn, VTextField } from "vuetify/components";
import { mdiFolderOpen } from "@mdi/js";
import SetupText from "./SetupText.vue";
import { useSetupI18n } from "./setupI18n.js";
import {
    defaultMapStorageDir,
    expandsAtRenderTime,
    mapStorageExample,
    pathToken,
    type MapStorageProblem,
    type SetupPlatform,
} from "./mapStorage.js";

/**
 * Step three: where rendered maps are written.
 *
 * The default is the platform's own application-data folder, which is where the app
 * already keeps its data, so the maps do not end up in a second unrelated place. It is
 * shown with its environment token intact (`%APPDATA%` on Windows, `~` elsewhere)
 * because that is the real value the main process expands when a render starts, and the
 * hint underneath names the exact token on screen rather than describing it vaguely.
 *
 * When the preload grows a folder picker, `canBrowse` turns true and a Choose folder
 * button appears beside the field. Until then there is no button pretending to be one:
 * a control that looks operable and does nothing is worse than a control that is absent.
 */
const props = defineProps<{
    modelValue: string;
    platform: SetupPlatform;
    problem: MapStorageProblem;
    canBrowse: boolean;
    busy: boolean;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
    browse: [];
    useDefault: [];
}>();

const i18n = useSetupI18n();

const isDefault = computed(() => props.modelValue.trim() === defaultMapStorageDir(props.platform));

const showTokenHint = computed(() => expandsAtRenderTime(props.modelValue, props.platform));

const errorMessage = computed(() => {
    if (props.problem === "empty") return i18n.t("storage.empty");
    if (props.problem === "relative") {
        return i18n.t("storage.invalid", { example: mapStorageExample(props.platform) });
    }
    return "";
});
</script>

<template>
    <div class="mb-setup-step">
        <SetupText tag="h2" text-key="storage.heading" class="mb-setup-step__heading" />
        <SetupText text-key="storage.lead" class="mb-setup-step__lead" />

        <div class="mb-setup-storage">
            <v-text-field
                :model-value="modelValue"
                :label="i18n.t('storage.fieldLabel')"
                :error-messages="errorMessage"
                :disabled="busy"
                :hint="isDefault ? i18n.t('storage.defaultLabel') : ''"
                persistent-hint
                variant="outlined"
                density="comfortable"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                class="mb-setup-storage__field"
                @update:model-value="(value: string) => emit('update:modelValue', value)"
            />
            <div class="mb-setup-storage__actions">
                <v-btn
                    v-if="canBrowse"
                    :prepend-icon="mdiFolderOpen"
                    :disabled="busy"
                    variant="tonal"
                    class="mb-setup-storage__button"
                    @click="emit('browse')"
                >
                    {{ i18n.t("action.browse") }}
                </v-btn>
                <v-btn
                    :disabled="busy || isDefault"
                    variant="text"
                    class="mb-setup-storage__button"
                    @click="emit('useDefault')"
                >
                    {{ i18n.t("action.useDefault") }}
                </v-btn>
            </div>
        </div>

        <SetupText
            v-if="showTokenHint"
            text-key="storage.pathHint"
            :vars="{ token: pathToken(platform) }"
            class="mb-setup-step__lead"
        />
        <SetupText text-key="storage.note" class="mb-setup-step__lead" />
    </div>
</template>

<style>
.mb-setup-storage {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 12px;
}

.mb-setup-storage__field {
    /* Wide enough for a real path, and allowed to be the whole row at 800x600. */
    flex: 1 1 20rem;
    min-width: 0;
}

.mb-setup-storage__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    /* Aligns the buttons with the field's input row rather than its floating label. */
    padding-block-start: 4px;
}

.mb-setup-storage__button {
    min-height: 40px;
}
</style>

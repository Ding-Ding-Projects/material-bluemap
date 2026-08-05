<script setup lang="ts">
import { computed } from "vue";
import { VBtn } from "vuetify/components";
import PathField from "../PathField.vue";
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
 * The browse button is `PathField.vue`, the same shared affordance every path field in
 * the app now adopts. It used to be gated on `canBrowse`, a prop that stayed false
 * forever because it watched `chooseMapStorageDirectory`, a preload method nobody ever
 * implemented; `PathField` reaches the real `window.materialBluemap.dialog` bridge
 * instead, so the button now genuinely works in the desktop app and disables itself
 * with an honest explanation everywhere else. There is no `canBrowse` prop and no
 * `browse` event left to wire: `PathField` decides for itself whether a bridge exists.
 */
const props = defineProps<{
    modelValue: string;
    platform: SetupPlatform;
    problem: MapStorageProblem;
    busy: boolean;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
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
            <PathField
                :model-value="modelValue"
                field="the map storage folder"
                :label="i18n.t('storage.fieldLabel')"
                semantic="folder"
                :disabled="busy"
                :error="errorMessage"
                density="comfortable"
                class="mb-setup-storage__field"
                @update:model-value="(value: string) => emit('update:modelValue', value)"
            />
            <div class="mb-setup-storage__actions">
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
            v-if="isDefault"
            text-key="storage.defaultLabel"
            class="mb-setup-storage__hint"
        />

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

.mb-setup-storage__hint {
    margin-block-start: -4px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

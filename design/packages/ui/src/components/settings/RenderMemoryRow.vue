<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VBtnToggle, VTextField } from "vuetify/components";
import type { RenderMemorySetting } from "./renderMemorySetting.js";

/**
 * How much memory a render's JVM may use — the setting `files/renderMemory.ts` has
 * always stored and validated, and that no render ever actually read until now (see
 * `render/orchestrator.ts`'s `jvmArgs` option). This row is the other missing half: the
 * control that lets somebody see and change it.
 *
 * Two controls, not one continuous slider: **Automatic**, which is what a fresh install
 * already behaves as and stays the default, and **Manual**, a plain number of megabytes.
 * Automatic is not "no limit" — the main process still recommends and applies a real
 * ceiling, worked out from the machine's own memory — it is "let the app pick the
 * number", which is the distinction the explanation text below states rather than
 * assumes.
 */
const props = defineProps<{
    setting: RenderMemorySetting;
}>();

const { t } = useI18n();

/** `VBtnToggle`'s own model, backed by the two-way `mode` ref underneath. */
const modeValue = computed<"automatic" | "manual">({
    get: () => props.setting.mode.value,
    set: (next) => {
        props.setting.mode.value = next;
    },
});

function onToggle(value: "automatic" | "manual" | null): void {
    if (value === null) return;
    modeValue.value = value;
}

const megabytes = computed<string>({
    get: () => props.setting.megabytes.value,
    set: (next) => {
        props.setting.megabytes.value = next;
    },
});

const canSave = computed(
    () =>
        props.setting.dirty.value &&
        props.setting.problem.value === null &&
        !props.setting.busy.value &&
        props.setting.canApply,
);

const canReset = computed(() => !props.setting.isDefault.value && !props.setting.busy.value && props.setting.canApply);

function onSave(): void {
    void props.setting.save();
}

function onReset(): void {
    void props.setting.reset();
}
</script>

<template>
    <div class="mb-render-memory">
        <p v-if="!props.setting.supported" class="mb-render-memory__note">
            {{
                t(
                    "settings.renderMemory.unsupported",
                    "This build cannot report or change the memory ceiling. Nothing is wrong with the setting — the app has no way to ask about it from this screen yet.",
                )
            }}
        </p>

        <template v-else>
            <div
                v-if="props.setting.readout.value !== null"
                class="mb-render-memory__toggle-row"
                role="group"
                :aria-label="t('settings.renderMemory.pickerLabel', 'How the memory ceiling is chosen')"
            >
                <v-btn-toggle
                    :model-value="modeValue"
                    :disabled="props.setting.busy.value || !props.setting.canApply"
                    color="primary"
                    variant="outlined"
                    density="comfortable"
                    divided
                    mandatory
                    @update:model-value="(value: 'automatic' | 'manual' | null) => onToggle(value)"
                >
                    <v-btn value="automatic">
                        {{ t("settings.renderMemory.automatic", "Automatic") }}
                    </v-btn>
                    <v-btn value="manual">
                        {{ t("settings.renderMemory.manual", "Manual") }}
                    </v-btn>
                </v-btn-toggle>

                <v-text-field
                    v-if="modeValue === 'manual'"
                    v-model="megabytes"
                    type="number"
                    :min="props.setting.readout.value.minimumMegabytes"
                    :disabled="props.setting.busy.value || !props.setting.canApply"
                    :error-messages="props.setting.problem.value ?? []"
                    :label="t('settings.renderMemory.megabytesField', 'Megabytes')"
                    density="comfortable"
                    variant="outlined"
                    hide-details="auto"
                    class="mb-render-memory__field"
                />

                <v-btn
                    :disabled="!canSave"
                    :loading="props.setting.busy.value"
                    variant="tonal"
                    @click="onSave"
                >
                    {{ t("settings.renderMemory.save", "Save this limit") }}
                </v-btn>
                <v-btn
                    v-if="props.setting.canApply"
                    :disabled="!canReset"
                    variant="text"
                    @click="onReset"
                >
                    {{ t("settings.renderMemory.reset", "Reset to automatic") }}
                </v-btn>
            </div>

            <p v-if="props.setting.readout.value !== null" class="mb-render-memory__explanation">
                {{ props.setting.readout.value.explanation }}
            </p>

            <p v-if="!props.setting.canApply" class="mb-render-memory__note">
                {{
                    t(
                        "settings.renderMemory.readOnly",
                        "This build can show the ceiling but cannot change it. The desktop app owns that setting; a browser tab has no access to it.",
                    )
                }}
            </p>

            <p
                v-if="props.setting.savedJustNow.value"
                class="mb-render-memory__saved"
                role="status"
                aria-live="polite"
            >
                {{ t("settings.renderMemory.saved", "Saved.") }}
            </p>

            <v-alert
                v-if="props.setting.failure.value !== null"
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
                class="mb-render-memory__alert"
            >
                {{ props.setting.failure.value }}
            </v-alert>
        </template>
    </div>
</template>

<style>
.mb-render-memory {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-render-memory__toggle-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-render-memory__field {
    flex: 0 1 12rem;
    min-width: 8rem;
}

.mb-render-memory__explanation {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-render-memory__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-render-memory__saved {
    margin: 0;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-primary));
}

.mb-render-memory__alert {
    overflow-wrap: anywhere;
}
</style>

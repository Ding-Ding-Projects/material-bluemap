<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VTextField } from "vuetify/components";
import type { DownloadConcurrencySetting } from "./downloadConcurrencySetting.js";

/**
 * How many release-asset parts a download fetches at once - the setting
 * `files/downloadConcurrency.ts` has always stored and validated, and that no download
 * ever actually read again after app launch until `downloader.ts`'s own `concurrency`
 * option learned to accept a function (see that file's doc comment). This row is the
 * other missing half: the control that lets somebody see and change it.
 *
 * One plain number field, bounded, with a reset - simpler than the render-memory row on
 * purpose, because there is no machine-derived "automatic" recommendation for this
 * setting the way there is for a heap ceiling. The default is a fixed number and staying
 * on it needs no separate mode.
 */
const props = defineProps<{
    setting: DownloadConcurrencySetting;
}>();

const { t } = useI18n();

const workers = computed<string>({
    get: () => props.setting.workers.value,
    set: (next) => {
        props.setting.workers.value = next;
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
    <div class="mb-download-concurrency">
        <p v-if="!props.setting.supported" class="mb-download-concurrency__note">
            {{
                t(
                    "settings.downloadConcurrency.unsupported",
                    "This build cannot report or change how many parts a download fetches at once. Nothing is wrong with the setting - the app has no way to ask about it from this screen yet.",
                )
            }}
        </p>

        <template v-else>
            <div
                v-if="props.setting.readout.value !== null"
                class="mb-download-concurrency__row"
                role="group"
                :aria-label="t('settings.downloadConcurrency.pickerLabel', 'How many parts are fetched at once')"
            >
                <v-text-field
                    v-model="workers"
                    type="number"
                    :min="props.setting.readout.value.minimumWorkers"
                    :max="props.setting.readout.value.maximumWorkers"
                    :disabled="props.setting.busy.value || !props.setting.canApply"
                    :error-messages="props.setting.problem.value ?? []"
                    :label="t('settings.downloadConcurrency.workersField', 'Parts at once')"
                    density="comfortable"
                    variant="outlined"
                    hide-details="auto"
                    class="mb-download-concurrency__field"
                />

                <v-btn
                    :disabled="!canSave"
                    :loading="props.setting.busy.value"
                    variant="tonal"
                    @click="onSave"
                >
                    {{ t("settings.downloadConcurrency.save", "Save this limit") }}
                </v-btn>
                <v-btn
                    v-if="props.setting.canApply"
                    :disabled="!canReset"
                    variant="text"
                    @click="onReset"
                >
                    {{ t("settings.downloadConcurrency.reset", "Reset to default") }}
                </v-btn>
            </div>

            <p v-if="props.setting.readout.value !== null" class="mb-download-concurrency__explanation">
                {{ props.setting.readout.value.explanation }}
            </p>

            <p v-if="!props.setting.canApply" class="mb-download-concurrency__note">
                {{
                    t(
                        "settings.downloadConcurrency.readOnly",
                        "This build can show the setting but cannot change it. The desktop app owns that setting; a browser tab has no access to it.",
                    )
                }}
            </p>

            <p
                v-if="props.setting.savedJustNow.value"
                class="mb-download-concurrency__saved"
                role="status"
                aria-live="polite"
            >
                {{ t("settings.downloadConcurrency.saved", "Saved.") }}
            </p>

            <v-alert
                v-if="props.setting.failure.value !== null"
                type="error"
                variant="tonal"
                density="comfortable"
                role="alert"
                class="mb-download-concurrency__alert"
            >
                {{ props.setting.failure.value }}
            </v-alert>
        </template>
    </div>
</template>

<style>
.mb-download-concurrency {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-download-concurrency__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-download-concurrency__field {
    flex: 0 1 10rem;
    min-width: 8rem;
}

.mb-download-concurrency__explanation {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-download-concurrency__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-download-concurrency__saved {
    margin: 0;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-primary));
}

.mb-download-concurrency__alert {
    overflow-wrap: anywhere;
}
</style>

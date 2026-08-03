<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiCheckCircle, mdiKeyOutline } from "@mdi/js";
import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VDialog,
    VDivider,
    VIcon,
    VProgressLinear,
    VSlider,
    VSpacer,
    VSwitch,
} from "vuetify/components";

/**
 * Super confirmation gate for a destructive action, built in the app's own renderer.
 *
 * Two independently operated keys arm a full-range slider; nothing happens until both keys
 * are on and the slider has travelled its whole range. Emergency exit and Escape cancel
 * without touching anything. The wording around it may be styled, but the facts it states
 * (what is destroyed, and that it cannot be undone) are fixed props, not decoration.
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        /** Dialog heading, e.g. "Reset all settings". */
        title: string;
        /** One sentence naming exactly what happens. */
        action: string;
        /** Bullet list of the data that will actually be affected. */
        affected?: string[];
        /** Label of the final confirm affordance. */
        confirmLabel: string;
    }>(),
    { affected: () => [] },
);

const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirm: [] }>();

const { t } = useI18n();

const keyOne = ref(false);
const keyTwo = ref(false);
const travel = ref(0);
const done = ref(false);

const armed = computed(() => keyOne.value && keyTwo.value);
const affectedList = computed(() => props.affected ?? []);

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

watch(open, (value) => {
    if (value) reset();
});

function reset(): void {
    keyOne.value = false;
    keyTwo.value = false;
    travel.value = 0;
    done.value = false;
}

function onTravel(value: number): void {
    if (!armed.value) {
        travel.value = 0;
        return;
    }
    travel.value = value;
    if (value >= 100 && !done.value) {
        done.value = true;
        emit("confirm");
    }
}

function onRelease(): void {
    if (!done.value) travel.value = 0;
}

function cancel(): void {
    open.value = false;
}
</script>

<template>
    <v-dialog v-model="open" max-width="440" scrollable>
        <v-card class="mb-super-confirm">
            <v-card-text>
                <div class="mb-super-confirm__head">
                    <v-icon :icon="mdiAlertOutline" color="error" size="28" aria-hidden="true" />
                    <h2 class="mb-super-confirm__title">{{ title }}</h2>
                </div>

                <p class="mb-super-confirm__action">{{ action }}</p>

                <ul v-if="affectedList.length" class="mb-super-confirm__affected">
                    <li v-for="item in affectedList" :key="item">{{ item }}</li>
                </ul>

                <v-divider class="my-3" />

                <p class="mb-super-confirm__step">
                    {{ t("superConfirm.keys", "Turn both keys, then drag the slider all the way.") }}
                </p>

                <div class="mb-super-confirm__keys">
                    <v-switch
                        v-model="keyOne"
                        :label="t('superConfirm.keyOne', 'Key 1')"
                        :prepend-icon="mdiKeyOutline"
                        color="error"
                        density="compact"
                        hide-details
                        inset
                    />
                    <v-switch
                        v-model="keyTwo"
                        :label="t('superConfirm.keyTwo', 'Key 2')"
                        :prepend-icon="mdiKeyOutline"
                        color="error"
                        density="compact"
                        hide-details
                        inset
                    />
                </div>

                <v-slider
                    class="mb-super-confirm__slider"
                    :model-value="travel"
                    :min="0"
                    :max="100"
                    :step="1"
                    :disabled="!armed || done"
                    :aria-label="confirmLabel"
                    :aria-valuetext="`${Math.round(travel)}%`"
                    color="error"
                    hide-details
                    @update:model-value="onTravel"
                    @end="onRelease"
                />

                <v-progress-linear
                    class="mb-super-confirm__progress"
                    :model-value="travel"
                    :color="done ? 'success' : 'error'"
                    height="6"
                    rounded
                    aria-hidden="true"
                />

                <p class="mb-super-confirm__status" role="status" aria-live="polite">
                    <template v-if="done">
                        <v-icon :icon="mdiCheckCircle" color="success" size="18" />
                        {{ t("superConfirm.done", "Authorized.") }}
                    </template>
                    <template v-else-if="!armed">
                        {{ t("superConfirm.locked", "Both keys are needed before the slider moves.") }}
                    </template>
                    <template v-else>
                        {{ t("superConfirm.armed", "Armed. Drag the slider to the end to confirm.") }}
                    </template>
                </p>
            </v-card-text>

            <v-card-actions>
                <v-btn color="primary" variant="tonal" @click="cancel">
                    {{ t("superConfirm.exit", "Emergency exit") }}
                </v-btn>
                <v-spacer />
                <span class="mb-super-confirm__label">{{ confirmLabel }}</span>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style>
.mb-super-confirm__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-super-confirm__title {
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-super-confirm__action {
    margin-block-start: 8px;
    font-size: 0.875rem;
    line-height: 1.5;
}

.mb-super-confirm__affected {
    margin: 8px 0 0 1.2em;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-super-confirm__step,
.mb-super-confirm__status {
    font-size: 0.8125rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-super-confirm__status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    margin-block-start: 4px;
}

.mb-super-confirm__keys {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-block: 4px 8px;
}

.mb-super-confirm__progress {
    transition: none;
}

.mb-super-confirm__label {
    font-size: 0.8125rem;
    font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
    .mb-super-confirm,
    .mb-super-confirm * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>

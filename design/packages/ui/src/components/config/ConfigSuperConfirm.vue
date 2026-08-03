<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiCheckCircle, mdiExitRun, mdiKeyOutline } from "@mdi/js";
import { VBtn, VCard, VCardActions, VCardText, VDivider, VIcon, VMenu, VProgressLinear, VSlider, VSpacer, VSwitch } from "vuetify/components";

/**
 * Super confirmation for a destructive action, anchored beside the control that
 * starts it.
 *
 * The contract asks for an anchored surface where the layout can host one, and
 * this one can: the delete control sits in a card with room beneath it. Two
 * independent keys arm a full-range slider, and nothing happens until both keys
 * are on and the slider has travelled its whole range. Emergency exit and Escape
 * cancel without touching anything, and focus returns to the control that opened
 * the gate.
 *
 * The facts are props, not decoration. Whatever tone the surrounding copy takes,
 * `action` and `affected` still name exactly what is destroyed and that it
 * cannot be undone.
 */
const props = withDefaults(
    defineProps<{
        title: string;
        /** One sentence naming exactly what happens. */
        action: string;
        /** The data that will actually be affected, item by item. */
        affected?: readonly string[];
        confirmLabel: string;
        disabled?: boolean;
    }>(),
    { affected: () => [], disabled: false },
);

const emit = defineEmits<{ confirm: [] }>();

const { t } = useI18n();

const open = ref(false);
const keyOne = ref(false);
const keyTwo = ref(false);
const travel = ref(0);
const done = ref(false);
const activator = ref<HTMLElement | null>(null);
/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);
const affectedList = computed<readonly string[]>(() => props.affected ?? []);


const armed = computed(() => keyOne.value && keyTwo.value);

watch(open, (value) => {
    if (value) {
        keyOne.value = false;
        keyTwo.value = false;
        travel.value = 0;
        done.value = false;
        return;
    }
    // Focus goes back where it came from, whether the gate completed or not.
    activator.value?.querySelector("button")?.focus();
});

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

/** A slider let go before the end springs back, so a slip cannot destroy anything. */
function onRelease(): void {
    if (!done.value) travel.value = 0;
}
</script>

<template>
    <span ref="activator" class="mb-config-confirm__anchor">
        <slot name="activator" :props="{ onClick: () => (open = true), disabled: isDisabled }" />

        <!--
            `target` anchors the gate to the control without also binding a click
            handler to it. `activator` would do both, and the slot's own onClick
            already opens the gate, so the two would fight over every click.
        -->
        <v-menu v-model="open" target="parent" :close-on-content-click="false" location="bottom end" offset="8">
            <v-card class="mb-config-confirm" max-width="420" role="dialog" :aria-label="title">
                <v-card-text>
                    <div class="mb-config-confirm__head">
                        <v-icon :icon="mdiAlertOutline" color="error" size="26" aria-hidden="true" />
                        <h3 class="mb-config-confirm__title">{{ title }}</h3>
                    </div>

                    <p class="mb-config-confirm__action">{{ action }}</p>

                    <ul v-if="affectedList.length" class="mb-config-confirm__affected">
                        <li v-for="item in affectedList" :key="item">{{ item }}</li>
                    </ul>

                    <v-divider class="my-3" />

                    <p class="mb-config-confirm__step">
                        {{ t("config.confirm.keys", "Turn both keys, then drag the slider all the way across.") }}
                    </p>

                    <div class="mb-config-confirm__keys">
                        <v-switch
                            v-model="keyOne"
                            :label="t('config.confirm.keyOne', 'Key 1')"
                            :prepend-icon="mdiKeyOutline"
                            color="error"
                            density="compact"
                            hide-details
                            inset
                        />
                        <v-switch
                            v-model="keyTwo"
                            :label="t('config.confirm.keyTwo', 'Key 2')"
                            :prepend-icon="mdiKeyOutline"
                            color="error"
                            density="compact"
                            hide-details
                            inset
                        />
                    </div>

                    <v-slider
                        class="mb-config-confirm__slider"
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
                        class="mb-config-confirm__progress"
                        :class="{ 'mb-config-confirm__progress--live': armed && travel > 0 && !done }"
                        :model-value="travel"
                        :color="done ? 'success' : 'error'"
                        height="6"
                        rounded
                        striped
                        aria-hidden="true"
                    />

                    <p class="mb-config-confirm__status" role="status" aria-live="polite">
                        <template v-if="done">
                            <v-icon :icon="mdiCheckCircle" color="success" size="18" class="mb-config-confirm__tick" />
                            {{ t("config.confirm.done", "Authorized.") }}
                        </template>
                        <template v-else-if="!armed">
                            {{ t("config.confirm.locked", "Both keys are needed before the slider will move.") }}
                        </template>
                        <template v-else>
                            {{ t("config.confirm.armed", "Armed. Drag the slider to the end to confirm.") }}
                        </template>
                    </p>
                </v-card-text>

                <v-card-actions>
                    <v-btn :prepend-icon="mdiExitRun" color="primary" variant="tonal" @click="open = false">
                        {{ t("config.confirm.exit", "Emergency exit") }}
                    </v-btn>
                    <v-spacer />
                    <span class="mb-config-confirm__label">{{ confirmLabel }}</span>
                </v-card-actions>
            </v-card>
        </v-menu>
    </span>
</template>

<style>
.mb-config-confirm__anchor {
    display: inline-flex;
}

.mb-config-confirm__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-config-confirm__title {
    font-size: 1.0625rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-config-confirm__action {
    margin-block-start: 8px;
    font-size: 0.875rem;
    line-height: 1.5;
}

.mb-config-confirm__affected {
    margin: 8px 0 0 1.2em;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-config-confirm__step,
.mb-config-confirm__status {
    font-size: 0.8125rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-confirm__status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    margin-block-start: 4px;
}

.mb-config-confirm__keys {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-block: 4px 8px;
}

.mb-config-confirm__progress {
    transition: none;
}

.mb-config-confirm__progress--live {
    animation: mb-config-confirm-pulse 900ms ease-in-out infinite;
}

.mb-config-confirm__tick {
    animation: mb-config-confirm-pop 260ms ease-out;
}

.mb-config-confirm__label {
    font-size: 0.8125rem;
    font-weight: 500;
}

@keyframes mb-config-confirm-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.55;
    }
}

@keyframes mb-config-confirm-pop {
    from {
        transform: scale(0.4);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-confirm__progress--live,
    .mb-config-confirm__tick {
        animation: none !important;
    }

    .mb-config-confirm,
    .mb-config-confirm * {
        transition-duration: 0.01ms !important;
    }
}
</style>

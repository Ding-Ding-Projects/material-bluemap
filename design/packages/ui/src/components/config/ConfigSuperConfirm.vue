<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiCheckCircle, mdiExitRun, mdiKeyOutline } from "@mdi/js";
import { VBtn, VCard, VCardActions, VCardText, VDivider, VIcon, VMenu, VProgressLinear, VSlider, VSpacer, VSwitch } from "vuetify/components";
import {
    createSuperConfirmGate,
    returnFocusTo,
    GATE_COMPLETION_HOLD_MS,
    GATE_TRAVEL_END,
    GATE_TRAVEL_START,
} from "../confirm/superConfirmGate.js";

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
 * cannot be undone. That is the one part of this component that no language mode
 * and no funny level is allowed to soften, because the caller supplies it and the
 * caller is the screen that knows which file is about to go.
 *
 * The arithmetic of the gate itself lives in `../confirm/superConfirmGate.ts`, shared
 * with `MenuSuperConfirm.vue`. This file is the anchored presentation of it and
 * nothing else; a rule that needs changing is changed there, once, for both.
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
const activator = ref<HTMLElement | null>(null);
const gate = createSuperConfirmGate(() => emit("confirm"));

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);
const affectedList = computed<readonly string[]>(() => props.affected ?? []);

const armed = gate.armed;
const done = computed(() => gate.authorized.value);

/**
 * The completion hold, cleared on unmount.
 *
 * Every consumer of this gate deletes the thing the gate was anchored to, so the usual
 * outcome of authorizing is that this component is torn down while the timer is still
 * pending. A timer that survives that would call into a dead component.
 */
let holdTimer: ReturnType<typeof setTimeout> | null = null;

function clearHold(): void {
    if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
    }
}

onBeforeUnmount(clearHold);

watch(open, (value) => {
    if (value) {
        clearHold();
        gate.reset();
        return;
    }
    clearHold();
    // Focus goes back where it came from, whether the gate completed or not.
    returnFocusTo(activator.value);
});

function onTravel(value: number): void {
    if (!gate.travelTo(value)) return;

    // Authorized. Hold the completion state long enough to be seen, then close, which is
    // what puts focus back on the control the user was standing on.
    clearHold();
    holdTimer = setTimeout(() => {
        holdTimer = null;
        open.value = false;
    }, GATE_COMPLETION_HOLD_MS);
}

/** A slider let go before the end springs back, so a slip cannot destroy anything. */
function onRelease(): void {
    gate.release();
}

/**
 * The Escape path, spelled out rather than left to the overlay.
 *
 * Vuetify closes a menu on Escape by itself, but only while focus is inside the overlay's
 * own content tree, and the contract asks for Escape and the platform back path as a
 * guarantee rather than as a default that happens to hold. Handling it here means the card
 * cancels from wherever inside it the key is pressed, including from the slider, which is
 * exactly where somebody having second thoughts will be.
 */
function cancel(): void {
    open.value = false;
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
            <v-card
                class="mb-config-confirm"
                :class="{ 'mb-config-confirm--authorized': done }"
                role="dialog"
                :aria-label="title"
                @keydown.esc.stop="cancel"
            >
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
                            v-model="gate.keyOne.value"
                            class="mb-config-confirm__key mb-config-confirm__key--one"
                            :label="t('config.confirm.keyOne', 'Key 1')"
                            :prepend-icon="mdiKeyOutline"
                            color="error"
                            density="compact"
                            hide-details
                            inset
                        />
                        <v-switch
                            v-model="gate.keyTwo.value"
                            class="mb-config-confirm__key mb-config-confirm__key--two"
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
                        :model-value="gate.travel.value"
                        :min="GATE_TRAVEL_START"
                        :max="GATE_TRAVEL_END"
                        :step="1"
                        :disabled="!armed || done"
                        :aria-label="confirmLabel"
                        :aria-valuetext="
                            t('config.confirm.travel', { percent: gate.percent.value }, '{percent} percent of the way across')
                        "
                        color="error"
                        hide-details
                        @update:model-value="onTravel"
                        @end="onRelease"
                    />

                    <v-progress-linear
                        class="mb-config-confirm__progress"
                        :class="{ 'mb-config-confirm__progress--live': gate.phase.value === 'moving' }"
                        :model-value="gate.travel.value"
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
                    <v-btn
                        class="mb-config-confirm__exit"
                        :prepend-icon="mdiExitRun"
                        color="primary"
                        variant="tonal"
                        @click="cancel"
                    >
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

/*
 * Bounded by the viewport rather than by a fixed width alone. At 200% display scale on a
 * small laptop the anchored card is most of the screen, and a fixed 420px there is a card
 * whose Emergency exit sits off the edge.
 */
.mb-config-confirm {
    width: min(420px, calc(100vw - 32px));
    max-width: 420px;
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
    overflow-wrap: anywhere;
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

/* Both keys stay operable side by side down to the narrowest supported width. */
.mb-config-confirm__key {
    flex: 1 1 8rem;
}

.mb-config-confirm__exit {
    min-height: 40px;
}

.mb-config-confirm__progress {
    transition: none;
}

.mb-config-confirm__progress--live {
    animation: mb-config-confirm-pulse 900ms ease-in-out infinite;
}

.mb-config-confirm--authorized {
    animation: mb-config-confirm-flash 420ms ease-out;
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

@keyframes mb-config-confirm-flash {
    from {
        box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.55);
    }
    to {
        box-shadow: 0 0 0 14px rgba(var(--v-theme-success), 0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-confirm__progress--live,
    .mb-config-confirm--authorized,
    .mb-config-confirm__tick {
        animation: none !important;
    }

    .mb-config-confirm,
    .mb-config-confirm * {
        transition-duration: 0.01ms !important;
    }
}
</style>

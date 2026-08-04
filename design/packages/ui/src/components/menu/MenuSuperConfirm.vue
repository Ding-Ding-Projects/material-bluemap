<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiCheckCircle, mdiExitRun, mdiKeyOutline } from "@mdi/js";
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
import {
    createSuperConfirmGate,
    returnFocusTo,
    GATE_COMPLETION_HOLD_MS,
    GATE_TRAVEL_END,
    GATE_TRAVEL_START,
} from "../confirm/superConfirmGate.js";

/**
 * Super confirmation gate for a destructive action, built in the app's own renderer.
 *
 * Two independently operated keys arm a full-range slider; nothing happens until both keys
 * are on and the slider has travelled its whole range. Emergency exit and Escape cancel
 * without touching anything. The wording around it may be styled, but the facts it states
 * (what is destroyed, and that it cannot be undone) are fixed props, not decoration.
 *
 * This is the modal half of the pair. `ConfigSuperConfirm.vue` anchors itself beside the
 * control it guards, which the contract prefers and the config screens can host; the
 * surfaces that reach for this one cannot. The settings menu is a narrow side sheet whose
 * own width is the whole surface, so an anchored card beside a row in it would either
 * overhang the sheet or be narrower than the sentence it has to say. Where there is nowhere
 * to anchor, the contract allows a dialog, and this is that case rather than a second
 * default.
 *
 * The rule the two share lives once, in `../confirm/superConfirmGate.ts`. Everything in
 * this file is presentation: which surface, which class names, which animation.
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        /** Dialog heading, e.g. "Reset all settings". */
        title: string;
        /** One sentence naming exactly what happens. */
        action: string;
        /** Bullet list of the data that will actually be affected. */
        affected?: readonly string[];
        /** Label of the final confirm affordance. */
        confirmLabel: string;
    }>(),
    { affected: () => [] },
);

const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirm: [] }>();

const { t } = useI18n();

const gate = createSuperConfirmGate(() => emit("confirm"));

const armed = gate.armed;
const done = computed(() => gate.authorized.value);
const affectedList = computed<readonly string[]>(() => props.affected ?? []);

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

/**
 * Where focus was when the gate opened, so cancelling can put it back.
 *
 * A modal has no activator slot to read it from, so it is remembered instead. The contract
 * asks for the return in both outcomes, and nothing about a dialog gives it for free: a
 * cancelled overlay drops focus onto `<body>`, and the next Tab restarts from the top of
 * the page rather than from the row the user was on.
 */
let opener: HTMLElement | null = null;

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
        const active = document.activeElement;
        opener = active instanceof HTMLElement ? active : null;
        return;
    }
    clearHold();
    returnFocusTo(opener);
    opener = null;
});

function onTravel(value: number): void {
    if (!gate.travelTo(value)) return;

    // Authorized. The completion state is held long enough to be seen, then the dialog
    // closes itself, which is what returns focus.
    clearHold();
    holdTimer = setTimeout(() => {
        holdTimer = null;
        open.value = false;
    }, GATE_COMPLETION_HOLD_MS);
}

function onRelease(): void {
    gate.release();
}

function cancel(): void {
    open.value = false;
}
</script>

<template>
    <v-dialog v-model="open" max-width="440" scrollable>
        <v-card
            class="mb-super-confirm"
            :class="{ 'mb-super-confirm--authorized': done }"
            :aria-label="title"
            @keydown.esc.stop="cancel"
        >
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
                        v-model="gate.keyOne.value"
                        class="mb-super-confirm__key mb-super-confirm__key--one"
                        :label="t('superConfirm.keyOne', 'Key 1')"
                        :prepend-icon="mdiKeyOutline"
                        color="error"
                        density="compact"
                        hide-details
                        inset
                    />
                    <v-switch
                        v-model="gate.keyTwo.value"
                        class="mb-super-confirm__key mb-super-confirm__key--two"
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
                    :model-value="gate.travel.value"
                    :min="GATE_TRAVEL_START"
                    :max="GATE_TRAVEL_END"
                    :step="1"
                    :disabled="!armed || done"
                    :aria-label="confirmLabel"
                    :aria-valuetext="
                        t('superConfirm.travel', { percent: gate.percent.value }, '{percent} percent of the way across')
                    "
                    color="error"
                    hide-details
                    @update:model-value="onTravel"
                    @end="onRelease"
                />

                <v-progress-linear
                    class="mb-super-confirm__progress"
                    :class="{ 'mb-super-confirm__progress--live': gate.phase.value === 'moving' }"
                    :model-value="gate.travel.value"
                    :color="done ? 'success' : 'error'"
                    height="6"
                    rounded
                    striped
                    aria-hidden="true"
                />

                <p class="mb-super-confirm__status" role="status" aria-live="polite">
                    <template v-if="done">
                        <v-icon :icon="mdiCheckCircle" color="success" size="18" class="mb-super-confirm__tick" />
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
                <v-btn
                    class="mb-super-confirm__exit"
                    :prepend-icon="mdiExitRun"
                    color="primary"
                    variant="tonal"
                    @click="cancel"
                >
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
    overflow-wrap: anywhere;
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

/* Both keys stay operable side by side down to the narrowest supported width. */
.mb-super-confirm__key {
    flex: 1 1 8rem;
}

.mb-super-confirm__exit {
    min-height: 40px;
}

.mb-super-confirm__progress {
    transition: none;
}

.mb-super-confirm__progress--live {
    animation: mb-super-confirm-pulse 900ms ease-in-out infinite;
}

.mb-super-confirm--authorized {
    animation: mb-super-confirm-flash 420ms ease-out;
}

.mb-super-confirm__tick {
    animation: mb-super-confirm-pop 260ms ease-out;
}

.mb-super-confirm__label {
    font-size: 0.8125rem;
    font-weight: 500;
}

@keyframes mb-super-confirm-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.55;
    }
}

@keyframes mb-super-confirm-pop {
    from {
        transform: scale(0.4);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes mb-super-confirm-flash {
    from {
        box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.55);
    }
    to {
        box-shadow: 0 0 0 14px rgba(var(--v-theme-success), 0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-super-confirm__progress--live,
    .mb-super-confirm--authorized,
    .mb-super-confirm__tick {
        animation: none !important;
    }

    .mb-super-confirm,
    .mb-super-confirm * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>

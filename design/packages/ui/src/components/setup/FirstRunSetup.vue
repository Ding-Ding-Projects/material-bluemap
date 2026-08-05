<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from "vue";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VDialog,
    VDivider,
    VSpacer,
} from "vuetify/components";
import SetupConsentStep from "./SetupConsentStep.vue";
import SetupEulaStep from "./SetupEulaStep.vue";
import SetupStorageStep from "./SetupStorageStep.vue";
import SetupWelcomeStep from "./SetupWelcomeStep.vue";
import { useSetupI18n } from "./setupI18n.js";
import { SETUP_STEPS, createFirstRunController, type SetupStep } from "./firstRunFlow.js";

/**
 * First-run setup: three steps, shown once, before anybody is in the middle of anything.
 *
 * Mount it once in the shell and forget about it. On mount it asks the main process
 * whether this is a first launch (`needsFirstRun()`); in a browser build, where there is
 * no preload bridge and therefore no local rendering to consent to, nothing appears at
 * all. Every later launch it stays closed, whichever way consent was answered, because
 * `completeFirstRun()` runs on both paths.
 *
 * A blocking dialog is right here and nowhere else in this application. This is the one
 * decision that genuinely must be made before continuing, which is exactly what a modal
 * is reserved for; everything the app says afterwards is a notification.
 *
 * **Accept and Decline are the same button rendered twice.** Same variant, same size,
 * same row, no colour separating them, neither one the default and neither one focused
 * first. A decline styled as the quiet option is a decline nobody makes.
 *
 * Layout notes that are load-bearing rather than decorative: the card is capped at the
 * viewport and its body scrolls inside that cap, so at 800x600 and at 200% display scale
 * the action row stays on screen instead of the last step being cut off with no way to
 * reach the buttons.
 */
const i18n = useSetupI18n();

const flow = createFirstRunController();

const titleId = useId();
const progressId = useId();
const stepRegion = ref<HTMLElement | null>(null);

const stepLabel = (step: SetupStep): string => i18n.t(`step.${step}` as const);

const progressText = computed(() =>
    i18n.t("setup.progress", { step: flow.stepNumber.value, total: flow.stepCount }),
);

onMounted(() => {
    void flow.start();
});

/**
 * Moving between steps replaces the whole body, so focus is put on the new step's region
 * rather than left on a button that has just changed meaning. The region is labelled with
 * the step name, so a screen reader announces where it landed instead of reading from
 * wherever the previous focus happened to be.
 */
watch(
    () => flow.step.value,
    () => {
        void nextTick(() => stepRegion.value?.focus());
    },
);

watch(
    () => flow.visible.value,
    (open) => {
        if (open) void nextTick(() => stepRegion.value?.focus());
    },
);

function onStorageInput(value: string): void {
    flow.storageDir.value = value;
}
</script>

<template>
    <v-dialog
        v-model="flow.visible.value"
        :aria-labelledby="titleId"
        :aria-describedby="progressId"
        :max-width="720"
        persistent
        scrollable
        class="mb-setup-dialog"
    >
        <v-card class="mb-setup-card">
            <div class="mb-setup-card__header">
                <h1 :id="titleId" class="mb-setup-card__title">
                    {{ i18n.t("app.name") }}
                </h1>
                <p :id="progressId" class="mb-setup-card__progress" aria-live="polite">
                    {{ progressText }}
                </p>
                <ol class="mb-setup-card__steps">
                    <li
                        v-for="(name, index) in SETUP_STEPS"
                        :key="name"
                        class="mb-setup-card__step"
                        :class="{
                            'mb-setup-card__step--current': name === flow.step.value,
                            'mb-setup-card__step--done': index < flow.stepNumber.value - 1,
                        }"
                        :aria-current="name === flow.step.value ? 'step' : undefined"
                    >
                        {{ stepLabel(name) }}
                    </li>
                </ol>
            </div>

            <v-divider />

            <v-card-text class="mb-setup-card__body">
                <div
                    ref="stepRegion"
                    class="mb-setup-card__region"
                    role="group"
                    tabindex="-1"
                    :aria-label="stepLabel(flow.step.value)"
                >
                    <!--
                        Explicit branches rather than one dynamic component. The steps
                        take different props, and a `<component :is>` handed the union
                        would fall the unused ones through onto the step's root element as
                        stray HTML attributes.
                    -->
                    <SetupWelcomeStep v-if="flow.step.value === 'welcome'" />
                    <SetupEulaStep v-else-if="flow.step.value === 'eula'" />
                    <SetupConsentStep
                        v-else-if="flow.step.value === 'consent'"
                        :answer="flow.answer.value"
                    />
                    <SetupStorageStep
                        v-else
                        :model-value="flow.storageDir.value"
                        :platform="flow.platform"
                        :problem="flow.storageProblem.value"
                        :busy="flow.busy.value"
                        @update:model-value="onStorageInput"
                        @use-default="flow.useDefaultStorage"
                    />
                </div>

                <v-alert
                    v-if="flow.failure.value !== null"
                    type="error"
                    variant="tonal"
                    density="comfortable"
                    class="mb-setup-card__failure"
                    role="alert"
                >
                    <p class="mb-setup-card__failure-text">{{ flow.failure.value }}</p>
                    <p class="mb-setup-card__failure-text">
                        {{ i18n.t("setup.failureNote") }}
                    </p>
                </v-alert>
            </v-card-text>

            <v-divider />

            <v-card-actions class="mb-setup-card__actions">
                <v-btn
                    v-if="flow.step.value !== 'welcome'"
                    variant="text"
                    :disabled="flow.busy.value"
                    @click="flow.back"
                >
                    {{ i18n.t("action.back") }}
                </v-btn>

                <v-spacer class="mb-setup-card__spacer" />

                <!--
                    Welcome and the licence both move on with Next and nothing else. The
                    licence step deliberately carries no Accept: reading is not agreeing,
                    and an accept button beside a document is a button people press
                    instead of reading it.
                -->
                <template v-if="flow.step.value === 'welcome' || flow.step.value === 'eula'">
                    <v-btn variant="tonal" :disabled="flow.busy.value" @click="flow.next">
                        {{ i18n.t("action.next") }}
                    </v-btn>
                </template>

                <template v-else-if="flow.step.value === 'consent'">
                    <!--
                        Equally weighted, deliberately: same variant, same size, same row.
                        Accept is listed first because it is the affirmative answer, not
                        because it is the recommended one.
                    -->
                    <v-btn
                        variant="tonal"
                        class="mb-setup-card__answer"
                        :disabled="flow.busy.value"
                        @click="flow.answerConsent(true)"
                    >
                        {{ i18n.t("action.accept") }}
                    </v-btn>
                    <v-btn
                        variant="tonal"
                        class="mb-setup-card__answer"
                        :disabled="flow.busy.value"
                        @click="flow.answerConsent(false)"
                    >
                        {{ i18n.t("action.decline") }}
                    </v-btn>
                </template>

                <template v-else>
                    <v-btn
                        v-if="flow.failure.value !== null"
                        variant="text"
                        :disabled="flow.busy.value"
                        @click="flow.dismissAfterFailure"
                    >
                        {{ i18n.t("action.continueAnyway") }}
                    </v-btn>
                    <v-btn
                        variant="tonal"
                        :disabled="flow.busy.value || flow.storageProblem.value !== null"
                        :loading="flow.busy.value"
                        @click="flow.finish"
                    >
                        {{ i18n.t("action.finish") }}
                    </v-btn>
                </template>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style>
.mb-setup-card {
    display: flex;
    flex-direction: column;
    /* Bounded by the viewport, with the body scrolling inside the bound. Without this a
       long step at 200% display scale pushes the action row off screen, which reads as
       the dialog having no buttons at all. */
    max-height: min(92dvh, 100%);
    border-radius: 16px;
}

.mb-setup-card__header {
    padding: 20px 24px 12px;
}

.mb-setup-card__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.4;
    color: rgb(var(--v-theme-on-surface));
}

.mb-setup-card__progress {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setup-card__steps {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
}

.mb-setup-card__step {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-setup-card__step--done {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setup-card__step--current {
    color: rgb(var(--v-theme-primary));
}

.mb-setup-card__body {
    flex: 1 1 auto;
    padding: 20px 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.mb-setup-card__region {
    /* Focused programmatically on every step change; the ring is what says so. */
    outline-offset: 4px;
    border-radius: 8px;
}

.mb-setup-card__region:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
}

.mb-setup-card__failure {
    margin-block-start: 16px;
}

.mb-setup-card__failure-text {
    margin: 0 0 4px;
    overflow-wrap: anywhere;
}

.mb-setup-card__failure-text:last-child {
    margin-block-end: 0;
}

.mb-setup-card__actions {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 24px 16px;
}

.mb-setup-card__actions .v-btn {
    /* A real target at every display scale, and identical for Accept and Decline. */
    min-height: 40px;
}

/*
 * Vuetify signals focus with a low-opacity overlay, which is a background tint rather than
 * a focus indicator: at the contrast the tonal buttons already sit at, a keyboard user
 * cannot reliably tell which of Accept and Decline they are about to press. These add a
 * real ring on top of it, on every control the flow contains.
 */
.mb-setup-card .v-btn:focus-visible,
.mb-setup-card a:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-setup-card .v-slider-thumb:focus-visible,
.mb-setup-card .v-selection-control__input:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
    border-radius: 50%;
}

.mb-setup-card .v-field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

.mb-setup-card__answer {
    min-width: 7.5rem;
}

/* At 800x600, and at 200% scale where the viewport is effectively half that, the action
   row stacks instead of overflowing, and the spacer stops taking a whole line. */
@media (max-width: 32rem) {
    .mb-setup-card__spacer {
        display: none;
    }

    .mb-setup-card__actions .v-btn {
        flex: 1 1 8rem;
    }
}
</style>

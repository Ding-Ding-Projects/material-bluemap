<script setup lang="ts">
import { computed } from "vue";
import { VAlert, VBtn, VProgressCircular } from "vuetify/components";
import { mdiRefresh, mdiRestart } from "@mdi/js";
import { langAttr } from "../setup/setupI18n.js";
import { updatePair, updateText } from "./updateCopy.js";
import type { UpdateState } from "./updateBridge.js";
import type { UpdateStatusModel } from "./updateModel.js";

/**
 * The always-visible account of where updates stand, for the settings surface.
 *
 * The banner is an offer and appears only when there is one to make. This is the other
 * half: the state that is always true and always reachable - which version is installed,
 * what the last check found and when, where updates come from, and a manual **Check for
 * updates** that says what it found rather than spinning.
 *
 * Three rules this row exists to keep:
 *
 *  - **A failure is never hidden behind a spinner.** `checking` shows a spinner beside the
 *    state rather than instead of it, and a failure's own sentence stays on screen with the
 *    updater's exact words behind a disclosure.
 *  - **A build that cannot update says so, once, with the reason.** No button that does
 *    nothing, no permanent banner nagging about it.
 *  - **The banner is reachable again.** Dismissing it is per version, and this row is where
 *    it comes back from, so "Later" can never mean "never".
 */
const props = defineProps<{
    state: UpdateState;
    model: UpdateStatusModel;
    /** True when the banner for the staged version has been put away. */
    dismissed?: boolean;
    busy?: boolean;
}>();

const emit = defineEmits<{
    (event: "check"): void;
    (event: "restart"): void;
    (event: "show-banner"): void;
}>();

const message = computed(() => updatePair(props.model.messageKey, props.model.vars));
const title = computed(() => updateText("update.title"));
const checkLabel = computed(() => updateText("update.action.check"));
const restartLabel = computed(() => updateText("update.action.restart"));
const showBannerLabel = computed(() => updateText("update.action.showBanner"));
const installedLabel = computed(() => updateText("update.label.installed"));
const newLabel = computed(() => updateText("update.label.new"));
const lastCheckedLabel = computed(() => updateText("update.label.lastChecked"));
const feedLabel = computed(() => updateText("update.label.feed"));
const detailLabel = computed(() => updateText("update.label.detail"));
const stateLabel = computed(() => updateText("update.label.state"));

const newVersion = computed(() => props.state.readyVersion ?? props.state.newVersion);
</script>

<template>
    <section class="mb-update-row" :aria-label="title">
        <div class="mb-update-row__state">
            <v-progress-circular
                v-if="props.state.checking"
                indeterminate
                size="18"
                width="2"
                :aria-label="stateLabel"
                class="mb-update-row__spinner"
            />
            <div class="mb-update-row__message" role="status" aria-live="polite">
                <p class="mb-update-row__primary">{{ message.primary }}</p>
                <p v-if="message.secondary !== null" class="mb-update-row__secondary" :lang="langAttr('yue')">
                    {{ message.secondary }}
                </p>
            </div>
        </div>

        <dl class="mb-update-row__facts">
            <!-- Absent rather than a placeholder glyph before the main process has
                 answered: a dash beside "Installed version" reads as a version this build
                 could not determine, which is a different and more alarming claim. -->
            <div v-if="props.state.currentVersion !== ''" class="mb-update-row__fact">
                <dt>{{ installedLabel }}</dt>
                <dd>{{ props.state.currentVersion }}</dd>
            </div>
            <div v-if="newVersion !== null" class="mb-update-row__fact">
                <dt>{{ newLabel }}</dt>
                <dd>{{ newVersion }}</dd>
            </div>
            <div v-if="props.state.lastCheckedAt !== null" class="mb-update-row__fact">
                <dt>{{ lastCheckedLabel }}</dt>
                <dd>{{ props.state.lastCheckedAt }}</dd>
            </div>
            <div v-if="props.state.feedUrl !== null" class="mb-update-row__fact">
                <dt>{{ feedLabel }}</dt>
                <dd class="mb-update-row__feed">{{ props.state.feedUrl }}</dd>
            </div>
        </dl>

        <v-alert
            v-if="props.model.unsupportedReason !== null"
            type="info"
            variant="tonal"
            density="comfortable"
            role="note"
            class="mb-update-row__alert"
        >
            {{ props.model.unsupportedReason }}
        </v-alert>

        <v-alert
            v-if="props.model.failureMessage !== null"
            type="error"
            variant="tonal"
            density="comfortable"
            role="alert"
            class="mb-update-row__alert"
        >
            {{ props.model.failureMessage }}
            <details v-if="props.model.failureDetail !== null" class="mb-update-row__detail">
                <summary>{{ detailLabel }}</summary>
                <pre>{{ props.model.failureDetail }}</pre>
            </details>
        </v-alert>

        <div class="mb-update-row__actions">
            <v-btn
                :prepend-icon="mdiRefresh"
                :disabled="!props.model.canCheck || props.busy === true"
                :loading="props.state.checking"
                variant="tonal"
                class="mb-update-row__check"
                @click="emit('check')"
            >
                {{ checkLabel }}
            </v-btn>
            <v-btn
                v-if="props.model.canRestart"
                :prepend-icon="mdiRestart"
                :disabled="props.busy === true"
                variant="tonal"
                class="mb-update-row__restart"
                @click="emit('restart')"
            >
                {{ restartLabel }}
            </v-btn>
            <v-btn
                v-if="props.dismissed === true && props.state.readyVersion !== null"
                variant="text"
                class="mb-update-row__show-banner"
                @click="emit('show-banner')"
            >
                {{ showBannerLabel }}
            </v-btn>
        </div>
    </section>
</template>

<style>
.mb-update-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-update-row__state {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mb-update-row__spinner {
    margin-block-start: 3px;
    flex: 0 0 auto;
}

.mb-update-row__message {
    min-width: 0;
}

.mb-update-row__primary {
    margin: 0;
    text-wrap: pretty;
    overflow-wrap: anywhere;
}

.mb-update-row__secondary {
    margin: 2px 0 0;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-update-row__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 8px 24px;
    margin: 0;
}

.mb-update-row__fact > dt {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-update-row__fact > dd {
    margin: 0;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}

.mb-update-row__feed {
    font-family: "Roboto Mono", monospace;
}

.mb-update-row__alert {
    overflow-wrap: anywhere;
}

.mb-update-row__detail > pre {
    margin: 4px 0 0;
    font-size: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.mb-update-row__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-update-row__actions .v-btn {
    min-height: 40px;
}
</style>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiCircleOutline,
    mdiLockAlertOutline,
    mdiPlayCircleOutline,
    mdiTimerSandEmpty,
} from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VIcon, VProgressCircular } from "vuetify/components";
import { formatBytes, preflightRows, type HostKeyDecision, type PreflightRow } from "./preflightModel.js";
import type { PreflightReport } from "./remoteBridge.js";

/**
 * The four checks, each on its own line, each with its own result.
 *
 * One line per check rather than one verdict for all four, because each has a different fix
 * and a single "could not connect" hides which. A check the run never reached is drawn as
 * **not reached** and says why, so nobody installs Docker on a machine that was switched off.
 *
 * ## The host key is the part to read carefully
 *
 * An **unknown** key is a decision put to the person, with the `SHA256:` fingerprints the
 * host is offering, and accepting one names that exact fingerprint. A **changed** key is a
 * refusal with no accept control anywhere in this component - not disabled, not behind a
 * confirmation, not present. `hostKeyDecision` cannot produce an acceptable shape for that
 * case and this template has no branch that would render one; the two together are what
 * make the guarantee structural rather than a matter of remembering.
 */
const props = defineProps<{
    report: PreflightReport | null;
    running: boolean;
    decision: HostKeyDecision;
    /** True when a check can be started from here at all. */
    canCheck: boolean;
    /** The machine, for the heading. */
    targetLabel: string;
}>();

const emit = defineEmits<{
    check: [];
    /** Record this exact fingerprint. Nothing else crosses. */
    trust: [fingerprint: string];
}>();

const { t } = useI18n();

const openDetail = ref<string | null>(null);

const rows = computed<readonly PreflightRow[]>(() =>
    preflightRows(props.report, props.running, t),
);

const passed = computed(() => props.report?.ok === true);

const roomLine = computed(() => {
    const report = props.report;
    if (report === null || report.freeBytes === null || report.workDir === null) return "";
    return t(
        "remote.preflight.room",
        { dir: report.workDir, free: formatBytes(report.freeBytes) },
        "{dir} has {free} free.",
    );
});

function iconFor(row: PreflightRow): string {
    switch (row.state) {
        case "passed":
            return mdiCheckCircleOutline;
        case "failed":
            return mdiAlertCircleOutline;
        case "waiting":
            return mdiTimerSandEmpty;
        case "not-reached":
            return mdiCircleOutline;
    }
}

function colourFor(row: PreflightRow): string | undefined {
    switch (row.state) {
        case "passed":
            return "success";
        case "failed":
            return "error";
        default:
            return undefined;
    }
}

function stateWord(row: PreflightRow): string {
    switch (row.state) {
        case "passed":
            return t("remote.preflight.state.passed", "passed");
        case "failed":
            return t("remote.preflight.state.failed", "failed");
        case "waiting":
            return t("remote.preflight.state.waiting", "checking");
        case "not-reached":
            return t("remote.preflight.state.notReached", "not checked");
    }
}

function toggleDetail(stage: string): void {
    openDetail.value = openDetail.value === stage ? null : stage;
}
</script>

<template>
    <v-card variant="tonal" class="mb-remote-preflight">
        <v-card-title class="mb-remote-preflight__title">
            {{ t("remote.preflight.title", { target: targetLabel }, "Checks on {target}") }}
        </v-card-title>
        <v-card-text>
            <p class="mb-remote-preflight__blurb">
                {{
                    t(
                        "remote.preflight.blurb",
                        "Asked in this order, and stopping at the first failure. Nothing is uploaded until all four have passed - a render is gigabytes and hours, and finding out at the end of the upload that the machine has no Docker is an evening wasted.",
                    )
                }}
            </p>

            <ol class="mb-remote-preflight__list">
                <li
                    v-for="row in rows"
                    :key="row.stage"
                    class="mb-remote-preflight__row"
                    :data-stage="row.stage"
                    :data-state="row.state"
                >
                    <v-icon
                        :icon="iconFor(row)"
                        :color="colourFor(row)"
                        size="20"
                        aria-hidden="true"
                        class="mb-remote-preflight__icon"
                    />
                    <div class="mb-remote-preflight__text">
                        <p class="mb-remote-preflight__stage">
                            {{ row.title }}
                            <span class="mb-remote-preflight__state">{{ stateWord(row) }}</span>
                        </p>
                        <p class="mb-remote-preflight__message">{{ row.message }}</p>
                        <template v-if="row.detail">
                            <v-btn
                                :aria-expanded="openDetail === row.stage ? 'true' : 'false'"
                                :aria-controls="`mb-remote-preflight-detail-${row.stage}`"
                                variant="text"
                                size="x-small"
                                density="comfortable"
                                @click="toggleDetail(row.stage)"
                            >
                                {{
                                    openDetail === row.stage
                                        ? t("remote.preflight.hideDetail", "Hide the detail")
                                        : t("remote.preflight.showDetail", "Show the detail")
                                }}
                            </v-btn>
                            <pre
                                v-if="openDetail === row.stage"
                                :id="`mb-remote-preflight-detail-${row.stage}`"
                                class="mb-remote-preflight__detail"
                            >{{ row.detail }}</pre>
                        </template>
                    </div>
                </li>
            </ol>

            <p v-if="roomLine" class="mb-remote-preflight__blurb" role="status">{{ roomLine }}</p>

            <!--
                An unknown host key: a decision, with the fingerprints to compare.
                Accepting one names that exact fingerprint; the main process re-scans and
                records only a key it has just been offered whose fingerprint matches, so
                this cannot put a line of its choosing into the trust store.
            -->
            <v-alert
                v-if="decision.kind === 'unknown'"
                type="warning"
                density="compact"
                variant="tonal"
                class="mb-remote-preflight__alert"
                data-host-key="unknown"
            >
                <p class="mb-remote-preflight__hostKeyTitle">
                    <v-icon :icon="mdiLockAlertOutline" size="18" aria-hidden="true" />
                    {{ t("remote.hostKey.unknownTitle", "This machine's key has not been seen before") }}
                </p>
                <p class="mb-remote-preflight__message">{{ decision.message }}</p>
                <ul class="mb-remote-preflight__keys">
                    <li v-for="offer in decision.offers" :key="offer.fingerprint">
                        <span class="mb-remote-preflight__keyType">{{ offer.type }}</span>
                        <code class="mb-remote-preflight__fingerprint">{{ offer.fingerprint }}</code>
                        <v-btn
                            v-if="decision.canAccept"
                            :aria-label="
                                t(
                                    'remote.hostKey.acceptOne',
                                    { fingerprint: offer.fingerprint },
                                    'Accept the host key with fingerprint {fingerprint}',
                                )
                            "
                            variant="tonal"
                            size="x-small"
                            color="primary"
                            @click="emit('trust', offer.fingerprint)"
                        >
                            {{ t("remote.hostKey.accept", "This matches — accept it") }}
                        </v-btn>
                    </li>
                </ul>
                <p v-if="!decision.canAccept" class="mb-remote-preflight__message">
                    {{
                        t(
                            "remote.hostKey.cannotAccept",
                            "This build cannot record a host key, so there is nothing to press. The desktop application owns the file keys are written to.",
                        )
                    }}
                </p>
            </v-alert>

            <!--
                A CHANGED host key. There is deliberately no accept control here - not a
                disabled one, not one behind a confirmation. A rebuilt server and an
                intercepted connection are indistinguishable from here, and a button that
                resolves that ambiguity in the application's favour resolves it in an
                attacker's favour too.
            -->
            <v-alert
                v-else-if="decision.kind === 'changed'"
                type="error"
                density="compact"
                variant="tonal"
                class="mb-remote-preflight__alert"
                role="alert"
                data-host-key="changed"
            >
                <p class="mb-remote-preflight__hostKeyTitle">
                    <v-icon :icon="mdiLockAlertOutline" size="18" aria-hidden="true" />
                    {{ t("remote.hostKey.changedTitle", "That machine's host key has CHANGED") }}
                </p>
                <p class="mb-remote-preflight__message">{{ decision.message }}</p>
                <pre v-if="decision.detail" class="mb-remote-preflight__detail">{{ decision.detail }}</pre>
            </v-alert>

            <v-alert
                v-else-if="decision.kind === 'unavailable'"
                type="warning"
                density="compact"
                variant="tonal"
                class="mb-remote-preflight__alert"
                data-host-key="unavailable"
            >
                <p class="mb-remote-preflight__message">{{ decision.message }}</p>
                <pre v-if="decision.detail" class="mb-remote-preflight__detail">{{ decision.detail }}</pre>
            </v-alert>

            <p v-if="passed" class="mb-remote-preflight__passed" role="status">
                {{
                    t(
                        "remote.preflight.passed",
                        "All four passed. This machine can take the render, and nothing has been uploaded yet.",
                    )
                }}
            </p>

            <div class="mb-remote-preflight__actions">
                <v-btn
                    :prepend-icon="mdiPlayCircleOutline"
                    :disabled="!canCheck || running"
                    variant="tonal"
                    color="primary"
                    size="small"
                    @click="emit('check')"
                >
                    {{
                        report === null
                            ? t("remote.preflight.run", "Check this machine")
                            : t("remote.preflight.again", "Check again")
                    }}
                </v-btn>
                <span v-if="running" class="mb-remote-preflight__busy" role="status" aria-live="polite">
                    <v-progress-circular indeterminate size="16" width="2" aria-hidden="true" />
                    {{ t("remote.preflight.busy", "Checking. Nothing is being uploaded.") }}
                </span>
            </div>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-remote-preflight {
    margin-block-start: 12px;
    border-radius: 12px;
}

.mb-remote-preflight__title {
    font-size: 0.9375rem;
    padding: 8px 12px 0;
    overflow-wrap: anywhere;
}

.mb-remote-preflight__blurb {
    margin-block-start: 4px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-remote-preflight__list {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-remote-preflight__row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mb-remote-preflight__icon {
    margin-block-start: 2px;
    flex: 0 0 auto;
}

.mb-remote-preflight__text {
    min-width: 0;
}

.mb-remote-preflight__stage {
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-remote-preflight__state {
    margin-inline-start: 8px;
    font-size: 0.75rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-remote-preflight__message {
    margin-block-start: 2px;
    font-size: 0.8125rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-remote-preflight__detail {
    margin-block-start: 4px;
    max-height: 30vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}

.mb-remote-preflight__alert {
    margin-block-start: 12px;
}

.mb-remote-preflight__hostKeyTitle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
}

.mb-remote-preflight__keys {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mb-remote-preflight__keys li {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-remote-preflight__keyType {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-remote-preflight__fingerprint {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
}

.mb-remote-preflight__passed {
    margin-block-start: 10px;
    font-size: 0.8125rem;
    font-weight: 500;
}

.mb-remote-preflight__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}

.mb-remote-preflight__busy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
}
</style>

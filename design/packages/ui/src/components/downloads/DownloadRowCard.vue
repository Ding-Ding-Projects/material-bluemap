<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiChevronDown,
    mdiChevronUp,
    mdiCloudDownloadOutline,
    mdiFolderArrowRightOutline,
    mdiPlayCircleOutline,
    mdiStopCircleOutline,
} from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VIcon, VProgressLinear } from "vuetify/components";
import {
    adviseOnDownloadFailure,
    canResume,
    etaText,
    formatBytes,
    partsText,
    phaseLabel,
    transferText,
    type DownloadRow,
} from "./downloads.js";
import { formatDuration } from "../world/renderRun.js";
import type { SettingsTarget } from "./downloadBridge.js";

/**
 * One download, while it happens and after it ends.
 *
 * The numbers on screen are the main process's own: bytes transferred of bytes expected,
 * which part of how many, an overall percentage and the estimate it computed. They are
 * pushed rather than polled because a twenty gigabyte world is tens of minutes of work,
 * and a spinner for tens of minutes is indistinguishable from a hang.
 *
 * The endings are kept apart, because they are different things and one of them is not a
 * problem at all. Finished offers the unpacked folder, which is the whole point of having
 * downloaded a world. Cancelled says the transferred bytes are kept and starting again
 * carries on. Interrupted says the same for a download the application never got to write
 * an ending for. Failed shows the app's own sentence, what it means, and whether anything
 * has to be fetched a second time.
 */
const props = defineProps<{
    row: DownloadRow;
    /** True when this build can stop a download in flight. */
    canCancel: boolean;
    /**
     * True when something above this can actually open a settings row.
     *
     * False names the setting in words instead. A button that looks pressable and goes
     * nowhere is worse than a sentence, because a sentence can be acted on.
     */
    canOpenSettings: boolean;
}>();

const emit = defineEmits<{
    cancel: [downloadId: string];
    /** Carries a stopped download on from where it got to. */
    resume: [row: DownloadRow];
    /** Use the unpacked folder, which is what makes a downloaded world usable. */
    use: [folder: string];
    /** Sends somebody to the setting that would fix a failure. */
    settings: [target: SettingsTarget];
}>();

const { t } = useI18n();

const detailOpen = ref(false);
const logOpen = ref(false);

const row = computed(() => props.row);
const task = computed(() => props.row.task);
const running = computed(() => props.row.state === "running");

/** What to call it. The id is the only name a download adopted from nothing else has. */
const title = computed(() => (props.row.asset === "" ? props.row.downloadId : props.row.asset));

const percent = computed(() => {
    const current = task.value;
    if (current === null) return 0;
    return Math.max(0, Math.min(100, current.percent));
});

const percentText = computed(() => {
    const current = task.value;
    return current === null ? "" : `${current.percent.toFixed(1).replace(/\.0$/, "")}%`;
});

const sizeText = computed(() => (props.row.bytes > 0 ? formatBytes(props.row.bytes, t) : ""));
const transfer = computed(() => transferText(task.value, t));
const parts = computed(() => partsText(task.value, t));
const eta = computed(() => etaText(task.value, t));
const phase = computed(() => phaseLabel(props.row.phase, t));

const durationText = computed(() => {
    const ms = props.row.durationMs;
    return ms === null ? "" : formatDuration(ms / 1000, t);
});

const advice = computed(() => {
    const failure = props.row.failure;
    return failure === null ? null : adviseOnDownloadFailure(failure, t);
});

const resumable = computed(() => canResume(props.row));

/**
 * Ids for the two disclosures below, so `aria-expanded` on each toggle has an
 * `aria-controls` to point at.
 *
 * `downloadId` is already a slug plus a short hex digest (see `downloadIdFor` in the main
 * process), so it is safe to drop straight into an id attribute without escaping, and it
 * keeps the two ids unique across every row on screen at once.
 */
const detailPanelId = computed(() => `mb-download-row-detail-${row.value.downloadId}`);
const logPanelId = computed(() => `mb-download-row-log-${row.value.downloadId}`);

/**
 * What the button that starts it again honestly says.
 *
 * A cancelled or interrupted download has bytes on disk and every part is checksummed on
 * its own, so asking for it again continues from where it stopped. A failure that never
 * transferred anything, a manifest that could not be read, does not, and telling somebody
 * it will carry on from where it stopped would promise them a saving that is not there.
 */
const resumeLabel = computed(() =>
    props.row.state === "failed" && advice.value?.resumable !== true
        ? t("downloads.row.retry", "Try this download again")
        : t("downloads.row.resume", "Carry on from where it stopped"),
);

/**
 * Why a resume is not on offer, when the state would otherwise allow one.
 *
 * A download adopted from an id alone has no repository and no asset name, so there is
 * nothing to ask for a second time. Saying so is better than a missing button nobody can
 * account for.
 */
const noResumeReason = computed(() =>
    props.row.state === "interrupted" || props.row.state === "cancelled" || props.row.state === "failed"
        ? resumable.value
            ? ""
            : t(
                  "downloads.row.cannotResume",
                  "This window does not know which release this came from, so it cannot ask for it again. Find it in the release above and start it from there.",
              )
        : "",
);
</script>

<template>
    <v-card variant="tonal" class="mb-download-row">
        <v-card-title class="mb-download-row__head">
            <v-icon
                :icon="
                    row.state === 'finished'
                        ? mdiCheckCircleOutline
                        : row.state === 'failed'
                          ? mdiAlertCircleOutline
                          : mdiCloudDownloadOutline
                "
                :color="row.state === 'finished' ? 'success' : row.state === 'failed' ? 'error' : undefined"
                size="20"
                aria-hidden="true"
            />
            <span class="mb-download-row__name">{{ title }}</span>
            <v-chip v-if="row.repository" size="x-small" variant="outlined">{{ row.repository }}</v-chip>
            <v-chip v-if="row.tag" size="x-small" variant="outlined">{{ row.tag }}</v-chip>
            <v-chip v-if="sizeText" size="x-small" variant="outlined">{{ sizeText }}</v-chip>
            <v-chip v-if="row.split" size="x-small" variant="outlined">
                {{ t("downloads.row.splitChip", { n: row.parts }, "{n} parts, rejoined here") }}
            </v-chip>
        </v-card-title>

        <v-card-text>
            <template v-if="running">
                <v-progress-linear
                    :model-value="percent"
                    :indeterminate="task === null"
                    :aria-label="t('downloads.row.progressLabel', { asset: title }, 'Download progress for {asset}')"
                    :aria-valuenow="task === null ? undefined : Math.round(percent)"
                    color="primary"
                    height="8"
                    rounded
                    class="mb-download-row__bar"
                />
                <p class="mb-download-row__line" role="status" aria-live="polite">
                    <strong v-if="percentText">{{ percentText }}</strong>
                    <span v-if="phase">{{ phase }}</span>
                    <span v-if="transfer">{{ transfer }}</span>
                    <span v-if="parts">{{ parts }}</span>
                    <span v-if="eta" class="mb-download-row__eta">{{ eta }}</span>
                </p>
                <p v-if="task?.currentPart" class="mb-download-row__note">{{ task.currentPart }}</p>

                <div class="mb-download-row__actions">
                    <v-btn
                        :prepend-icon="mdiStopCircleOutline"
                        :disabled="!canCancel || row.cancelling"
                        :aria-label="t('downloads.row.stopOne', { asset: title }, 'Stop the download of {asset}')"
                        color="error"
                        variant="tonal"
                        size="small"
                        @click="emit('cancel', row.downloadId)"
                    >
                        {{
                            row.cancelling
                                ? t("downloads.row.stopping", "Stopping...")
                                : t("downloads.row.stop", "Stop this download")
                        }}
                    </v-btn>
                </div>
                <p class="mb-download-row__note">
                    {{
                        canCancel
                            ? t(
                                  "downloads.row.stopNote",
                                  "Stopping keeps every byte already transferred. Starting it again continues from there rather than beginning again.",
                              )
                            : t(
                                  "downloads.row.cannotStop",
                                  "This build cannot stop a download once it has started. It will run to the end or until the app is closed, and nothing already transferred is lost either way.",
                              )
                    }}
                </p>
            </template>

            <template v-else-if="row.state === 'finished'">
                <p class="mb-download-row__line">
                    {{
                        durationText
                            ? t(
                                  "downloads.row.finishedIn",
                                  { duration: durationText },
                                  "Downloaded and verified in {duration}. Every part matched the checksum published beside it.",
                              )
                            : t(
                                  "downloads.row.finished",
                                  "Downloaded and verified. Every part matched the checksum published beside it.",
                              )
                    }}
                </p>
                <p v-if="row.content" class="mb-download-row__path">
                    {{ t("downloads.row.contentAt", { folder: row.content }, "Unpacked into {folder}") }}
                </p>
                <p v-else-if="row.archive" class="mb-download-row__path">
                    {{
                        t(
                            "downloads.row.archiveAt",
                            { archive: row.archive },
                            "The archive is at {archive}. It was not unpacked, so there is no folder to render yet.",
                        )
                    }}
                </p>

                <div class="mb-download-row__actions">
                    <v-btn
                        v-if="row.content"
                        :prepend-icon="mdiFolderArrowRightOutline"
                        :aria-label="
                            t('downloads.row.useOne', { asset: title }, 'Use the folder downloaded from {asset}')
                        "
                        color="primary"
                        variant="flat"
                        size="small"
                        @click="emit('use', row.content)"
                    >
                        {{ t("downloads.row.use", "Use this folder") }}
                    </v-btn>
                </div>
            </template>

            <template v-else-if="row.state === 'cancelled' || row.state === 'interrupted'">
                <p class="mb-download-row__line">
                    {{
                        row.state === "cancelled"
                            ? t(
                                  "downloads.row.cancelled",
                                  "You stopped this download. Every byte it had already transferred is still there, and starting it again carries on from where it stopped.",
                              )
                            : t(
                                  "downloads.row.interrupted",
                                  "This download was still going when the app or the machine stopped, so it never got to write an ending. What it had already transferred is still there.",
                              )
                    }}
                </p>
            </template>

            <template v-else-if="advice">
                <v-alert type="error" density="compact" variant="tonal" role="alert">
                    <p class="mb-download-row__failure">{{ advice.message }}</p>
                    <p class="mb-download-row__note">{{ advice.explanation }}</p>
                </v-alert>

                <p v-if="advice.remedy.settings && !canOpenSettings" class="mb-download-row__note">
                    {{
                        t(
                            "downloads.row.settingsElsewhere",
                            "The folder downloads are written into is in the app's own settings, beside where rendered maps are written. This surface has no way to open it from here.",
                        )
                    }}
                </p>

                <div class="mb-download-row__actions">
                    <v-btn
                        v-if="advice.remedy.settings && advice.remedy.actionKey && canOpenSettings"
                        color="primary"
                        variant="tonal"
                        size="small"
                        @click="emit('settings', advice.remedy.settings)"
                    >
                        {{ t(advice.remedy.actionKey, advice.remedy.actionFallback) }}
                    </v-btn>
                    <v-btn
                        v-if="advice.detail"
                        :append-icon="detailOpen ? mdiChevronUp : mdiChevronDown"
                        :aria-expanded="detailOpen ? 'true' : 'false'"
                        :aria-controls="detailPanelId"
                        variant="text"
                        size="small"
                        @click="detailOpen = !detailOpen"
                    >
                        {{
                            detailOpen
                                ? t("downloads.row.hideDetail", "Hide the detail")
                                : t("downloads.row.showDetail", "Show what the app reported")
                        }}
                    </v-btn>
                </div>

                <pre
                    v-if="detailOpen && advice.detail"
                    :id="detailPanelId"
                    class="mb-download-row__pre"
                >{{ advice.detail }}</pre>
            </template>

            <div v-if="!running && (resumable || noResumeReason)" class="mb-download-row__actions">
                <v-btn
                    v-if="resumable"
                    :prepend-icon="mdiPlayCircleOutline"
                    :aria-label="t('downloads.row.resumeOne', { asset: title }, 'Start downloading {asset} again')"
                    color="primary"
                    variant="tonal"
                    size="small"
                    @click="emit('resume', row)"
                >
                    {{ resumeLabel }}
                </v-btn>
            </div>
            <p v-if="noResumeReason" class="mb-download-row__note">{{ noResumeReason }}</p>

            <div v-if="row.log.length > 0" class="mb-download-row__logs">
                <v-btn
                    :append-icon="logOpen ? mdiChevronUp : mdiChevronDown"
                    :aria-expanded="logOpen ? 'true' : 'false'"
                    :aria-controls="logPanelId"
                    variant="text"
                    size="x-small"
                    density="comfortable"
                    @click="logOpen = !logOpen"
                >
                    {{
                        logOpen
                            ? t("downloads.row.hideLog", "Hide what it reported")
                            : t("downloads.row.showLog", { n: row.log.length }, "Show what it reported ({n} lines)")
                    }}
                </v-btn>
                <pre v-if="logOpen" :id="logPanelId" class="mb-download-row__pre">{{
                    row.log.map((line) => line.message).join("\n")
                }}</pre>
            </div>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-download-row {
    border-radius: 12px;
    margin-block: 8px;
}

.mb-download-row__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.9375rem;
}

.mb-download-row__name {
    overflow-wrap: anywhere;
}

.mb-download-row__line {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    margin-block-start: 8px;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-download-row__line strong {
    font-variant-numeric: tabular-nums;
}

.mb-download-row__eta {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-download-row__failure {
    font-size: 0.875rem;
    line-height: 1.5;
}

.mb-download-row__note {
    margin-block-start: 6px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-download-row__path {
    margin-block-start: 6px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.mb-download-row__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}

.mb-download-row__logs {
    margin-block-start: 12px;
}

.mb-download-row__pre {
    margin-block-start: 8px;
    padding: 8px;
    max-height: 30vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
    .mb-download-row .v-progress-linear__indeterminate {
        animation-duration: 0.01ms !important;
    }
}
</style>

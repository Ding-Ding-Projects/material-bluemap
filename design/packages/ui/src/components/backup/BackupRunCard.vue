<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiChevronDown,
    mdiChevronUp,
    mdiCloudUploadOutline,
    mdiOpenInNew,
    mdiPlayCircleOutline,
    mdiStopCircleOutline,
} from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VIcon, VProgressLinear } from "vuetify/components";
import { canResume, etaText, formatBytes, partsText, phaseLabel, transferText } from "./backups.js";
import type { BackupRow } from "./backups.js";

/**
 * One backup, while it happens and after it ends.
 *
 * The numbers are the main process's own: bytes sent of bytes expected, which part of how
 * many, an overall percentage and the estimate it computed for the phase it is in. They
 * are pushed rather than polled because a twenty gigabyte world is hours of work, and a
 * spinner for hours is indistinguishable from a hang.
 *
 * The endings are kept apart because they are different things and only one of them is a
 * problem. Finished offers the release. Cancelled says the packed and uploaded bytes are
 * kept and carrying on is cheap. Failed shows the main process's own sentence, and offers
 * the one route that would fix it when there is one - which for a refused credential is
 * signing in again, at the surface where the failure was discovered rather than in a menu
 * somewhere else.
 */
const props = defineProps<{
    row: BackupRow;
    /** True when this build can stop a backup in flight. */
    canCancel: boolean;
    /** True when something above this can actually open the sign-in settings row. */
    canOpenSettings: boolean;
}>();

const emit = defineEmits<{
    /** Stop this backup. What is packed and uploaded is kept. */
    stop: [backupId: string];
    /** Carry a stopped backup on from where it got to. */
    resume: [row: BackupRow];
    /** Open the GitHub sign-in row in settings. */
    signIn: [];
    /** Open a release page in the system browser. */
    open: [url: string];
}>();

const { t } = useI18n();

const showLog = ref(false);

/** Ties the log toggle button to the log list it discloses, for assistive tech. */
const logId = computed(() => `mb-backup-row-log-${props.row.backupId}`);

const percent = computed(() => props.row.task?.percent ?? 0);
const transfer = computed(() => transferText(props.row.task, t));
const parts = computed(() => partsText(props.row.task, t));
const eta = computed(() => etaText(props.row.task, t));
const phase = computed(() => phaseLabel(props.row.phase, t));

const title = computed(() => {
    if (props.row.label !== "") return props.row.label;
    if (props.row.tag !== "") return props.row.tag;
    return t("backup.row.unnamed", "A backup started in another window");
});

const kindLabel = computed(() => {
    if (props.row.kind === "world") return t("backup.kind.world", "Minecraft world");
    if (props.row.kind === "render") return t("backup.kind.render", "Rendered map");
    return "";
});

const stateLabel = computed(() => {
    switch (props.row.state) {
        case "finished":
            return t("backup.row.finished", "Backed up");
        case "failed":
            return t("backup.row.failed", "Did not finish");
        case "cancelled":
            return t("backup.row.cancelled", "Stopped");
        default:
            return phase.value;
    }
});

const stateColour = computed(() => {
    switch (props.row.state) {
        case "finished":
            return "success";
        case "failed":
            return "error";
        case "cancelled":
            return "warning";
        default:
            return "primary";
    }
});

const stateIcon = computed(() => {
    switch (props.row.state) {
        case "finished":
            return mdiCheckCircleOutline;
        case "failed":
            return mdiAlertCircleOutline;
        default:
            return mdiCloudUploadOutline;
    }
});

/**
 * The row's accessible name, said in full.
 *
 * A card whose label is only a heading and a chip reads to a screen reader as a pile of
 * fragments. This is one sentence with the same facts the eye gets from the layout.
 */
const cardLabel = computed(() =>
    t(
        "backup.row.label",
        { name: title.value, state: stateLabel.value, repository: props.row.repository },
        "{name}: {state}, to {repository}",
    ),
);
</script>

<template>
    <v-card class="mb-backup-row" variant="tonal" :aria-label="cardLabel">
        <v-card-title class="mb-backup-row__head">
            <v-icon :icon="stateIcon" size="20" aria-hidden="true" />
            <span class="mb-backup-row__name">{{ title }}</span>
            <v-chip v-if="kindLabel" size="x-small" variant="flat" density="compact">{{ kindLabel }}</v-chip>
            <v-chip size="x-small" :color="stateColour" variant="flat" density="compact">
                {{ stateLabel }}
            </v-chip>
        </v-card-title>

        <v-card-text class="mb-backup-row__body">
            <p v-if="row.repository" class="mb-backup-row__where">
                {{
                    t(
                        "backup.row.where",
                        { repository: row.repository, tag: row.tag },
                        "To {repository}, as the release {tag}",
                    )
                }}
            </p>

            <template v-if="row.state === 'running'">
                <v-progress-linear
                    :model-value="percent"
                    height="6"
                    rounded
                    color="primary"
                    :aria-label="t('backup.row.progressLabel', 'How much of this backup is done')"
                />
                <p class="mb-backup-row__numbers" role="status" aria-live="polite">
                    <span>{{ row.task?.description || phase }}</span>
                    <span v-if="transfer"> · {{ transfer }}</span>
                    <span v-if="parts"> · {{ parts }}</span>
                    <span v-if="eta"> · {{ eta }}</span>
                </p>
                <v-btn
                    v-if="canCancel"
                    :prepend-icon="mdiStopCircleOutline"
                    :disabled="row.stopping"
                    size="small"
                    variant="text"
                    color="warning"
                    @click="emit('stop', row.backupId)"
                >
                    {{
                        row.stopping
                            ? t("backup.row.stopping", "Stopping...")
                            : t("backup.row.stop", "Stop this backup")
                    }}
                </v-btn>
                <p v-else class="mb-backup-row__note">
                    {{
                        t(
                            "backup.row.cannotStop",
                            "This build cannot stop a backup once it has started. It will finish, or fail, on its own.",
                        )
                    }}
                </p>
            </template>

            <template v-else-if="row.state === 'finished' && row.summary">
                <p class="mb-backup-row__note">
                    {{
                        t(
                            "backup.row.finishedDetail",
                            {
                                size: formatBytes(row.summary.bytes, t),
                                parts: String(row.summary.parts),
                                archive: row.summary.archive,
                            },
                            "{archive}, {size}, in {parts} release asset(s). Every part carries its own SHA-256 in the pointer beside it, so a restore can check what it fetched.",
                        )
                    }}
                </p>
                <v-btn
                    v-if="row.summary.releaseUrl"
                    :prepend-icon="mdiOpenInNew"
                    size="small"
                    variant="text"
                    color="primary"
                    @click="emit('open', row.summary.releaseUrl)"
                >
                    {{ t("backup.row.openRelease", "Open the release on GitHub") }}
                </v-btn>
            </template>

            <template v-else-if="row.state === 'cancelled'">
                <v-alert type="info" density="compact" variant="tonal" class="mb-backup-row__alert">
                    {{
                        t(
                            "backup.row.cancelledDetail",
                            "Stopped. Everything already packed and everything already uploaded is kept, so carrying on continues from where it got to rather than starting over.",
                        )
                    }}
                </v-alert>
            </template>

            <template v-else-if="row.state === 'failed' && row.failure">
                <v-alert type="error" density="compact" variant="tonal" class="mb-backup-row__alert" role="alert">
                    <p>{{ row.failure.message }}</p>
                    <p v-if="row.failure.detail" class="mb-backup-row__note">{{ row.failure.detail }}</p>
                </v-alert>
                <v-btn
                    v-if="row.failure.needsSignIn && canOpenSettings"
                    size="small"
                    variant="tonal"
                    color="primary"
                    @click="emit('signIn')"
                >
                    {{ t("backup.row.signIn", "Sign in to GitHub again") }}
                </v-btn>
                <p v-else-if="row.failure.needsSignIn" class="mb-backup-row__note">
                    {{
                        t(
                            "backup.row.signInWhere",
                            "Sign in to GitHub again from Settings, then start this backup again.",
                        )
                    }}
                </p>
            </template>

            <v-btn
                v-if="canResume(row)"
                :prepend-icon="mdiPlayCircleOutline"
                size="small"
                variant="tonal"
                color="primary"
                @click="emit('resume', row)"
            >
                {{ t("backup.row.resume", "Carry on with this backup") }}
            </v-btn>

            <template v-if="row.log.length > 0">
                <v-btn
                    :append-icon="showLog ? mdiChevronUp : mdiChevronDown"
                    size="small"
                    variant="text"
                    :aria-expanded="showLog"
                    :aria-controls="logId"
                    @click="showLog = !showLog"
                >
                    {{
                        showLog
                            ? t("backup.row.hideLog", "Hide what it reported")
                            : t("backup.row.showLog", "Show what it reported")
                    }}
                </v-btn>
                <ul v-if="showLog" :id="logId" class="mb-backup-row__log">
                    <li v-for="line in row.log" :key="line.id">{{ line.message }}</li>
                </ul>
            </template>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-backup-row {
    margin-block-start: 8px;
}

.mb-backup-row__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    line-height: 1.3;
}

.mb-backup-row__name {
    font-weight: 500;
    overflow-wrap: anywhere;
}

.mb-backup-row__body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
}

.mb-backup-row__where,
.mb-backup-row__numbers,
.mb-backup-row__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
    overflow-wrap: anywhere;
}

.mb-backup-row__alert,
.mb-backup-row :deep(.v-progress-linear) {
    inline-size: 100%;
}

.mb-backup-row__log {
    max-block-size: 200px;
    overflow-y: auto;
    padding-inline-start: 18px;
    font-family: "Roboto Mono", monospace;
    font-size: 0.6875rem;
    line-height: 1.6;
}
</style>

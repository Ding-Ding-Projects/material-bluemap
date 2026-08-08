<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertOutline,
    mdiCancel,
    mdiCheckCircleOutline,
    mdiCloseCircleOutline,
    mdiDownload,
    mdiPackageVariantClosed,
    mdiSelectAll,
    mdiSelectInverse,
    mdiSelectOff,
    mdiShieldAlertOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckboxBtn,
    VChip,
    VIcon,
    VList,
    VListItem,
    VProgressLinear,
    VSelect,
    VSpacer,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createDependencyInstaller, type DependencyRow } from "./dependencyInstaller.js";
import type { DependencyInstallerBridge } from "./dependencyBridge.js";
import {
    dependencyExportFileName,
    dependencyExportText,
    dependencyRouteLabel,
    dependencySearchText,
    dependencyStageLabel,
    type DependencyExportFormat,
} from "./dependencyModel.js";

/**
 * The one button that installs git, the GitHub CLI, Docker Desktop and rsync.
 *
 * Two routes exist, chosen once per dependency by the main process (`main/sysdeps/
 * registry.ts`) and never by this panel: a private per-app download for the JDK
 * (`JavaRuntimeRow.vue`, elsewhere in this same settings screen), and winget/
 * Chocolatey here, for real system tools that need a real installer. This panel says
 * which route each dependency takes, and whether it will raise a Windows elevation
 * prompt, *before* the button is pressed - never as a surprise mid-install.
 *
 * Every row's progress is exactly what the package manager reported: Chocolatey's
 * genuine percentages render as a determinate bar, winget's phase-only stdout
 * renders as an indeterminate one, and a stage with no percentage concept at all
 * (resolving, verifying, the elevation notice) renders no bar, ever. See
 * `dependencyInstaller.ts` for where that truthfulness is actually enforced.
 */
const props = defineProps<{ bridge?: DependencyInstallerBridge | null }>();

const { t } = useI18n();
const uid = useId();

const installer = createDependencyInstaller(props.bridge === undefined ? {} : { bridge: props.bridge });
void installer.loadPreview();

/* -------------------------------------------------------------------------- */
/* Finding one among many                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const visible = computed(() => installer.rows.value.filter((row) => matcher.value.test(dependencySearchText(row, t))));
const sample = computed(() => installer.rows.value.map((row) => dependencySearchText(row, t)).join("\n"));

const searchSummary = computed(() => {
    if (matcher.value.error !== null) {
        return t("dependencies.list.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    if (!matcher.value.active) return "";
    return t(
        "dependencies.list.searchSummary",
        { shown: visible.value.length, total: installer.rows.value.length },
        "Showing {shown} of {total}.",
    );
});

const searchVisible = computed(() => installer.rows.value.length > 3 || query.value.length > 0);

/* -------------------------------------------------------------------------- */
/* Choosing several                                                           */
/* -------------------------------------------------------------------------- */

function isChosen(id: string): boolean {
    return installer.selected.value.has(id);
}

const chosenCount = computed(() => installer.selected.value.size);

/** How many of the chosen rows will actually raise a Windows elevation prompt. */
const elevatedChosenCount = computed(
    () =>
        installer.installableRows.value.filter(
            (row) => isChosen(row.id) && row.preview.elevation !== "none",
        ).length,
);

const bulkLabel = computed(() =>
    t("dependencies.list.chosenCount", { chosen: chosenCount.value }, "{chosen} selected"),
);

/* -------------------------------------------------------------------------- */
/* The button, and what it discloses before it is pressed                     */
/* -------------------------------------------------------------------------- */

const running = computed(() => installer.runState.value !== "idle");

const elevationDisclosures = computed(() => {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const row of installer.installableRows.value) {
        if (!isChosen(row.id)) continue;
        if (row.preview.elevation === "none") continue;
        if (seen.has(row.preview.elevationDisclosure)) continue;
        seen.add(row.preview.elevationDisclosure);
        lines.push(row.preview.elevationDisclosure);
    }
    return lines;
});

async function onInstall(): Promise<void> {
    await installer.run();
}

async function onCancel(): Promise<void> {
    await installer.cancel();
}

/* -------------------------------------------------------------------------- */
/* Per-row rendering                                                          */
/* -------------------------------------------------------------------------- */

function appearanceIdOf(row: DependencyRow): string {
    return `dependency.${row.id}`;
}

function routeChipText(row: DependencyRow): string {
    return dependencyRouteLabel(row.preview.route, t);
}

function stageText(row: DependencyRow): string {
    if (row.stage === "idle") return row.preview.alreadyInstalled ? t("dependencies.row.already", "Already installed") : "";
    return dependencyStageLabel(row.stage, t);
}

/** Only a real, non-fabricated progress bar - see the module doc above. */
function showsBar(row: DependencyRow): boolean {
    return row.progress.kind !== "none";
}

function barIndeterminate(row: DependencyRow): boolean {
    return row.progress.kind === "indeterminate";
}

/** Always a real number - `0` when there is nothing determinate to show, since the
 *  indeterminate flag is what actually decides the bar's appearance in that case. */
function barPercent(row: DependencyRow): number {
    return row.progress.kind === "determinate" ? row.progress.percent : 0;
}

/** `undefined` (never announced) unless there is a real percentage to announce. */
function barAriaValueNow(row: DependencyRow): number | undefined {
    return row.progress.kind === "determinate" ? row.progress.percent : undefined;
}

function outcomeSeverity(row: DependencyRow): "success" | "warning" | "error" | null {
    const outcome = row.outcome;
    if (outcome === null) return null;
    switch (outcome.kind) {
        case "installed":
        case "already-installed":
            return "success";
        case "cancelled":
            return "warning";
        default:
            return "error";
    }
}

function outcomeMessage(row: DependencyRow): string {
    const outcome = row.outcome;
    if (outcome === null) return "";
    switch (outcome.kind) {
        case "installed":
            return t(
                "dependencies.outcome.installed",
                { output: outcome.verifiedOutput ?? "" },
                "Installed and verified: {output}",
            );
        case "already-installed":
            return outcome.verified
                ? t("dependencies.outcome.alreadyVerified", { output: outcome.verifiedOutput ?? "" }, "Already installed and runs: {output}")
                : t("dependencies.outcome.alreadyUnverified", "Already installed, but running it did not look right.");
        case "declined-elevation":
            return t(
                "dependencies.outcome.declinedElevation",
                { code: String(outcome.exitCode ?? "") },
                "Administrator permission was declined (exit code {code}). Nothing was installed.",
            );
        case "not-found":
            return t(
                "dependencies.outcome.notFound",
                { packageId: outcome.packageId, manager: outcome.manager },
                "{manager} could not find the package {packageId}.",
            );
        case "network-failure":
            return t("dependencies.outcome.network", { message: outcome.message }, "A network problem stopped the install: {message}");
        case "verification-failed":
            return t(
                "dependencies.outcome.verificationFailed",
                { code: String(outcome.exitCode ?? ""), message: outcome.message },
                "The package manager reported success (exit code {code}), but the tool did not run right afterwards: {message}",
            );
        case "cancelled":
            return t("dependencies.outcome.cancelled", "Cancelled before this finished.");
        case "unsupported":
            return outcome.message;
        case "failed":
            return t(
                "dependencies.outcome.failed",
                { code: String(outcome.exitCode ?? "no exit code"), message: outcome.message },
                "Failed (exit code {code}): {message}",
            );
    }
}

/* -------------------------------------------------------------------------- */
/* Taking the log away with you                                               */
/* -------------------------------------------------------------------------- */

const exportFormat = ref<DependencyExportFormat>("json");

const exportItems = computed(() => [
    { value: "json" as const, title: t("dependencies.export.json", "JSON, every event, re-readable") },
    { value: "markdown" as const, title: t("dependencies.export.markdown", "Markdown, for pasting") },
    { value: "text" as const, title: t("dependencies.export.text", "Plain text log") },
]);

function exportLog(): void {
    const text = dependencyExportText(installer.log.value, exportFormat.value);
    const name = dependencyExportFileName(exportFormat.value);
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
    }
}
</script>

<template>
    <v-card class="mb-deps" :aria-label="t('dependencies.cardLabel', 'Install system dependencies')">
        <v-card-title class="mb-deps__head mb-responsive-card-title">
            <v-icon :icon="mdiPackageVariantClosed" aria-hidden="true" />
            <span class="mb-responsive-card-title__text">{{ t("dependencies.title", "Install system dependencies") }}</span>
        </v-card-title>

        <v-card-text>
            <p class="mb-deps__blurb">
                {{
                    t(
                        "dependencies.blurb",
                        "Git, the GitHub CLI, Docker Desktop and rsync are real system tools, installed through Windows's own package managers - winget or Chocolatey - because a private per-app copy would not put them on your PATH or let other software use them. A real installer sometimes means Windows asks for administrator permission, and this section always says so before the button is pressed, never after.",
                    )
                }}
            </p>

            <v-alert v-if="installer.previewState.value === 'unsupported'" type="info" density="compact" variant="tonal" class="mb-3">
                {{
                    t(
                        "dependencies.unsupported",
                        "This build cannot install system dependencies from here. The desktop app owns winget and Chocolatey; a browser tab has no main process to run them with.",
                    )
                }}
            </v-alert>

            <v-alert v-else-if="installer.previewState.value === 'failed'" type="error" density="compact" variant="tonal" class="mb-3">
                {{ t("dependencies.previewFailed", { message: installer.previewFailure.value ?? "" }, "Could not read the current state: {message}") }}
            </v-alert>

            <v-progress-linear v-if="installer.previewState.value === 'loading'" indeterminate color="primary" class="mb-2" />

            <template v-if="installer.previewState.value === 'ready'">
                <div v-if="searchVisible" class="mb-deps__search">
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regexMode"
                        v-model:flags="flags"
                        :label="t('dependencies.searchLabel', 'Search dependencies')"
                        :placeholder="t('dependencies.searchHint', 'a name, a route, or a status')"
                        :sample="sample"
                        :summary="searchSummary"
                    />
                </div>

                <!-- The disclosure: exactly what pressing the button below will do, before it does it. -->
                <v-alert
                    v-if="elevationDisclosures.length > 0 && !running"
                    type="warning"
                    variant="tonal"
                    density="comfortable"
                    class="mb-3"
                    role="status"
                >
                    <p class="mb-deps__elevationTitle">
                        {{
                            t(
                                "dependencies.elevationWarning.title",
                                { count: elevatedChosenCount },
                                "{count} of these will ask Windows for administrator permission",
                            )
                        }}
                    </p>
                    <ul class="mb-deps__elevationList">
                        <li v-for="line in elevationDisclosures" :key="line">{{ line }}</li>
                    </ul>
                </v-alert>

                <div
                    class="mb-deps__bulk"
                    role="group"
                    :aria-label="t('dependencies.bulkLabel', 'Actions on the chosen dependencies')"
                >
                    <span class="mb-deps__bulkcount" aria-live="polite">{{ bulkLabel }}</span>
                    <v-btn
                        :prepend-icon="mdiSelectAll"
                        variant="text"
                        size="small"
                        :disabled="running || installer.installableRows.value.length === 0"
                        @click="installer.selectAll()"
                    >
                        {{ t("dependencies.selectShown", { shown: installer.installableRows.value.length }, "Select the {shown} that need installing") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiSelectInverse"
                        variant="text"
                        size="small"
                        :disabled="running || installer.installableRows.value.length === 0"
                        @click="installer.selectInverse()"
                    >
                        {{ t("dependencies.selectInverse", "Invert") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiSelectOff"
                        variant="text"
                        size="small"
                        :disabled="running || chosenCount === 0"
                        @click="installer.selectNone()"
                    >
                        {{ t("dependencies.selectNone", "Clear the selection") }}
                    </v-btn>

                    <v-spacer />

                    <v-select
                        v-model="exportFormat"
                        :items="exportItems"
                        :label="t('dependencies.export.format', 'Export log as')"
                        item-title="title"
                        item-value="value"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="mb-deps__format"
                    />
                    <v-btn
                        :prepend-icon="mdiDownload"
                        variant="text"
                        size="small"
                        :disabled="installer.log.value.length === 0"
                        @click="exportLog"
                    >
                        {{ t("dependencies.export.button", "Export the install log") }}
                    </v-btn>
                </div>

                <div
                    class="mb-deps__list"
                    role="listbox"
                    aria-multiselectable="true"
                    :aria-label="t('dependencies.listLabel', 'System dependencies')"
                >
                    <AppearanceTarget
                        v-for="row in visible"
                        :id="appearanceIdOf(row)"
                        :key="row.id"
                        :label="row.displayName"
                        as="div"
                        role="presentation"
                        class="mb-deps__rowhost"
                    >
                        <div class="mb-deps__row">
                            <v-checkbox-btn
                                :model-value="isChosen(row.id)"
                                :disabled="running || !(row.preview.route.kind === 'package-manager' && !row.preview.alreadyInstalled)"
                                :aria-label="t('dependencies.choose', { name: row.displayName }, 'Choose {name}')"
                                density="compact"
                                hide-details
                                @update:model-value="installer.toggle(row.id)"
                            />

                            <div class="mb-deps__option" role="option" :aria-selected="isChosen(row.id) ? 'true' : 'false'">
                                <span class="mb-deps__text">
                                    <span class="mb-deps__name">
                                        {{ row.displayName }}
                                        <v-chip size="x-small" variant="tonal" class="ms-2">{{ routeChipText(row) }}</v-chip>
                                        <v-chip
                                            v-if="row.preview.elevation !== 'none'"
                                            size="x-small"
                                            color="warning"
                                            variant="tonal"
                                            class="ms-2"
                                            :prepend-icon="mdiShieldAlertOutline"
                                        >
                                            {{
                                                row.preview.elevation === "required"
                                                    ? t("dependencies.chip.elevationRequired", "Needs administrator permission")
                                                    : row.preview.elevation === "possible"
                                                      ? t("dependencies.chip.elevationPossible", "May need administrator permission")
                                                      : t("dependencies.chip.elevationUnknown", "Administrator permission: depends on this machine")
                                            }}
                                        </v-chip>
                                        <v-chip v-if="row.preview.alreadyInstalled" size="x-small" variant="outlined" class="ms-2">
                                            {{
                                                row.preview.installedVersion !== null
                                                    ? t("dependencies.chip.alreadyVersion", { version: row.preview.installedVersion }, "Already installed ({version})")
                                                    : t("dependencies.chip.already", "Already installed")
                                            }}
                                        </v-chip>
                                    </span>

                                    <span v-if="stageText(row)" class="mb-deps__subtitle" role="status" aria-live="polite">
                                        {{ stageText(row) }}
                                    </span>

                                    <v-progress-linear
                                        v-if="showsBar(row)"
                                        :model-value="barPercent(row)"
                                        :indeterminate="barIndeterminate(row)"
                                        :aria-label="t('dependencies.progressLabel', { name: row.displayName }, 'Install progress for {name}')"
                                        :aria-valuenow="barAriaValueNow(row)"
                                        color="primary"
                                        height="6"
                                        rounded
                                        class="mb-deps__bar"
                                    />

                                    <v-alert
                                        v-if="outcomeSeverity(row) !== null"
                                        :type="outcomeSeverity(row) ?? 'info'"
                                        density="compact"
                                        variant="tonal"
                                        class="mb-deps__outcome"
                                        :icon="
                                            outcomeSeverity(row) === 'success'
                                                ? mdiCheckCircleOutline
                                                : outcomeSeverity(row) === 'warning'
                                                  ? mdiCancel
                                                  : mdiCloseCircleOutline
                                        "
                                    >
                                        {{ outcomeMessage(row) }}
                                    </v-alert>
                                </span>
                            </div>
                        </div>

                        <template #menu="{ close }">
                            <v-list density="compact" :aria-label="t('dependencies.rowMenuLabel', 'What this dependency can do')">
                                <v-list-item
                                    :prepend-icon="mdiSelectAll"
                                    :disabled="running || !(row.preview.route.kind === 'package-manager' && !row.preview.alreadyInstalled)"
                                    :title="isChosen(row.id) ? t('dependencies.menuUnchoose', 'Take it out of the selection') : t('dependencies.menuChoose', 'Add it to the selection')"
                                    @click="
                                        () => {
                                            close();
                                            installer.toggle(row.id);
                                        }
                                    "
                                />
                            </v-list>
                        </template>
                    </AppearanceTarget>
                </div>

                <p v-if="visible.length === 0" class="mb-deps__empty" role="status">
                    {{ t("dependencies.noMatch", "Nothing here matches that search. Clearing it brings the whole list back.") }}
                </p>

                <div class="mb-deps__actions">
                    <v-btn
                        v-if="!running"
                        color="primary"
                        variant="tonal"
                        :prepend-icon="mdiDownload"
                        :disabled="chosenCount === 0"
                        @click="onInstall"
                    >
                        {{ t("dependencies.installButton", { chosen: chosenCount }, "Install {chosen} selected") }}
                    </v-btn>
                    <v-btn v-else color="error" variant="tonal" :prepend-icon="mdiAlertOutline" :disabled="installer.runState.value === 'cancelling'" @click="onCancel">
                        {{
                            installer.runState.value === "cancelling"
                                ? t("dependencies.cancelling", "Cancelling…")
                                : t("dependencies.cancelButton", "Cancel")
                        }}
                    </v-btn>
                    <v-progress-linear v-if="running" indeterminate color="primary" class="mb-deps__runningBar" />
                </div>
            </template>
        </v-card-text>
    </v-card>
</template>

<style scoped>
.mb-deps {
    inline-size: 100%;
    border-radius: 16px;
}

.mb-deps__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * means the title can never wrap, so the bilingual title was silently cut off with
     * no ellipsis and no indication anything was missing. Same fix as
     * `DockerWorldSourcePanel.vue`'s `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}

.mb-deps__blurb,
.mb-deps__empty {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-deps__search {
    margin-block: 8px;
}

.mb-deps__elevationTitle {
    margin: 0 0 4px;
    font-weight: 600;
}

.mb-deps__elevationList {
    margin: 0;
    padding-inline-start: 1.25rem;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-deps__bulk {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 8px;
}

.mb-deps__bulkcount {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-deps__format {
    flex: 0 1 220px;
    min-inline-size: 160px;
}

.mb-deps__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mb-deps__rowhost {
    display: block;
}

.mb-deps__row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
}

.mb-deps__option {
    display: flex;
    flex: 1 1 auto;
    align-items: flex-start;
    gap: 12px;
    min-block-size: 48px;
    min-inline-size: 0;
    padding: 6px 12px;
    border-radius: 8px;
}

.mb-deps__text {
    display: flex;
    min-inline-size: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
}

.mb-deps__name {
    font-size: 1rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.mb-deps__subtitle {
    font-size: 0.8125rem;
    line-height: 1.3;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-deps__bar {
    max-inline-size: 420px;
}

.mb-deps__outcome {
    max-inline-size: 640px;
    overflow-wrap: anywhere;
}

.mb-deps__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-block-start: 12px;
}

.mb-deps__runningBar {
    max-inline-size: 320px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-deps .v-progress-linear__indeterminate {
        animation-duration: 0.01ms !important;
    }
}

@media (max-width: 600px) {
    .mb-deps__bulk {
        gap: 4px;
    }
}
</style>

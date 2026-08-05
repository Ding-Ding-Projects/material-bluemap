<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiCompareHorizontal, mdiContentCopy, mdiDownload, mdiSwapHorizontal } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VIcon, VMenu, VProgressCircular } from "vuetify/components";

import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import HistoryReadableDiff from "./HistoryReadableDiff.vue";
import type { HistoryComparisonFile, HistoryRevision } from "./historyHost.js";

/**
 * Two revisions, side by side, however far apart they are.
 *
 * ### Why this is the biggest thing the panel was missing
 *
 * A history that can only show a revision against its immediate parent cannot answer the
 * question people actually arrive with, which is never "what did save number 14 do" and
 * almost always "what has changed since the config last worked". Four saves ago meant four
 * patches to read and merge in your head, and nobody does that; they give up and restore the
 * whole folder, losing every good change made since. One comparison spanning the gap is the
 * difference between undoing a mistake and undoing a week.
 *
 * ### Which way round it is, said rather than implied
 *
 * A comparison has a direction and getting it backwards inverts every statement in it. The
 * header names both ends with their dates, and the older end is always A. The swap button
 * exists because somebody who picked them in the other order should not have to unpick them,
 * and it says what it will do rather than silently reversing the arrows.
 *
 * ### It is a surface, not a dialog
 *
 * Comparing is reading, and reading is exactly the thing a modal is worst at: the list you
 * are comparing against is behind it. So this sits above the list with the rows still there,
 * still filterable, still selectable, and closing it changes nothing else.
 */
const props = withDefaults(
    defineProps<{
        /** The older end. Null while only one endpoint has been chosen. */
        from: HistoryRevision | null;
        /** The newer end. */
        to: HistoryRevision | null;
        /** The fetched comparison, or null while it is still being fetched. */
        files?: readonly HistoryComparisonFile[] | null;
        /** Why the comparison could not be read, shown in place of it. */
        error?: string | null;
        /** True when the host can put single files and settings back. */
        restorable?: boolean;
        busy?: boolean;
    }>(),
    { files: null, error: null, restorable: false, busy: false },
);

const emit = defineEmits<{
    swap: [];
    close: [];
    restoreSetting: [path: string, key: string];
    restoreFile: [path: string];
    copy: [];
    download: [format: "markdown" | "json" | "csv" | "text"];
}>();

const { t, locale } = useI18n();

const localeTag = computed(() => (locale.value === "none" ? "en" : locale.value));

function when(revision: HistoryRevision | null): string {
    if (revision === null) return "";
    const date = new Date(revision.at);
    if (Number.isNaN(date.getTime())) return revision.at;
    return new Intl.DateTimeFormat(localeTag.value, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

const exportOpen = ref(false);

type ExportFormat = "markdown" | "json" | "csv" | "text";

/**
 * A search field over four rows reads as overkill until the fifth format arrives -- which is
 * exactly why the menu carries the project's own filterable list rather than a bare
 * `v-list`: every context menu in this application gets one, this one included, so a reader
 * who has met the tab menu's filter already knows how this one works too.
 */
const exportItems = computed<MenuSearchItem[]>(() => [
    { id: "markdown", label: t("history.exportMarkdown", "Markdown file") },
    { id: "json", label: t("history.exportJson", "JSON file") },
    { id: "csv", label: t("history.exportCsv", "CSV file") },
    { id: "text", label: t("history.exportPlain", "Plain text file") },
]);

function chooseExport(id: string): void {
    exportOpen.value = false;
    emit("download", id as ExportFormat);
}

const ready = computed(() => props.from !== null && props.to !== null);
const shownFiles = computed<readonly HistoryComparisonFile[] | null>(() => props.files ?? null);
const problem = computed(() => props.error ?? null);
const isBusy = computed(() => props.busy === true);
const canRestore = computed(() => props.restorable === true);

/** The two ends in one sentence, for the region's accessible name and for an export. */
const title = computed(() => {
    if (!ready.value) {
        return t("history.compare.pending", "Pick a second revision to compare against.");
    }
    return t(
        "history.compare.title",
        { a: props.from?.shortId ?? "", b: props.to?.shortId ?? "" },
        "What changed between {a} and {b}",
    );
});
</script>

<template>
    <v-card
        class="mb-history-compare"
        variant="tonal"
        role="region"
        :aria-label="title"
        aria-live="polite"
    >
        <v-card-text>
            <header class="mb-history-compare__head">
                <v-icon :icon="mdiCompareHorizontal" size="20" aria-hidden="true" />
                <h3 class="mb-history-compare__title">{{ title }}</h3>

                <v-btn
                    v-if="ready"
                    :prepend-icon="mdiSwapHorizontal"
                    variant="text"
                    size="small"
                    :aria-label="
                        t(
                            'history.compare.swapLong',
                            { a: from?.shortId ?? '', b: to?.shortId ?? '' },
                            'Compare the other way round, from {b} to {a}',
                        )
                    "
                    :disabled="isBusy"
                    @click="emit('swap')"
                >
                    {{ t("history.compare.swap", "Swap") }}
                </v-btn>

                <v-btn
                    v-if="ready && shownFiles"
                    :prepend-icon="mdiContentCopy"
                    variant="text"
                    size="small"
                    :aria-label="t('history.compare.copyLong', 'Copy this comparison to the clipboard')"
                    :disabled="isBusy"
                    @click="emit('copy')"
                >
                    {{ t("history.compare.copy", "Copy") }}
                </v-btn>

                <v-btn
                    v-if="ready && shownFiles"
                    :prepend-icon="mdiDownload"
                    variant="text"
                    size="small"
                    :aria-label="t('history.compare.exportLong', 'Export this comparison to a file')"
                    :aria-expanded="exportOpen ? 'true' : 'false'"
                    aria-haspopup="menu"
                    :disabled="isBusy"
                >
                    {{ t("history.compare.export", "Export") }}
                    <v-menu
                        v-model="exportOpen"
                        activator="parent"
                        :close-on-content-click="false"
                        location="bottom end"
                    >
                        <!--
                            Rendered from `exportOpen` itself rather than only from the
                            menu's own visibility, so choosing a format unmounts the search
                            field and its query immediately rather than waiting on the
                            overlay's own close transition to finish.
                        -->
                        <MenuSearchList
                            v-if="exportOpen"
                            :items="exportItems"
                            :label="t('history.compare.exportLong', 'Export this comparison to a file')"
                            @choose="chooseExport"
                        />
                    </v-menu>
                </v-btn>

                <v-btn
                    :icon="mdiClose"
                    variant="text"
                    size="small"
                    density="comfortable"
                    :aria-label="t('history.compare.close', 'Stop comparing')"
                    @click="emit('close')"
                />
            </header>

            <dl class="mb-history-compare__ends">
                <div>
                    <dt>{{ t("history.compare.older", "A, the older") }}</dt>
                    <dd>
                        <template v-if="from">{{ from.label }} · {{ when(from) }}</template>
                        <template v-else>{{ t("history.compare.noneYet", "not chosen yet") }}</template>
                    </dd>
                </div>
                <div>
                    <dt>{{ t("history.compare.newer", "B, the newer") }}</dt>
                    <dd>
                        <template v-if="to">{{ to.label }} · {{ when(to) }}</template>
                        <template v-else>{{ t("history.compare.noneYet", "not chosen yet") }}</template>
                    </dd>
                </div>
            </dl>

            <p v-if="!ready" class="mb-history-compare__quiet">
                {{
                    t(
                        "history.compare.howTo",
                        "Choose A on one revision and B on another, from any two rows in the list. They do not have to be next to each other.",
                    )
                }}
            </p>

            <v-alert v-else-if="problem" type="warning" variant="tonal" density="comfortable">
                {{ problem }}
            </v-alert>

            <div v-else-if="shownFiles === null" class="mb-history-compare__loading">
                <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                <span>{{ t("history.compare.loading", "Working out what changed...") }}</span>
            </div>

            <!--
                Restoring from a comparison goes back to A, the older end, which is the only
                reading of "put this back" that means anything here: B is already the newer
                state, and half of it is usually what is on disk. So the value named is the
                one on A's side.
            -->
            <HistoryReadableDiff
                v-else
                :files="shownFiles"
                :restorable="canRestore"
                :busy="isBusy"
                restore-side="before"
                :source-label="from?.shortId ?? ''"
                @restore-setting="(path, key) => emit('restoreSetting', path, key)"
                @restore-file="(path) => emit('restoreFile', path)"
            />
        </v-card-text>
    </v-card>
</template>

<style>
.mb-history-compare {
    margin-block-start: 10px;
}

.mb-history-compare__head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.mb-history-compare__title {
    flex: 1 1 200px;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 500;
    min-width: 0;
    overflow-wrap: anywhere;
}

.mb-history-compare__ends {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 8px 0 0;
    font-size: 0.8125rem;
}

.mb-history-compare__ends dt {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-compare__ends dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.mb-history-compare__quiet {
    margin: 8px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-compare__loading {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-block-start: 8px;
    font-size: 0.8125rem;
}
</style>
